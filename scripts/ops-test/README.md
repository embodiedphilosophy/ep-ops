# Ops dashboard test kit

Run the dashboard locally against **synthetic data**, so nothing real is read-then-written: no sheet writes, no
emails, no Motion/Kit/Circle/Make changes. Then check the public website is unchanged against the **live** sheet
before merging.

## Files
| File | What it does |
|---|---|
| `mock.mjs` | One local server (port 4555) standing in for Google (token, Sheets incl. writes, Calendar), Kit (read only), Calendly (read only: one-to-one bookings and what each mentee wrote), Make's image webhook, and a GET-only proxy to Motion. Every write is applied to in-memory data and logged; anything else outbound is refused and logged. Synthetic EP-Programming-Calendar, Social Engine and Team data live at the top of the file. Options: `MOCK_READONLY=1` refuses sheet writes; `MOCK_AUTO=1` marks two Motion tasks auto-completed. |
| `env.sh` | `source` it: points the app at the mock, makes a throwaway `OPS_SECRET` in `out/`. |
| `run.sh` | Starts the mock, builds and starts the app on :3100, mints a sign-in cookie for jacob@ (`out/cookie.txt`, via `cookie.mjs`; pass another email to test as someone else), makes `out/upload-test.png`. `--no-build` skips the build. |
| `shoot.cjs` | Screenshots every /ops page (list in `pages.json`) at desktop and phone width; reports HTTP status, horizontal overflow and page errors. POSTs are blocked. `node scripts/ops-test/shoot.cjs scripts/ops-test/out label` |
| `feed.cjs` `crop.cjs` `newpost.cjs` `email.cjs` | Click-through tests of Content → Social (feed and post editor, crop/upload, new post, snippets/quotes) and Content → Email (promo emails vs Kit). Writes go to the mock; check `out/mock.log` for exactly what would have been written. |
| `promo.cjs` | Content → Email promo emails: write a planned email (makes the Promo Emails tab), preview, build its Kit draft (the mock logs `KIT DRAFT CREATED`; nothing reaches Kit), add and delete an extra, mark one not needed and bring it back, phone width. |
| `circle.cjs` | Events drawer → Circle: session status, "Set up course in Circle" (standalone course) and "Push to Circle". Needs Circle writes switched on in the mock: `source env.sh`, `export CIRCLE_EVENT_SYNC=live MOCK_CIRCLE_WRITES=1`, restart the mock and `next start`; Circle writes show in `out/mock.log` as `CIRCLE WRITE`. |
| `images.cjs` | Content → Social Image Library split into Art and Promo Images (by `has_text`), and the post picker offering Art only. |
| `out/` | Logs, cookie, screenshots (git-ignored). |

## Typical loop
```bash
bash scripts/ops-test/run.sh                    # mock + build + start
node scripts/ops-test/shoot.cjs scripts/ops-test/out after
node scripts/ops-test/newpost.cjs               # or whichever flow you touched
grep -E "WROTE|APPENDED|BLOCKED" scripts/ops-test/out/mock.log
```
Notes: the mock keeps state until restarted (rerun `run.sh`). Cached sheet reads survive builds in
`.next/cache/fetch-cache` (`run.sh` clears it). Playwright: the cloud image has it in /opt/node-tools; locally `npm i -D playwright`.
When you add a sheet tab or column the dashboard reads, add it to the synthetic data in `mock.mjs` too.

| `content-v2-api.sh` | Content v2 at API level (needs `run.sh` running): who can edit / approve, Expired and Unconfirmed, carousel rules (2 to 10 slides, Manual when approved), delete, author stamps, and the Instagram sync (new posts only, backfill, match to the plan). |
| `content-v2.cjs` | Content v2 in a browser: Expired banner, build a carousel from the library, reorder, upload a video to the Drive mock, delete, "Use in a post" from Art and Quotes, Carolyn (Publisher) vs a viewer, phone width. The mock stands in for Instagram (`/graph`) and Drive (`/gdrive`). |
| `instagram-ingest.sh` | The Make → dashboard Instagram endpoint: secret, form and JSON bodies, new vs known posts, match to the plan. Start from a fresh `run.sh`. |
| `content-v2-phase2-api.sh` | Review & approve (blocked can't be approved, flags need a reason, creators can't approve), Health, Rules defaults; browser: rhythm and week-ahead cards, exact-count approve button, phone width. Start from a fresh `run.sh`. |
| `social-workspace.cjs` | The Social workspace in a browser: sidebar, Calendar (all five views, day categories, drag, drafts, expired banner), Review & approve, Composer page, Library, old links, permissions, phone width. Start from a fresh `run.sh`. `social-shoot.cjs` screenshots every Social page. |
| `cards.cjs` | The card maker in the Composer: template families, only verified quotes offered, bold phrase must be in the quote, art needs reuse OK and no words, all three sizes, Sanskrit with Devanāgarī, export to the Library as Designs, the server stamps quote columns and refuses unverified ids. Start from a fresh `run.sh`. |
| `cards2.sh` / `cards-programs.cjs` | Event promo (facts, refusals), Meet the teacher, educational / story / keyword carousels (slide counts, limits, art rules, export), and This Week at EP (week list, standing post, slides). Start from a fresh `run.sh`. |
| `composer.cjs` | The Composer page: phone preview shapes, Reel and Story views, structured selects, London time, DRAFT block and guardrail checks, saving type / pillar / assignee, comments, Request changes needs a note, viewer can comment but not edit, phone width. Start from a fresh `run.sh`. |
| `library-v2.cjs` | The Library: tabs with counts, filters that run on the whole table (licence, deity), provenance, Use in a post, Open in a template, hide, bulk edit, viewer sees no edit controls, phone width. Start from a fresh `run.sh`. |
| `email-phase3.sh` / `email-phase3.cjs` | Teachers & Email phase 3: reminder rules (off by default, audience needed, one Kit email per session, drafts unless self-scheduling, the daily job) and the newsletter (numbering by what went out, Skipped, Thursday job, verified verse, build, schedule) in the API and in a browser. Mock Kit; each needs a fresh run.sh. |
| `campaigns-api.sh` / `campaigns.cjs` | Coming up & campaigns, clip requests (API checks; browser at desktop and phone width) and the Team & roles page. Fresh run.sh. |
| `ig-publish.sh` | "Post now" against the mock Graph API. Run `off` after a fresh `run.sh`, then `META_PUBLISH=live bash run.sh --no-build` and run `live`. |
| `email-phase1.sh` / `email-phase1.cjs` | Teachers & Email phase 1: Kit sync, matching, attach, put away (API), and the screens in a browser. Mock Kit; each needs a fresh run.sh. |
| `email-phase2.sh` / `email-phase2.cjs` | Teachers & Email phase 2: plan, Kit drafts, conflicts, pre-send checks, schedule, reschedule (API) and the editor and calendar in a browser. Mock Kit; each needs a fresh run.sh. |
| `delete-expired.sh` | "Delete all expired" in the Health panel: who sees it, the count, that approved posts are untouched. Fresh run.sh. |
| `email-launches.sh` / `email-launches.cjs` | Teachers & Email phase 4a: launches (playbooks and their dates, the Meditation Resolution Mondays, the wizard, drafts and tag in Kit, the board) in the API and in a browser. Mock Kit; each needs a fresh run.sh. |
