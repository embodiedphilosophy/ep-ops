#!/usr/bin/env bash
# Ads PR 4, the Audience library, in the app: restarted twice with the Meta key set and the safety switch ON at the Meta mock only (MOCK_ADS=live; the jobs are live; Make's Ad Agent
# is AUTO on the mock sheet).
#   1. the Practice Report NOT connected: ads-library-api.mjs a (roles, the empty library, three campaigns built through the app, the daily job, "Use in a campaign", Bring back,
#      thresholds, tags, suggestions), then ads-library.cjs (the pages in a browser, desktop and phone width, the Settings section)
#   2. MOCK_REPORT=1: the Practice Report connected to a synthetic quiz in an in-process Postgres (REPORT_TEST_DB=pglite, made-up people): ads-library-api.mjs b (overlap, ideas, and no
#      personal value anywhere), then ads-library.cjs b (in a browser)
# Mock only; the real Meta, Anthropic, Resend and quiz database are never contacted. Needs a build. Restarts the app normally at the end.
cd "$(dirname "$0")/../.."
bad=0
MOCK_ADS=live bash scripts/ops-test/run.sh --no-build >/dev/null 2>&1
source scripts/ops-test/env.sh
MOCK_ADS=live node scripts/ops-test/ads-library-api.mjs a || bad=1
MOCK_ADS=live node scripts/ops-test/ads-library.cjs a || bad=1
MOCK_ADS=live MOCK_REPORT=1 bash scripts/ops-test/run.sh --no-build >/dev/null 2>&1
source scripts/ops-test/env.sh
MOCK_ADS=live MOCK_REPORT=1 node scripts/ops-test/ads-library-api.mjs b || bad=1
MOCK_ADS=live MOCK_REPORT=1 node scripts/ops-test/ads-library.cjs b || bad=1
bash scripts/ops-test/run.sh --no-build >/dev/null 2>&1
exit $bad
