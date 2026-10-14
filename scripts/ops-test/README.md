# Ops dashboard test kit

Run the dashboard locally against **synthetic data**, so nothing real is read-then-written: no sheet writes, no
emails, no Motion/Kit/Circle/Make changes. Then check the public website is unchanged against the **live** sheet
before merging.

## Files
| File | What it does |
|---|---|
| `mock.mjs` | One local server (port 4555) standing in for Google (token, Sheets incl. writes, Calendar), Kit (read only), Make's image webhook, and a GET-only proxy to Motion. Every write is applied to in-memory data and logged; anything else outbound is refused and logged. Synthetic EP-Programming-Calendar, Social Engine and Team data live at the top of the file. Options: `MOCK_READONLY=1` refuses sheet writes; `MOCK_AUTO=1` marks two Motion tasks auto-completed. |
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
