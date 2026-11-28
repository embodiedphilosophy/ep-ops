#!/usr/bin/env bash
# Ads PR 5, Audience insights, in the app. Restarts the app several times (nothing real is contacted: the Meta, Circle, Kit, Anthropic and quiz stand-ins only):
#   0. ads-insights.mjs: the checking of what a model writes, in node
#   1. full:       the Meta key set and the safety switch ON at the Meta mock only (MOCK_ADS=live), the quiz connected (MOCK_REPORT=1 = a synthetic quiz in an in-process Postgres),
#                  Circle and Kit connected: ads-insights-api.mjs full, then ads-insights.cjs (a browser)
#   2. nokey:      no Anthropic key (MOCK_NOKEY=1): the numbers without prose
#   3. kitonly / circleonly / neither: a source's key taken away (MOCK_NOCIRCLE=1, MOCK_NOKIT=1)
#   4. failures:   Kit answers 500, Circle can't list purchases, Circle answers 500
# Needs a build. Restarts the app normally at the end.
cd "$(dirname "$0")/../.."
bad=0
source scripts/ops-test/env.sh
node scripts/ops-test/ads-insights.mjs || bad=1
phase() {   # phase <name> <env words...>  → restart with those switches, run the API flow for the phase
  name=$1; shift
  env "$@" bash scripts/ops-test/run.sh --no-build >/dev/null 2>&1
  source scripts/ops-test/env.sh
  [ "$name" = neither ] && { echo "== the empty page, in a browser (nothing read yet, no table)"; node scripts/ops-test/ads-insights.cjs empty || bad=1; }
  echo "== $name"; node scripts/ops-test/ads-insights-api.mjs $name || bad=1
}
phase full MOCK_ADS=live MOCK_REPORT=1
node scripts/ops-test/ads-insights.cjs || bad=1
phase nokey MOCK_ADS=live MOCK_NOKEY=1
phase kitonly MOCK_NOCIRCLE=1
phase circleonly MOCK_NOKIT=1
phase neither MOCK_NOCIRCLE=1 MOCK_NOKIT=1
phase failures MOCK_ADS=live
bash scripts/ops-test/run.sh --no-build >/dev/null 2>&1
exit $bad
