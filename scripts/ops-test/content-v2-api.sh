#!/usr/bin/env bash
# Content v2, API level (needs run.sh running). Checks roles, delete, Expired, carousels and the Instagram sync.
# All writes go to the mock; read exactly what happened with: grep -E "WROTE|APPENDED|ADDED|GRAPH|DRIVE" scripts/ops-test/out/mock.log
cd "$(dirname "$0")/../.."; source scripts/ops-test/env.sh
B=http://localhost:3100; ok=0; bad=0
ck() { node scripts/ops-test/cookie.mjs "$1"; }
J() { curl -s -H "Cookie: ep_ops=$(ck $1)" "${@:2}"; }
P() { curl -s -H "Cookie: ep_ops=$(ck $1)" -H 'Content-Type: application/json' -X POST "$B/api/ops/social" -d "$2"; }
t() { if [ "$2" = "$3" ]; then ok=$((ok+1)); echo "ok   $1"; else bad=$((bad+1)); echo "FAIL $1: got [$2] want [$3]"; fi; }
q() { python3 -c "import sys,json; d=json.load(sys.stdin); print($1)"; }

echo "-- roles"
for who in carolyn:True:True stephanie:True:True cleo:True:False vera:False:False rebecka:True:True; do IFS=: read n e p <<<"$who"
  r=$(J $n@example.com "$B/api/ops/social?view=plan"); t "$n canEdit" "$(echo "$r" | q "d.get('canEdit')")" "$e"; t "$n canPublish" "$(echo "$r" | q "d.get('canPublish')")" "$p"; done

echo "-- plan shows Expired and hides nothing it shouldn't"
r=$(J jacob@embodiedphilosophy.com "$B/api/ops/social?view=plan")
t "expired are all past-due Proposed rows" "$(echo "$r" | q "all(x['values']['status']=='Proposed' for x in d['rows'] if x['display_status']=='Expired') and any(x['display_status']=='Expired' for x in d['rows'])")" "True"
t "unconfirmed rows" "$(echo "$r" | q "sum(1 for x in d['rows'] if x['display_status']=='Unconfirmed')")" "1"

echo "-- add a carousel as Rebecka (can create, can't approve)"
slides='[{"kind":"image","drive_file_id":"AAAAAAAAAAAAAAAAAAAAAAAA"},{"kind":"video","drive_file_id":"BBBBBBBBBBBBBBBBBBBBBBBB"},{"kind":"image","url":"https://picsum.photos/200"}]'
vals=$(python3 -c "import json;print(json.dumps({'view':'plan','add':True,'values':{'publish_date':'$(date -u -d '+3 days' +%F)','publish_time_ET':'11:00','platforms':'IG Feed, Facebook','caption':'Three slides','media_kind':'carousel','slides_json':'''$slides'''}}))")
r=$(P rebecka@example.com "$vals"); t "carousel added" "$(echo "$r" | q "d.get('ok')")" "True"; NEWID=$(echo "$r" | q "d.get('post_id')")
vals1=$(echo "$vals" | python3 -c "import sys,json;d=json.load(sys.stdin);d['values']['slides_json']=json.dumps([json.loads(d['values']['slides_json'])[0]]);print(json.dumps(d))")
r=$(P rebecka@example.com "$vals1"); t "1-slide carousel refused" "$(echo "$r" | q "'at least' in (d.get('errors') or {}).get('slides_json','')")" "True"
r=$(P viewer@example.com "$vals"); t "viewer can't add" "$(echo "$r" | q "'social team' in d.get('error','')")" "True"

echo "-- approve: Vera no, Carolyn yes (carousel becomes Manual until Graph publishing is live)"
plan=$(J jacob@embodiedphilosophy.com "$B/api/ops/social?view=plan"); row=$(echo "$plan" | q "[x['row'] for x in d['rows'] if x['values']['post_id']=='$NEWID'][0]"); before=$(echo "$plan" | q "__import__('json').dumps([x['values'] for x in d['rows'] if x['row']==$row][0])")
r=$(P vera@example.com "{\"view\":\"plan\",\"row\":$row,\"changes\":{\"status\":\"Approved\"},\"before\":$before}"); t "viewer can't approve" "$(echo "$r" | q "'error' in d")" "True"
r=$(P cleo@example.com "{\"view\":\"plan\",\"row\":$row,\"changes\":{\"status\":\"Approved\"},\"before\":$before}"); t "creator-only can't approve" "$(echo "$r" | q "'Only people who schedule' in d.get('error','')")" "True"
r=$(P carolyn@example.com "{\"view\":\"plan\",\"row\":$row,\"changes\":{\"status\":\"Approved\"},\"before\":$before}"); t "publisher approves" "$(echo "$r" | q "d.get('ok')")" "True"
plan=$(J jacob@embodiedphilosophy.com "$B/api/ops/social?view=plan")
t "carousel now Manual" "$(echo "$plan" | q "[x['values']['status'] for x in d['rows'] if x['values']['post_id']=='$NEWID'][0]")" "Manual"
t "created_by stamped" "$(echo "$plan" | q "[x['values']['created_by'] for x in d['rows'] if x['values']['post_id']=='$NEWID'][0]")" "Rebecka Oberg"
t "approved_by stamped" "$(echo "$plan" | q "[x['values']['approved_by'] for x in d['rows'] if x['values']['post_id']=='$NEWID'][0]")" "Carolyn Boucher"

echo "-- delete"
r=$(P carolyn@example.com "{\"view\":\"plan\",\"delete\":[{\"row\":$row}]}"); t "can't delete a Manual (approved) post" "$(echo "$r" | q "d.get('deleted')")" "0"
exp=$(echo "$plan" | q "[x['row'] for x in d['rows'] if x['display_status']=='Expired'][0]")
r=$(P carolyn@example.com "{\"view\":\"plan\",\"delete\":[{\"row\":$exp}]}"); t "expired deleted" "$(echo "$r" | q "d.get('deleted')")" "1"
plan=$(J jacob@embodiedphilosophy.com "$B/api/ops/social?view=plan"); t "deleted row hidden" "$(echo "$plan" | q "any(x['row']==$exp for x in d['rows'])")" "False"

echo "-- Instagram sync"
r=$(curl -s "$B/api/ops/social-sync?key=wrong"); t "sync needs the key" "$(echo "$r" | q "d.get('error')")" "unauthorized"
r=$(curl -s "$B/api/ops/social-sync?key=$CRON_SECRET&dry=1"); echo "dry: $r"
r=$(curl -s "$B/api/ops/social-sync?key=$CRON_SECRET"); echo "run: $r"; t "sync ok" "$(echo "$r" | q "d.get('ok')")" "True"
t "added only the newer post (NEW2)" "$(echo "$r" | q "d.get('added')")" "1"
r2=$(curl -s "$B/api/ops/social-sync?key=$CRON_SECRET"); t "second run adds nothing" "$(echo "$r2" | q "d.get('added')")" "0"
r3=$(curl -s "$B/api/ops/social-sync?key=$CRON_SECRET&from=$(date -u -d '-10 days' +%F)"); echo "backfill: $r3"; t "backfill adds the missing NEW1" "$(echo "$r3" | q "d.get('added')")" "1"
plan=$(J jacob@embodiedphilosophy.com "$B/api/ops/social?view=plan")
t "P101 matched and Posted" "$(echo "$plan" | q "[(x['values']['status'],x['values'].get('ig_media_id')) for x in d['rows'] if x['values']['post_id']=='P101'][0]")" "('Posted', 'NEW1')"
echo; echo "$ok passed, $bad failed"; [ $bad = 0 ]
