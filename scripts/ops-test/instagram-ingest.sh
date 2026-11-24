#!/usr/bin/env bash
# Posts sent in by Make (/api/ops/social-sync/ingest): secret, form and JSON bodies, new vs known, match to the plan. Mock only. Start from a fresh run.sh.
cd "$(dirname "$0")/../.."; source scripts/ops-test/env.sh
B=http://localhost:3100/api/ops/social-sync/ingest; ok=0; bad=0
t() { if [ "$2" = "$3" ]; then ok=$((ok+1)); echo "ok   $1"; else bad=$((bad+1)); echo "FAIL $1: got [$2] want [$3]"; fi; }
q() { python3 -c "import sys,json; d=json.load(sys.stdin); print($1)"; }
H="x-ingest-secret: $SOCIAL_INGEST_SECRET"
D=$(date -u -d '-2 days' +%F)
t "no secret refused" "$(curl -s -X POST $B | q "d['error']")" "unauthorized"
t "wrong secret refused" "$(curl -s -X POST -H 'x-ingest-secret: nope-nope-nope-nope' $B | q "d['error']")" "unauthorized"
# one post as form fields, the way the Make HTTP module sends it; same day and caption as the plan's P101
r=$(curl -s -X POST -H "$H" --data-urlencode "id='NEWMAKE1" --data-urlencode "timestamp=${D}T16:00:00+00:00" --data-urlencode "media_type=IMAGE" --data-urlencode "media_product_type=FEED" --data-urlencode "caption=What is recognition?" --data-urlencode "permalink=https://instagram.com/p/newmake1" --data-urlencode "like_count=12" --data-urlencode "comments_count=1" $B)
echo "form: $r"; t "form post added" "$(echo "$r" | q "(d['added'], d['matched'])")" "(1, 1)"
r=$(curl -s -X POST -H "$H" --data-urlencode "id='NEWMAKE1" --data-urlencode "timestamp=${D}T16:00:00+00:00" --data-urlencode "caption=What is recognition?" --data-urlencode "permalink=https://instagram.com/p/newmake1" --data-urlencode "like_count=40" --data-urlencode "comments_count=3" $B)
t "same post again adds nothing, refreshes likes" "$(echo "$r" | q "(d['added'], d['refreshed'])")" "(0, 1)"
r=$(curl -s -X POST -H "$H" -H 'Content-Type: application/json' -d "{\"media\":[{\"id\":\"J1\",\"timestamp\":\"$(date -u -d '-30 days' +%F)T15:00:00Z\",\"media_type\":\"IMAGE\",\"caption\":\"old\",\"permalink\":\"https://instagram.com/p/j1\"},{\"id\":\"J2\",\"timestamp\":\"$(date -u -d '-31 days' +%F)T15:00:00Z\",\"media_type\":\"VIDEO\",\"caption\":\"older\",\"permalink\":\"https://instagram.com/p/j2\"}]}" $B)
t "JSON list adds both (old posts too)" "$(echo "$r" | q "d['added']")" "2"
t "garbage body is harmless" "$(curl -s -X POST -H "$H" -d 'nonsense' $B | q "d['added']")" "0"
C=$(node scripts/ops-test/cookie.mjs jacob@embodiedphilosophy.com)
t "plan row P101 is Posted with the link" "$(curl -s -H "Cookie: ep_ops=$C" "http://localhost:3100/api/ops/social?view=plan" | q "[(x['values']['status'],x['values'].get('permalink')) for x in d['rows'] if x['values']['post_id']=='P101'][0]")" "('Posted', 'https://instagram.com/p/newmake1')"
t "the leading apostrophe Make adds is stripped" "$(curl -s -H "Cookie: ep_ops=$C" "http://localhost:3100/api/ops/social?view=history" | q "any(x['values']['ig_media_id']=='NEWMAKE1' for x in d['rows'])")" "True"
echo; echo "$ok passed, $bad failed"; [ $bad = 0 ]
