#!/usr/bin/env bash
# Content v2 phase 2 at API level (needs run.sh running): Review & approve rules (blocked vs flagged), Health, Rules. Mock only.
cd "$(dirname "$0")/../.."; source scripts/ops-test/env.sh
B=http://localhost:3100; ok=0; bad=0
ck() { node scripts/ops-test/cookie.mjs "$1"; }
G() { curl -s -H "Cookie: ep_ops=$(ck $1)" "$B/api/ops/social?view=$2"; }
P() { curl -s -H "Cookie: ep_ops=$(ck $1)" -H 'Content-Type: application/json' -X POST "$B/api/ops/social" -d "$2"; }
t() { if [ "$2" = "$3" ]; then ok=$((ok+1)); echo "ok   $1"; else bad=$((bad+1)); echo "FAIL $1: got [$2] want [$3]"; fi; }
q() { python3 -c "import sys,json; d=json.load(sys.stdin); print($1)"; }
D=$(date -u -d '+6 days' +%F)
add() { P carolyn@example.com "$(python3 -c "import json,sys;print(json.dumps({'view':'plan','add':True,'values':json.loads(sys.argv[1])}))" "$1")"; }

echo "-- rules and plan"
t "feed posts per week read from Rules tab" "$(G carolyn@example.com plan | q "d['rules']['feed_posts_per_week']")" "5"
t "text-heavy limit defaults to 2" "$(G carolyn@example.com plan | q "d['rules']['max_text_heavy_run']")" "2"

echo "-- review: flagged vs blocked"
r=$(add "{\"publish_date\":\"$D\",\"publish_time_ET\":\"11:00\",\"platforms\":\"IG Feed\",\"caption\":\"A verse.\",\"pillar\":\"Sanskrit translation\",\"image_url\":\"https://lh3.googleusercontent.com/d/AAAAAAAAAAAAAAAAAAAAAAAA\"}"); FL=$(echo "$r" | q "d['post_id']")
r=$(add "{\"publish_date\":\"$D\",\"publish_time_ET\":\"12:00\",\"platforms\":\"IG Feed\",\"caption\":\"Join us.\",\"pillar\":\"Past or upcoming course\",\"linked_event\":\"Not a real event — 2026-12-01\",\"image_url\":\"https://lh3.googleusercontent.com/d/AAAAAAAAAAAAAAAAAAAAAAAA\"}"); BL=$(echo "$r" | q "d['post_id']")
rev=$(G carolyn@example.com review)
t "flagged post lists teacher clearance" "$(echo "$rev" | q "[x for x in d['rows'] if x['values']['post_id']=='$FL'][0]['flags'][0][:20]")" "Needs teacher cleara"
t "blocked post lists the missing fact" "$(echo "$rev" | q "len([x for x in d['rows'] if x['values']['post_id']=='$BL'][0]['blocked'])")" "1"
fl=$(echo "$rev" | q "__import__('json').dumps([[x['row'],x['values']] for x in d['rows'] if x['values']['post_id']=='$FL'][0])"); bl=$(echo "$rev" | q "__import__('json').dumps([[x['row'],x['values']] for x in d['rows'] if x['values']['post_id']=='$BL'][0])")
flrow=$(echo "$fl" | q "d[0]"); flval=$(echo "$fl" | q "__import__('json').dumps(d[1])"); blrow=$(echo "$bl" | q "d[0]"); blval=$(echo "$bl" | q "__import__('json').dumps(d[1])")
r=$(P carolyn@example.com "{\"view\":\"plan\",\"approve\":[{\"row\":$blrow,\"before\":$blval,\"reason\":\"just do it\"}]}"); t "blocked can't be approved even with a reason" "$(echo "$r" | q "(d['approved'], d['skipped'][0]['why'][:12])")" "(0, 'Its event is')"
r=$(P carolyn@example.com "{\"view\":\"plan\",\"approve\":[{\"row\":$flrow,\"before\":$flval}]}"); t "flagged needs a reason" "$(echo "$r" | q "(d['approved'], d['skipped'][0].get('needReason'))")" "(0, True)"
r=$(P cleo@example.com "{\"view\":\"plan\",\"approve\":[{\"row\":$flrow,\"before\":$flval,\"reason\":\"ok\"}]}"); t "creator can't approve at all" "$(echo "$r" | q "'schedule' in d.get('error','')")" "True"
r=$(P carolyn@example.com "{\"view\":\"plan\",\"approve\":[{\"row\":$flrow,\"before\":$flval,\"reason\":\"Floss cleared it by message\"}]}"); t "flagged approved with a reason" "$(echo "$r" | q "d['approved']")" "1"
plan=$(G carolyn@example.com plan)
t "override reason saved on the post" "$(echo "$plan" | q "'Floss cleared it' in [x['values'].get('override_reason','') for x in d['rows'] if x['values']['post_id']=='$FL'][0]")" "True"
t "approved by Carolyn" "$(echo "$plan" | q "[x['values'].get('approved_by') for x in d['rows'] if x['values']['post_id']=='$FL'][0]")" "Carolyn Boucher"

echo "-- health"
h=$(G carolyn@example.com health)
t "health has items, High first" "$(echo "$h" | q "d['items'][0]['level']")" "High"
t "health mentions the unconfirmed post" "$(echo "$h" | q "any('not confirmed' in i['title'] for i in d['items'])")" "True"
echo; echo "$ok passed, $bad failed"; [ $bad = 0 ]
