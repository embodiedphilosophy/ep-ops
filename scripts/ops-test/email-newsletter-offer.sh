#!/usr/bin/env bash
# The newsletter's featured offer (needs a fresh run.sh). Mock Kit only.
cd "$(dirname "$0")/../.."; source scripts/ops-test/env.sh
B=http://localhost:3100; ok=0; bad=0; LOG=scripts/ops-test/out/mock.log
ck() { node scripts/ops-test/cookie.mjs "$1"; }
NP() { curl -s -H "Cookie: ep_ops=$(ck floss@example.com)" -H 'Content-Type: application/json' -X POST "$B/api/ops/email/newsletter" -d "$1"; }
PV() { curl -s -H "Cookie: ep_ops=$(ck floss@example.com)" "$B/api/ops/email/newsletter?date=$SUN&preview=1"; }
t() { if [ "$2" = "$3" ]; then ok=$((ok+1)); echo "ok   $1"; else bad=$((bad+1)); echo "FAIL $1: got [$2] want [$3]"; fi; }
SUN=$(python3 -c "import datetime as D; d=D.date.today()+D.timedelta(days=1); print(d+D.timedelta(days=(6-d.weekday())%7))")
NP "{\"action\":\"create\",\"date\":\"$SUN\"}" >/dev/null
NP "{\"action\":\"save\",\"date\":\"$SUN\",\"changes\":{\"subject\":\"Beginning again\",\"reflection_headline\":\"Return\",\"reflection_body\":\"What stays when everything moves.\",\"sanskrit_iast\":\"x\"}}" >/dev/null
t "no offer, no Featured block" "$(PV | grep -c '>Featured<')" "0"
t "an offer saves" "$(NP "{\"action\":\"save\",\"date\":\"$SUN\",\"changes\":{\"featured_offer_title\":\"The Open Library\",\"featured_offer_text\":\"Every recording, for the week.\",\"featured_offer_url\":\"https://embodiedphilosophy.com/open-library\"}}" | python3 -c "import sys,json; print(json.load(sys.stdin)['ok'])")" "True"
h=$(PV)
t "the preview shows the offer's title" "$(echo "$h" | grep -c 'The Open Library')" "1"
t "and its text" "$(echo "$h" | grep -c 'Every recording, for the week.')" "1"
t "and a Learn more button to its link" "$(echo "$h" | grep -c 'href="https://embodiedphilosophy.com/open-library"')" "1"
t "it sits before Study With Us" "$(echo "$h" | python3 -c "import sys; h=sys.stdin.read(); print(h.index('The Open Library') < h.index('Study With Us'))")" "True"
NP "{\"action\":\"save\",\"date\":\"$SUN\",\"changes\":{\"featured_offer_button\":\"See the library\"}}" >/dev/null
t "a custom button label is used" "$(PV | grep -c 'See the library')" "1"
r=$(NP "{\"action\":\"build\",\"date\":\"$SUN\",\"confirm\":true}"); t "the Kit draft builds" "$(echo "$r" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('ok'))")" "True"
N1=$(grep 'KIT DRAFT BLOCKS' $LOG | tail -1 | grep -o '[0-9]* top-level' | grep -o '[0-9]*')
NP "{\"action\":\"save\",\"date\":\"$SUN\",\"changes\":{\"featured_offer_title\":\"\",\"featured_offer_text\":\"\",\"featured_offer_url\":\"\",\"featured_offer_button\":\"\"}}" >/dev/null
t "clearing the offer removes it from the preview" "$(PV | grep -c 'The Open Library')" "0"
NP "{\"action\":\"build\",\"date\":\"$SUN\",\"confirm\":true}" >/dev/null
N0=$(grep 'KIT DRAFT BLOCKS' $LOG | tail -1 | grep -o '[0-9]* top-level' | grep -o '[0-9]*')
t "the Kit draft has one block fewer without the offer" "$((N1 - N0))" "1"
t "nothing scheduled or sent" "$(grep -ciE 'KIT (SENT|SEND)|/send' $LOG)" "0"
echo "$ok passed, $bad failed"; [ $bad = 0 ]
