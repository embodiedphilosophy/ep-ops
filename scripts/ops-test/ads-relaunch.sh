#!/usr/bin/env bash
# Relaunch (Ads): "make a new draft from this campaign". Two runs, each on a fresh app with the Meta key set and the safety switch ON at the Meta mock only (MOCK_ADS=live):
#   live  ads-relaunch-api.mjs live, then ads-relaunch.cjs (the Campaigns list and the campaign page in a browser at 1360 and 390 px) on the same state
#   nokey ads-relaunch-api.mjs nokey (no drafting key: the new copy is all [placeholders])
# Mock only; the real Meta and Anthropic are never contacted, and the Meta mock must see no write from a relaunch. Needs a build. Restarts the app normally at the end.
cd "$(dirname "$0")/../.."
bad=0
MOCK_ADS=live bash scripts/ops-test/run.sh --no-build >/dev/null 2>&1
source scripts/ops-test/env.sh
MOCK_ADS=live node scripts/ops-test/ads-relaunch-api.mjs live || bad=1
MOCK_ADS=live node scripts/ops-test/ads-relaunch.cjs || bad=1
MOCK_ADS=live MOCK_NOKEY=1 bash scripts/ops-test/run.sh --no-build >/dev/null 2>&1
source scripts/ops-test/env.sh
MOCK_ADS=live MOCK_NOKEY=1 node scripts/ops-test/ads-relaunch-api.mjs nokey || bad=1
bash scripts/ops-test/run.sh --no-build >/dev/null 2>&1
exit $bad
