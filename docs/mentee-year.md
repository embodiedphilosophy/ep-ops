# The mentee year (Ops → Mentee year, `/ops/mentee-year`)

A staff version of the Sahṛdaya Upāya "Mentee year" page (Nov 2026): what each mentee does each day, week, month and quarter from October to July, and the dated steps of the two final projects (the 60-minute talk and the three-session offering), so staff can see where the cohort should be.

- **Where:** a "Mentee year" link in the Ops sidebar (staff), and a card on Today with this month's theme and the next three project steps that links to the page.
- **Tabs** (`?tab=`): **Now** (next three project steps, this month, and the next quarterly review as a tick-list) · **The rhythm** (Daily · Weekly · Monthly · Quarterly · Culmination, and a typical four-week month) · **Month by month** (ten cards, this month highlighted) · **Final projects** (the two-lane strip November to July, the dated table with filters `&p=talk|offering`) · **One-to-ones** (how mentees book; the booking-summary template).
- **Content:** `data/mentee-year.json`, drawn from the Mentee Year page. Dates are real (`YYYY-MM-DD`); text marks `**bold**`, `_italic_`, `~quiet~`, `^date^`. To change a step, edit its row in `steps` **and** the same step in its month card in `months` (a test checks they match). `reviews` holds the three quarterly checklists (December Q1, March mid-year, June readiness). Pacing is this schedule's own and can be adjusted.
- **Code:** `lib/ops/menteeyear.js` (pure helpers), `app/ops/mentee-year/page.js`, styles at the end of `app/ops/ops.css`. (Editing since Nov 2026: see “Editing” below.)
- **Tests:** `node --import ./scripts/ce-test/register.mjs scripts/ops-test/mentee-year.mjs` (content integrity, next steps, current month, reviews, lanes); the pages in the ops test harness (`bash scripts/ops-test/run.sh`, then open `/ops/mentee-year`).
- Not built here (the design handoff for the widgets was not attached): per-mentee step status, the Ledger tabs (Schedule, Months, Step status), and the nudges and Monday digest lines. This page is the shared reference they would hang on.

## Cohort numbers (widgets PR)
The Now and Final projects tabs now read the Mentee Schedule and Mentee Step Status tabs (falling back to `data/mentee-year.json` for steps and months): see "Mentee year widgets" in `docs/sahrdaya-upaya-page.md`. The Immersion numbering in the month cards now follows `data/mentee.json` (Immersion 1 is in November).

## Editing (Nov 2026)
Jacob, Irene and Floss can edit the page (`app/ops/mentee-year/Editor.js` → `POST /api/ops/mentee-year` → `lib/ops/menteeyearedit.js`). What is saved is what mentees see.
- **Tasks** (Month by month, and This month on Now): "+ Add a task" puts a dated, tickable row on every mentee's "This month" list on `/c/mentorship`, in the month of its due date, with an optional "Open" link. Stored in **Mentee Schedule** as `kind = task` (new `link` column). Ticks go to Mentee Step Status like project steps; the cohort count shows under each task. No reminder emails for tasks.
- **Project steps** (Final projects): Edit on each step (date, project, title, what to do, evidence) and "+ Add a project step". A step keeps its `step_id` when reworded, so ticks stay.
- **Remove from mentee page** sets `publish = FALSE`; the item is listed under "Taken off the mentee page" with "Put back". Nothing is deleted.
- **Month theme and focus** (Edit theme): Mentee Months. The theme shows in italics under "This month" on the mentee page. The month bullet lists still come from `data/mentee-year.json`.
- **First edit:** if Mentee Schedule is missing it is made with the seeded steps and review checks in one write (Months likewise), so editing one step never drops the others. `scheduleFrom` now falls back to the seed per kind, so a tab holding only tasks still shows the seeded steps.
- `readTab` reads `A1:Z500` (was `A1:L500`) for the new column; `lib/mentee/year.js` and `content.js` are identical copies in ep-website.
- Tests: `scripts/ops-test/mentee-year-edit.mjs` (pure) and `scripts/ops-test/mentee-year-edit.cjs` (click-through against the mock).
