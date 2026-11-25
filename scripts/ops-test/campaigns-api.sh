#!/usr/bin/env bash
# Coming up & campaigns at API level (needs a fresh run.sh). Mock only.
cd "$(dirname "$0")/../.."; source scripts/ops-test/env.sh
B=http://localhost:3100; ok=0; bad=0
ck() { node scripts/ops-test/cookie.mjs "$1"; }
G() { curl -s -H "Cookie: ep_ops=$(ck $1)" "$B/api/ops/social/campaigns"; }
P() { curl -s -H "Cookie: ep_ops=$(ck $1)" -H 'Content-Type: application/json' -X POST "$B/api/ops/social/campaigns" -d "$2"; }
t() { if [ "$2" = "$3" ]; then ok=$((ok+1)); echo "ok   $1"; else bad=$((bad+1)); echo "FAIL $1: got [$2] want [$3]"; fi; }
q() { python3 -c "import sys,json; d=json.load(sys.stdin); print($1)"; }
J=jacob@embodiedphilosophy.com
r=$(G $J); t "reads upcoming events" "$(echo "$r" | q "len(d['events'])>0")" "True"
E=$(echo "$r" | q "d['events'][0]['id']"); T=$(echo "$r" | q "d['events'][0]['title']")
t "default is Promote" "$(echo "$r" | q "d['events'][0]['state']")" "Promote"
t "Skip is saved" "$(P $J "{\"action\":\"state\",\"event_id\":\"$E\",\"state\":\"Skip\"}" | q "d['ok']")" "True"
t "Skip is remembered" "$(G $J | q "[e for e in d['events'] if e['id']=='$E'][0]['state']")" "Skip"
t "bad state refused" "$(P $J "{\"action\":\"state\",\"event_id\":\"$E\",\"state\":\"Nope\"}" | q "'error' in d")" "True"
t "viewer can't change" "$(P ichha@example.com "{\"action\":\"state\",\"event_id\":\"$E\",\"state\":\"Promote\"}" | q "'error' in d")" "True"
c=$(P $J "{\"action\":\"campaign\",\"event_id\":\"$E\",\"days\":5}"); C=$(echo "$c" | q "d['id']")
t "campaign made" "$C" "C001"
t "second campaign for the same event refused" "$(P $J "{\"action\":\"campaign\",\"event_id\":\"$E\"}" | q "'error' in d")" "True"
r=$(G $J); t "six steps (5 to 1 and launch)" "$(echo "$r" | q "len(d['campaigns'][0]['steps'])")" "6"
t "event now shows Campaign" "$(echo "$r" | q "[e for e in d['events'] if e['id']=='$E'][0]['state']")" "Campaign"
t "day 5 is six days out, day 1 two days out" "$(echo "$r" | python3 -c "
import sys,json,datetime as D
d=json.load(sys.stdin); ev=[e for e in d['events'] if e['date'] and e['id']=='$E'][0]; ed=D.date.fromisoformat(ev['date'])
s={x['step']:D.date.fromisoformat(x['date']) for x in d['campaigns'][0]['steps']}
print((ed-s['5']).days,(ed-s['1']).days,(ed-s['0']).days)")" "6 2 0"
P $J "{\"action\":\"step\",\"campaign_id\":\"$C\",\"step\":\"5\",\"changes\":{\"teacher\":\"Nataraj\"}}" >/dev/null
P $J "{\"action\":\"step\",\"campaign_id\":\"$C\",\"step\":\"4\",\"changes\":{\"teacher\":\"Onika\"}}" >/dev/null
t "apply adds six proposals" "$(P $J "{\"action\":\"apply\",\"campaign_id\":\"$C\"}" | q "d['added']")" "6"
t "apply again adds none" "$(P $J "{\"action\":\"apply\",\"campaign_id\":\"$C\"}" | q "d['added']")" "0"
t "two clip requests" "$(P $J "{\"action\":\"request\",\"campaign_id\":\"$C\",\"owner\":\"Rebecka Oberg\"}" | q "d['sent']")" "2"
t "asking again makes none" "$(P $J "{\"action\":\"request\",\"campaign_id\":\"$C\"}" | q "d['sent']")" "0"
r=$(G $J); t "clips listed as Requested" "$(echo "$r" | q "sorted(set(c['status'] for c in d['clips']))")" "['Requested']"
CR=$(echo "$r" | q "d['clips'][0]['id']")
t "clip moves on" "$(P $J "{\"action\":\"clip\",\"id\":\"$CR\",\"status\":\"In edit\"}" | q "d['ok']")" "True"
echo "$ok passed, $bad failed"; [ $bad = 0 ]
