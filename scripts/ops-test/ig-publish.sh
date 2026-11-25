#!/usr/bin/env bash
# Post now (Instagram publishing) at API level against the mock Graph API. Run twice, each after a fresh run.sh:
#   bash scripts/ops-test/run.sh && bash scripts/ops-test/ig-publish.sh off
#   META_PUBLISH=live bash scripts/ops-test/run.sh --no-build && bash scripts/ops-test/ig-publish.sh live
cd "$(dirname "$0")/../.."; source scripts/ops-test/env.sh
MODE=${1:-off}; B=http://localhost:3100; ok=0; bad=0
ck() { node scripts/ops-test/cookie.mjs "$1"; }
P() { curl -s -H "Cookie: ep_ops=$(ck $1)" -H 'Content-Type: application/json' -X POST "$B/api/ops/social" -d "$2"; }
G() { curl -s -H "Cookie: ep_ops=$(ck carolyn@example.com)" "$B/api/ops/social?view=plan"; }
t() { if [ "$2" = "$3" ]; then ok=$((ok+1)); echo "ok   $1"; else bad=$((bad+1)); echo "FAIL $1: got [$2] want [$3]"; fi; }
q() { python3 -c "import sys,json; d=json.load(sys.stdin); print($1)"; }
D=$(date -u -d '+3 days' +%F); IMG=https://lh3.googleusercontent.com/d/AAAAAAAAAAAAAAAAAAAAAAAA
add() { P carolyn@example.com "$(python3 -c "import json,sys;print(json.dumps({'view':'plan','add':True,'values':json.loads(sys.argv[1])}))" "$1")" | q "d['post_id']"; }
rowof() { G | q "[x['row'] for x in d['rows'] if x['values']['post_id']=='$1'][0]"; }
statusof() { G | q "[x['values']['status'] for x in d['rows'] if x['values']['post_id']=='$1'][0]"; }
now() { P carolyn@example.com "{\"view\":\"plan\",\"publishNow\":{\"row\":$(rowof $1)}}"; }
S=$(add "{\"publish_date\":\"$D\",\"publish_time_ET\":\"11:00\",\"platforms\":\"IG Feed\",\"caption\":\"A verse.\",\"image_url\":\"$IMG\",\"status\":\"Approved\",\"first_comment\":\"Link in bio\"}")
if [ $MODE = off ]; then
  t "refused while publishing is off" "$(now $S | q "'switched on' in d['error']")" "True"
  t "post is left as it was" "$(statusof $S)" "Approved"
else
  r=$(now $S); t "single posts" "$(echo "$r" | q "d['permalink']")" "https://instagram.com/p/mockpub"
  t "marked Posted" "$(statusof $S)" "Posted"
  t "second click refused" "$(now $S | q "'error' in d")" "True"
  SL='[{"kind":"image","drive_file_id":"AAAAAAAAAAAAAAAAAAAAAAAA"},{"kind":"image","drive_file_id":"BBBBBBBBBBBBBBBBBBBBBBBB"},{"kind":"video","drive_file_id":"CCCCCCCCCCCCCCCCCCCCCCCC"}]'
  C=$(add "$(python3 -c "import json,sys;print(json.dumps({'publish_date':'$D','publish_time_ET':'12:00','platforms':'IG Feed','caption':'Swipe.','media_kind':'carousel','slides_json':sys.argv[1],'status':'Approved'}))" "$SL")")
  t "carousel approved (not Manual) when live" "$(statusof $C)" "Approved"
  t "carousel posts" "$(now $C | q "d['ok']")" "True"
  F=$(add "{\"publish_date\":\"$D\",\"publish_time_ET\":\"13:00\",\"platforms\":\"IG Feed\",\"caption\":\"FAILME\",\"image_url\":\"$IMG\",\"status\":\"Approved\"}")
  t "Instagram error is shown plainly" "$(now $F | q "d['error'].startswith('Instagram wouldn’t take it')")" "True"
  t "failed post is marked Failed" "$(statusof $F)" "Failed"
  L=scripts/ops-test/out/mock.log
  t "carousel made 3 children then one carousel" "$(grep -c 'GRAPH PUBLISH media .*is_carousel_item' $L)/$(grep -c 'media_type.*CAROUSEL' $L)" "3/1"
  t "first comment sent" "$(grep -c 'GRAPH PUBLISH comments' $L)" "1"
fi
echo "$ok passed, $bad failed"; [ $bad = 0 ]
