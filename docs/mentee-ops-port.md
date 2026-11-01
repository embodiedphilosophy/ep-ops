# Sahṛdaya Upāya and the mentee year in ep-ops

What the dashboard side of the Sahṛdaya Upāya work does. The mentee pages themselves (`/c/mentorship`, `/c/reflections`, `/school/mentee-year`) are served by ep-website; everything staff see or run lives here. The full description of the mentee side is in ep-website `docs/sahrdaya-upaya-page.md`.

## Screens
- **Today → "Mentee year"** card (staff): the next three project steps with how many mentees are done, and who is waiting on what.
- **Mentee year** (`/ops/mentee-year`, in the sidebar for staff): Now (per-mentee ticks under each step, review progress), The rhythm, Month by month, Final projects (cohort counts), One-to-ones. "View the mentee version" opens `/school/mentee-year` on the site.
- **One-to-ones** (`/ops/one-to-ones`, directors): booked sessions with what each mentee wrote (their own summary on the page, or Calendly's answer); filters All / No summary / Not booked / Past; amber 3 days before, red 1 day before.
- **Settings → Peer partners**: now rotation-aware (a pair row has `rotation` and `chat_url`).

## Sheets (EP-Programming-Calendar)
`Mentee Partners` (season | month | email_a | email_b | name_a | name_b | publish | rotation | chat_url), `Mentee Schedule`, `Mentee Months`, `Mentee Step Status`, `Mentee Profiles` (email | name | city | tz). Seed the Schedule and Months tabs once: `node --import ./scripts/ce-test/register.mjs scripts/seed-mentee-schedule.mjs` (dry run) then `--write`.

## Jobs (daily 13:00 UTC, and Mondays 12:00 UTC)
- **Mentee reminders** (`lib/mentee/yearjobs.js`): `MENTEE_NUDGES` unset = off, `dry` = lists them in the daily run's JSON, `on` = emails, each once. A mentee can turn them off on their page.
- **Monday lines** for Jacob (in the Motion digest, or one email): overdue steps, reviews, one-to-ones without a summary, quiet mentees.
- **Mentee digest** (`/api/ops/mentee-digest`, Mondays): the review queue, pair health and "worth a word". `?key=CRON_SECRET&dry=1` previews it. Pair nudges inside it need `MENTEE_NUDGES=on` and use Circle direct messages (unchecked against the real API).
- **Pair chats** (`lib/mentee/pairchats.js`, `/api/ops/pair-chats`): makes a Circle group chat for each articulation group when its rotation starts and writes the link into `chat_url`. `PAIR_CHATS`: unset = off, `dry` = lists, `test` = makes ONE chat with only Jacob and shows Circle's reply, `on` = real. Circle only makes a chat when its first message is sent, so the job sends one short opening line from Jacob (`PAIR_CHAT_OPENING`, default "Your articulation chat for rotation {n}."); chats can't be named from Circle's own screens. Only empty `chat_url` cells are filled. **Not yet checked against the real Circle API**: first run `/api/ops/pair-chats?key=CRON_SECRET&mode=test`, read the reply, delete the test chat in Circle, set `PAIR_CHAT_LINK` (e.g. `https://ss.embodiedphilosophy.com/c/messages/{uuid}`) if the reply has no address, then switch `PAIR_CHATS=on`.

## Env
`CALENDLY_TOKEN`, `MENTEE_NUDGES`, `PAIR_CHATS`, `PAIR_CHAT_LINK`, `CIRCLE_HEADLESS_TOKEN` (member API, for chats and DMs), `CIRCLE_API_TOKEN`, `CRON_SECRET`, `SCHOOL_ORIGIN` (default https://ss.embodiedphilosophy.com).

## Tests
`scripts/member-test/year.mjs`, `scripts/ops-test/mentee-year.mjs`, `scripts/ops-test/pair-chats.mjs` (run with `node --import ./scripts/ce-test/register.mjs …`); the Ops pages against `scripts/ops-test/mock.mjs` (now has Mentee Step Status, Calendly and Kit tag data).
