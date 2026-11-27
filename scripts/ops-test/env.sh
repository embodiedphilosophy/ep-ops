# Point the app at the local mock (scripts/ops-test/mock.mjs) instead of Google, Kit, Motion, Make, Resend, Zoom.
# Usage: source scripts/ops-test/env.sh      (then build/start as usual; see README.md)
K="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
mkdir -p "$K/out"
[ -s "$K/out/ops_secret" ] || (umask 077; openssl rand -hex 32 > "$K/out/ops_secret")   # throwaway, local only
export M=http://localhost:4555
export GOOGLE_TOKEN_URL=$M/token SHEETS_BASE=$M CALENDAR_API_BASE=$M MOTION_BASE=$M/motion
export RESEND_BASE=$M/resend KIT_BASE=$M/kit/v4 KIT_API_KEY=mock ZOOM_API_BASE=$M/zoom ZOOM_OAUTH_BASE=$M/zoomauth
export SOCIAL_IMAGES_HOOK=$M/make-hook
export ZENDESK_BASE=$M/zendesk ZENDESK_EMAIL=mock@example.com ZENDESK_API_TOKEN=mock KB_SHEET_ID=mock-kb
export CALENDLY_API_BASE=$M/calendly CALENDLY_TOKEN=mock
# Tasks and the time clock live in Neon when DATABASE_URL is set: unset it so tests never touch the real database
# (tasks then come read-only from Motion through the mock; the time clock shows as unavailable).
unset RESEND_API_KEY CIRCLE_API_TOKEN CRON_SECRET OPS_ORIGIN OPS_LIVE REVALIDATE_SECRET CIRCLE_EVENT_SYNC DATABASE_URL POSTGRES_URL TASKS_BACKEND
# Ads (Meta): never inherit real settings. The base address points at the Meta mock (:4556) so even a stray call cannot reach Meta; the ads flows set the rest themselves.
unset META_ADS_TOKEN META_AD_ACCOUNT_ID META_PIXEL_ID META_PAGE_ID META_ADS_LIVE ADS_TEST_DB
export META_ADS_BASE=http://localhost:4556
# MOCK_ADS=dry | live (ads-settings.sh only): fake Meta settings so Settings shows the other modes. The token is a throwaway word; the mock accepts any.
if [ "$MOCK_ADS" = dry ] || [ "$MOCK_ADS" = live ]; then export META_ADS_TOKEN=mock-ads-token-for-the-settings-test META_AD_ACCOUNT_ID=act_MOCK1 META_PIXEL_ID=PIX1 META_PAGE_ID=PAGE1; fi
[ "$MOCK_ADS" = live ] && export META_ADS_LIVE=live
export OPS_SECRET="$(cat "$K/out/ops_secret")"
export CALENDAR_SHEET_ID=mock-sheet SOCIAL_SHEET_ID=mock-social
export MOCK_LOG="$K/out/mock.log"
# The mock accepts any signed token: without a real service account, sign with a throwaway local key
if [ -z "$GOOGLE_PRIVATE_KEY" ]; then
  [ -s "$K/out/test_key.pem" ] || (umask 077; openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out "$K/out/test_key.pem" 2>/dev/null)
  export GOOGLE_PRIVATE_KEY="$(cat "$K/out/test_key.pem")" GOOGLE_SERVICE_ACCOUNT_EMAIL=mock@test.local
fi
# Course Library: a fake Circle (read only), a stand-in website sheet (the mock serves every sheet id) and site refresh
export CIRCLE_API_TOKEN=mock CIRCLE_API_BASE=$M/circle WEBSITE_SHEET_ID=mock-website SITE_URL=$M/site COURSES_REVALIDATE_SECRET=mock-secret REVALIDATE_SECRET=mock-secret
export KALIGHAT_COVER_URL=$M/img/kalighat.png
# Landing Pages: the website's /api/landing-pages feed comes from the mock (MOCK_NOLP=1 makes it a 404)
export LANDING_PAGES_URL=$M/site/api/landing-pages
# CE credits ledger (/ops/ce): the website's CE admin API comes from the mock
export CE_ADMIN_KEY=mock-ce
# YouTube: dispatches go to the mock's fake GitHub; the pipeline's calls use a throwaway secret; no Blob (thumbnails kept in memory)
unset BLOB_READ_WRITE_TOKEN
export GITHUB_API_BASE=$M/github GITHUB_PIPELINE_TOKEN=mock-gh OPS_PIPELINE_SECRET=mock-pipeline-secret-0123456789abcdef
# Content v2: Instagram (read only) and Drive uploads against the mock; a local-only cron key for /api/ops/social-sync
export META_GRAPH_URL=$M/graph META_ACCESS_TOKEN=mock META_IG_USER_ID=IG1 META_APP_ID=1 META_APP_SECRET=mock
export DRIVE_API_BASE=$M/gdrive DRIVE_UPLOAD_USER=jacob@embodiedphilosophy.com SOCIAL_UPLOADS_FOLDER_ID=mockfolder0123456789
export CRON_SECRET=mock-cron-secret OPS_LIVE=${MOCK_OPS_LIVE:-1}   # MOCK_OPS_LIVE=0: the app starts as it does on a project where the jobs are paused (final-sweep-crons.sh)
export SOCIAL_INGEST_SECRET=mock-ingest-secret-0123456789
# Ads PR 2 (campaign drafts): copy drafting goes to the mock Anthropic on :4555, with a throwaway key; the real key is never used (unset first). Pictures are kept inline
# (no Blob) and Ads tables live in PGlite, an in-process Postgres, so no test touches a real database. All three switches are inert unless set, and are not set in production.
unset ANTHROPIC_API_KEY ANTHROPIC_BASE
export ANTHROPIC_BASE=$M/anthropic ANTHROPIC_API_KEY=mock-anthropic-key-not-real ADS_TEST_BLOB=inline ADS_TEST_DB=pglite
if [ "$MOCK_NOKEY" = 1 ]; then unset ANTHROPIC_API_KEY; fi   # ads-drafts.sh: a run with no drafting key
# Ads PR 4 (the Practice Report link): never the real quiz database. REPORT_TEST_DB=pglite (MOCK_REPORT=1, ads-library.sh only) gives a synthetic quiz in an in-process Postgres;
# otherwise the link is not connected. Inert unless set; not set in production.
unset REPORT_DATABASE_URL REPORT_TEST_DB
if [ "$MOCK_REPORT" = 1 ]; then export REPORT_TEST_DB=pglite; fi
# Alerts (Ads safety net): text and WhatsApp go through Twilio. Never inherit real settings; TWILIO_BASE points at the Twilio mock (:4557) so even a stray call cannot reach Twilio.
# MOCK_TWILIO=sms | both | template (alert flows only) gives the app throwaway settings so the alert channels have something to send through (at the mock only).
unset TWILIO_ACCOUNT_SID TWILIO_AUTH_TOKEN TWILIO_SMS_FROM TWILIO_WHATSAPP_FROM TWILIO_WHATSAPP_TEMPLATE_SID
export TWILIO_BASE=http://localhost:4557
if [ "$MOCK_TWILIO" = sms ] || [ "$MOCK_TWILIO" = both ] || [ "$MOCK_TWILIO" = template ]; then export TWILIO_ACCOUNT_SID=ACmocktwilioaccount0000000000000000 TWILIO_AUTH_TOKEN=mock-twilio-token-not-real TWILIO_SMS_FROM=+15005550006; fi
if [ "$MOCK_TWILIO" = both ] || [ "$MOCK_TWILIO" = template ]; then export TWILIO_WHATSAPP_FROM=+14155238886; fi
[ "$MOCK_TWILIO" = template ] && export TWILIO_WHATSAPP_TEMPLATE_SID=HXmocktemplate00000000000000000000
# MOCK_META=ready (alert flows only): the Meta key, ad account and pixel set (the safety switch stays OFF: reads need only the key) so the watchdog has an account to read at the mock.
if [ "$MOCK_META" = ready ]; then export META_ADS_TOKEN=mock-ads-token-for-the-safety-test META_AD_ACCOUNT_ID=act_MOCK1 META_PIXEL_ID=PIX1 META_PAGE_ID=PAGE1; fi
