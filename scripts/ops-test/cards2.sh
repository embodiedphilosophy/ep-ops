#!/usr/bin/env bash
# Event promo, Meet the teacher and the carousels: facts, refusals, slide counts, exports. Mock only. Fresh run.sh.
cd "$(dirname "$0")/../.."; source scripts/ops-test/env.sh
B=http://localhost:3100/api/ops/social/render; ok=0; bad=0; O=scripts/ops-test/out/cards; mkdir -p $O
C=$(node scripts/ops-test/cookie.mjs jacob@embodiedphilosophy.com)
t() { if [ "$2" = "$3" ]; then ok=$((ok+1)); echo "ok   $1"; else bad=$((bad+1)); echo "FAIL $1: got [$2] want [$3]"; fi; }
q() { python3 -c "import sys,json; d=json.load(sys.stdin); print($1)"; }
P() { curl -s -D $O/h.txt -o $O/$1 -H "Cookie: ep_ops=$C" -H 'Content-Type: application/json' -X POST $B -d "$2"; head -1 $O/h.txt | cut -d' ' -f2; }
E=$(curl -s -H "Cookie: ep_ops=$C" "$B?what=events" | q "[e['id'] for e in d['events'] if e['title'].startswith('Living')][0]")
t "event promo draws from the schedule" "$(P event.png "{\"template\":\"event\",\"colourway\":\"Pine\",\"size\":\"4:5\",\"event_id\":\"$E\"}")" "200"
t "event promo 9:16" "$(P event916.png "{\"template\":\"event\",\"colourway\":\"Terra\",\"size\":\"9:16\",\"event_id\":\"$E\"}")" "200"
M=$(curl -s -H "Cookie: ep_ops=$C" "$B?what=events" | q "[e['id'] for e in d['events'] if e['missing']][0]")
r=$(P missing.json "{\"template\":\"event\",\"colourway\":\"Pine\",\"size\":\"4:5\",\"event_id\":\"$M\"}"); t "event promo refuses with missing facts" "$r" "400"
t "...and names what is missing" "$(cat $O/missing.json | q "'missing' in d['error'] and 'Programming' in d['error']")" "True"
t "Meet the teacher draws" "$(P teacher.png '{"template":"teacher","colourway":"Ivory","size":"4:5","teacher_email":"abha@example.com","program":"Wisdom School"}')" "200"
t "unknown teacher refused" "$(P x.json '{"template":"teacher","colourway":"Ivory","size":"4:5","teacher_email":"nobody@example.com"}')" "400"
CAR='{"title":"Five limbs, five days","subtitle":"A short series","cta":"Join us for the countdown.","slides":[{"heading":"Yama","body":"The restraints: how we meet the world."},{"heading":"Niyama","body":"The observances: how we meet ourselves."},{"heading":"Āsana","body":"A steady, comfortable seat."}]}'
r=$(curl -s -D $O/h.txt -o $O/edu0.png -H "Cookie: ep_ops=$C" -H 'Content-Type: application/json' -X POST $B -d "{\"template\":\"edu\",\"colourway\":\"Navy\",\"size\":\"4:5\",\"slide\":0,\"carousel\":$CAR}"); t "educational carousel cover draws" "$(head -1 $O/h.txt | cut -d' ' -f2)" "200"
t "it reports 5 slides (cover, 3, closing)" "$(grep -i '^x-slides' $O/h.txt | tr -d '\r' | awk '{print $2}')" "5"
for i in 1 4; do curl -s -o $O/edu$i.png -H "Cookie: ep_ops=$C" -H 'Content-Type: application/json' -X POST $B -d "{\"template\":\"edu\",\"colourway\":\"Navy\",\"size\":\"4:5\",\"slide\":$i,\"carousel\":$CAR}"; done
t "a nine-slide carousel is cut at eight" "$(curl -s -D $O/h.txt -o /dev/null -H "Cookie: ep_ops=$C" -H 'Content-Type: application/json' -X POST $B -d "{\"template\":\"edu\",\"colourway\":\"Navy\",\"size\":\"4:5\",\"carousel\":{\"title\":\"x\",\"slides\":$(python3 -c "import json;print(json.dumps([{'heading':'h','body':'b'}]*9))")}}"; grep -i '^x-slides' $O/h.txt | tr -d '\r' | awk '{print $2}')" "10"
t "a carousel with an empty slide is refused" "$(P x.json '{"template":"edu","colourway":"Navy","size":"4:5","carousel":{"title":"x","slides":[{"heading":"h","body":""}]}}')" "400"
t "keyword carousel needs its keyword" "$(P x.json '{"template":"keyword","colourway":"TWELVE · brick","size":"4:5","carousel":{"title":"Free guide","slides":[{"heading":"a","body":"b"}]}}')" "400"
t "keyword carousel draws with the keyword" "$(curl -s -o $O/kw5.png -w '%{http_code}' -H "Cookie: ep_ops=$C" -H 'Content-Type: application/json' -X POST $B -d '{"template":"keyword","colourway":"TWELVE · brick","size":"4:5","slide":2,"carousel":{"title":"Free guide","keyword":"twelve","slides":[{"heading":"a","body":"b"}]}}')" "200"
t "story carousel refuses art with words on it" "$(P x.json '{"template":"story","colourway":"Leaf","size":"4:5","carousel":{"title":"A tale","slides":[{"body":"Once","art":"IMG0"}]}}')" "400"
t "story carousel draws with Art" "$(P story1.png '{"template":"story","colourway":"Leaf","size":"4:5","slide":1,"carousel":{"title":"A tale","slides":[{"body":"Once upon a time the Goddess woke.","art":"IMG1"}]}}')" "200"
MON=$(date -u -d "$(date -u +%F) -$(( ($(date -u +%u)+6)%7 )) days" +%F)
WK=$(curl -s -H "Cookie: ep_ops=$C" "$B?what=week&monday=$MON" | q "json.dumps([{'id':e['id'],'line':'A line for ' + e['title'][:10]} for e in d['events'] if not e['missing']])" | sed "s/\"/\\\\\"/g")
t "week list leaves out the Sādhana School weekly session" "$(curl -s -H "Cookie: ep_ops=$C" "$B?what=week&monday=$MON" | q "any('Sādhana School' in e['title'] for e in d['events'])")" "False"
WKJ=$(curl -s -H "Cookie: ep_ops=$C" "$B?what=week&monday=$MON" | python3 -c "import sys,json; d=json.load(sys.stdin); print(json.dumps([{'id':e['id'],'line':'A line for '+e['title'][:12]} for e in d['events'] if not e['missing']]))")
t "This Week at EP cover draws from the schedule" "$(P tw0.png "{\"template\":\"thisweek\",\"colourway\":\"Leaf\",\"size\":\"4:5\",\"slide\":0,\"week\":{\"monday\":\"$MON\",\"events\":$WKJ}}")" "200"
curl -s -o $O/tw1.png -H "Cookie: ep_ops=$C" -H 'Content-Type: application/json' -X POST $B -d "{\"template\":\"thisweek\",\"colourway\":\"Leaf\",\"size\":\"4:5\",\"slide\":1,\"week\":{\"monday\":\"$MON\",\"events\":$WKJ}}"
t "This Week at EP with nothing ticked is refused" "$(P x.json "{\"template\":\"thisweek\",\"colourway\":\"Leaf\",\"size\":\"4:5\",\"week\":{\"monday\":\"$MON\",\"events\":[]}}")" "400"
r=$(curl -s -H "Cookie: ep_ops=$C" -H 'Content-Type: application/json' -X POST $B -d "{\"template\":\"edu\",\"colourway\":\"Navy\",\"size\":\"4:5\",\"export\":true,\"carousel\":$CAR}"); echo "$r" | head -c 200; echo
t "exporting a carousel saves every slide" "$(echo "$r" | q "len(d['exports'])")" "5"
t "...as Designs in the Library, in order" "$(echo "$r" | q "[e['slide'] for e in d['exports']]")" "[0, 1, 2, 3, 4]"
echo; echo "$ok passed, $bad failed"; [ $bad = 0 ]
