# Circle API checks (Course Library, Phase 2)

**Status: not run. The Circle Admin key is not available to the cloud session that built this**, so nothing below has been
confirmed against Circle. Do not treat any "expected" line as fact. What is ready:

- `GET /api/ops/library-check` (signed in as a director; read only; returns endpoint status codes and field *names*, no
  values beyond course titles/ids, no secrets). Open it once on the preview or production deployment (which has
  `CIRCLE_API_TOKEN`) and paste the JSON into the "Results" section below.
- The sync works whatever Circle returns (fallbacks in the right-hand column), so the answers decide polish, not whether it runs.

| # | Check (read-only) | Probe | If Circle can't give it |
|---|---|---|---|
| 1 | Courses: id, title, published/draft | `GET /spaces` filtered to course spaces | Staff paste a Circle link ("Add from a Circle link"); sync only checks it resolves (`GET /spaces/{id}`) |
| 2 | Paywall price + interval | `GET /paywalls` (prices/amount/interval) | Price label typed by hand in the publish form; "Changed in Circle" can't notice price changes |
| 3 | Paywall checkout URL | `GET /paywalls` (checkout_url or similar) | Staff paste the checkout link |
| 4 | Cover image | field on the space | Use the Kalighat image (`KALIGHAT_COVER_URL`, from the ep-media Blob store) |
| 5 | Member → paywalls/access groups by email (phase 3 only) | `GET /access_groups` | Kit tags |
| 6 | Webhooks | `GET /webhooks` | Hourly cron (`/api/ops/library-sync`) + "Check Circle now" |
| 7 | SSO (open question in the handoff) | `GET /sso_settings` | n/a, phase 3 |

Field names are looked up under several likely spellings (`lib/ops/circlecatalog.js`), because the real ones are unconfirmed.
Nothing in ep-ops writes to Circle through the Course Library: the code uses `circleGet`/`circleList` (GET only).

## Results
_(paste the `/api/ops/library-check` output here, with the date)_
