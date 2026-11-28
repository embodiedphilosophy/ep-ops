#!/usr/bin/env bash
# The fast set: what to run for most changes (about a quarter of the full suite's time).
#   bash scripts/ops-test/fast.sh                 build once, then the standard set, each on fresh state
#   bash scripts/ops-test/fast.sh --no-build      reuse the last build
#   bash scripts/ops-test/fast.sh ads-live.sh today.cjs   only the named flows (plus the build)
# Rule (agreed with Jake): do ONE full run (scripts/ops-test/all.sh) only when a shared piece changes
# (lib/google, lib/ops/store, nav, the shell, a migration). Otherwise run this, plus the flows for the area you changed.
# Fixed ports: only one run at a time. Writes a one-line-per-flow summary and ends with DONE; exit code 1 if anything failed.
cd "$(dirname "$0")/../.." || exit 1
BUILD=1; [ "$1" = "--no-build" ] && { BUILD=0; shift; }
FLOWS=("$@")
[ ${#FLOWS[@]} -eq 0 ] && FLOWS=(links.cjs final-sweep.cjs final-sweep-crons.sh settings-groups.cjs ads-account.sh ads-live.sh ads-settings.sh ads-library.sh ads-safety.sh ads-insights.sh today.cjs)
bad=0
if [ $BUILD = 1 ]; then
  if bash scripts/ops-test/run.sh >/tmp/fast-build.log 2>&1; then echo "ok    build+start"; else echo "FAIL  build+start (see /tmp/fast-build.log)"; bad=1; fi
fi
for f in "${FLOWS[@]}"; do
  bash scripts/ops-test/run.sh --no-build >/dev/null 2>&1; source scripts/ops-test/env.sh
  case $f in *.sh) out=$(bash scripts/ops-test/$f 2>&1); rc=$?;; *) out=$(node scripts/ops-test/$f 2>&1); rc=$?;; esac
  if [ $rc = 0 ]; then echo "ok    $f"; else echo "FAIL  $f   $(echo "$out" | grep -E 'FAIL|Error' | head -2 | tr '\n' ' ' | cut -c1-200)"; bad=1; fi
done
pkill -f '^next-server' || true; pkill -f 'ops-test/.*mock' || true
echo DONE; exit $bad
