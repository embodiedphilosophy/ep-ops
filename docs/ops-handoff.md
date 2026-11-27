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
- **General Teaching Agreement** (`lib/ops/agreement.js`, Nov 25 2026): EP's standard teacher agreement, merged from the
  2025–26 contracts (Wisdom School ICA, Guest Faculty Workshop, Course Agreement). Built in, so it is always offered in
  Faculty → Invitations; a Settings → Contracts row named exactly "General Teaching Agreement" replaces its text (or, with
  active = FALSE, switches it off). New placeholders: `{{offerings_list}}`, `{{terms_or_none}}`.
- **Agreement step in onboarding** (`/teach`, `app/api/teach/agreement`): a teacher who hasn't signed any agreement (staff
  added them, or the invitation had none) reads and signs the general agreement after Welcome, before Bio. It lists their
  current offerings; the fee reads "as agreed with EP in writing for each offering". Archived on Faculty Invitations with
  `source = onboarding` (same fingerprint, printable copy, countersignature); finishing onboarding is refused until it's
  signed. Skipped for anyone on the Team tab whose type isn't teacher. Faculty → Onboarding and /teach (directors) show
  "agreement to sign". Test: `scripts/ops-test/agreement.cjs`.
- **Programming range** (Oct 15): `?range=8w|3m|6m|12m`, default 6 months. Rows with something due come first; the rest
  are listed month by month (nothing is hidden any more). A session opened by link beyond the range is still found.

## 8. Sahṛdaya Upāya "This week" (Oct 2026)

The mentees' "This week" page is built in **ep-website** (`/school/sahrdaya-upaya/this-week`, drawn inside a Secret Circle space; see ep-website `docs/mentee-this-week.md`). Ops only holds what staff write for it: Settings → **Sahṛdaya Upāya** has four tables (tabs on the calendar sheet, made from the editor the first time): **Weekly reading**, **Assignments**, **Teaching feedback** (private to each mentee) and **Coming soon**. Defined in `lib/ops/sitetables.js` (`MENTEE_TABLES`). Formation hours stay where they are (the website's `member_formation`, credited by Circle admins); the monthly one-to-one stays on Calendly. Tested against the mock only (create tab, add row, validation, Change Log).

## 9. Library by department (Oct 2026)

Settings → **Library** → **Library items** is where staff enter the member Library shown in Circle at `/c/library` (ep-website, `public/circle/library.js`; see ep-website `docs/library-departments.md`). One row per item: department, level (Foundations / Deepening / Advanced), label, title, teachers, link, access, publish. Defined in `lib/ops/sitetables.js` (`LIBRARY_TABLES`); the `Library Items` tab is made from the editor on first use. Tested against the mock (create tab, add row, validation, Change Log).

## 10. YouTube Studio (Nov 2026, branch `claude/youtube-studio`)

Vimeo → YouTube: each Monday the worker (separate repo **embodiedphilosophy/ep-youtube-pipeline**, GitHub Actions)
proposes 5 Studio-Produced talks; staff approve them here; the worker cuts a 15–20 min stretch, makes the thumbnail,
parks the cut on Vimeo; staff review and push to YouTube. Ops only stores, shows and fires.

- Page `/ops/youtube` (`app/ops/youtube/`): tabs This week · Review queue · Published · Skipped. Access `canYouTube` in
  `nav.js` (directors + Team role Media or YouTube, i.e. Jacob and Rebecka). Sidebar: Publishing → YouTube.
- Logic `lib/ops/youtube.js`; records in Neon table `ops_youtube` (`kind` proposal|cut, jsonb `data`; memory without DATABASE_URL).
  Proposal: proposed → producing → ready → published, or skipped. Cut: review ⇄ recutting / rethumbing → publishing → published.
- Worker API `app/api/youtube/*` (Bearer `OPS_PIPELINE_SECRET`, `lib/ops/pipelineauth.js`): `GET /state`, `POST /proposals`,
  `POST /cuts`, `GET /cuts/{id}`, `POST /cuts/{id}/thumbnail` (→ Vercel Blob `youtube/thumbs/`), `POST /cuts/{id}/published`.
  `used_vimeo_ids` = everything approved, skipped, cut or published (untouched proposals may come back).
  `upcoming_programs` = one row per program starting on the Master Schedule in the next 10 weeks.
- A re-cut posts `/cuts` again with the same `proposal_id`: the same cut is updated; any field staff edited (`edited[]`) keeps the staff value.
- Ops fires `repository_dispatch` (`produce`, `thumb`, `publish`) with `GITHUB_PIPELINE_TOKEN`. Re-cut start/end are sent as
  strings because the workflow drops a numeric 0. `thumb` sends the **source** Vimeo ID (the worker grabs frames from it).
- Scheduled release: date + time in New York → `publish_at` in UTC (YouTube keeps it private until then).
- Tasks: one "[yt:week:<date>]" task when proposals arrive and one "[yt:cut:<id>]" per new cut, labelled with directors +
  Media/YouTube people; closed when the week is all decided / the cut is published. Only with the database (not in local tests).
- Env (ep-ops on Vercel): `OPS_PIPELINE_SECRET` (same as the GitHub secret, 24+ chars), `GITHUB_PIPELINE_TOKEN` (fine-grained,
  repo ep-youtube-pipeline, Contents read & write), `BLOB_READ_WRITE_TOKEN` (existing store is fine). Optional
  `GITHUB_PIPELINE_REPO`, `GITHUB_API_BASE` (tests).
- Test: `node scripts/ops-test/youtube.cjs` after `run.sh` (plays the worker; dispatches land in `out/mock.log` as `GITHUB DISPATCH`).


## Content & Social v2 (Nov 2026, phase 1)

Brief: the "EP Ops · Content & Social v2" handoff (Jake, 24 Nov 2026). Phase 1 is built; phases 2 to 4 are not.

- **Roles** (`lib/ops/nav.js`, Team tab → roles): Editor, Creator, Publisher, Approver and the older Social all open the Social tools.
  Approving (= scheduling) needs Publisher, Approver, Editor or Social; Creator and Viewer can't. Anyone who schedules can delete a
  Proposed post, and an author can delete their own. Sign-in is an emailed link to anyone on the Team tab, so no Google account is needed.
- **Weekly Plan gains columns** on first write (`ensureColumns`): `created_by approved_by updated_by updated_at media_kind slides_json`
  (and `ig_media_id permalink` when the sync first matches a post). Nothing else about the tab changes, so Make is unaffected.
- **Statuses worked out on screen, never written:** Expired (Proposed past its time), Unconfirmed (Approved, 2 hours past its time, no
  Posted yet). **Deleted** is written, but the row stays so row numbers never move; it is hidden everywhere.
- **Carousel / Reel / Story:** `media_kind` + `slides_json` (`readSlides`/`checkSlides` in `lib/ops/socialengine.js`, limit `MAX_SLIDES` = 10).
  Make posts one picture, so approving one of these writes **Manual** (post by hand) until `META_PUBLISH=live` exists (phase 3).
- **Uploads:** `lib/ops/driveupload.js` + `app/api/ops/social/upload`. The server opens a Drive resumable session as a Workspace user
  (domain-wide delegation, `DRIVE_UPLOAD_USER`, folder `SOCIAL_UPLOADS_FOLDER_ID`, scope `drive.file`); the browser sends the file
  straight to Google. Logged on the new **Upload Log** tab (made on first upload); pictures also join the Image Library.
  The older Make route (`/api/ops/social/image`) still serves single-picture upload and crop.
- **Instagram sync:** `lib/ops/igsync.js`, cron `/api/ops/social-sync` hourly at :40 (runs only with `OPS_LIVE=1`). Needs `META_ACCESS_TOKEN`,
  `META_IG_USER_ID`; optional `META_APP_ID` + `META_APP_SECRET` for the token expiry check. By hand:
  `/api/ops/social-sync?key=CRON_SECRET` (`&dry=1` shows what it would do, `&from=2026-10-01` backfills from that day).
  It only reads Instagram. Last run and errors are kept in `ops_social_health` (Neon) for the Health panel (phase 2).
- Tests: `scripts/ops-test/content-v2-api.sh` (roles, delete, carousels, sync) and `content-v2.cjs` (browser).

### Instagram without a Meta token (Make → dashboard)
`/api/ops/social-sync/ingest` takes Instagram posts from the Make scenario "EP Social: Instagram to dashboard" (Make's Instagram connection reads them). Header `x-ingest-secret` must equal Vercel `SOCIAL_INGEST_SECRET`. Same logic as the direct sync (`applyMedia` in `lib/ops/igsync.js`): new posts into Post History, likes/comments refreshed, matching plan rows marked Posted with the link. Form fields (one post) or JSON `{ media: [...] }`. Once `META_ACCESS_TOKEN` exists the hourly direct sync takes over and the Make scenario can be switched off.
### Content & Social v2, phase 2 (part)
- `lib/ops/socialrules.js`: feed-rhythm rules (`max_text_heavy_run` 2, `max_promo_run` 1), "a week ahead", and `guardrails()`:
  **blocked** = facts missing (no picture/caption, event not on the Master Schedule, caption over 2,200); **flags** = sign-offs
  (Sanskrit/educational clearance, Meet the teacher, unchecked quote or picture). Settings are read from the Rules tab with code defaults
  (feed posts per week now defaults to 7 when the row is missing; the sheet's own row is unchanged until someone edits it).
- Social → **Review**: tick posts, exact count on the button, a reason is required for flagged ones and saved in `override_reason`; the server
  enforces both. Social → **Health**: Instagram check, Meta token expiry, unconfirmed/failed/expired posts, posts without pictures, broken columns.
- Tests: `content-v2-phase2-api.sh`, `content-v2-phase2.cjs`.

### Content & Social v2, calendar and day categories
- Social → **Calendar**: Week (7 columns, post cards, "Open feed slot 11:00", drag a card to another day to reschedule; posts already out can't be moved, nor can a post be moved into the past) and Month (counts per day, click a day for its week).
- **Day categories** live on the new **Day Categories** tab (made on first save): `weekday, category, scope (standing | week_of), week_of, updated_by`. "This week only" beats the standing row (`categoryFor`, `lib/ops/socialrules.js`). Each day shows Filled · approved / awaiting approval / Filled but blocked / Not filled ("has X instead") / Missed / No category (`dayState`). Editors, approvers and directors can change categories.
- Test: `scripts/ops-test/content-v2-calendar.cjs` (start from a fresh `run.sh`).


### Social is its own workspace (Content & Social v2 design)
The Social tools moved out of Content's tabs into their own sidebar section, one page per job, following the design canvas:
`/ops/social` Calendar (the week at a glance: status cards, pillar balance, feed rhythm, a week ahead, day categories, week / month / list / grid / feed views, drafts tray, expired banner) · `/ops/social/compose` Composer (a page, `?row=N` to edit) · `/ops/social/review` Review & approve with Health beside it · `/ops/social/library`, `/sources`, `/published`, `/rules` (the tables, in `[section]/page.js`).
"Also in Content" in the sidebar keeps Email, Media and Site copy review; `/ops/content` keeps Overview, Email, Media, Review, and old `?tab=social…` links redirect.
Code: `app/ops/social/*` (new screens, `social.css` scoped to `.soc`), shared pieces still exported from `app/ops/content/SocialEngine.js` (`Composer`, `useView`, `api`), `lib/ops/socialstatus.js` (review and health data), `lib/ops/socialcards.js` (status cards), `lib/ops/socialrules.js` (rules, day categories). Test: `scripts/ops-test/social-workspace.cjs` (fresh `run.sh`).
Still the older look: the Composer form (design has a phone preview, template picker and guardrail list) and the Library tables (design has a three-pane library with filters).

### Cards from templates (the Canva replacement, first slice)
`lib/ops/templates/registry.js` (templates, their fields and which are locked, colourways from the design, sizes 4:5 · 1:1 · 9:16), `lib/ops/templates/render.js` (draws a card on the server with Satori through `next/og`, fonts bundled in `lib/ops/fonts`, JPEG via `sharp` for export), `app/api/ops/social/render/route.js` (preview = PNG, export = JPEG to Drive through the Make hook and a `Design` row in the Image Library), `app/ops/social/TemplatePanel.js` (the "Make a card" panel in the Composer).
Rules enforced on the server: the words come only from a **verified** Quote Library row; a bold phrase must be words already in the quote; art must be Art (reuse OK, no words on it); a post's `quote_text` / `quote_source` / `quote_check` columns are written only by the server, so "Verbatim" always means it was copied from the library. Posts remember `template_id`, `colourway` and `template_fields` (columns added on first write) so a card can be reopened. Colourways rotate so the same ground doesn't repeat.
Templates so far: Tarka quote card, CHITHEADS quote, Quote on art (overlay or panel), Sanskrit verse card (Devanāgarī and translation come from `devanagari` / `translation` columns in the Quote Library when present). Not yet: carousels, event promo, Meet the teacher, Suggested reading, This Week at EP, collage elements, "save as preset". Test: `scripts/ops-test/cards.cjs` (fresh `run.sh`).

### More templates: carousels, event promo, Meet the teacher, This Week at EP
`lib/ops/templates/registry.js` now also has **Educational carousel**, **Storytelling carousel**, **Keyword lead magnet** (cover, numbered slides, closing slide; up to 8 body slides, text editable, art only from the Library), **Event / course promo** (title, date, time ET with London, teacher, price and link from the Master Schedule; refuses to draw and names what is missing) and **Meet the teacher** (name, role, one-line bio and headshot from teacher onboarding; the teacher should OK it, a flag), plus **This Week at EP**.
`lib/ops/templates/facts.js` reads the Master Schedule and teacher profiles; the render route (`app/api/ops/social/render`) also answers `GET ?what=events | teachers | week&monday=`. In the Composer, a Carousel post offers "Make slides from a template"; a Single post offers "Make a card".
**This Week at EP** (`/ops/social/this-week`): the standing Sunday 09:00 ET carousel for the next Mon–Sun, built from the Master Schedule (internal sessions and Sādhana School weekly sessions left out), events can be unticked, each has an editable line, colourways rotate. Nothing posts until someone presses a button: "Save as a proposed post" or "Save and approve". The post is marked `is_standing`, so it doesn't count toward a day's category, the daily target or the feed rhythm.
New Weekly Plan columns: `keyword`, `is_standing`. Free text containing Sanskrit diacritics (without a verified quote) is flagged "Has Sanskrit: check it against the source". Tests: `scripts/ops-test/cards2.sh` (API) and `cards-programs.cjs` (browser).

### The Composer (design: "Post composer")
One page, three columns: a **phone preview** (4:5 or 1:1 for feed posts, 9:16 for Reels and Stories, with the carousel dots and the caption as it will read), **media and checks** (the template card and art card for a single post, the slide list for a carousel, the by-hand handoff for a Story with Download frame / Copy sticker link / Mark posted, and the **guardrail checks** list), and **details** (Publish to toggles, structured selects for post type, pillar and event, date and time ET with London beside it, caption with locked / DRAFT blocks and hashtag set, first comment, link, assignee, thread, and Approve · Request changes · Skip · Delete). Code: `Composer` in `app/ops/content/SocialEngine.js`, page in `app/ops/social/ComposePage.js`. New Weekly Plan columns: `content_pillar`, `first_comment`, `assignee`. Comments live on a new **Comments** tab (made on the first comment; everyone on staff can comment). Test: `scripts/ops-test/composer.cjs`. Not built: trimming a Reel and choosing its cover frame, a captions file, caption blocks as separate editable parts (the caption is still one text box with the locked and DRAFT parts shown beside it).

### The Library (design: "Media library")
`/ops/social/library` is a three-pane screen (`app/ops/social/LibraryPage.js`): tabs **Art · Promo graphics · Video · Designs · Canva archive** (with counts), filters on the left (search, category, deity, program, and Use: Reuse OK only · No words on image · Clear of 90-day reuse gap · Has a licence on file) that run **on the whole table on the server** (`facets` come back for the dropdowns), a grid with problem flags (Licence missing, Missing preview · fix, Not for reuse, Wrong shape for Reels), and a provenance panel (licence, artist, date, source, last used, where it was used, Commons page, credit line "added to captions automatically") with **Use in a post**, **Open in a template** (opens the card maker on Quote on art with that art), **Hide from the planner** and **Edit details**. **Select** gives bulk edit (category, program, deity, reuse, hidden), each row checked against what the editor showed. Drop zone / upload go straight to Drive. Cards made in the template studio appear under **Designs** (type Design). The Canva archive tab is empty until the pages are imported. Categories and archive folders stay as tables behind a link. Test: `scripts/ops-test/library-v2.cjs`.

## Coming up & campaigns, clip requests, Team & roles (Content v2)
- **Pages**: `/ops/social/campaigns` (`app/ops/social/Campaigns.js`, API `app/api/ops/social/campaigns/route.js`) and `/ops/social/team` (read-only: people from the Team tab, sign-off rules, how-to video link).
- **Tabs in the EP Social Engine sheet**, made on first use by `lib/ops/socialdata.js`: Coming Up (Promote / Campaign / Skip per Master Schedule event; unset = Promote), Campaigns, Campaign Steps, Clip Requests.
- **Campaign** = a countdown of N days (default 5) ending the day before the event, plus a launch step on the day. Day 1 is the day before the event (Jake: 31 Dec for Meditation Resolution on 1 Jan). Dates, times, themes and teacher are editable per step; a teacher is optional on any day: if one does a social media takeover that day, add them and request their clip.
- **Add to the calendar** writes one *Proposed* Weekly Plan row per step (Reel for countdown days, feed post for launch), linked to the event. Nothing is approved or posted.
- **Clip requests**: steps with a teacher get a request (status Requested, due a week before the post, owner = the Creator in Team). Statuses: Not requested, Requested, In edit, Ready. No email is sent yet; the owner sees them on the page.
- **How-to video**: add a Rules-tab row called "How-to video" with the URL; the Team page links to it.
- Test: `scripts/ops-test/campaigns-api.sh` (17, fresh run.sh) and `campaigns.cjs` (browser, desktop and phone).

## Posting straight to Instagram (Content v2)
- `lib/ops/igpublish.js` posts one Weekly Plan row through the Graph API: single picture, carousel (children then parent), Reel (waits for Instagram to process the video), Story; then the first comment. Pictures and videos are the Drive links Instagram downloads itself.
- **Off until `META_PUBLISH=live`** (with `META_ACCESS_TOKEN` + `META_IG_USER_ID`, the same as the sync). While off, carousels, Reels and Stories still approve to "Manual" and are posted by hand.
- When on: the post editor shows "Post to Instagram now" for Approved / Manual / Failed posts (people who schedule only). The row is set to Publishing first (a second click can't double-post), then Posted with its link, or Failed with the reason in the notes. Approving a carousel/Reel/Story no longer makes it Manual.
- Not built yet: posting at the scheduled time. Only "Post now" exists; Make still publishes single pictures at their time.
- Test: `scripts/ops-test/ig-publish.sh off|live` against the mock Graph API (see the script header). A real test post needs Jacob's explicit OK.

## Delete all expired posts (Review & approve → Health)
- The Health card "N expired posts" has a **Delete all N** button (people who schedule or approve only). It asks first, then sets every expired post (Proposed, past its time, never approved) to Deleted. Rows stay in the sheet, hidden; approved and posted posts are never touched. API: `POST /api/ops/social { view: 'plan', deleteExpired: true }` → `{ deleted }`. It works on the whole plan, not just the weeks on screen.
- Test: `scripts/ops-test/delete-expired.sh` (8 checks; fresh `run.sh`).

## Teachers & Email, phase 1 (Content v2 second handoff)
- **Content is now "Teachers & Email"** (eyebrow "Teachers · Email · Launches"). `/ops/content` with no tab goes to `/ops/email` (the old Overview status board and Next posts strip are gone; Next posts lives in Social). The old tabs stay: Promo emails, Media, Site copy review. Sidebar so far: This week, Emails, Promo emails, Media, Site copy review. Email calendar, Launches, Reminders, Newsletter and Teachers join as their phases land.
- **Kit read sync** (`lib/ops/emailkit.js`): every broadcast from the last 60 days to the next 90, plus every undated draft, read from Kit API v4 (`lib/kit.js`, `KIT_API_KEY`), cached two minutes ("Read Kit again" skips the cache). Matching: an `[E0xx]` in the subject or internal description, or a link saved in Ops; `[MM-REMINDER …]` counts as an automatic reminder; Scaffolding counts as the newsletter. Everything else is **Not matched**.
- **Ops memory**: the "Email Links" tab on EP-Programming-Calendar (`lib/ops/emaildata.js`, made on first use): kit_id, event_id, archived, note.
- **Attach** (Emails → Not matched): picks an event and, after a confirm, writes `[E###] ` in front of the email's internal description in Kit. It sends only the description (`setDescription`), so a scheduled email stays scheduled. Nothing else in Kit is written.
- **Put away** (Emails → To tidy): old drafts (WR1–3, [NEEDS CONTENT], test drafts, empty "Sequence") and the hand-made "Meditation Monday today at 12pm" duplicate. **This hides them in Ops only**; nothing is deleted and Kit is not changed (Kit's API has no archive for broadcasts), so archive them in Kit by hand from "Open in Kit". Sent emails can never be put away. Always behind a confirm.
- **This week** + **Programming side panel** (any screen): events for this week and next with "n of m in Kit" (planned from Task Templates, in Kit = scheduled or sent), missing Master Schedule facts, and a Needs attention list.
- Not yet: sync on a 5–10 minute cron and webhooks (reads happen when a screen opens), sequence emails (Kit's v4 API only lists sequences), conflict states. Those come with phase 2.
- Roles: `canEditEmail` (directors, GM, PM, and the Marketing, Media or Social roles).
- Test: `scripts/ops-test/email-phase1.sh` (22 checks) and `email-phase1.cjs` (browser, desktop and phone); both need a fresh `run.sh`.

## Teachers & Email, phase 2 (write and schedule from Ops)
- **Email plan** (Ops owns the plan and copy): tabs "Email Plan", "Email Revisions", "Email Comments" on EP-Programming-Calendar, made on first use (`lib/ops/emailplan.js`). Statuses: Idea, Draft, Ready for Jake, Scheduled, Sent, Not needed. Every change to the copy is a revision.
- **Editor** (`/ops/email/edit`, `EmailEditor.js`): event, type/step, subject, preview text, send date and time (ET, London beside it), blocks (text with bold/italic/link, event facts from the Master Schedule, member / non-member as Kit Liquid, teacher bio, button, image, raw Kit HTML), audience builder (tags and segments, exclusions, live count for tag audiences), live desktop/mobile preview, versions, comments. Actions: Save · Save draft to Kit · Mark ready for Jake · Schedule in Kit… · Not needed.
- **Sync rules** (`lib/ops/emailsync.js`, runs whenever a screen opens): Kit scheduled/sent → the plan row says so; edited in Kit only → "Edited in Kit"; edited in both → conflict with a choice (Use Kit's version / Keep the Ops version); gone from Kit → flagged. Pulling Kit's version keeps its HTML as one raw block. Saving to Kit never touches `send_at`, so a scheduled email stays scheduled.
- **Schedule** always asks (audience, count, date) and runs the pre-send checks (placeholder links, Zoom ID, date past or after the event, empty/[NEEDS CONTENT], second email to the same audience that day, missing price/link/teacher). Any failed check, or a draft not marked ready, can be overridden only with a note, which is logged as a comment. Ready for Jake is a review step, not a lock.
- **Email calendar** (`/ops/email/calendar`): month / week / list, coloured by programme (`lib/ops/emailprograms.js`), Kit's automatic reminders in a striped lane, a "No date yet" tray, Programming and Social overlays, warnings (two emails to one audience a day, dated after the event, nothing planned for an event soon). Drag a plan email to move it; a scheduled one asks first and reschedules in Kit. Kit-only emails are taken into the plan ("Edit in Ops") before they can be moved.
- **Known limits**: Kit's API has no test send, so "send yourself a test" opens the draft in Kit; segment audiences get no live count; Kit may rewrite saved HTML, which could show as "Edited in Kit" on the first real use (check on one throwaway email); sequence emails and the 5–10 minute cron/webhooks are still to do.
- Tests: `scripts/ops-test/email-phase2.sh` (34 checks) and `email-phase2.cjs` (browser, desktop and phone); each needs a fresh `run.sh`.

## Teachers & Email, phase 3 (reminders and the newsletter)
- **Reminder rules** (`/ops/email/reminders`, `lib/ops/reminders.js`): tab "Reminder Rules" on EP-Programming-Calendar, made on first use with five rules from the handoff, **all off**: Sādhana School weekly session, Wisdom School pathway session, Wisdom School Monthly Lecture (the day of + 30 minutes before), Open Session and Practicum (the day before + an hour before), SLBT mentees. Each rule says which sessions it covers (programme codes and/or words in the title), when each email goes out (`60m` = minutes before the session; `d0@08:00` = the day of at that ET time; `d-1@09:00` = the day before), who gets it (Kit tags/segments), the subject/message (`{title} {day} {time} {teacher}`) and a button with the event's Zoom link. A rule can't be switched on without an audience or sessions.
- **The daily job** (`/api/ops/reminders`, vercel.json 12:30 UTC, `OPS_LIVE=1`; `?dry=1` lists and changes nothing): for each enabled rule and each session in the next 14 days it makes ONE Kit email (never twice: the Email Plan row carries `launch_id = rule:event:token`). It makes a **draft**, and schedules it only for a rule with "Schedule the emails in Kit on their own" ticked. Sessions with no Zoom link (or no start time) are skipped, and the page says so. "Make them now" does the same for one rule, after a confirm.
- **Not rules, on purpose:** Meditation Mondays' "begins in one hour" (Kit's own automation keeps sending it; the hand-made "today at 12pm" duplicate is flagged in Emails) and teacher reminders (the existing daily job; only the addresses in Teacher/Host Emails).
- **Newsletter** (`/ops/email/newsletter`, `lib/ops/newsletter.js`): lists every issue on the "Weekly Scaffolding" tab. **Numbers count only issues that went out** (Kit says sent): the first is No. 1, the next unsent issue is the next number, and an issue whose date passed without going out is **Skipped** with no number. The editor covers subject, preview, theme, reflection, link, the line above "This week at EP", P.S., a **Sanskrit verse copied from the verified Quote Library** (Devanagari + IAST + translation + source, never typed), a read-only "This week at EP" list from the Master Schedule (the sheet's Newsletter column decides: show, enrolled_only, hide), and a live preview. Actions: Save · Save draft to Kit · Schedule for Sunday 9:00 ET… (a confirm; unfinished issues need a note) · Skip this week.
- **Thursday's job** (`/api/scaffolding`) now makes the issue **in Ops** (row, number, events line) and only builds the Kit draft when nothing is blank; otherwise it emails the directors a link to write it, and no blank Kit draft is made. Building from the editor, or with `?date=`, works as before.
- **Not done**: the "featured offer" field (the Scaffolding builder has no place for it yet) and the Kit snippet for teacher bios (phase 4).
- Tests: `scripts/ops-test/email-phase3.sh` (53 checks) and `email-phase3.cjs` (browser, desktop and phone); each needs a fresh `run.sh`.

## Teachers & Email, phase 4a (launches)
- **Launches** (`/ops/email/launches`, `lib/ops/launches.js`): tabs "Launches" and "Playbooks" on EP-Programming-Calendar, made on first use. A launch groups one moment: its **emails** (Email Plan rows with `launch_id`), **social** posts (Weekly Plan posts linked to its event), **landing page** and **tasks** (tasks tagged with its event). The board shows the four lanes on a timeline (scrolls inside its own box) and lists everything under it. Mark it Planning / Live / Done; "Save as a playbook" keeps its shape.
- **Playbooks** count steps from key dates ("anchors"): Event promo, Enrollment (doors open / close / term starts), Countdown to a day, Festival or season, Offer week. A step may carry an exact date instead.
- **Meditation Resolution** (Jake, 25 Nov): the countdown playbook has the four Road to Resolution emails on Mondays **30 Nov, 14, 21 and 28 Dec**: none on 7 Dec (the Practice Report) and none on 31 Dec. Meditation Mondays then pause until **11 Jan** and run every Monday after, except national holidays. That last part lives in the Master Schedule and in Kit's own Meditation Monday automation, not here.
- **New launch wizard** (4 steps): event and playbook → key dates (and a landing page link) → audience (Kit tags/segments; an optional "Enrolled · …" tag) → review every generated step and its date before anything exists. "Create the launch" always asks, then plans the emails in the Email Plan and, if ticked, makes them as **drafts in Kit** (never scheduled, never sent) and makes the enrolled tag in Kit if it isn't there. Generated emails start with "[FILL IN]", so the pre-send checks stop them going out blank. The "Welcome" step goes to the enrolled tag.
- **Suggested launches** (not created for you): Cyber Week · The Open Library, Practice Report (7 Dec), Meditation Resolution 2027 (matched to its event), Enrollment Winter 2027 (6–26 Jan, term 27 Jan), Vasanta Navarātri (22 Mar), Enrollment Spring 2027 (31 Mar). Cyber Week and the Practice Report aren't on Programming yet: they exist only as launches.
- Tests: `scripts/ops-test/email-launches.sh` (27 checks, uses a mock team member, not a real address) and `email-launches.cjs` (browser, desktop and phone); each needs a fresh `run.sh`.

## Teachers & Email, phase 4b (teachers)
- **One master record, owned by Ops**: the **Teachers** tab on EP-Programming-Calendar (the one onboarding and the website already read). New columns are only ever *added*: short_bio, pronouns, credentials, links_json, preferred_name, photo_alt, photo_credit, focal_x/focal_y, photo_versions_json, bio_updated_on, live_bio, live_photo_url, review_note/by/at, hidden. `bio` is still the website bio (onboarding asks for 60–100 words); `short_bio` (~40 words) is what emails, the Kit snippet and Social "Meet the teacher" use (`teacherFacts` prefers it, and the preferred spelling).
- **Directory** (`/ops/email/teachers`, `lib/ops/teachers.js`): everyone with a profile plus everyone on the Master Schedule, with a state: Submission waiting, No profile yet, Missing headshot, Needs update (no bio, or last updated more than 12 months ago), Current. Filters, coming-up and taught counts, "Start a profile" for someone scheduled with none, "Add a teacher".
- **Profile editor**: name, preferred spelling (diacritics), role, pronouns, short and long bio (word counts; a short bio outside 20–60 words is refused), credentials, links. Saving a **live** bio or name asks first, because it changes the website at once.
- **Headshots**: square, 4:5 and circle crops from one focal point (`/api/ops/teachers/photo`, sharp), alt text, credit; a new upload keeps the earlier headshot as a version you can bring back. **Uploading needs `BLOB_READ_WRITE_TOKEN`** (Vercel Blob, as in onboarding); without it the page says so. The upload and restore buttons are the only parts not covered by the mock tests.
- **Review queue** (replaces Content → Review, which now redirects here; the "Site copy review" sidebar item is gone): each submitted bio is set against what is live (words added/removed; new headshot noticed). **Approve** (asks first) sets status approved and remembers what is live; **Edit, then approve** opens the profile; **Send back** needs a note and a confirm, puts the profile back to "on file" and emails the teacher the note (skipped, and said so, if no mail key). **Course pages** are reviewed and published/taken down in the same place.
- **Publish targets and usage**: website (live on approval), Circle profile (**copy by hand**: Ops can't write Circle profiles), Kit snippet (**copy by hand**: the short bio, which emails built here already use), Social "Meet the teacher" (ready when approved with a bio and headshot). Usage shows upcoming sessions, course pages and emails that use their bio; bios older than a year are flagged.
- **Test entries** (a name or address with test/demo/dummy/lorem) are spotted and can be **hidden, never deleted**, in one click; "Hidden" brings them back.
- Tests: `scripts/ops-test/email-teachers.sh` (42 checks, uses a mock team member) and `email-teachers.cjs` (browser, desktop and phone); each needs a fresh `run.sh`.

## Teachers & Email, phase 4c (media)
- **Media** (`/ops/email/media`, API `/api/ops/email/media`): **Replays to post** are sessions from the last 30 days with no replay yet (the existing rule in `lib/ops/lanes.js`: tracks whose Task Templates include a replay task, no Video ID, no replay link). Each row has a Circle link field and **Mark posted**: it checks the link is a web address and that the session has happened, then writes it to **Event Details › Replay Link** (the event's "Replay in Circle", through `updateRow`: conflict-checked and logged to the Change Log), and the session moves to **Posted in the last 30 days**, where the link can be changed (asks first). The old Content → Media link redirects here, and Media is in the Teachers & Email sidebar.
- **CHITHEADS** latest episodes (the podcast feed). **Tarka milestones** is a placeholder until the Tarka area exists (the Tarka Operations sheet will feed it).
- Tests: `scripts/ops-test/email-media.sh` (12 checks, mock team member) and `email-media.cjs` (browser, desktop and phone); each needs a fresh `run.sh`.

## EP Ops 2, step 1: clean-up (ep-ops half)
- Deleted the two stray folders that came in by accident with an earlier pull request: `ep-ops-program-title/` and `ops-fix/`. Every file in them was an older copy of a file that is still in the real tree (checked file by file: seven identical, two older versions of `app/ops/ops.css` and `lib/calendar.js`), and nothing imports them.
- Still to do, in ep-website, after confirming which project runs the jobs: remove the leftover copy of `/ops`, `/teach` and `lib/ops/*` and the five duplicated crons.
## Newsletter: featured offer
- The Newsletter editor has an optional **Featured offer** (title, a few lines, link, button text; the button defaults to "Learn more →"). It sits between the week's events and "Study With Us", in both the Kit editor blocks (`lib/scaffoldtree.js`) and the HTML fallback (`lib/scaffolding.js`), and is left out when blank. The four columns (Featured Offer Title / Text / URL / Button) are added to the Weekly Scaffolding tab the first time one is saved.
- Test: `scripts/ops-test/email-newsletter-offer.sh` (11 checks, fresh `run.sh`).

## EP Ops 2, step 2: the new look
- **Settings, not pages.** The look is changed where it is defined: the tokens at the top of `app/ops/ops.css` (ground `#F6F2EA`, panel white with a hairline shadow, lines `#E7E0D2` / `#EFEAE0`, `--r-ctl` 10px, `--r-panel` 14px, new `--r-pill`, figures in Inter with tabular numbers, big counts in Cormorant 600 with lining numerals; Terra, Pine, Ochre, serif and sans unchanged), plus a block at the end of the file headed "EP Ops 2: the new look" for the parts that are structure rather than values. The old blanket "square corners everywhere" rule is gone.
- **Sidebar**: light (`#FBF9F4`, hairline right border); the current place is a Pine pill with white text; counts are round. The solid Pine version is one switch: `SIDEBAR = 'pine'` in `lib/ops/nav.js` adds `.pine` to the shell (no new environment variable). The two-line text mark is now `public/brand/ep-wordmark-black.png` (white on Pine), 184px wide, linking to Today, alt text "Embodied Philosophy".
- **Headings**: all 18 `text-transform: uppercase` rules in `ops.css` (and the ones in `social.css`) are sentence case. Section headings 16px semibold; tool page titles Inter 26px semibold; a program's or a person's name uses `.ops-name` (Cormorant 38–40px).
- **Components**: status is a soft pill with the word in it; tabs are a segmented control on a sand track; count cards use serif lining numerals; buttons are 40px tall (at least 44px at phone width); Terra is kept for the one main button and for anything late or at risk.
- **Inline styles**: swept for hard-coded colours; the three page files that had them now use the named settings. The two that remain are data colours (the lane colours on the launch board, the pillar key on the Social calendar).
- No page moves, no behaviour changes.

## EP Ops 2, step 3: the new shell and the redirects
- **Eight places** (`lib/ops/nav.js`): Today, Programs, Tasks, People, Publish, Students, Business, Settings, each with its old pages' role checks. Teachers still see only Today and Programs. Sub-pages are **views (tabs) inside a place**, not sidebar entries (`VIEWS` in `nav.js`; a view the role may not see falls back to the first allowed one). The sidebar search stays; the old "Search" link is gone from the list.
- **Places** (`app/ops/place.js`, `app/ops/{programs,people,publish,students,business,settings}/page.js`): a place shows the view named by `?view=` (or by the older query strings: `?needs=profile`, `?email=`). Each view runs the old page and puts its content, title and own tabs inside the one shell: the old page's components, data and API calls are reused, nothing is re-implemented. (The old settings page is now `app/ops/settings/Tables.js`, shown at Settings › All settings.) The merge steps that follow replace a view with its new page and delete the old one.
- **Every old address redirects once** (`lib/ops/redirects.mjs`, served by `next.config.mjs`; one shared table). Query strings are kept (`?show=`, `?id=`, `?event=`, `?row=`, `?s=`). They are temporary (307) redirects while the work lands; they can be made permanent at the end. `/ops/social/campaigns` (already a stub) and `/ops/content`, `/ops/admin` point straight at their final addresses.
- **Links the code writes** (emails, digests, pages) were updated to the new addresses in the same pull request (145 lines); anything written with an old address still lands, through one redirect.
- **Checks**: `scripts/ops-test/links.cjs` (every old address with its query string: one redirect, right place, page loads; the stubs; the sidebar for director, Irene, Floss, Ichha, Carolyn and a teacher; every `/ops/...` the code writes lands within one redirect) and `scripts/ops-test/all.sh` (every scripted flow against a fresh mock).

## EP Ops 2, step 4a: the Programs index
- **Everything EP runs** (`/ops/programs`, `app/ops/programs/Index.js`, rules in `lib/ops/programindex.js`): the old Programming list as one table: Program, Dates, Faculty, Ready?, Launch, Circle. "Needs attention" first (anything late or due within the week: the old list's own red/amber rule), then month by month. Filter chips (All, Sādhana School, Wisdom School, Meditation Pass, Sahṛdaya Upāya, Campaigns) group by the program's "part of" (Parent Program), else by track (`groupOf`); List / Calendar switch (`?layout=calendar`); "Add a program" (the existing flow; the one Terra button) and "Add event".
- **Nothing new is read**: rows come from `readinessRows` (as before); Launch from the Launches and Email Plan tabs (read only, staff only; a launch tied to one of the program's sessions); Circle from the calendar's Circle columns (the program's Circle panel still asks Circle itself); campaigns are the launches no program claims (Practice Report). Teachers see their own programs only (four columns, no chips, no Add).
- **Still the older page for now**: a session opened by `?event=` (the drawer), Past, Cancelled, Recently done run `app/ops/events/page.js` unchanged; links to the last three sit under the table. Step 4b moves the drawer into the program page.
- The button is now "Add a program" (was "+ Add program"); `program.cjs` was updated for that and for dates that had passed.
- Test: `scripts/ops-test/programs-index.cjs` (fresh `run.sh`); `all.sh` runs it and `program.cjs`.
