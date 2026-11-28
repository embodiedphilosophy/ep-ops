#!/usr/bin/env bash
# Ads › What we've learned, in the app. Restarts the app per phase (nothing real is contacted: the Meta mock's synthetic 20-week history, the Anthropic stand-in, an in-process Postgres):
#   0. ads-learned.mjs: the pure part and the import library in node (needs the mocks running, so run.sh first)
#   1. none:     no Meta key: ads-learned-api.mjs none, ads-learned.cjs empty (the empty page, phone width)
#   2. full:     the Meta key set (the safety switch stays OFF: reading needs only the key), world 'history':
#                ads-learned-api.mjs full1 (a rate limit once, then 8 of 20 weeks), ads-learned.cjs importing, ads-learned-api.mjs full2 (the rest, the statements, the model's phrasing), ads-learned.cjs
#      timeout:  the server answers with a 504 / 500 HTML page (simulated in the browser): the specific message, at both widths (ads-learned.cjs timeout, on the data from phase full)
#   2b. large:   a BIG account (Meta mock world 'large') with the run budget cut to 1.5 s (MOCK_HISTORY_BUDGET): ads-learned-api.mjs large1 (one run, answers in time, part-way), ads-learned.cjs partial (the progress line at both
#                widths, the press), ads-learned-api.mjs large2 (the next runs finish it); guard: the server's time guard answers (MOCK_HISTORY_GUARD) with what was done
#   3. bad:      the model also answers badly (every bad statement dropped)           4. nokey: no model key           5. failmodel: the model fails
# Needs a build. Restarts the app normally at the end.
cd "$(dirname "$0")/../.."
bad=0
source scripts/ops-test/env.sh
bash scripts/ops-test/run.sh --no-build >/dev/null 2>&1; source scripts/ops-test/env.sh
node scripts/ops-test/ads-learned.mjs || bad=1
phase() {   # phase <name> <env words...>  → restart with those switches, then set the Meta mock's world
  name=$1; shift
  env "$@" bash scripts/ops-test/run.sh --no-build >/dev/null 2>&1
  source scripts/ops-test/env.sh
  echo "== $name"
}
phase none
node scripts/ops-test/ads-learned-api.mjs none || bad=1
node scripts/ops-test/ads-learned.cjs empty || bad=1
phase full MOCK_META=ready
node scripts/ops-test/ads-learned-api.mjs full1 || bad=1
node scripts/ops-test/ads-learned.cjs importing || bad=1
node scripts/ops-test/ads-learned-api.mjs full2 || bad=1
node scripts/ops-test/ads-learned.cjs full || bad=1
node scripts/ops-test/ads-learned.cjs timeout || bad=1
phase large MOCK_META=ready MOCK_HISTORY_BUDGET=1500
node scripts/ops-test/ads-learned-api.mjs large1 || bad=1
node scripts/ops-test/ads-learned.cjs partial || bad=1
node scripts/ops-test/ads-learned-api.mjs large2 || bad=1
phase guard MOCK_META=ready MOCK_HISTORY_BUDGET=60000 MOCK_HISTORY_GUARD=1500
node scripts/ops-test/ads-learned-api.mjs guard || bad=1
phase bad MOCK_META=ready
node scripts/ops-test/ads-learned-api.mjs bad || bad=1
phase nokey MOCK_META=ready MOCK_NOKEY=1
node scripts/ops-test/ads-learned-api.mjs nokey || bad=1
phase failmodel MOCK_META=ready MOCK_ANTHROPIC_FAIL=1
node scripts/ops-test/ads-learned-api.mjs failmodel || bad=1
bash scripts/ops-test/run.sh --no-build >/dev/null 2>&1
exit $bad
