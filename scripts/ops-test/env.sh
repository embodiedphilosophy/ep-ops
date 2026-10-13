# Point the app at the local mock (scripts/ops-test/mock.mjs) instead of Google, Kit, Motion, Make, Resend, Zoom.
# Usage: source scripts/ops-test/env.sh      (then build/start as usual; see README.md)
K="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
mkdir -p "$K/out"
[ -s "$K/out/ops_secret" ] || (umask 077; openssl rand -hex 32 > "$K/out/ops_secret")   # throwaway, local only
export M=http://localhost:4555
export GOOGLE_TOKEN_URL=$M/token SHEETS_BASE=$M CALENDAR_API_BASE=$M MOTION_BASE=$M/motion
export RESEND_BASE=$M/resend KIT_BASE=$M/kit/v4 KIT_API_KEY=mock ZOOM_API_BASE=$M/zoom ZOOM_OAUTH_BASE=$M/zoomauth
export SOCIAL_IMAGES_HOOK=$M/make-hook
# Tasks and the time clock live in Neon when DATABASE_URL is set: unset it so tests never touch the real database
# (tasks then come read-only from Motion through the mock; the time clock shows as unavailable).
unset RESEND_API_KEY CIRCLE_API_TOKEN CRON_SECRET OPS_ORIGIN OPS_LIVE REVALIDATE_SECRET CIRCLE_EVENT_SYNC DATABASE_URL POSTGRES_URL TASKS_BACKEND
export OPS_SECRET="$(cat "$K/out/ops_secret")"
export CALENDAR_SHEET_ID=mock-sheet SOCIAL_SHEET_ID=mock-social
export MOCK_LOG="$K/out/mock.log"
# The mock accepts any signed token: without a real service account, sign with a throwaway local key
if [ -z "$GOOGLE_PRIVATE_KEY" ]; then
  [ -s "$K/out/test_key.pem" ] || (umask 077; openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out "$K/out/test_key.pem" 2>/dev/null)
  export GOOGLE_PRIVATE_KEY="$(cat "$K/out/test_key.pem")" GOOGLE_SERVICE_ACCOUNT_EMAIL=mock@test.local
fi
# Course Library: a fake Circle (read only), a stand-in website sheet (the mock serves every sheet id) and site refresh
export CIRCLE_API_TOKEN=mock CIRCLE_API_BASE=$M/circle WEBSITE_SHEET_ID=mock-website SITE_URL=$M/site COURSES_REVALIDATE_SECRET=mock-secret
export KALIGHAT_COVER_URL=$M/img/kalighat.png
