#!/usr/bin/env bash
# EP Ops 2, step 10: every cron in vercel.json, run as a dry run WITHOUT OPS_LIVE (lib/crongate.js). The app is restarted with the jobs paused
# (MOCK_OPS_LIVE=0, read by env.sh); each cron is called the way Vercel Cron calls it (GET with the Authorization header) and must answer
# "skipped", and the mock must see no write of any kind. The dry-run and preview modes that exist must work and write nothing either.
# At the end the app is restarted normally (jobs live against the mock, as every other flow expects). Mock only.
cd "$(dirname "$0")/../.."
export MOCK_OPS_LIVE=0
bash scripts/ops-test/run.sh --no-build >/dev/null 2>&1; source scripts/ops-test/env.sh
B=http://localhost:3100; ok=0; bad=0; LOG=scripts/ops-test/out/mock.log; AUTH="Authorization: Bearer $CRON_SECRET"
t() { if [ "$2" = "$3" ]; then ok=$((ok+1)); echo "ok   $1"; else bad=$((bad+1)); echo "FAIL $1: got [$2] want [$3]"; fi; }
q() { python3 -c "import sys,json; d=json.load(sys.stdin); print($1)"; }
WRITES='^(WROTE|ADDED|APPENDED|COPIED|RENAMED|CIRCLE WRITE|CIRCLE DATA|DRIVE|GITHUB|GRAPH PUBLISH|KIT (DRAFT|TAG|DESC|REFUSED)|MAKE PUT|SITE (REVALIDATE|CE )|ZENDESK WRITE|BLOCKED)'
writes() { grep -cE "$WRITES" $LOG; }
t "the app is running with the jobs paused (OPS_LIVE is not 1)" "${OPS_LIVE:-unset}" "0"
PATHS=$(python3 -c "import json; print(' '.join(c['path'] for c in json.load(open('vercel.json'))['crons']))")
t "vercel.json lists the eleven crons" "$(echo $PATHS | wc -w | tr -d ' ')" "11"
BASE=$(writes)
echo "-- each cron, the way Vercel Cron calls it"
for p in $PATHS; do
  t "$p without the key is refused" "$(curl -s -o /dev/null -w '%{http_code}' "$B$p")" "401"
  t "$p with a wrong key is refused" "$(curl -s -o /dev/null -w '%{http_code}' "$B$p?key=wrong")" "401"
  r=$(curl -s -H "$AUTH" -w '\n%{http_code}' "$B$p"); code=$(echo "$r" | tail -1); body=$(echo "$r" | sed '$d')
  t "$p (cron header) answers 200" "$code" "200"
  t "$p (cron header) says it was skipped, because the jobs are paused" "$(echo "$body" | q "(d.get('skipped'), 'OPS_LIVE' in d.get('reason',''))")" "(True, True)"
  t "$p wrote nothing to the mock" "$(writes)" "$BASE"
done
echo "-- the dry-run and preview modes that exist (they work with the jobs paused, and change nothing)"
# The mock's sheet starts without some tabs (Reminder Rules, Email Plan, Change Log): the first read of any of them sets the tab up, as every page does. So
# run the modes once, require that all they did was that set-up, then run them again: the second round must write nothing at all.
D=$(date -u -d "$(( (7 - $(date -u +%w)) % 7 - 14 )) days" +%F)   # a Sunday whose Weekly Scaffolding row is an unsent Draft in the mock
MODES=("/api/zoom/sync?dry=1" "/api/ops/auto?dry=1" "/api/ops/reminders?dry=1" "/api/ops/mentee-digest?dry=1" "/api/ops/social-sync?dry=1" "/api/scaffolding?dry=1&date=$D" "/api/scaffolding?preview=1&date=$D" "/api/ops/daily?preview=21" "/api/ops/daily?digest=preview" "/api/ops/ads-sync?dry=1" "/api/ops/ads-rules?dry=1" "/api/ops/ads-audiences?dry=1")
SETUP="^(ADDED (TAB|COLUMNS)|WROTE '[^']*'!A1:|APPENDED Change Log .*(new tab|new column))"
round() { for u in "${MODES[@]}"; do code=$(curl -s -o /dev/null -w '%{http_code}' -H "$AUTH" "$B$u"); t "$u answers 200" "$code" "200"; done; }
round
t "the first round only set up tabs that were missing (nothing else was written)" "$(grep -E "$WRITES" $LOG | grep -vcE "$SETUP")" "0"
BASE=$(writes)
round
t "the second round wrote nothing to the mock" "$(writes)" "$BASE"
t "mentee-digest?dry=1 shows the email it would send, and sends nothing" "$(curl -s -H "$AUTH" "$B/api/ops/mentee-digest?dry=1" | grep -c '<title>')" "1"
t "auto?dry=1 reports what it would close" "$(curl -s -H "$AUTH" "$B/api/ops/auto?dry=1" | q "d.get('dry', True) is True and d.get('skipped') is None")" "True"
t "reminders?dry=1 makes nothing" "$(curl -s -H "$AUTH" "$B/api/ops/reminders?dry=1" | q "(d['dry'], d['made'])")" "(True, 0)"
t "social-sync?dry=1 is a dry run" "$(curl -s -H "$AUTH" "$B/api/ops/social-sync?dry=1" | q "d['dry']")" "True"
t "daily?preview=21 sends nothing" "$(curl -s -H "$AUTH" "$B/api/ops/daily?preview=21" | q "'nothing was sent' in d['mode']")" "True"
t "ads-sync?dry=1 is a dry run and, with no ads key, says Meta isn't connected" "$(curl -s -H "$AUTH" "$B/api/ops/ads-sync?dry=1" | q "(d['dry'], d.get('notConnected'))")" "(True, True)"
t "ads-rules?dry=1 is a preview: nothing recorded, and with the jobs paused the first lock is closed" "$(curl -s -H "$AUTH" "$B/api/ops/ads-rules?dry=1" | q "(d['preview'], d['recorded'], d['locks']['cron'], d['locks']['open'])")" "(True, 0, False, False)"
t "ads-audiences?dry=1 is a preview that records nothing and, with no campaigns, says so" "$(curl -s -H "$AUTH" "$B/api/ops/ads-audiences?dry=1" | q "(d['preview'], d.get('note'), d['audiences']['created'])")" "(True, 'No campaigns yet.', 0)"
t "the newsletter sample is a page of HTML" "$([ "$(curl -s -H "$AUTH" "$B/api/scaffolding?preview=1&date=$D" | grep -c "<")" -gt 0 ] && echo yes)" "yes"
echo "-- the paused gate is the only thing that stopped them: the same call with the jobs live is not skipped (mock)"
export MOCK_OPS_LIVE=1; bash scripts/ops-test/run.sh --no-build >/dev/null 2>&1; source scripts/ops-test/env.sh
t "the app is running with the jobs live again" "$OPS_LIVE" "1"
t "/api/ops/auto is not skipped when the jobs are live" "$(curl -s -H "$AUTH" "$B/api/ops/auto?dry=1" | q "d.get('skipped') is None")" "True"
t "/api/ops/ads-sync is not skipped when the jobs are live (no ads key here, so it reads nothing)" "$(curl -s -H "$AUTH" "$B/api/ops/ads-sync" | q "d.get('skipped') is None and d.get('notConnected') is True")" "True"
t "/api/ops/ads-rules is not skipped when the jobs are live (no campaigns, nothing to do, nothing sent)" "$(curl -s -H "$AUTH" "$B/api/ops/ads-rules" | q "d.get('skipped') is None and d['recorded'] == 0 and d['applied'] == 0")" "True"
t "/api/ops/ads-audiences is not skipped when the jobs are live (no campaigns: it says so and makes no table)" "$(curl -s -H "$AUTH" "$B/api/ops/ads-audiences" | q "d.get('skipped') is None and d['note'] == 'No campaigns yet.' and d['audiences']['created'] == 0")" "True"
t "/api/ops/library-sync is not skipped when the jobs are live" "$(curl -s -H "$AUTH" "$B/api/ops/library-sync" | q "d.get('skipped') is None")" "True"
echo; echo "$ok passed, $bad failed"; [ $bad = 0 ]
