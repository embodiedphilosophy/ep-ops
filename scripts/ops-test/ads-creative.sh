#!/usr/bin/env bash
# Ads › Creative results, in the app. The app is restarted twice (the Meta, Anthropic and Resend stand-ins only; nothing real is contacted):
#   1. b: no Meta key (as in the first days): ads-creative-api.mjs b (not connected, no tables, then a draft only), then ads-creative.cjs b (the page's empty and not-connected words)
#   2. a: the Meta key set and the safety switch ON at the Meta mock only (MOCK_ADS=live): ads-creative-api.mjs a (six campaigns built through the app, results at two sizes, every number
#      recomputed from Meta's own rows), then ads-creative.cjs a (the page in a browser, desktop and phone width)
# Needs a build. Restarts the app normally at the end.
cd "$(dirname "$0")/../.."
bad=0
bash scripts/ops-test/run.sh --no-build >/dev/null 2>&1
source scripts/ops-test/env.sh
node scripts/ops-test/ads-creative.cjs b0 || bad=1
node scripts/ops-test/ads-creative-api.mjs b || bad=1
node scripts/ops-test/ads-creative.cjs b || bad=1
MOCK_ADS=live bash scripts/ops-test/run.sh --no-build >/dev/null 2>&1
source scripts/ops-test/env.sh
MOCK_ADS=live node scripts/ops-test/ads-creative-api.mjs a || bad=1
MOCK_ADS=live node scripts/ops-test/ads-creative.cjs a || bad=1
bash scripts/ops-test/run.sh --no-build >/dev/null 2>&1
exit $bad
