# ep-ops: Embodied Philosophy team dashboard & teacher onboarding

Its own repo and Vercel project (like the quiz at report.embodiedphilosophy.com), at **ops.embodiedphilosophy.com**.
The public site (ep-website) reads the same sheets; this app writes them.

| Path | What it is |
|---|---|
| /ops | Team dashboard: Today, Events, Tasks, Publish, Business, People, Hours, Settings |
| /teach | Teacher onboarding |
| /api/ops/daily, /api/ops/auto, /api/zoom/sync, /api/scaffolding | Back-office crons (vercel.json); real runs need `OPS_LIVE=1` |

Start with `CLAUDE.md` (rules, testing) and `docs/ops-handoff.md` (architecture, backlog).

## Settings (Vercel → ep-ops → Environment Variables)
Copy every variable from ep-website that the dashboard uses (same values):
`CALENDAR_SHEET_ID`, `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_PRIVATE_KEY`, `SOCIAL_SHEET_ID`, `METRICS_SHEET_ID`,
`OPS_SECRET`, `RESEND_API_KEY`, `RESEND_FROM`, `CRON_SECRET`, `DATABASE_URL` (Neon), `MOTION_API_KEY`,
`MOTION_WORKSPACE_ID`, `KIT_API_KEY`, `CIRCLE_API_TOKEN`, `CIRCLE_TEACHER_ACCESS_GROUP_ID`, `CIRCLE_TRACKS`,
`CIRCLE_GROUPS_JSON`, `CIRCLE_EVENT_SYNC`, `ZOOM_*`, `MEDITATION_MONDAYS_MEETING_ID`, `SOCIAL_IMAGES_HOOK`,
`SCAFFOLDING_*`, `HOLD_TAG_ID`, `OPS_TEAM_CALENDARS`, `BLOB_READ_WRITE_TOKEN`, `EVENTS_SHEET_CSV_URL`, `THEME_YEAR`.
New here:
- `OPS_URL` = https://ops.embodiedphilosophy.com (sign-in links)
- `SITE_URL` and `NEXT_PUBLIC_SITE_URL` = https://www.embodiedphilosophy.com
- `REVALIDATE_SECRET` = a new random value, set on **both** projects (lets a save here refresh the website)
- `OPS_LIVE` = `1`, only at cutover (step 4 below)

## Cutover (once)
1. Merge the move PR here; in Vercel add the domain ops.embodiedphilosophy.com to ep-ops and the CNAME at GoDaddy.
2. Add the settings above (without `OPS_LIVE`). Redeploy. Sign in at ops.embodiedphilosophy.com/ops and check each page.
   Crons on this project do nothing yet.
3. Merge the ep-website PR "ops-moves-out" (adds /api/revalidate and the switch below; changes nothing by itself).
4. Flip, back to back: ep-website gets `OPS_ORIGIN=https://ops.embodiedphilosophy.com` (then redeploy ep-website:
   the /ops → ops redirect is set at build time); ep-ops gets `OPS_LIVE=1` (redeploy).
   Now ep-website's crons stand down, ep-ops runs them, and old /ops and /teach links forward here.
5. A week later, if all is well: remove /ops, /teach, their APIs and the ops-only libraries from ep-website.

Rollback: remove `OPS_LIVE` here and `OPS_ORIGIN` on ep-website, redeploy both.
