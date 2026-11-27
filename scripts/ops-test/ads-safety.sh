#!/usr/bin/env bash
# The ad safety net and alerts, in the app. The app is restarted three times (Meta and Twilio are the mocks on :4556 and :4557; email has no key in the test kit):
#   a. the Meta key set (the safety switch stays OFF: the net only reads) and Twilio set (text + WhatsApp):  ads-safety-api.mjs a, then ads-safety.cjs a
#   b. the Meta key set, NO Twilio settings (email only):                                                      ads-safety-api.mjs b, then ads-safety.cjs b
#   c. NO Meta key:                                                                                            ads-safety-api.mjs c, then ads-safety.cjs c
# Mock only; the real Meta, Twilio and Resend are never contacted. Needs a build. Restarts the app normally at the end.
cd "$(dirname "$0")/../.."
bad=0
for ph in a b c; do
  case $ph in a) export MOCK_META=ready MOCK_TWILIO=both;; b) export MOCK_META=ready MOCK_TWILIO=;; c) export MOCK_META= MOCK_TWILIO=;; esac
  echo "== phase $ph"
  bash scripts/ops-test/run.sh --no-build >/dev/null 2>&1
  source scripts/ops-test/env.sh
  node scripts/ops-test/ads-safety-api.mjs $ph || bad=1
  node scripts/ops-test/ads-safety.cjs $ph || bad=1
done
export MOCK_META= MOCK_TWILIO=
bash scripts/ops-test/run.sh --no-build >/dev/null 2>&1
exit $bad
