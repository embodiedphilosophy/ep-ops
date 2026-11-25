#!/usr/bin/env bash
# Teachers & Email phase 4b: the teacher directory, profile editor, headshots, review queue (needs a fresh run.sh). Mock only.
cd "$(dirname "$0")/../.."; source scripts/ops-test/env.sh
B=http://localhost:3100; ok=0; bad=0; LOG=scripts/ops-test/out/mock.log
ck() { node scripts/ops-test/cookie.mjs "$1"; }
G() { curl -s -H "Cookie: ep_ops=$(ck $1)" "$B/api/ops/email/teachers$2"; }
P() { curl -s -H "Cookie: ep_ops=$(ck $1)" -H 'Content-Type: application/json' -X POST "$B/api/ops/email/teachers" -d "$2"; }
t() { if [ "$2" = "$3" ]; then ok=$((ok+1)); echo "ok   $1"; else bad=$((bad+1)); echo "FAIL $1: got [$2] want [$3]"; fi; }
q() { python3 -c "import sys,json; d=json.load(sys.stdin); print($1)"; }
F=floss@example.com
echo "-- directory"
d=$(G $F)
st() { echo "$d" | q "[t['state'] for t in d['teachers'] if t['email']=='$1'][0]"; }
t "a submission is flagged" "$(st abha@example.com)" "Submission waiting"
t "a bio more than a year old needs an update" "$(st nataraj@example.com)" "Needs update"
t "a recent complete profile is current" "$(st onika@example.com)" "Current"
t "someone scheduled with no profile says so" "$(st jacob@example.com)" "No profile yet"
t "a test entry is spotted" "$(echo "$d" | q "[t['name'] for t in d['teachers'] if t['test']]")" "['Test Teacher']"
t "teachers with sessions come first" "$(echo "$d" | q "d['teachers'][0]['upcoming']>0")" "True"
echo "-- review queue"
r=$(G $F "?what=review")
t "two bios are waiting" "$(echo "$r" | q "sorted(b['email'] for b in d['bios'])")" "['abha@example.com', 'mary@example.com']"
t "a first submission has no diff" "$(echo "$r" | q "[(b['first'], b['diff']) for b in d['bios'] if b['email']=='abha@example.com'][0]")" "(True, None)"
t "a change is shown against what is live, with added words" "$(echo "$r" | q "any(x['t']=='add' for b in d['bios'] if b['email']=='mary@example.com' for x in b['diff'])")" "True"
t "a new headshot is noticed" "$(echo "$r" | q "[b['new_photo'] for b in d['bios'] if b['email']=='mary@example.com'][0]")" "True"
echo "-- a profile"
n=$(G $F "?email=nataraj@example.com")
t "stale bio is flagged" "$(echo "$n" | q "d['stale']")" "True"
t "website target is live" "$(echo "$n" | q "[x['state'] for x in d['targets'] if x['key']=='website'][0]")" "Live"
t "Circle is copy-by-hand, not pretended" "$(echo "$n" | q "[x['state'] for x in d['targets'] if x['key']=='circle'][0]")" "Copy by hand"
t "viewer can't edit" "$(P ichha@example.com '{"action":"save","email":"nataraj@example.com","changes":{"pronouns":"he/him"}}' | q "'error' in d")" "True"
t "a very short bio is refused" "$(P $F '{"action":"save","email":"nataraj@example.com","changes":{"short_bio":"Too short."}}' | q "'words' in d['error']")" "True"
SB="Nataraj teaches Kashmir Shaivism and leads the Sādhana School reading groups, bringing close attention to the texts and a warm, practical way of showing how the tradition lives in daily practice."
t "a short bio of about 40 words saves" "$(P $F "{\"action\":\"save\",\"email\":\"nataraj@example.com\",\"changes\":{\"short_bio\":\"$SB\",\"pronouns\":\"he/him\"}}" | q "d['ok']")" "True"
t "changing a live bio needs a confirm" "$(P $F '{"action":"save","email":"nataraj@example.com","changes":{"bio":"A new long bio for Nataraj."}}' | q "d.get('needConfirm')")" "True"
t "and saves once confirmed, stamping the date" "$(P $F '{"action":"save","email":"nataraj@example.com","confirm":true,"changes":{"bio":"A new long bio for Nataraj."}}' | q "d['ok']")" "True"
n=$(G $F "?email=nataraj@example.com"); t "the bio is no longer stale" "$(echo "$n" | q "d['stale']")" "False"
t "a link must be a web address" "$(P $F '{"action":"save","email":"nataraj@example.com","changes":{"links":[{"label":"Bad","url":"nope"},{"label":"Site","url":"https://example.org"}]}}' | q "d['ok']"; G $F "?email=nataraj@example.com" | q "[l['label'] for l in d['profile']['links']]")" "True
['Site']"
echo "-- headshot"
t "a focal point outside the picture is refused" "$(P $F '{"action":"photoMeta","email":"nataraj@example.com","changes":{"focal_x":150}}' | q "'error' in d")" "True"
t "alt text, credit and focal point save" "$(P $F '{"action":"photoMeta","email":"nataraj@example.com","changes":{"photo_alt":"Nataraj smiling","photo_credit":"Ryan","focal_x":30,"focal_y":20}}' | q "d['ok']")" "True"
crop() { curl -s -o /tmp/crop-$2.bin -w '%{content_type} %{size_download}' -H "Cookie: ep_ops=$(ck $F)" "$B/api/ops/teachers/photo?email=nataraj@example.com&shape=$1"; }
t "square crop is a JPEG" "$(crop square sq | cut -d' ' -f1)" "image/jpeg"
t "4:5 crop is a JPEG" "$(crop portrait pt | cut -d' ' -f1)" "image/jpeg"
t "circle crop is a PNG" "$(crop circle ci | cut -d' ' -f1)" "image/png"
t "the 4:5 crop really is 4:5" "$(python3 -c "
import struct
b=open('/tmp/crop-pt.bin','rb').read(); i=2
while i<len(b):
  m=b[i+1]; l=struct.unpack('>H',b[i+2:i+4])[0]
  if m in (0xC0,0xC2): h,w=struct.unpack('>HH',b[i+5:i+9]); print(w,h); break
  i+=2+l")" "800 1000"
t "no headshot, no crop" "$(curl -s -o /dev/null -w '%{http_code}' -H "Cookie: ep_ops=$(ck $F)" "$B/api/ops/teachers/photo?email=test@example.com&shape=square")" "404"
t "an unknown version can't be restored" "$(P $F '{"action":"restoreVersion","email":"nataraj@example.com","index":0}' | q "'error' in d")" "True"
echo "-- approving and sending back"
t "approving needs a bio and headshot" "$(P $F '{"action":"approve","email":"test@example.com"}' | q "'headshot' in d['error']")" "True"
t "approve puts Abha on the website" "$(P $F '{"action":"approve","email":"abha@example.com"}' | q "d['ok']")" "True"
t "she leaves the queue and is live" "$(G $F "?what=review" | q "'abha@example.com' in [b['email'] for b in d['bios']]"; G $F "?email=abha@example.com" | q "d['profile']['status']")" "False
approved"
t "sending back needs a note" "$(P $F '{"action":"sendBack","email":"mary@example.com","confirm":true}' | q "'what to change' in d['error']")" "True"
t "and a confirm" "$(P $F '{"action":"sendBack","email":"mary@example.com","note":"Please shorten it."}' | q "'confirm' in d['error']")" "True"
t "sent back with a note; with no mail key here the email is skipped, and that is said" "$(P $F '{"action":"sendBack","email":"mary@example.com","note":"Please shorten it.","confirm":true}' | q "(d['ok'], d['mailed'])")" "(True, False)"
m=$(G $F "?email=mary@example.com"); t "she is back to on file with the note kept" "$(echo "$m" | q "(d['profile']['status'], d['profile']['review_note'])")" "('on file', 'Please shorten it.')"
echo "-- clearing out test entries"
t "hiding needs a confirm" "$(P $F '{"action":"archive","email":"test@example.com"}' | q "'confirm' in d['error']")" "True"
t "hidden, not deleted" "$(P $F '{"action":"archive","email":"test@example.com","confirm":true}' | q "d['ok']"; G $F | q "[(t['hidden']) for t in d['teachers'] if t['email']=='test@example.com'][0]")" "True
True"
t "it can be brought back" "$(P $F '{"action":"restore","email":"test@example.com","confirm":true}' | q "d['ok']"; G $F | q "[(t['hidden']) for t in d['teachers'] if t['email']=='test@example.com'][0]")" "True
False"
t "a profile can be started for someone scheduled" "$(P $F '{"action":"create","email":"jacob@example.com","name":"Jacob Kyle"}' | q "d['ok']")" "True"
t "but not twice" "$(P $F '{"action":"create","email":"jacob@example.com","name":"Jacob Kyle"}' | q "'already' in d['error']")" "True"
t "nothing was written to Kit or Circle" "$(grep -cE 'BLOCKED' $LOG)" "0"
echo "$ok passed, $bad failed"; [ $bad = 0 ]
