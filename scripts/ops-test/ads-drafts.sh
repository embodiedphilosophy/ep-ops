#!/usr/bin/env bash
# Ads PR 2 (campaign drafts): the API flow in three modes, then the browser flow. The app is restarted for each (MOCK_ADS and MOCK_NOKEY are read by env.sh):
#   dry   the Meta key, ad account, pixel and Page set, the safety switch OFF (as in production): drafts, checks, Send and Start as dry runs, roles
#   live  the safety switch ON at the Meta mock only: a full 5 × 5 built paused (1 + 5 + 25), Advantage+, Start, a refusing Meta
#   nokey no drafting key: every copy set stays a [placeholder]
# then ads-drafts.cjs in a browser (dry mode, a fresh state). Needs a build (run.sh once). Mock only; the real Meta and Anthropic are never contacted. Restarts the app normally at the end.
cd "$(dirname "$0")/../.."
bad=0
for m in dry live nokey; do
  echo "== $m"
  case $m in dry) A="MOCK_ADS=dry";; live) A="MOCK_ADS=live";; nokey) A="MOCK_ADS=dry MOCK_NOKEY=1";; esac
  env $A bash scripts/ops-test/run.sh --no-build >/dev/null 2>&1
  source scripts/ops-test/env.sh
  env $A node scripts/ops-test/ads-drafts-api.mjs $m || bad=1
done
echo "== browser"
MOCK_ADS=dry bash scripts/ops-test/run.sh --no-build >/dev/null 2>&1
source scripts/ops-test/env.sh
MOCK_ADS=dry node scripts/ops-test/ads-drafts.cjs || bad=1
bash scripts/ops-test/run.sh --no-build >/dev/null 2>&1
exit $bad
