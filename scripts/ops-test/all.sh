#!/usr/bin/env bash
# Runs every scripted flow against a fresh mock, one after another, and prints one line each (pass or fail).
# Most flows start from a fresh run.sh state, so each gets its own. Usage: bash scripts/ops-test/all.sh [--no-build]
cd "$(dirname "$0")/../.."
bash scripts/ops-test/run.sh "${1:-}" >/tmp/all-run.log 2>&1 || { echo "run.sh failed"; exit 1; }
source scripts/ops-test/env.sh
T=scripts/ops-test
for f in content-v2-api.sh content-v2-phase2-api.sh instagram-ingest.sh cards2.sh campaigns-api.sh delete-expired.sh email-phase1.sh email-phase2.sh email-phase3.sh email-launches.sh email-teachers.sh email-media.sh email-newsletter-offer.sh \
         social-workspace.cjs cards.cjs cards-programs.cjs composer.cjs library-v2.cjs campaigns.cjs email-phase1.cjs email-phase2.cjs email-phase3.cjs email-launches.cjs email-teachers.cjs email-media.cjs links.cjs; do
  [ -f $T/$f ] || continue
  bash $T/run.sh --no-build >/dev/null 2>&1; source $T/env.sh
  case $f in *.sh) out=$(bash $T/$f 2>&1); rc=$?;; *) out=$(node $T/$f 2>&1); rc=$?;; esac
  if [ $rc = 0 ]; then echo "ok    $f"; else echo "FAIL  $f   $(echo "$out" | grep -E 'FAIL|Error' | head -2 | tr '\n' ' ' | cut -c1-160)"; fi
done
