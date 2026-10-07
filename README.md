# ep-ops: Embodied Philosophy team dashboard & teacher onboarding

Next.js app on Vercel at **ops.embodiedphilosophy.com** (like the quiz at report.embodiedphilosophy.com, it's its own
repo and Vercel project). The public site (ep-website) only reads what this app writes.

| Path | What it is |
|---|---|
| /ops | Team dashboard: Motion tasks (past due / this week / coming up) and teaching sessions with Zoom links |
| /teach | Teacher onboarding (directors see every assigned teacher and can "Try it as" them, saving nothing) |
| /teach/preview/[slug] | A course page before it's published (directors and that course's teachers) |
| /api/ops/daily | Daily cron: Motion tasks from Task Templates, teaching reminders, slides requests, "page is live" notes |

## Sign-in
Email link (Resend). Anyone on the **Team** tab, or anyone whose email is in a session's **Teacher/Host Emails** on
the Master Schedule. Teachers with onboarding left are sent from /ops to /teach.

## Teacher onboarding
1. **Bio & headshot** (60–100 words, square photo, uploaded to the ep-media Blob store). Returning teachers confirm
   what's on file (Teacher Profiles tab, or the website's Teachers tab) or update it.
2. **Their offering**, once per upcoming offering (a Series, or a single event): title, subtitle, description,
   what students will explore, who it's for, plus, when that track's **Task Templates** have a Teacher row for it:
   - readings: share them all now (links or uploads) or send them a week before each session;
   - three promotional email blurbs (rows mentioning "blurbs"/"promotional": EVENT, i.e. courses a teacher leads
     on their own; Wisdom School and Sādhana School don't ask, since EP writes those);
   - a promo clip link (rows mentioning a "clip", e.g. LRL).
3. **Course page preview**; "This looks right" sends it to directors for review.
4. **Circle** (tracks in `CIRCLE_TRACKS`, default `SS,SSWW,EVENT`; `ALL` after the full move to Circle): invite,
   Teachers access group, course space; then how to teach there.
5. **Dashboard tour**, **emails to expect**, a welcome email, and a row on the **Team** tab.

What onboarding closes in Motion (and the daily job then stops creating): bio/headshot, title/description, promo
blurbs, and readings if shared up front. The day after each session, the daily job asks that session's teachers for
their slides as a PDF (tracks with a Teacher "slides" row); EP staff on the Team tab are left out.

## Data: EP-Programming-Calendar (the service account needs edit access)
| Tab | One row per | Set by hand |
|---|---|---|
| Master Schedule, Track Defaults, Task Templates, Team | (existing) | |
| Teacher Profiles | teacher (email) | `status` = `approved` puts their bio/photo on the website's Teachers page |
| Course Pages | offering (Series or event ID) | `status` = `published` puts embodiedphilosophy.com/courses/[slug] live; `circle_space_id` = their Circle space |

## Settings (Vercel → ep-ops → Environment Variables)
- Google: `CALENDAR_SHEET_ID`, `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_PRIVATE_KEY`
- Sign-in & email: `OPS_SECRET`, `RESEND_API_KEY`, `RESEND_FROM`, `OPS_URL` (https://ops.embodiedphilosophy.com)
- Motion: `MOTION_API_KEY` (optional `MOTION_WORKSPACE_ID`); cron: `CRON_SECRET`
- Zoom (for join links): `ZOOM_ACCOUNT_ID`, `ZOOM_CLIENT_ID`, `ZOOM_CLIENT_SECRET`, optional `MEDITATION_MONDAYS_MEETING_ID`
- Circle: `CIRCLE_API_TOKEN`, `CIRCLE_TEACHER_ACCESS_GROUP_ID`, optional `CIRCLE_SPACE_<TRACK>`, `CIRCLE_TRACKS`
- Uploads: `BLOB_READ_WRITE_TOKEN` (ep-media store)
- Website: `SITE_URL` (default https://www.embodiedphilosophy.com), `EVENTS_SHEET_CSV_URL` (to recognise teachers already on the site)

The daily cron runs at 13:00 UTC (vercel.json). Run by hand: `/api/ops/daily?key=CRON_SECRET`; `&preview=21` sends
nothing and lists what would go out.

## Moving over from ep-website
1. Deploy this project and add the ops.embodiedphilosophy.com domain (CNAME at GoDaddy).
2. Copy the settings above from the ep-website project.
3. In ep-website set `OPS_ORIGIN=https://ops.embodiedphilosophy.com`: its /ops redirects here and its daily job stops.
