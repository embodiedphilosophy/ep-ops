# EP Ops dashboard — handoff for Claude Code

Read this first. It is the brief, the state of play, and the backlog for the ops dashboard at `/ops`.
Design reference (Claude Design canvas, owner: Jacob): https://claude.ai/code/artifact/7dade985-636f-4619-a566-0314f4ea3ee7
— boards: System, Components, Today, Events, Publish, Teacher (phone), Business, Settings, People, Time clock.

## 1. What the dashboard is for

One place for EP staff, contractors and rotating teachers. Every screen answers one question:

| Place | Question | Who |
|---|---|---|
| Today `/ops` | What needs me this week? | everyone (scoped) |
| Events `/ops/events` | Is each offering ready? | everyone; editors change |
| Tasks `/ops/tasks` | The whole task list | staff |
| Publish `/ops/content` | Is everything we publish moving? | staff |
| Business `/ops/insights` | Is EP healthy? | director |
| People `/ops/team`, Hours `/ops/hours` | Who does what; time worked | staff |
| Settings `/ops/settings` | Every sheet-backed table | director + editors (manager, projects) |
| Landing Pages `/ops/landing` | Is every /lp/ page live and its checkout working? | staff |

## 2. State of play (Oct 2026)

Merged to `main`:
- PR #5 Phase 1 restyle (design system in `app/ops/ops.css`, sidebar shell)
- PR #6 Phase 2 regroup (Tasks, Settings, Triage on Today, Review in Publish) + task store

- PR #7/#8 time clock with monthly caps
- PR #9 Waiting on your yes (Today); PR #10 Publish overview tab
Built, awaiting push/merge (see branches): `ops-recurring-tasks`, `ops-cleanup` + `ops-enrolments`, `ops-funnel`, `ops-waiting-link`.

Production facts:
- Vercel project `ep-ops`, repo `embodiedphilosophy/ep-ops`, at ops.embodiedphilosophy.com (moved out of ep-website, Oct 2026).
- Tasks now live in Neon Postgres (`DATABASE_URL`). 76 tasks were imported from Motion. `TASKS_BACKEND` is removed, so the database is the source of truth.
- Motion is now only Jacob's read-only overview: the daily job adds one "EP Ops · <date>" task to his Motion each morning (`lib/ops/motiondigest.js`).
- Monthly hour caps: Team tab column `monthly_hours` (Settings → Team).

## 3. Architecture map

- `app/ops/Shell.js` sidebar + page header (`title`, `eyebrow`, `head`). `lib/ops/nav.js` who sees which item.
- `app/ops/ops.css` the design system. Scoped to `.ops-shell` (and `.ops-login`) because `/teach` reuses `ops-*` class names. Old ops rules in `app/globals.css` are overridden, not yet deleted.
- Tasks: always import from `lib/ops/taskstore.js` (never `motion.js` or `taskdb.js` directly). Shape: `{ id, name, description, due, labels[], completed, blockedOn, auto }`. Owners are labels (a person's name or a role). Conventions kept in `description`: `[ep:EVENTID:task-slug:owner-slug]` event tag, `[blocked:Name]`, `[auto:date:rule]`.
- `lib/ops/tasks.js` task logic (expected tasks from Task Templates, `visibleTo`, `forHome`, `bucket`, `groupByEvent`, `needsOwner`). `syncToMotion()` is a legacy name; it writes to the task store.
- `lib/ops/hours.js` time clock (Neon tables `ops_shifts`, `ops_hour_requests`, `ops_hour_alerts`; made on first use).
- `lib/ops/landingpages.js` + `app/ops/landing/` Landing Pages: reads ep-website's `/api/landing-pages` (5-min cache, `LANDING_PAGES_URL` overrides), derives Upcoming/Running/Ended/Evergreen from `startsAt`/`endsAt` (New York dates), checks each page (must answer 200) and checkout link (2xx) with a 5-min per-instance cache (`?check=1` forces a fresh check), links to the Course Library when the slug matches an offering id. Stores nothing.
- `lib/ops/store.js` the only safe writer to the calendar sheet (by header name, refuses formula columns, conflict check, Change Log). Use it for any sheet write.
- `lib/ops/sitetables.js` + `app/ops/content/SiteEditor.js` the table editor behind Settings (`scope="settings"`).
- `lib/ops/checks.js` + `lib/ops/readiness.js` event readiness checks.
- Crons (`vercel.json`): `/api/ops/daily` 13:00 UTC (task sync, reminders, nudges, Motion digest), `/api/ops/auto` every 15 min (auto-complete, shift sweep).
- Root `ops/` folder (`ops/motion.js`, `ops/tasks.js`) is an old copy, not imported by the app. Confirm and delete.

## 4. Rules (keep these)

- The Google Sheet (EP-Programming-Calendar) is the source of truth for events and settings; the database holds tasks, hours and decisions. Never keep a second checklist.
- Design: terra `--risk` only for late/at risk; pine `--pine` for actions; status is always a dot + a word; 44px rows; one section-header style; underline tabs; detail in a drawer; help text sparingly. No emoji, no new fonts, no gradients.
- Dates are New York time (`todayET()`; `America/New_York` client-side).
- Teacher reminder emails go only to the addresses in that session's Teacher/Host Emails column. Never widen this.
- Automated emails go from "EP Admin" <team@embodiedphilosophy.com>.
- Copy: plain, short, sentence case. Name things the user knows (Master Schedule, Kit, Circle).
- Next.js here is a new major version: check `node_modules/next/dist/docs/` before using unfamiliar APIs.

## 5. Backlog (do in this order; one branch + PR each)

Each item: build passes (`npm run build`), works at phone width, follows section 4.

1. **Waiting on your yes (Today, director, top of main column).** One list, oldest first, each with one button:
   extra-hours requests (`pendingRequests()` in `lib/ops/hours.js`; move them out of the Team hours aside),
   social posts awaiting approval (Social Engine status `Proposed` within the next 7 days → link to Publish → Social),
   teacher bios / course pages with status `submitted` (Publish → Review),
   Ad Agent recommendations when the Ad Agent is in recommend-only mode (read from the Revenue & Metrics sheet, see `lib/ops/metrics.js` ad sets `action`; read-only: link out, don't act).
   Skip Circle cancellations for now (no data source yet) and note it in the PR.
2. **Repeating tasks.** New Settings table "Recurring tasks" (sheet tab: `task`, `owner`, `every` = weekly|monthly, `day` = weekday name or day of month, `active`). The daily job creates the next occurrence once, de-duplicated by a `[rec:<slug>:<date>]` tag in the description. Examples to seed (as rows, not code): weekly social approval (Sat, Rebecka), monthly close (1st, Jacob).
3. **Publish → Overview tab** (design board "Publish"): one row per lane (Social, Email, Media, Site copy) with status + next action, next 9 posts strip, promo emails by event, review count. Make it the default tab. Data already exists in `app/ops/content/page.js` (promoRows, waitingReplays, upcomingSocial).
4. **Enrolments on Events.** Investigate first (`lib/circle.js`, `lib/kit.js`, `lib/membersync.js`): signups per event (Kit enrolled tag count is the likely source), and "paid but not in Circle" for Circle offerings. Show an Enrolled column + bar in the events list and a block at the top of the drawer (design board "Events"). If a source isn't reachable, ship what is and note the gap.
5. **Funnel on Business** (design board "Business"): Practice Report quiz → Meditation Mondays → Wisdom School → Plus → Sādhana School, last 30 days / quarter / year. Investigate the quiz data source (report.embodiedphilosophy.com, likely Kit tags/forms). Placeholders are not acceptable in production: if a step has no source, hide it and say so in the PR.
6. **Support queue** (Ether → Ichha handoffs). Ether is a separate project, not in this repo. Only if handoffs are reachable (API or shared DB) add a Support section to Today (Ichha first, director count). Otherwise skip and write down what's needed.
7. **Cleanup.** Delete ops rules in `app/globals.css` now superseded by `ops.css` (check `/teach` still renders); delete root `ops/` if unused; rename `syncToMotion` → `syncTasks`; move Social libraries (quotes, images, captions, rules, categories, sources) from Publish → Social into Settings if it can be done without breaking `SocialEngine.js`.

## 5b. Status of the backlog (Oct 2026)

- 1 done (#9). 2 done: Settings → Recurring tasks; add the seed rows (weekly social approval, Sat, Rebecka; monthly close, 1st, Jacob) in the editor.
- 3 done (#10).
- 4 partly: Enrolled count from the Kit Enrolled Tag (list + drawer). Not done: "paid but not in Circle" (needs payments joined to Circle members).
- 5 done as config: Settings → Funnel lists each step and its Kit tag; steps without a tag are hidden. Fill in the tags (Practice Report quiz, Meditation Mondays, Wisdom School, Plus, Sādhana School) to light it up. Counts use Kit's `tagged_after`, untested against live Kit.
- 6 done as its own page, `/ops/support` (`lib/ops/support.js`, `app/ops/support/`, `app/api/ops/support/route.js`): Ichha's Zendesk inbox (Needs a reply / Waiting on customer / Pitches & automated), replies and status changes sent to Zendesk as the signed-in person, suggested answers from the EP Support KB sheet (Entries tab), "save a new answer" → a Draft row on Entries through `addPlain` (Change Log), and Ether's gaps from the Handoffs tab. Access: `canSupport` in `nav.js` (directors, manager, projects, any role matching customer/support/happiness). Vercel: `ZENDESK_EMAIL`, `ZENDESK_API_TOKEN` (optional `ZENDESK_SUBDOMAIN`, `KB_SHEET_ID`); the service account needs edit access to EP Support KB. The Answers tab edits the KB's Entries rows through `updatePlain` (conflict check + Change Log): anyone with Support access edits, only `canApprove` (director, manager, projects) makes an answer Live, retires it or moves it back to Draft; a Live answer edited by a non-approver drops back to Draft. Not done: a count on Today.
- 7 partly: root `ops/` removed, `syncToMotion` renamed `syncTasks`. Not done (needs a browser to check `/teach`/`SocialEngine.js`): pruning ops rules from `app/globals.css`; moving Social libraries into Settings.

## 6. Verifying without a login

Now there is a test kit: `scripts/ops-test/` (see its README) runs the dashboard signed in, against synthetic sheets and a mock of Kit, Make and Motion, with click-through tests and screenshots at desktop and phone width; (`site-check.sh` belongs to ep-website and doesn't apply here.) The notes below still work for a quick look.

There are no unit tests. Pages need a signed-in user and live sheets. To check a layout: add a throwaway route (e.g. `app/ops-preview/page.js`) that renders the components with sample props inside `<div className="ops-root">`, run `npx next dev`, screenshot with Playwright, then delete the route before committing. Never commit the preview route.

## 7. Open decisions (defaults if nobody answers)

- Weekly hour limits: not needed; monthly only.
- Staff see only their own tasks (plus anything waiting on them); directors see all.
- Personal/Oxford tasks stay in Jacob's own Motion; they are never imported.
- Circle cancellation handling (remove + Kit win-back tag): later, needs a source.

## 8. Refinement pass (Oct 15 2026, branch `ops-refine`)

- **Programs** (`lib/ops/programs.js`, `app/api/ops/program/route.js`, `app/ops/events/ProgramEditor.js`): "+ Add program" on
  Programming makes N sessions at once (Schedule + Event Details rows sharing one Series). The program drawer edits
  each session's module title + description (Event Details `Module Title`; fills `Public Title` = "Program: Module" and
  `Summary`, which the website already reads) and the fields every session shares, and adds sessions. Two new
  dashboard-only Event Details columns, added on first save: `Program Name`, `Module Title`. Readiness groups any
  non-MM series into one row (`P-<series>`). Bulk sheet writes: `updateRows` / `nextIds` / `readRows` in `store.js`.
- **Task generator**: no teacher named → one "Name the teacher" task per session (one per series) instead of a
  "Teacher (unassigned)" copy of every teacher template. The daily sync closes sync-made tasks (`created_by = ''`)
  whose template is gone, that "Name the teacher" replaced, or "Name the teacher" once a teacher is named
  (`orphans()` in `tasks.js`). Hand-added and Motion-imported tasks are never closed. Bio tasks are skipped (and
  auto-closed) for teachers with a website bio or who are staff, matching the readiness check.
- **Readiness labels**: a row whose first session has passed says Running / Running, behind / Wrapping up /
  Follow-up late; "At risk" is only for things not started. Checks due before a session that already happened drop off.
- **Today**: one list. Badge = exactly "Needs you". Triage moved to Tasks → No owner (Today's tiles link there).
- **Sidebar** in sections (Programs, People, Publishing, Students, Business; CE credits + Settings under the divider).
  "Social" is now "Content"; "Faculty & onboarding" is "Faculty".
- **Support**: Kit/Zoom/Vimeo/Google senders and bracket-code spam go to Pitches & automated; one row per person
  (their other tickets counted); topic chips (Recordings & slides, Access & sign-in, Orders & billing, Other).
- **Finance**: off-plan figures (YTD revenue behind plan, ad spend over budget, ad share over ceiling, low runway)
  get the terra edge and ▼, the same weight as the ROAS arrow.
- Test kit: `scripts/ops-test/program.cjs` (program flow); mock gained the real SS teacher templates.

## 9. Faculty, pay, search (Oct 15 2026, branch `ops-next`, on top of `ops-refine`)

- **Faculty invitations** (`lib/ops/faculty.js`, `app/api/ops/faculty`, `app/ops/team/Invitations.js`, public `app/invite/[token]`,
  `app/api/invite`): Faculty → Invitations sends a Yes/No email (Resend; without it the link is shown to copy). Yes → the
  teacher reads and signs the agreement (typed name + consent); the director's countersignature is automatic. The exact
  signed text, a SHA-256 fingerprint, time and IP are archived on the invitation row; `/invite/<token>/contract` (teacher)
  and `/invite/staff/contract?id=F…` (editors) show it printable. Signing adds the teacher's name to Teachers and their
  email to Teacher/Host Emails on every session of the offering (appended, never replacing). Tabs: `Faculty Invitations`,
  `Contract Templates` (Settings → Contracts; placeholders listed there). Links are signed tokens (OPS_SECRET), 60 days.
- **Contractor pay** (`lib/ops/payables.js`, `app/api/ops/payables`, Finance → To pay): faculty fees are owed per taught
  session (or after the last one, flat fee); staff submit a month of hours on Hours (Team tab `hourly_rate`). Rows live on
  the dashboard-owned `Contractor Payables` tab (the daily job writes new ones); "Mark paid" after paying in Gusto;
  "Copy the list for Gusto". Not done: pushing payments into Gusto (needs a Gusto API app).
- **Monday digest**: the daily job emails each staff member their "Needs you" list on Mondays. `?digest=preview` (with
  the cron key) lists what would be sent, sending nothing. Fixed: the daily job called the removed `syncToMotion`.
- **Programs**: "Start from" an earlier program copies its modules (and teachers/emails/host/time left blank). Teachers can
  write the module title + description of the sessions they teach (program drawer); nothing else.
- **Search** (`/ops/search`, box in the sidebar): sessions/programs, tasks, people, invitations, Zendesk tickets, by role.
- **Sheet checks** (`lib/ops/sheetchecks.js`, top of Programming for editors): duplicate rows, one series on two tracks,
  single-session series, emails without teachers, internal names on the website.
- Tests: `scripts/ops-test/faculty.cjs` (invite → sign → sessions → To pay → teacher modules → copy program → search).
- **Programming range** (Oct 15): `?range=8w|3m|6m|12m`, default 6 months. Rows with something due come first; the rest
  are listed month by month (nothing is hidden any more). A session opened by link beyond the range is still found.

## 8. Sahṛdaya Upāya "This week" (Oct 2026)

The mentees' "This week" page is built in **ep-website** (`/school/sahrdaya-upaya/this-week`, drawn inside a Secret Circle space; see ep-website `docs/mentee-this-week.md`). Ops only holds what staff write for it: Settings → **Sahṛdaya Upāya** has four tables (tabs on the calendar sheet, made from the editor the first time): **Weekly reading**, **Assignments**, **Teaching feedback** (private to each mentee) and **Coming soon**. Defined in `lib/ops/sitetables.js` (`MENTEE_TABLES`). Formation hours stay where they are (the website's `member_formation`, credited by Circle admins); the monthly one-to-one stays on Calendly. Tested against the mock only (create tab, add row, validation, Change Log).

## 9. Library by department (Oct 2026)

Settings → **Library** → **Library items** is where staff enter the member Library shown in Circle at `/c/library` (ep-website, `public/circle/library.js`; see ep-website `docs/library-departments.md`). One row per item: department, level (Foundations / Deepening / Advanced), label, title, teachers, link, access, publish. Defined in `lib/ops/sitetables.js` (`LIBRARY_TABLES`); the `Library Items` tab is made from the editor on first use. Tested against the mock (create tab, add row, validation, Change Log).
