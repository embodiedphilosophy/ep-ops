#!/usr/bin/env bash
# Teachers & Email phase 1 at API level (needs a fresh run.sh). Mock Kit only: nothing real is read or written.
cd "$(dirname "$0")/../.."; source scripts/ops-test/env.sh
B=http://localhost:3100; ok=0; bad=0
ck() { node scripts/ops-test/cookie.mjs "$1"; }
G() { curl -s -H "Cookie: ep_ops=$(ck $1)" "$B/api/ops/email?what=$2&fresh=1"; }
P() { curl -s -H "Cookie: ep_ops=$(ck $1)" -H 'Content-Type: application/json' -X POST "$B/api/ops/email" -d "$2"; }
t() { if [ "$2" = "$3" ]; then ok=$((ok+1)); echo "ok   $1"; else bad=$((bad+1)); echo "FAIL $1: got [$2] want [$3]"; fi; }
q() { python3 -c "import sys,json; d=json.load(sys.stdin); print($1)"; }
J=jacob@embodiedphilosophy.com; R=rebecka@example.com
r=$(G $J emails)
L=$(echo "$r" | q "[e['id'] for e in d['events'] if 'Recognition in practice' in e['title']][0]"); RES=$(echo "$r" | q "[e['id'] for e in d['events'] if 'Meditation Resolution' in e['title']][0]")
t "Kit is connected" "$(echo "$r" | q "d['configured']")" "True"
t "the four Road to Resolution drafts are unmatched" "$(echo "$r" | q "len([x for x in d['emails'] if x['subject'].startswith('Road to Resolution') and not x['linked']])")" "4"
t "a promo with the lecture's ID is matched to its event" "$(echo "$r" | q "[x['event_id'] for x in d['emails'] if x['kit_id']=='230'][0]")" "$L"
t "the automatic MM reminder counts as matched" "$(echo "$r" | q "[x['linked'] for x in d['emails'] if x['kit_id']=='220'][0]")" "True"
t "hand-made MM email is flagged duplicate" "$(echo "$r" | q "[x['flags'] for x in d['emails'] if x['kit_id']=='221'][0]")" "['duplicate']"
t "WR1, WR2, NEEDS CONTENT and Test are stale" "$(echo "$r" | q "sorted(x['kit_id'] for x in d['emails'] if 'stale' in x['flags'])")" "['210', '211', '212', '213']"
t "a sent email is never offered for tidy" "$(echo "$r" | q "[x['flags'] for x in d['emails'] if x['kit_id']=='231'][0]")" "[]"
w=$(G $J week); t "week counts the lecture scheduled and sent emails" "$(echo "$w" | q "[(e['inKit'], e['drafts']) for e in d['events'] if e['id']=='$L'][0]")" "(2, 0)"
t "attention lists the unmatched emails" "$(echo "$w" | q "any(a['key']=='unlinked' for a in d['attention'])")" "True"
echo "-- attach"
t "attach needs a confirm" "$(P $J "{\"action\":\"attach\",\"kit_id\":\"200\",\"event_id\":\"$RES\"}" | q "'confirm' in d['error']")" "True"
t "attach to an unknown event refused" "$(P $J '{"action":"attach","kit_id":"200","event_id":"E999","confirm":true}' | q "'error' in d")" "True"
t "viewer cannot attach" "$(P ichha@example.com "{\"action\":\"attach\",\"kit_id\":\"200\",\"event_id\":\"$RES\",\"confirm\":true}" | q "'error' in d")" "True"
for i in 200 201 202 203; do P $J "{\"action\":\"attach\",\"kit_id\":\"$i\",\"event_id\":\"$RES\",\"confirm\":true}" >/dev/null; done
r=$(G $J emails); t "all four now under $RES" "$(echo "$r" | q "len([x for x in d['emails'] if x['event_id']=='$RES'])")" "4"
t "Kit's description got the ID" "$(grep -c "KIT DESCRIPTION SET 20[0-3] \[$RES\]" scripts/ops-test/out/mock.log)" "4"
t "nothing else was written to Kit" "$(grep -c 'BLOCKED kit' scripts/ops-test/out/mock.log)" "0"
echo "-- tidy"
t "archive needs a confirm" "$(P $J '{"action":"archive","kit_ids":["210"]}' | q "'confirm' in d['error']")" "True"
t "stale drafts and the duplicate are put away" "$(P $J '{"action":"archive","kit_ids":["210","211","212","213","221"],"confirm":true}' | q "d['changed']")" "5"
t "a sent email can't be put away" "$(P $J '{"action":"archive","kit_ids":["231"],"confirm":true}' | q "d['changed']")" "0"
r=$(G $J emails); t "five are archived" "$(echo "$r" | q "d['counts']['archived']")" "5"
t "nothing left to tidy" "$(echo "$r" | q "d['counts']['stale']+d['counts']['duplicate']")" "0"
t "Kit saw no delete or archive" "$(grep -cE 'DELETE|KIT ARCHIVE' scripts/ops-test/out/mock.log)" "0"
t "restore brings one back" "$(P $J '{"action":"restore","kit_ids":["210"],"confirm":true}' | q "d['changed']")" "1"
echo "$ok passed, $bad failed"; [ $bad = 0 ]
