#!/usr/bin/env bash
# Teachers & Email phase 2 at API level: plan, Kit drafts, conflicts, checks, schedule, reschedule (needs a fresh run.sh). Mock Kit only.
cd "$(dirname "$0")/../.."; source scripts/ops-test/env.sh
B=http://localhost:3100; ok=0; bad=0; LOG=scripts/ops-test/out/mock.log
ck() { node scripts/ops-test/cookie.mjs "$1"; }
G() { curl -s -H "Cookie: ep_ops=$(ck $1)" "$B/api/ops/email/plan?$2"; }
P() { curl -s -H "Cookie: ep_ops=$(ck $1)" -H 'Content-Type: application/json' -X POST "$B/api/ops/email/plan" -d "$2"; }
t() { if [ "$2" = "$3" ]; then ok=$((ok+1)); echo "ok   $1"; else bad=$((bad+1)); echo "FAIL $1: got [$2] want [$3]"; fi; }
q() { python3 -c "import sys,json; d=json.load(sys.stdin); print($1)"; }
J=jacob@embodiedphilosophy.com
EV=$(curl -s -H "Cookie: ep_ops=$(ck $J)" "$B/api/ops/email?what=emails&fresh=1" | q "[e['id'] for e in d['events'] if 'Meditation Resolution' in e['title']][0]")
D1=$(date -u -d '+10 days' +%F); D2=$(date -u -d '+12 days' +%F)
BL='[{"type":"text","text":"Join us for **Meditation Resolution**."},{"type":"facts"},{"type":"member","member":"Members: your link is in Circle.","nonmember":"Everyone is welcome."},{"type":"button","label":"Join us","url":"https://enroll.embodiedphilosophy.com/resolution"}]'
AUD='{"include":[{"type":"tag","id":2,"name":"Member: Wisdom School"}],"exclude":[]}'
echo "-- create and push"
c=$(P $J "{\"action\":\"create\",\"event_id\":\"$EV\",\"type\":\"Promo\",\"step\":\"Promo #1\",\"subject\":\"Meditation Resolution opens\",\"planned_date\":\"$D1\",\"planned_time_et\":\"09:00\",\"blocks\":$BL,\"audience\":$AUD}"); ID=$(echo "$c" | q "d['id']")
t "plan row made" "$ID" "EM001"
t "viewer can't create" "$(P ichha@example.com '{"action":"create"}' | q "'error' in d")" "True"
t "push creates a Kit draft" "$(P $J "{\"action\":\"push\",\"id\":\"$ID\"}" | q "bool(d['kit_id'])")" "True"
t "the draft carries the event ID and audience in its description" "$(grep -c "KIT DRAFT CREATED .*\[$EV\] Promo · Promo #1 · Member: Wisdom School" $LOG)" "1"
t "the draft was not scheduled" "$(grep 'KIT DRAFT CREATED' $LOG | tail -1 | grep -c 'send_at *$')" "1"
one=$(G $J "id=$ID"); KID=$(echo "$one" | q "d['plan']['kit_id']")
t "preview shows both versions" "$(echo "$one" | q "'Everyone else sees' in d['preview'] and '{% if' in d['html']")" "True"
t "Kit now has it as a draft that matches" "$(echo "$one" | q "d['plan']['conflict']=='' and d['plan']['status']")" "Draft"
echo "-- edit in Ops, edit in Kit, conflict"
P $J "{\"action\":\"save\",\"id\":\"$ID\",\"pushToKit\":true,\"changes\":{\"subject\":\"Meditation Resolution is open\"}}" >/dev/null
t "an edit in Ops updates the Kit draft" "$(grep -c "KIT DRAFT UPDATED $KID Meditation Resolution is open" $LOG)" "1"
t "each copy change is a revision" "$(G $J "id=$ID" | q "len(d['revisions'])")" "2"
curl -s -X PUT "$KIT_BASE/broadcasts/$KID" -H 'Content-Type: application/json' -d '{"subject":"Edited in Kit by Floss"}' >/dev/null
t "an edit made in Kit shows as Edited in Kit" "$(G $J "id=$ID&fresh=1" | q "d['plan']['conflict']")" "kit"
P $J "{\"action\":\"save\",\"id\":\"$ID\",\"changes\":{\"preview_text\":\"A quiet start\"}}" >/dev/null
t "edited in both → conflict" "$(G $J "id=$ID&fresh=1" | q "d['plan']['conflict']")" "both"
t "pushing over Kit's edit is refused" "$(P $J "{\"action\":\"push\",\"id\":\"$ID\"}" | q "d['conflict']")" "True"
t "keeping Kit's version pulls it in" "$(P $J "{\"action\":\"resolve\",\"id\":\"$ID\",\"choose\":\"kit\"}" | q "d['ok']")" "True"
one=$(G $J "id=$ID&fresh=1"); t "subject is Kit's and the conflict is cleared" "$(echo "$one" | q "(d['plan']['subject'], d['plan']['conflict'])")" "('Edited in Kit by Floss', '')"
echo "-- audience count"
t "a tag audience shows its live count" "$(G $J "what=count&include=tag:1" | q "(d['n'], d['exact'])")" "(7, True)"
echo "-- schedule"
t "schedule needs a confirm" "$(P $J "{\"action\":\"schedule\",\"id\":\"$ID\"}" | q "'confirm' in d['error']")" "True"
r=$(P $J "{\"action\":\"schedule\",\"id\":\"$ID\",\"confirm\":true}"); t "a draft not marked ready needs a note" "$(echo "$r" | q "d['needNote']")" "True"
t "nothing was scheduled in Kit yet" "$(grep -c "send_at 20" $LOG)" "0"
P $J "{\"action\":\"ready\",\"id\":\"$ID\"}" >/dev/null
r=$(P $J "{\"action\":\"schedule\",\"id\":\"$ID\",\"confirm\":true}"); t "ready but with checks failing still needs a note" "$(echo "$r" | q "d['needNote'] and len(d['checks'])>0")" "True"
echo "   (checks: $(echo "$r" | q "[c['key'] for c in d['checks']]"))"
r=$(P $J "{\"action\":\"schedule\",\"id\":\"$ID\",\"confirm\":true,\"override_note\":\"Jake approved by message\"}"); t "scheduled with a note" "$(echo "$r" | q "bool(d.get('send_at'))")" "True"
t "Kit got a send time" "$(grep -c "KIT DRAFT UPDATED $KID .*send_at 20" $LOG)" "1"
one=$(G $J "id=$ID&fresh=1"); t "status is Scheduled" "$(echo "$one" | q "d['plan']['status']")" "Scheduled"
t "the override is logged as a comment" "$(echo "$one" | q "any('Scheduled anyway' in c['text'] for c in d['comments'])")" "True"
echo "-- reschedule"
t "moving a scheduled email asks first" "$(P $J "{\"action\":\"reschedule\",\"id\":\"$ID\",\"date\":\"$D2\"}" | q "'confirm' in d['error']")" "True"
t "confirmed move updates Kit" "$(P $J "{\"action\":\"reschedule\",\"id\":\"$ID\",\"date\":\"$D2\",\"confirm\":true}" | q "d['wasScheduled']")" "True"
t "planned date follows" "$(G $J "id=$ID&fresh=1" | q "d['plan']['planned_date']")" "$D2"
t "a scheduled email can't be marked not needed" "$(P $J "{\"action\":\"notNeeded\",\"id\":\"$ID\",\"confirm\":true}" | q "'error' in d")" "True"
echo "-- adopt and calendar"
r=$(P $J '{"action":"adopt","kit_id":"201"}'); t "a Kit email can be adopted into the plan" "$(echo "$r" | q "d['id']")" "EM002"
cal=$(G $J "what=calendar&from=$(date -u -d '-30 days' +%F)&to=$(date -u -d '+60 days' +%F)")
t "calendar has the scheduled email on its new day" "$(echo "$cal" | q "[i['date'] for i in d['items'] if i['id']=='$ID'][0]")" "$D2"
t "the automatic reminder sits in its own lane" "$(echo "$cal" | q "any(i['kind']=='auto' for i in d['items'])")" "True"
t "undated drafts wait in the tray" "$(echo "$cal" | q "len(d['tray'])>0")" "True"
t "Programming events overlay" "$(echo "$cal" | q "len(d['events'])>0")" "True"
t "no email was ever sent" "$(grep -ciE 'KIT (SENT|SEND)|/send' $LOG)" "0"
t "nothing blocked in Kit" "$(grep -c 'BLOCKED kit' $LOG)" "0"
echo "$ok passed, $bad failed"; [ $bad = 0 ]
