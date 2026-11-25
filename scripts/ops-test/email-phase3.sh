#!/usr/bin/env bash
# Teachers & Email phase 3 at API level: reminder rules and the newsletter (needs a fresh run.sh). Mock Kit only.
cd "$(dirname "$0")/../.."; source scripts/ops-test/env.sh
B=http://localhost:3100; ok=0; bad=0; LOG=scripts/ops-test/out/mock.log
ck() { node scripts/ops-test/cookie.mjs "$1"; }
R() { curl -s -H "Cookie: ep_ops=$(ck $1)" "$B/api/ops/email/reminders$2"; }
RP() { curl -s -H "Cookie: ep_ops=$(ck $1)" -H 'Content-Type: application/json' -X POST "$B/api/ops/email/reminders" -d "$2"; }
N() { curl -s -H "Cookie: ep_ops=$(ck $1)" "$B/api/ops/email/newsletter$2"; }
NP() { curl -s -H "Cookie: ep_ops=$(ck $1)" -H 'Content-Type: application/json' -X POST "$B/api/ops/email/newsletter" -d "$2"; }
t() { if [ "$2" = "$3" ]; then ok=$((ok+1)); echo "ok   $1"; else bad=$((bad+1)); echo "FAIL $1: got [$2] want [$3]"; fi; }
q() { python3 -c "import sys,json; d=json.load(sys.stdin); print($1)"; }
J=jacob@embodiedphilosophy.com; AUD='{"include":[{"type":"tag","id":2,"name":"Member: Wisdom School"}],"exclude":[]}'
echo "-- reminder rules"
r=$(R $J "?fresh=1")
t "five rules, all off" "$(echo "$r" | q "(len(d['rules']), any(x['enabled'] for x in d['rules']))")" "(5, False)"
t "Meditation Mondays and teacher reminders are listed as handled elsewhere" "$(echo "$r" | q "[b['key'] for b in d['builtIn']]")" "['mm', 'teachers']"
t "viewer can't change a rule" "$(RP ichha@example.com '{"action":"save","id":"R001","changes":{"enabled":true}}' | q "'error' in d")" "True"
t "a rule can't be switched on with no audience" "$(RP $J '{"action":"save","id":"R001","changes":{"enabled":true}}' | q "'audience' in d['error'] or 'who gets it' in d['error'].lower()")" "True"
t "a bad time is explained" "$(RP $J '{"action":"save","id":"R001","changes":{"sends":"soon"}}' | q "'60m' in d['error']")" "True"
t "audience + on" "$(RP $J "{\"action\":\"save\",\"id\":\"R001\",\"changes\":{\"audience\":$AUD,\"enabled\":true}}" | q "d['ok']")" "True"
t "R004 audience + on" "$(RP $J "{\"action\":\"save\",\"id\":\"R004\",\"changes\":{\"audience\":$AUD,\"enabled\":true}}" | q "d['ok']")" "True"
t "R003 audience + on + schedules itself" "$(RP $J "{\"action\":\"save\",\"id\":\"R003\",\"changes\":{\"audience\":$AUD,\"enabled\":true,\"auto_schedule\":true}}" | q "d['ok']")" "True"
r=$(R $J "?fresh=1")
t "SS rule will make the wk 7 reminder an hour before" "$(echo "$r" | q "[(u['state']) for u in d['upcoming'] if u['rule']['id']=='R001' and 'wk 7' in u['event']['title']]")" "['new']"
t "the rule counts back from 12pm ET" "$(echo "$r" | q "[u['send_at'][11:16] for u in d['upcoming'] if u['rule']['id']=='R001' and 'wk 7' in u['event']['title']][0] in ('15:00','16:00')")" "True"
t "Open Session gets two emails (day before, an hour before)" "$(echo "$r" | q "len([u for u in d['upcoming'] if u['rule']['id']=='R004' and 'Open Session 3' in u['event']['title']])")" "2"
t "Practicum with no Zoom link is skipped and says why" "$(echo "$r" | q "[u['why'] for u in d['upcoming'] if u['rule']['id']=='R004' and 'Practicum' in u['event']['title']][0]")" "The Master Schedule has no Zoom link for it yet."
t "monthly lecture gets the day-of and 30 minute emails" "$(echo "$r" | q "len([u for u in d['upcoming'] if u['rule']['id']=='R003' and 'Monthly Lecture' in u['event']['title']])")" "2"
t "a rule that's off makes nothing" "$(echo "$r" | q "[u['state'] for u in d['upcoming'] if u['rule']['id']=='R002']")" "[]"
t "making them needs a confirm" "$(RP $J '{"action":"run","id":"R001"}' | q "'confirm' in d['error']")" "True"
t "an off rule can't be run" "$(RP $J '{"action":"run","id":"R002","confirm":true}' | q "'error' in d")" "True"
t "R001 makes the wk 7 reminder" "$(RP $J '{"action":"run","id":"R001","confirm":true}' | q "d['made']")" "1"
t "it is a Kit draft with the event ID and the rule in its description" "$(grep -c 'KIT DRAFT CREATED .*Reminder · Sādhana School weekly session' $LOG)" "1"
t "and was not scheduled" "$(grep 'KIT DRAFT CREATED .*Reminder · Sādhana' $LOG | tail -1 | grep -c 'send_at *$')" "1"
t "running again makes nothing new" "$(RP $J '{"action":"run","id":"R001","confirm":true}' | q "d['made']")" "0"
t "the rule remembers its last run" "$(R $J "?fresh=1" | q "'1 already there' in [x['last_result'] for x in d['rules'] if x['id']=='R001'][0]")" "True"
t "R003 (schedules itself) sets a send time in Kit" "$(RP $J '{"action":"run","id":"R003","confirm":true}' | q "d['made']")" "2"
t "...with a send_at" "$(grep 'KIT DRAFT CREATED .*Wisdom School Monthly Lecture' $LOG | grep -c 'send_at 20')" "2"
t "the reminders appear in the Email Plan as Reminders" "$(curl -s -H "Cookie: ep_ops=$(ck $J)" "$B/api/ops/email/plan?what=plan&fresh=1" | q "len([x for x in d['plan'] if x['type']=='Reminder'])")" "3"
echo "-- the daily job"
t "needs the key" "$(curl -s -o /dev/null -w '%{http_code}' "$B/api/ops/reminders")" "401"
t "dry run changes nothing" "$(curl -s "$B/api/ops/reminders?key=mock-cron-secret&dry=1" | q "(d['dry'], d['made'])")" "(True, 0)"
t "a real run makes what's left (Open Session's two emails)" "$(curl -s "$B/api/ops/reminders?key=mock-cron-secret" | q "d['made']")" "2"
t "and the next run makes nothing" "$(curl -s "$B/api/ops/reminders?key=mock-cron-secret" | q "d['made']")" "0"
echo "-- newsletter"
n=$(N $J "?fresh=1")
t "the two issues that went out are No. 1 and No. 2" "$(echo "$n" | q "sorted([i['number'] for i in d['issues'] if i['state']=='Sent'])")" "[1, 2]"
t "issues that never went out are Skipped, with no number" "$(echo "$n" | q "all(i['number'] is None for i in d['issues'] if i['state']=='Skipped') and len([i for i in d['issues'] if i['state']=='Skipped'])>=3")" "True"
SUN=$(python3 -c "import datetime as D; d=D.date.today()+D.timedelta(days=1); print(d+D.timedelta(days=(6-d.weekday())%7))")
before=$(grep -c 'KIT DRAFT CREATED' $LOG)
r=$(curl -s "$B/api/scaffolding?key=mock-cron-secret"); t "Thursday's job makes the issue in Ops, not a blank Kit draft" "$(echo "$r" | q "d['action']")" "issue-made-in-ops"
t "no Kit draft was created" "$(( $(grep -c 'KIT DRAFT CREATED' $LOG) - before ))" "0"
n=$(N $J "?fresh=1"); t "the new issue is next in line: No. 3" "$(echo "$n" | q "[(i['number'], i['state']) for i in d['issues'] if i['send_date']=='$SUN']")" "[(3, 'Draft')]"
t "and the job doesn't make a second row" "$(curl -s "$B/api/scaffolding?key=mock-cron-secret" >/dev/null; N $J "?fresh=1" | q "len([i for i in d['issues'] if i['send_date']=='$SUN'])")" "1"
d=$(N $J "?date=$SUN&fresh=1")
t "This week at EP is filled from the schedule" "$(echo "$d" | q "isinstance(d['events'], list)")" "True"
t "blanks are named" "$(echo "$d" | q "len(d['gaps'])>0")" "True"
t "a verse with no Sanskrit can't be picked" "$(NP $J "{\"action\":\"save\",\"date\":\"$SUN\",\"changes\":{\"quote_id\":\"Q2\"}}" | q "'verified' in d['error']")" "True"
t "a verified verse is copied exactly" "$(NP $J "{\"action\":\"save\",\"date\":\"$SUN\",\"changes\":{\"quote_id\":\"Q3\"}}" | q "d['ok']")" "True"
d=$(N $J "?date=$SUN&fresh=1"); t "diacritics and Devanagari are stamped" "$(echo "$d" | q "(d['issue']['values']['sanskrit_iast'], d['issue']['values']['sanskrit_devanagari'])")" "('oṃ gaṃ gaṇapataye namaḥ ||', 'ॐ गं गणपतये नमः ॥')"
NP $J "{\"action\":\"save\",\"date\":\"$SUN\",\"changes\":{\"subject\":\"Beginning again\",\"preview_text\":\"A new year\",\"reflection_headline\":\"Return\",\"reflection_body\":\"What stays when everything moves.\"}}" >/dev/null
t "the text saved" "$(N $J "?date=$SUN&fresh=1" | q "d['issue']['values']['subject']")" "Beginning again"
t "a viewer can't edit" "$(NP ichha@example.com "{\"action\":\"save\",\"date\":\"$SUN\",\"changes\":{\"subject\":\"x\"}}" | q "'error' in d")" "True"
t "building needs a confirm" "$(NP $J "{\"action\":\"build\",\"date\":\"$SUN\"}" | q "'confirm' in d['error']")" "True"
r=$(NP $J "{\"action\":\"build\",\"date\":\"$SUN\",\"confirm\":true}"); t "build makes the Kit draft" "$(echo "$r" | q "r_ok if (r_ok:=d.get('ok')) else d.get('error')")" "True"
t "Kit got a Weekly Scaffolding draft, unscheduled" "$(grep 'KIT DRAFT CREATED' $LOG | grep -c "Weekly Scaffolding $SUN")" "1"
t "the issue is now In Kit" "$(N $J "?fresh=1" | q "[i['state'] for i in d['issues'] if i['send_date']=='$SUN'][0]")" "In Kit"
t "an issue with nothing missing schedules for Sunday 9:00 ET" "$(NP $J "{\"action\":\"schedule\",\"date\":\"$SUN\",\"confirm\":true}" | q "d['ok']")" "True"
SUN2=$(python3 -c "import datetime as D; print(D.date.fromisoformat('$SUN')+D.timedelta(days=7))")
NP $J "{\"action\":\"create\",\"date\":\"$SUN2\"}" >/dev/null; NP $J "{\"action\":\"build\",\"date\":\"$SUN2\",\"confirm\":true}" >/dev/null
r=$(NP $J "{\"action\":\"schedule\",\"date\":\"$SUN2\",\"confirm\":true}"); t "an unfinished issue needs a note to schedule" "$(echo "$r" | q "d.get('needNote')")" "True"
t "and the note lets it through" "$(NP $J "{\"action\":\"schedule\",\"date\":\"$SUN2\",\"confirm\":true,\"override_note\":\"Jake read it\"}" | q "d['ok']")" "True"
t "Kit got two send times" "$(grep -c 'KIT DRAFT UPDATED 9.. .*send_at 20' $LOG)" "2"
t "now Scheduled and locked" "$(N $J "?fresh=1" | q "[i['state'] for i in d['issues'] if i['send_date']=='$SUN'][0]")" "Scheduled"
t "a scheduled issue can't be skipped" "$(NP $J "{\"action\":\"skip\",\"date\":\"$SUN\",\"confirm\":true}" | q "'error' in d")" "True"
t "no email was sent to the audience" "$(grep -ciE 'KIT (SENT|SEND)|/send' $LOG)" "0"
t "nothing blocked in Kit" "$(grep -c 'BLOCKED kit' $LOG)" "0"
echo "$ok passed, $bad failed"; [ $bad = 0 ]
