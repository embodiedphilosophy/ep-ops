#!/usr/bin/env bash
# Ads PR 1: Settings › Connections and jobs shows the Meta ads row correctly in its three modes (nothing set / the key set, switch off / switch on),
# only to directors, and nothing at page load reaches Meta or makes tables. The app is restarted once per mode (MOCK_ADS, read by env.sh), and at the
# end restarted normally. Needs a build (run.sh once). Mock only; the Meta mock is on :4556 and the real Meta is never contacted.
cd "$(dirname "$0")/../.."
bad=0
for m in none dry live; do
  echo "== mode: $m"
  MOCK_ADS=$([ $m = none ] && echo "" || echo $m) bash scripts/ops-test/run.sh --no-build >/dev/null 2>&1
  source scripts/ops-test/env.sh
  MOCK_ADS=$([ $m = none ] && echo "" || echo $m) node scripts/ops-test/ads-settings.cjs $m || bad=1
done
bash scripts/ops-test/run.sh --no-build >/dev/null 2>&1
exit $bad
