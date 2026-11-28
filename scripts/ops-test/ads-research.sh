#!/usr/bin/env bash
# Ads outside research, in the app (the weekly search for outside information, every statement checked against a source the search returned). Restarts the app several times
# (nothing real is contacted: the Anthropic stand-in in mock.mjs, which answers in the web search shape; no real search, no Meta, no sheet write):
#   0. ads-research.mjs: the checking and the keeping, in node
#   1. empty:     key set, nothing yet: the empty page in a browser
#   2. full:      a bad answer through the weekly job: ads-research-api.mjs full, then the browser (1360 and 390)
#   3. nokey:     no Anthropic key (MOCK_NOKEY=1): API, then the browser
#   4. paused:    the jobs paused (MOCK_OPS_LIVE=0): the job is skipped, the preview and Look now still work
#   5. failing:   the model fails, then the search tool: said plainly, nothing kept
#   6. look / lookempty: "Look now" in a browser, with a good and then an empty answer, on a fresh app each
# Needs a build. Restarts the app normally at the end.
cd "$(dirname "$0")/../.."
bad=0
source scripts/ops-test/env.sh
fresh() { env "$@" bash scripts/ops-test/run.sh --no-build >/dev/null 2>&1; source scripts/ops-test/env.sh; }
echo "== node"; node scripts/ops-test/ads-research.mjs || bad=1
fresh; echo "== empty"; node scripts/ops-test/ads-research.cjs empty || bad=1
echo "== full"; node scripts/ops-test/ads-research-api.mjs full || bad=1
node scripts/ops-test/ads-research.cjs full || bad=1
fresh MOCK_NOKEY=1; echo "== nokey"; node scripts/ops-test/ads-research-api.mjs nokey || bad=1
node scripts/ops-test/ads-research.cjs nokey || bad=1
fresh MOCK_OPS_LIVE=0; echo "== paused"; node scripts/ops-test/ads-research-api.mjs paused || bad=1
fresh; echo "== failing"; node scripts/ops-test/ads-research-api.mjs failing || bad=1
fresh; echo "== look"; curl -s "http://localhost:4555/__research?mode=good" >/dev/null; node scripts/ops-test/ads-research.cjs look || bad=1
fresh; echo "== lookempty"; curl -s "http://localhost:4555/__research?mode=empty" >/dev/null; node scripts/ops-test/ads-research.cjs lookempty || bad=1
bash scripts/ops-test/run.sh --no-build >/dev/null 2>&1
exit $bad
