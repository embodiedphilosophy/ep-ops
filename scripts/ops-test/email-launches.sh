#!/usr/bin/env bash
# Teachers & Email phase 4a: launches (needs a fresh run.sh). Mock Kit only.
cd "$(dirname "$0")/../.."; source scripts/ops-test/env.sh
B=http://localhost:3100; ok=0; bad=0; LOG=scripts/ops-test/out/mock.log
ck() { node scripts/ops-test/cookie.mjs "$1"; }
G() { curl -s -H "Cookie: ep_ops=$(ck $1)" "$B/api/ops/email/launches$2"; }
P() { curl -s -H "Cookie: ep_ops=$(ck $1)" -H 'Content-Type: application/json' -X POST "$B/api/ops/email/launches" -d "$2"; }
t() { if [ "$2" = "$3" ]; then ok=$((ok+1)); echo "ok   $1"; else bad=$((bad+1)); echo "FAIL $1: got [$2] want [$3]"; fi; }
q() { python3 -c "import sys,json; d=json.load(sys.stdin); print($1)"; }
J=floss@example.com
r=$(G $J)
t "five playbooks to start with" "$(echo "$r" | q "len(d['playbooks'])")" "5"
t "no launches yet; all six suggested" "$(echo "$r" | q "(len(d['launches']), len(d['suggestions']))")" "(0, 6)"
t "Meditation Resolution is matched to its event on the schedule" "$(echo "$r" | q "bool([s for s in d['suggestions'] if s['name']=='Meditation Resolution 2027'][0]['event_id'])")" "True"
echo "-- the Meditation Resolution countdown"
p=$(P $J '{"action":"preview","playbook_id":"PB-countdown","dates":{"event":"2027-01-01"}}')
t "four emails on Mondays: 30 Nov, 14, 21 and 28 Dec" "$(echo "$p" | q "[s['date'] for s in d['steps'] if s['type']=='email']")" "['2026-11-30', '2026-12-14', '2026-12-21', '2026-12-28']"
t "they are all Mondays" "$(echo "$p" | q "all(__import__('datetime').date.fromisoformat(s['date']).weekday()==0 for s in d['steps'] if s['type']=='email')")" "True"
t "nothing on 7 Dec or 31 Dec" "$(echo "$p" | q "any(s['date'] in ('2026-12-07','2026-12-31') for s in d['steps'])")" "False"
echo "-- the enrollment playbook counts from three dates"
p=$(P $J '{"action":"preview","playbook_id":"PB-enrol","dates":{"open":"2027-01-06"}}')
t "with only the open date, the steps from the other dates are named as left out" "$(echo "$p" | q "sorted(d['missing'])")" "['close', 'term']"
p=$(P $J '{"action":"preview","playbook_id":"PB-enrol","dates":{"open":"2027-01-06","close":"2027-01-26","term":"2027-01-27"}}')
t "doors open on 6 Jan and the last day is 26 Jan" "$(echo "$p" | q "[s['date'] for s in d['steps'] if s['step'] in ('Doors open','Last day')]")" "['2027-01-06', '2027-01-26']"
STEPS=$(echo "$p" | q "__import__('json').dumps(d['steps'])")
echo "-- create"
t "viewer can't create" "$(P ichha@example.com '{"action":"create","name":"x"}' | q "'error' in d")" "True"
t "create needs a confirm" "$(P $J "{\"action\":\"create\",\"name\":\"Enrollment · Winter 2027\",\"playbook_id\":\"PB-enrol\",\"steps\":$STEPS}" | q "'confirm' in d['error']")" "True"
NE=$(echo "$p" | q "len([s for s in d['steps'] if s['type']=='email'])")
c=$(P $J "{\"action\":\"create\",\"confirm\":true,\"name\":\"Enrollment · Winter 2027\",\"kind\":\"Enrollment\",\"playbook_id\":\"PB-enrol\",\"dates\":{\"open\":\"2027-01-06\",\"close\":\"2027-01-26\",\"term\":\"2027-01-27\"},\"tag_name\":\"Enrolled · Winter 2027\",\"make_drafts\":true,\"landing_url\":\"https://embodiedphilosophy.com/winter\",\"steps\":$STEPS}")
t "the launch is made with every email planned and drafted in Kit" "$(echo "$c" | q "(d['id'], d['emails']==$NE, d['drafts']==$NE)")" "('L001', True, True)"
t "the Enrolled tag was made in Kit, once" "$(grep -c 'KIT TAG CREATED Enrolled · Winter 2027' $LOG)" "1"
t "all the drafts are unscheduled" "$(grep 'KIT DRAFT CREATED' $LOG | grep -c 'Launch ·')" "$NE"
t "none has a send time" "$(grep 'KIT DRAFT CREATED .*Launch ·' $LOG | grep -vc 'send_at *$')" "0"
t "a second launch with the same name is refused" "$(P $J "{\"action\":\"create\",\"confirm\":true,\"name\":\"enrollment · winter 2027\",\"steps\":$STEPS}" | q "'already exists' in d['error']")" "True"
t "the launch's emails are in the Email Plan, tied to it" "$(curl -s -H "Cookie: ep_ops=$(ck $J)" "$B/api/ops/email/plan?what=plan&fresh=1" | q "len([x for x in d['plan'] if x['launch_id']=='L001'])==$NE")" "True"
t "Welcome goes to the enrolled tag" "$(curl -s -H "Cookie: ep_ops=$(ck $J)" "$B/api/ops/email/plan?what=plan&fresh=1" | q "[x['audience_json'] for x in d['plan'] if x['step']=='Welcome'][0].count('Enrolled')>0")" "True"
echo "-- the board"
b=$(G $J "?id=L001")
t "emails lane has them all" "$(echo "$b" | q "len([i for i in d['items'] if i['lane']=='email'])==$NE")" "True"
t "social, landing page and task steps are on the board" "$(echo "$b" | q "sorted(set(i['lane'] for i in d['items']))")" "['email', 'page', 'social', 'task']"
t "the landing page link is there" "$(echo "$b" | q "[i['href'] for i in d['items'] if i['lane']=='page' and i['key']=='url'][0]")" "https://embodiedphilosophy.com/winter"
t "marking it live" "$(P $J '{"action":"update","id":"L001","changes":{"status":"Live"}}' | q "d['ok']")" "True"
t "a bad status is refused" "$(P $J '{"action":"update","id":"L001","changes":{"status":"Whenever"}}' | q "'error' in d")" "True"
t "saving it as a playbook adds a sixth" "$(P $J '{"action":"savePlaybook","id":"L001","name":"Enrollment, my way"}' | q "d['ok']"; G $J | q "len(d['playbooks'])")" "True
6"
t "the launch leaves the suggestions" "$(G $J | q "len(d['suggestions'])")" "5"
echo "-- Meditation Resolution from its playbook"
EVID=$(G $J | q "[s['event_id'] for s in d['suggestions'] if s['name']=='Meditation Resolution 2027'][0]")
P1=$(P $J '{"action":"preview","playbook_id":"PB-countdown","dates":{"event":"2027-01-01"}}'); S2=$(echo "$P1" | q "__import__('json').dumps(d['steps'])")
c=$(P $J "{\"action\":\"create\",\"confirm\":true,\"name\":\"Meditation Resolution 2027\",\"kind\":\"Event\",\"event_id\":\"$EVID\",\"playbook_id\":\"PB-countdown\",\"dates\":{\"event\":\"2027-01-01\"},\"make_drafts\":true,\"steps\":$S2}")
t "four Road to Resolution emails made" "$(echo "$c" | q "(d['emails'], d['drafts'])")" "(4, 4)"
t "no email was ever sent" "$(grep -ciE 'KIT (SENT|SEND)|/send' $LOG)" "0"
t "nothing blocked in Kit" "$(grep -c 'BLOCKED kit' $LOG)" "0"
echo "$ok passed, $bad failed"; [ $bad = 0 ]
