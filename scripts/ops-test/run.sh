#!/usr/bin/env bash
# Start the mock and a production build of the app on :3100 against it, and mint a sign-in cookie.
#   bash scripts/ops-test/run.sh            build + start
#   bash scripts/ops-test/run.sh --no-build start the last build
set -e
cd "$(dirname "$0")/../.."
K=scripts/ops-test
source $K/env.sh
H=$(sha1sum package-lock.json | cut -c1-40); [ "$(cat node_modules/.ops-lock 2>/dev/null)" = "$H" ] || { npm ci --no-audit --no-fund > /dev/null 2>&1 && echo "$H" > node_modules/.ops-lock; }   # deps changed since the last install
# Stop earlier runs (by process name: lsof can't see ports in some sandboxes; anchored so this shell isn't matched)
pkill -f '^next-server' || true; pkill -f '^npm exec next start' || true; pkill -f '^node .*ops-test/mock.mjs' || true; sleep 1
: > $K/out/mock.log
nohup node $K/mock.mjs > /dev/null 2>&1 &
rm -rf .next/cache/fetch-cache
[ "$1" = "--no-build" ] || npx next build > $K/out/build.log 2>&1 || { tail -30 $K/out/build.log; exit 1; }
nohup npx next start -p 3100 > $K/out/next.log 2>&1 &
node $K/cookie.mjs > $K/out/cookie.txt
python3 $K/make-png.py $K/out/upload-test.png
sleep 5; curl -s -o /dev/null -w "app on :3100 → %{http_code}\n" http://localhost:3100/ops
