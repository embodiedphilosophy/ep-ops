#!/usr/bin/env bash
# Ads PR 3, live campaigns and rules: the app is restarted with the Meta key set and the safety switch ON at the Meta mock only (MOCK_ADS=live; the jobs are live too; Make's Ad Agent
# is AUTO on the mock Metrics sheet), then ads-live-api.mjs (the hourly sync, the morning rules as a dry run while Make is on and for real once it is OFF, Reverse, Pause and Start
# again, the roles, the token) and ads-live.cjs (the pages in a browser, desktop and phone) run against the same campaign. Mock only; the real Meta, Anthropic and Resend are never
# contacted. Needs a build. Restarts the app normally at the end.
cd "$(dirname "$0")/../.."
bad=0
MOCK_ADS=live bash scripts/ops-test/run.sh --no-build >/dev/null 2>&1
source scripts/ops-test/env.sh
MOCK_ADS=live node scripts/ops-test/ads-live-api.mjs || bad=1
MOCK_ADS=live node scripts/ops-test/ads-live.cjs || bad=1
bash scripts/ops-test/run.sh --no-build >/dev/null 2>&1
exit $bad
