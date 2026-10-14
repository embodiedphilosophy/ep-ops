# ep-ops: the EP team dashboard + teacher onboarding

Next.js 16 app on Vercel (project `ep-ops`, auto-deploys from `main`) at ops.embodiedphilosophy.com: the staff
dashboard at `/ops` (`app/ops/*`, APIs in `app/api/ops/*`, logic in `lib/ops/*`), teacher onboarding at `/teach`,
and the back-office crons (daily, auto, Zoom sync, Weekly Scaffolding). The public website is a separate repo and
project (`embodiedphilosophy/ep-website`); it reads the same sheets. Owner: Jacob Kyle (jacob@embodiedphilosophy.com).

**Read `docs/ops-handoff.md` first**: the dashboard's brief, architecture map, design rules and the backlog in
order. This file adds the safety rules and how to test.

## Ground rules
- **Spreadsheets are the hidden source of truth; the dashboard is the interface.** Staff never edit sheets directly.
  Every change goes through `lib/ops/store.js` (`updateRow` / `updatePlain` / `addPlain`): columns found by header
  name, formula columns never written, conflict check against the `before` values (409), every change logged to
  the Change Log tab, and `refreshSite()` after a save so cached reads expire.
- **The same sheets drive the public website** (ep-website). Never break it: don't rename tabs or columns the site
  reads (`lib/coursepages.js`, `lib/content.js`, `lib/events.js` in ep-website) without changing the site in the same
  breath. Libraries shared with the site (`lib/google.js`, `lib/calendar.js`, `lib/events.js`…) are copies: fix a bug
  in both repos. After a save, `refreshSite()` also expires the website's cache via its `/api/revalidate`.
- **Test with `scripts/ops-test/`** (synthetic mock, see its README). Never test by writing to real systems:
  no real sheet or database writes, emails, Motion tasks, Kit/Circle/Make changes, social posts, and no daily
  cron run. Crons only run for real with `OPS_LIVE=1` (`lib/crongate.js`).
  Real external writes (a test Instagram post, switching on `CIRCLE_EVENT_SYNC=live`) need Jacob's explicit OK.
- Google allows ~60 sheet reads a minute: display endpoints use light cached reads (`{ light: true }`), saves
  use fresh reads.
- Never print secrets or env values. Credentials are environment variables (Vercel and the cloud environment).
- One branch + PR per piece of work (Jacob merges). Before opening the PR: `npm run build`, the relevant
  `scripts/ops-test/` flows and phone width. Say in the PR
  what you tested and what you couldn't.
- Write UI copy and messages in plain, warm English; no jargon in what staff read.

## Systems and sheets
- **EP-Programming-Calendar** (`CALENDAR_SHEET_ID`): Schedule + Event Details (header row 4, IDs `E###`) feed the
  Master Schedule formula view; also Team, Task Templates (with `done_when`), Track Defaults, Circle Groups,
  Resources, Teachers, Course Pages, Weekly Scaffolding, Site * tabs (website content), Change Log.
- **EP Social Engine** (`1IWmlLqZNPgmMuPgdM9HkVQagQNwPylAd0zi4YcUtEIM`): Weekly Plan, Image Library, Quote
  Library, Caption Bank, Rules… Make scenario "EP Social: Publish approved posts" publishes `Approved` rows at
  their time, downloading the picture **from Drive** (image_url must be an lh3 Drive link). New pictures (uploads,
  crops) go to Drive through the Make scenario "EP Social: Dashboard images ↔ Drive" (`SOCIAL_IMAGES_HOOK`).
- **EP Revenue & Metrics System (2026)** (`1gK_02Szjd76AYEUCNcUHAXZtJZh5PYIwSpzrek4OSYs`): Insights reads it
  (Make fills it from Stripe, PayPal, Meta).
- **Tarka Operations** (`1BYfIfwxeLiJ1cln855c5t8PVT1Hg6QPqdRYDhI8NShc`): the Tarka journal's tracker (Calendar,
  Tasks, Editorial Pipeline, Editions, Contacts, Targets, Team, Task Templates, Key). Planned Tarka area.
- **Tasks and the time clock** live in Neon Postgres (`DATABASE_URL`); always go through `lib/ops/taskstore.js`.
  Motion only gets Jacob's daily digest. Local tests unset `DATABASE_URL` (tasks then read from Motion, read only).
- **Kit** (email, `KIT_API_KEY`; read-only checks; promo broadcasts carry the
  event ID like `[E047] Promo #2`), **Circle** (community + live streams, `CIRCLE_API_TOKEN` = an Admin **V2** token; event sync is a dry
  run until `CIRCLE_EVENT_SYNC=live`. New Circle events are drafts until "Push to Circle" on the event's drawer,
  `app/ops/events/CirclePanel.js`; standalone courses (track EVENT) get a hidden course space + live-sessions space
  from "Set up course in Circle", `lib/ops/circlecourse.js`), **Make** (automations), **Vercel Blob** (teacher uploads).
- Being retired: Kajabi, Uscreen, Vimeo (the Vimeo ID only feeds the site's free-preview players).

## People and access (`lib/ops/nav.js`, Team tab)
Directors see everything incl. Settings (`/ops/settings`). Floss, Irene and Jacob edit events. The Social role edits Social.
Teachers see only their own work. Tarka (planned): Jacob, Stephanie Corigliano (Editor-in-Chief), Floss Harry.
