#!/usr/bin/env bash
# The Ads account view (Ads › Campaigns › "In your Meta account"), in the app. The app is restarted for each phase (Meta is the mock on :4556; nothing real is contacted):
#   a. NO Meta key:                                           ads-account-api.mjs a, ads-account.cjs a   ("not connected", Meta asked nothing)
#   b. Meta key set, switch OFF (as in production), the mock's 'account' world, no Ads tables yet:   ads-account-api.mjs b, then ads-account.cjs b
#   c. Meta key set and the switch ON at the mock only (MOCK_ADS=live): a campaign built in Ops and sent, shown as "Made in Ops":   ads-account-api.mjs c, then ads-account.cjs c
#   d. Meta answers with a rate limit from the start (nothing seen before):  ads-account.cjs d        e. the mock's 'empty' world (no campaigns):  ads-account.cjs e
# And first ads-account.mjs (the library in node: modes, calls, Made in Ops with and without tables, totals). Needs a build. Restarts the app normally at the end.
cd "$(dirname "$0")/../.."
bad=0
bash scripts/ops-test/run.sh --no-build >/dev/null 2>&1
source scripts/ops-test/env.sh
node scripts/ops-test/ads-account.mjs || bad=1
for ph in a b c d e; do
  case $ph in a) export MOCK_META= MOCK_ADS=;; c) export MOCK_META= MOCK_ADS=live;; *) export MOCK_META=ready MOCK_ADS=;; esac
  echo "== phase $ph"
  bash scripts/ops-test/run.sh --no-build >/dev/null 2>&1
  source scripts/ops-test/env.sh
  case $ph in b) curl -s "http://localhost:4556/__world?name=account" >/dev/null;; d) curl -s "http://localhost:4556/__world?name=account" >/dev/null; curl -s "http://localhost:4556/__mode?rateLimitReads=1" >/dev/null;; e) curl -s "http://localhost:4556/__world?name=empty" >/dev/null;; esac
  if [ $ph = a ] || [ $ph = b ] || [ $ph = c ]; then node scripts/ops-test/ads-account-api.mjs $ph || bad=1; fi
  node scripts/ops-test/ads-account.cjs $ph || bad=1
done
export MOCK_META= MOCK_ADS=
bash scripts/ops-test/run.sh --no-build >/dev/null 2>&1
exit $bad
