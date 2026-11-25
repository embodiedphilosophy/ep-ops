#!/usr/bin/env bash
# Teachers & Email phase 4c: Media — replays to post, "Mark posted", the old Content → Media link (needs a fresh run.sh). Mock only.
cd "$(dirname "$0")/../.."; source scripts/ops-test/env.sh
B=http://localhost:3100; ok=0; bad=0; LOG=scripts/ops-test/out/mock.log
ck() { node scripts/ops-test/cookie.mjs "$1"; }
G() { curl -s -H "Cookie: ep_ops=$(ck $1)" "$B/api/ops/email/media"; }
P() { curl -s -H "Cookie: ep_ops=$(ck $1)" -H 'Content-Type: application/json' -X POST "$B/api/ops/email/media" -d "$2"; }
t() { if [ "$2" = "$3" ]; then ok=$((ok+1)); echo "ok   $1"; else bad=$((bad+1)); echo "FAIL $1: got [$2] want [$3]"; fi; }
q() { python3 -c "import sys,json; d=json.load(sys.stdin); print($1)"; }
F=floss@example.com
m=$(G $F)
N=$(echo "$m" | q "len([r for r in d['replays'] if r['title']=='Meditation Mondays'])")
t "recent Meditation Mondays are waiting for their replay" "$([ "$N" -ge 2 ] && echo yes)" "yes"
ID=$(echo "$m" | q "[r['id'] for r in d['replays'] if r['title']=='Meditation Mondays'][0]")
t "nothing is posted yet" "$(echo "$m" | q "len(d['posted'])")" "0"
t "viewer can't mark one posted" "$(P ichha@example.com "{\"action\":\"posted\",\"id\":\"$ID\",\"link\":\"https://community.example.com/c/replays/mm\"}" | q "'error' in d")" "True"
t "a link must be a web address" "$(P $F "{\"action\":\"posted\",\"id\":\"$ID\",\"link\":\"circle post\"}" | q "'https' in d['error']")" "True"
t "an unknown session is refused" "$(P $F '{"action":"posted","id":"E999","link":"https://community.example.com/c/x"}' | q "'error' in d")" "True"
FUT=$(curl -s -H "Cookie: ep_ops=$(ck $F)" "$B/api/ops/email/plan?what=meta" | q "[e['id'] for e in d['events'] if e['date']>'$(date -u +%F)'][0]")
t "a session that hasn't happened can't have a replay" "$(P $F "{\"action\":\"posted\",\"id\":\"$FUT\",\"link\":\"https://community.example.com/c/x\"}" | q "'hasn' in d['error']")" "True"
t "marking it posted saves the Circle link" "$(P $F "{\"action\":\"posted\",\"id\":\"$ID\",\"link\":\"https://community.example.com/c/replays/mm\"}" | q "d['ok']")" "True"
t "the link was written to Event Details as Replay Link" "$(grep -c "WROTE 'Event Details'.*community.example.com/c/replays/mm" $LOG | awk '{print ($1>0)?"yes":"no"}')" "yes"
m=$(G $F)
t "it left the waiting list" "$(echo "$m" | q "len([r for r in d['replays'] if r['title']=='Meditation Mondays'])")" "$((N-1))"
t "and is in the posted list with its link" "$(echo "$m" | q "[p['link'] for p in d['posted']]")" "['https://community.example.com/c/replays/mm']"
t "the link can be changed" "$(P $F "{\"action\":\"posted\",\"id\":\"$ID\",\"link\":\"https://community.example.com/c/replays/mm-2\"}" | q "d['ok']"; G $F | q "[p['link'] for p in d['posted']][0]")" "True
https://community.example.com/c/replays/mm-2"
t "nothing was blocked" "$(grep -c 'BLOCKED' $LOG)" "0"
echo "$ok passed, $bad failed"; [ $bad = 0 ]
