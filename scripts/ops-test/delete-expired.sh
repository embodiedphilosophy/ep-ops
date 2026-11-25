#!/usr/bin/env bash
# "Delete all expired" in Review & approve's Health panel (needs a fresh run.sh). Mock only.
cd "$(dirname "$0")/../.."; source scripts/ops-test/env.sh
B=http://localhost:3100; ok=0; bad=0
ck() { node scripts/ops-test/cookie.mjs "$1"; }
G() { curl -s -H "Cookie: ep_ops=$(ck $1)" "$B/api/ops/social?view=$2"; }
P() { curl -s -H "Cookie: ep_ops=$(ck $1)" -H 'Content-Type: application/json' -X POST "$B/api/ops/social" -d "$2"; }
t() { if [ "$2" = "$3" ]; then ok=$((ok+1)); echo "ok   $1"; else bad=$((bad+1)); echo "FAIL $1: got [$2] want [$3]"; fi; }
q() { python3 -c "import sys,json; d=json.load(sys.stdin); print($1)"; }
n=$(G carolyn@example.com health | q "[i['action']['n'] for i in d['items'] if i.get('action')][0]")
t "Health offers the button with a count" "$([ "$n" -gt 0 ] && echo yes)" "yes"
t "a creator doesn't get the button" "$(G cleo@example.com health | q "any(i.get('action') for i in d['items'])")" "False"
t "a creator can't delete expired" "$(P cleo@example.com '{"view":"plan","deleteExpired":true}' | q "'error' in d")" "True"
t "a publisher deletes them all" "$(P carolyn@example.com '{"view":"plan","deleteExpired":true}' | q "d['deleted']")" "$n"
t "none are left expired" "$(G carolyn@example.com plan | q "len([r for r in d['rows'] if r.get('display_status')=='Expired'])")" "0"
t "the Health card is gone" "$(G carolyn@example.com health | q "any(i.get('action') for i in d['items'])")" "False"
t "a second click deletes nothing" "$(P carolyn@example.com '{"view":"plan","deleteExpired":true}' | q "d['deleted']")" "0"
t "approved and posted posts are untouched" "$(G carolyn@example.com plan | q "len([r for r in d['rows'] if r['values'].get('status') in ('Approved','Posted')])>0")" "True"
echo "$ok passed, $bad failed"; [ $bad = 0 ]
