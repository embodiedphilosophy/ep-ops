#!/usr/bin/env bash
# The Ads account buttons (Pause, Resume, +20%, an exact daily budget, Reverse on campaigns not made in Ops), in the app. The app is restarted for each phase (Meta is the mock on :4556):
#   first ads-manual.mjs in node (the sums, the gate, refusals, conflicts, Reverse), then
#   dry   Meta key set, switch OFF (as in production): ads-manual-api.mjs dry, ads-manual.cjs dry    ("Recorded only", Meta never written)
#   live  the switch ON at the mock only (MOCK_ADS=live): ads-manual-api.mjs live, ads-manual.cjs live
# Needs a build. Restarts the app normally at the end.
cd "$(dirname "$0")/../.."
bad=0
bash scripts/ops-test/run.sh --no-build >/dev/null 2>&1
source scripts/ops-test/env.sh
node scripts/ops-test/ads-manual.mjs || bad=1
for ph in dry live; do
  case $ph in dry) export MOCK_META=ready MOCK_ADS=;; live) export MOCK_META= MOCK_ADS=live;; esac
  echo "== phase $ph"
  bash scripts/ops-test/run.sh --no-build >/dev/null 2>&1
  source scripts/ops-test/env.sh
  curl -s "http://localhost:4556/__world?name=account" >/dev/null
  node scripts/ops-test/ads-manual-api.mjs $ph || bad=1
  curl -s "http://localhost:4556/__reset" >/dev/null; curl -s "http://localhost:4556/__world?name=account" >/dev/null
  node scripts/ops-test/ads-manual.cjs $ph || bad=1
done
export MOCK_META= MOCK_ADS=
bash scripts/ops-test/run.sh --no-build >/dev/null 2>&1
exit $bad
