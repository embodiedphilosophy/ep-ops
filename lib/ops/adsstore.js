// Ads in the dashboard's own database (the same Neon database as tasks; see ./adsdb.js). Plain storage only: no business logic lives here.
// Create, get, list and update for each kind of thing, from one table of columns (ENTITIES) so the tables and the code cannot drift.
//
// Tables are made by ensureAdsTables(), which only Ads code may call. Nothing in the running app calls it yet, so merging this
// creates nothing in the real database; the first thing someone saves in Ads (PR 2) calls it; opening Ads only reads (adsTablesExist).
//
// Money is whole cents. Dates are 'YYYY-MM-DD'. Times are ISO strings. Lists and objects are jsonb.
import { adsQuery } from './adsdb.js';

const T = 'text', I = 'integer', F = 'double precision', B = 'boolean', J = 'jsonb', D = 'date', TS = 'timestamptz';
const s = (def = "''") => [T, `NOT NULL DEFAULT ${def}`];   // a text column that is never null
const n = type => [type, 'NOT NULL DEFAULT 0'];
const json = def => [J, `NOT NULL DEFAULT '${def}'`];

// prefix = the id's start; cols = name → [sql type, extras]; after = extra SQL (indexes, uniqueness)
export const ENTITIES = {
  campaigns: { table: 'ads_campaigns', prefix: 'cmp', order: 'created_at DESC', cols: {
    launch_id: s(), program_id: s(), name: s(),
    goal: s("'Purchase'"),              // Purchase, Lead or Traffic
    structure: s("'test'"),             // 'test' (1 campaign, 5 ad sets × 5 ads) or 'advantage' (1 ad set)
    status: s("'draft'"),               // draft, sent_paused, live, paused, ended
    draft_step: [I, 'NOT NULL DEFAULT 1'], // which of the four draft steps they are on
    landing_url: s(), utm: json('{}'), cta: s("'LEARN_MORE'"),
    start_date: [D, ''], end_date: [D, ''], dates_follow_launch: [B, 'NOT NULL DEFAULT true'],
    budget_mode: s("'per_adset'"),      // 'per_adset' or 'campaign'
    daily_budget_cents: n(I), spend_cap_cents: n(I),
    meta_settings: json('{}'),          // pixel and event, Page, Instagram account, placements, campaign name
    meta_campaign_id: s(),
    rules_on: [B, 'NOT NULL DEFAULT false'],       // the morning rules for this campaign
    rules_dry_run: [B, 'NOT NULL DEFAULT true'],   // while true the rules only say what they would do (Make's Ad Agent stays on)
    created_by: s(),
  } },
  adsets: { table: 'ads_adsets', prefix: 'ast', order: 'position', cols: {
    campaign_id: [T, 'NOT NULL REFERENCES ads_campaigns(id) ON DELETE CASCADE'], position: n(I),
    label: s("'New test'"),             // 'Proven' or 'New test'
    audience_id: s(), audience_name: s(), targeting: json('{}'),
    daily_budget_cents: n(I), budget_ceiling_cents: n(I),
    meta_adset_id: s(), status: s("'draft'"),
  }, after: ['CREATE INDEX IF NOT EXISTS ads_adsets_campaign ON ads_adsets (campaign_id, position)'] },
  creatives: { table: 'ads_creatives', prefix: 'crv', order: 'position', cols: {
    campaign_id: [T, 'NOT NULL REFERENCES ads_campaigns(id) ON DELETE CASCADE'], position: n(I),
    name: s(), kind: s("'image'"),      // 'image' (four sizes) or 'video' (9:16 and 4:5)
    images: json('{}'),                 // { '9:16': url, '4:5': url, '1:1': url, '1.91:1': url }
    video_url: s(), source: s(),        // where the art came from: the launch's art or a Drive image
    meta_images: json('{}'), meta_creative_id: s(),
  }, after: ['CREATE INDEX IF NOT EXISTS ads_creatives_campaign ON ads_creatives (campaign_id, position)'] },
  copysets: { table: 'ads_copysets', prefix: 'cpy', order: 'position', cols: {
    campaign_id: [T, 'NOT NULL REFERENCES ads_campaigns(id) ON DELETE CASCADE'], position: n(I),
    main_text: s(), headline: s(),
    source_kind: s("'placeholder'"),    // launch_email, landing_page, testimonial, placeholder
    source_ref: s(), source_text: s(),  // which email / page / testimonial, and the words drawn from
    is_placeholder: [B, 'NOT NULL DEFAULT true'],   // a [placeholder] blocks Start
  }, after: ['CREATE INDEX IF NOT EXISTS ads_copysets_campaign ON ads_copysets (campaign_id, position)'] },
  ads: { table: 'ads_ads', prefix: 'adx', order: 'position', cols: {
    campaign_id: [T, 'NOT NULL REFERENCES ads_campaigns(id) ON DELETE CASCADE'],
    adset_id: [T, 'NOT NULL REFERENCES ads_adsets(id) ON DELETE CASCADE'],
    creative_id: [T, 'NOT NULL REFERENCES ads_creatives(id) ON DELETE CASCADE'],
    position: n(I), name: s(), meta_ad_id: s(), status: s("'draft'"),
  }, after: ['CREATE INDEX IF NOT EXISTS ads_ads_campaign ON ads_ads (campaign_id, adset_id, position)'] },
  rules: { table: 'ads_rules', prefix: 'rul', order: 'created_at', cols: {   // one row per campaign
    campaign_id: [T, 'NOT NULL UNIQUE REFERENCES ads_campaigns(id) ON DELETE CASCADE'],
    metric: s("'roas'"),                // 'roas' (Purchase), 'cpl' (Lead); Traffic gets no rules
    window_hours: [I, 'NOT NULL DEFAULT 72'],
    raise_pct: [F, 'NOT NULL DEFAULT 20'], raise_every_hours: [I, 'NOT NULL DEFAULT 48'],
    raise_threshold: [F, 'NOT NULL DEFAULT 1.5'],   // Y: return on ad spend at least this (or cost per lead at most this, in dollars)
    ceiling_cents: n(I),                // never raise an ad set above this
    off_threshold: [F, 'NOT NULL DEFAULT 1'],       // Z: turn off below this return (or above this cost per lead)
    off_min_spend_cents: n(I),          // only after it has spent this much
    pause_weakest_after_days: n(I),     // 0 = off
  } },
  actions: { table: 'ads_actions', prefix: 'act', order: 'at DESC', cols: {
    campaign_id: [T, 'NOT NULL'], adset_id: s(), ad_id: s(),   // an Ops campaign's id (cmp_…), or, for the buttons on a campaign made in Meta, that campaign's Meta id (no row in ads_campaigns, so no foreign key)
    at: [TS, 'NOT NULL DEFAULT now()'],
    kind: s(),                          // raise_budget, turn_off, pause_ad, send_to_meta, start, pause, edit
    by: s(), dry_run: [B, 'NOT NULL DEFAULT true'],  // 'rules' or a person's name; dry run = said, not done
    detail: s(), before: [J, ''], after: [J, ''],
    reverse_to: [J, ''],                // what Reverse puts back (e.g. { daily_budget_cents: 5000 })
    reversed_at: [TS, ''], reversed_by: s(),
    // kinds for campaigns made in Meta (Ads account buttons): meta_pause, meta_resume, meta_budget (and 'reverse')
  }, after: ['CREATE INDEX IF NOT EXISTS ads_actions_campaign ON ads_actions (campaign_id, at DESC)',
    'ALTER TABLE ads_actions DROP CONSTRAINT IF EXISTS ads_actions_campaign_id_fkey'] },   // tables made before the buttons carried the foreign key
  audiences: { table: 'ads_audiences', prefix: 'aud', order: 'name', cols: {
    name: s(), description: s(), source: s("'suggested'"),   // interest, lookalike, custom, quiz, suggested
    meta_settings: json('{}'),          // the exact Meta settings, saved for reuse
    meta_audience_id: s(),
    standing: s("'Not tested'"),        // Proven, Promising, Not tested, Retired
    campaigns_count: n(I), best_result: json('{}'),
    tags: json('[]'),                   // course types and topics it buys
    overlaps: json('[]'),               // quiz archetypes it overlaps with
    retired_at: [TS, ''], notes: s(),
    wins: n(I), strikes: n(I),          // campaigns at or above target / below the floor (worked out each morning; Ads PR 4)
    override: json('{}'),               // 'Bring back': { by, at, strikes_forgiven } (a person's decision, Ads PR 4)
  } },
  audience_results: { table: 'ads_audience_results', prefix: 'res', order: 'created_at DESC', cols: {   // an audience's result in one campaign
    audience_id: [T, 'NOT NULL REFERENCES ads_audiences(id) ON DELETE CASCADE'],
    campaign_id: [T, 'NOT NULL REFERENCES ads_campaigns(id) ON DELETE CASCADE'], adset_id: s(),
    spend_cents: n(I), purchases: n(I), revenue_cents: n(I), leads: n(I),
    roas: [F, ''], cpl_cents: [I, ''], outcome: s(),   // above target, below target, below floor
  }, after: ['CREATE UNIQUE INDEX IF NOT EXISTS ads_audience_results_one ON ads_audience_results (audience_id, campaign_id)'] },
  results: { table: 'ads_results', prefix: 'dly', order: 'date DESC', cols: {   // Meta's numbers a day at a time (the hourly sync writes these)
    date: [D, 'NOT NULL'], campaign_id: s(), adset_id: s(), ad_id: s(),
    spend_cents: n(I), impressions: n(I), clicks: n(I), purchases: n(I), revenue_cents: n(I), leads: n(I),
    synced_at: [TS, 'NOT NULL DEFAULT now()'],
  }, after: ['CREATE UNIQUE INDEX IF NOT EXISTS ads_results_one ON ads_results (date, campaign_id, adset_id, ad_id)'] },
  weekly_reads: { table: 'ads_weekly_reads', prefix: 'wkr', order: 'week_start DESC', cols: {
    week_start: [D, 'NOT NULL UNIQUE'], body: s(), claims: json('[]'),   // each claim linked to its numbers
    numbers: json('{}'), sources: json('[]'),   // numbers = every metric with its id; sources = which of the five sources were connected
    generated_at: [TS, ''], breakdowns: json('[]'), topics: json('[]'), read_state: s(),   // Ads PR 5: the quiz breakdowns, the topic table, and whether the written read was made (ok, no_key, failed, all_dropped, no_data)
  } },
  settings: { table: 'ads_settings', prefix: 'set', order: 'key', cols: {   // a tiny key / value table for what directors set in Settings (Ads PR 4: the audience standing thresholds)
    key: [T, 'NOT NULL UNIQUE'], value: json('{}'), updated_by: s(),
  } },
  alerts: { table: 'alerts_log', prefix: 'alr', order: 'created_at DESC', cols: {   // every alert the safety net (lib/ops/alerts.js) has raised; one row per problem while it lasts
    key: s(), level: s("'important'"),  // urgent, important, routine (test = a test message)
    title: s(), body: s(), short: s(), link: s(),   // link is an address inside Ops (or Meta's tool); body and short are plain English
    measure: [F, 'NOT NULL DEFAULT 0'], sent_measure: [F, 'NOT NULL DEFAULT 0'],   // how big the problem is now / when it was last sent (25% worse sends again)
    numbers: json('{}'),
    state: s("'open'"),                 // open, resolved
    sends: json('[]'),                  // [{ at, kind: alert | repeat | worse | escalated | resolved | test }]
    queued: json('[]'),                 // [{ email, kind }] waiting for the end of that person's quiet hours
    deliveries: json('[]'),             // [{ at, kind, who, channel, status: sent | skipped | failed, detail }]: never a phone number
    events: json('[]'),                 // acknowledgements and changes: [{ at, type, by, note }]
    last_sent_at: [TS, ''], acked_by: s(), acked_at: [TS, ''], snooze_until: [TS, ''], resolved_at: [TS, ''],
  }, after: ['CREATE INDEX IF NOT EXISTS alerts_log_key ON alerts_log (key, created_at DESC)'] },
  outside_notes: { table: 'ads_outside_notes', prefix: 'out', order: 'week_start DESC, created_at DESC', cols: {   // the weekly outside research (lib/ops/adsresearch.js): one row per sourced statement, plus one 'run' row per week
    week_start: [D, 'NOT NULL'], kind: s("'note'"),   // 'note' (a statement with its sources) or 'run' (what that week's look found, said plainly)
    statement: s(), sources: json('[]'),   // sources = [{ url, title, snippet, page_age }]: only results the search really returned
    status: s("'New'"), read_at: [TS, ''],   // New or Seen before; the moment the pages were read
    topic: s(),   // which question it answers: a, b, c or d (b = what advertisers pay)
    norm: s(), source_key: s(),   // how a statement and its first source are recognised the next week (for Seen before)
    info: json('{}'),   // a run row: { state, searches, results, asked, kept, dropped: [reason, ...] }
  }, after: ['CREATE INDEX IF NOT EXISTS ads_outside_notes_week ON ads_outside_notes (week_start, kind)'] },
  topic_ideas: { table: 'ads_topic_ideas', prefix: 'tpc', order: 'created_at DESC', cols: {
    topic_key: [T, 'NOT NULL UNIQUE'],  // a dismissed key is never suggested again
    title: s(), summary: s(), format: s(), audience_hint: s(), evidence: json('[]'),
    status: s("'new'"),                 // new, sent, dismissed
    program_ref: s(), week_start: [D, ''], dismissed_at: [TS, ''], dismissed_by: s(),
    sent_by: s(), sent_at: [TS, ''], track: s(), parent: s(),   // Ads PR 5: who sent it to Programs and when; the track and school the Add a program form is prefilled with
  } },
  // Ads › What we've learned (the ad history). Aggregates, ad / campaign / ad set names, ids and measures of an ad's words only: never a person, never the words themselves.
  history_weeks: { table: 'ads_history_weeks', prefix: 'hwk', order: 'week_start DESC', cols: {   // one row per week of history read (or tried)
    week_start: [D, 'NOT NULL UNIQUE'], status: s("'done'"),   // done, failed
    ad_rows: n(I), spend_cents: n(I), attempts: n(I), read_at: [TS, ''], note: s(),
  } },
  history_ads: { table: 'ads_history_ads', prefix: 'had', order: 'name', cols: {   // one row per ad ever seen
    ad_id: [T, 'NOT NULL UNIQUE'], name: s(), campaign_id: s(), campaign_name: s(), adset_id: s(), adset_name: s(), objective: s(),
    features: json('{}'),               // goal, offer, audience, format, copy length, headline kind, button, season, budget: labels and measures, never the words
  } },
  history_adsets: { table: 'ads_history_adsets', prefix: 'has', order: 'name', cols: {   // one row per ad set: only what an ad needs from it (the kind of audience and the daily budget), never the targeting itself
    adset_id: [T, 'NOT NULL UNIQUE'], name: s(), campaign_id: s(), audience: s("'unknown'"), daily_cents: n(I),
  } },
  history_results: { table: 'ads_history_results', prefix: 'hrs', order: 'week_start DESC', cols: {   // one ad's week, added up
    week_start: [D, 'NOT NULL'], ad_id: [T, 'NOT NULL'], campaign_id: s(), adset_id: s(),
    spend_cents: n(I), impressions: n(I), clicks: n(I), purchases: n(I), revenue_cents: n(I), leads: n(I),
  }, after: ['CREATE UNIQUE INDEX IF NOT EXISTS ads_history_results_one ON ads_history_results (week_start, ad_id)'] },
  history_findings: { table: 'ads_history_findings', prefix: 'hfd', order: 'spend_cents DESC', cols: {   // every checked statement ever made, so the list builds over time
    key: [T, 'NOT NULL UNIQUE'], kind: s(), dim: s(), label: s(), side: s(), reliability: s(), text: s(), by: s("'code'"),   // by: who phrased it (code or the model)
    metrics: json('[]'), sources: json('[]'), more: n(I), ads: n(I), campaigns: n(I), spend_cents: [I, 'NOT NULL DEFAULT 0'],
    period: s(), first_seen: [D, ''], last_seen: [D, ''], first_read: n(I), last_read: n(I), status: s("'newer'"),   // newer, still_true, no_longer_true
  } },
};
export const ENTITY_NAMES = Object.keys(ENTITIES);
// Columns added after a table first shipped (Ads PR 4): a table made earlier gets them here, the next time tables are ensured
const ADDED = { audiences: ['wins', 'strikes', 'override'], weekly_reads: ['generated_at', 'breakdowns', 'topics', 'read_state'], topic_ideas: ['sent_by', 'sent_at', 'track', 'parent'], outside_notes: ['topic'] };   // Ads PR 5 added the last two

const kind = type => (type === J ? 'json' : type === D ? 'date' : type === TS ? 'ts' : type);
const col = (e, name) => (name === 'id' || name === 'created_at' || name === 'updated_at') ? null : ENTITIES[e].cols[name];
const q = name => `"${name}"`;   // "at", "date" and "after" are words Postgres also uses

// Make the tables. Safe to run any number of times. Only Ads code may call this.
let ready = null;
export function ensureAdsTables() {
  return (ready ||= (async () => {
    for (const e of ENTITY_NAMES) {
      const { table, cols, after = [] } = ENTITIES[e];
      const lines = ['id text PRIMARY KEY', 'created_at timestamptz NOT NULL DEFAULT now()', 'updated_at timestamptz NOT NULL DEFAULT now()',
        ...Object.entries(cols).map(([name, [type, extra]]) => `${q(name)} ${type} ${extra}`.trim())];
      await adsQuery(`CREATE TABLE IF NOT EXISTS ${table} (${lines.join(', ')})`);
      for (const name of ADDED[e] || []) await adsQuery(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS ${q(name)} ${cols[name][0]} ${cols[name][1]}`);
      for (const sql of after) await adsQuery(sql);
    }
  })().catch(err => { ready = null; throw err; }));
}
// Do the tables exist yet? Opening Ads only reads; the tables are made by the first thing someone saves (never by looking).
export async function adsTablesExist() { return (await adsQuery("SELECT to_regclass('ads_campaigns') AS t"))[0]?.t != null; }
export const forgetAdsTables = () => { ready = null; };   // tests: switch to another database

// What comes out: dates as 'YYYY-MM-DD', times as ISO strings, nothing else changed (Neon and PGlite hand these back differently)
function shape(e, r) {
  if (!r) return null;
  const out = {};
  for (const [k, v] of Object.entries(r)) {
    const c = k === 'id' ? null : k === 'created_at' || k === 'updated_at' ? [TS] : ENTITIES[e].cols[k];
    const t = c && kind(c[0]);
    out[k] = v == null ? v : t === 'date' ? (v instanceof Date ? v.toISOString() : String(v)).slice(0, 10) : t === 'ts' ? new Date(v).toISOString() : v;
  }
  return out;
}
const value = (e, k, v) => { const c = col(e, k); if (!c) throw new Error(`${e} has no column “${k}”`); return kind(c[0]) === 'json' && v != null ? JSON.stringify(v) : v; };
const cast = (e, k) => (kind(ENTITIES[e].cols[k][0]) === 'json' ? '::jsonb' : '');
const check = e => { if (!ENTITIES[e]) throw new Error(`Unknown kind of thing: ${e}`); };

export async function createRow(e, row = {}) {
  check(e); await ensureAdsTables();
  const keys = Object.keys(row);
  const id = row.id || `${ENTITIES[e].prefix}_${globalThis.crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
  const names = keys.filter(k => k !== 'id');
  const sql = `INSERT INTO ${ENTITIES[e].table} (id${names.map(k => ', ' + q(k)).join('')}) VALUES ($1${names.map((k, i) => `, $${i + 2}${cast(e, k)}`).join('')}) RETURNING *`;
  return shape(e, (await adsQuery(sql, [id, ...names.map(k => value(e, k, row[k]))]))[0]);
}
export async function getRow(e, id) {
  check(e); await ensureAdsTables();
  return shape(e, (await adsQuery(`SELECT * FROM ${ENTITIES[e].table} WHERE id = $1`, [id]))[0]);
}
// where: { column: value } (all must match). Ordered the way that kind is usually shown.
export async function listRows(e, where = {}, { limit = 500 } = {}) {
  check(e); await ensureAdsTables();
  const keys = Object.keys(where);
  const sql = `SELECT * FROM ${ENTITIES[e].table}${keys.length ? ' WHERE ' + keys.map((k, i) => `${q(k)} = $${i + 1}${cast(e, k)}`).join(' AND ') : ''} ORDER BY ${ENTITIES[e].order.replace(/^(\w+)/, '"$1"')} LIMIT ${Math.min(Number(limit) || 500, 2000)}`;
  return (await adsQuery(sql, keys.map(k => value(e, k, where[k])))).map(r => shape(e, r));
}
// Like listRows, but only LOOKS: if that table is not there yet it answers [] and makes nothing (the safety net's pages and previews use this)
export async function peekRows(e, where = {}, { limit = 500 } = {}) {
  check(e);
  if ((await adsQuery('SELECT to_regclass($1) AS t', [ENTITIES[e].table]))[0]?.t == null) return [];
  const keys = Object.keys(where);
  const sql = `SELECT * FROM ${ENTITIES[e].table}${keys.length ? ' WHERE ' + keys.map((k, i) => `${q(k)} = $${i + 1}${cast(e, k)}`).join(' AND ') : ''} ORDER BY ${ENTITIES[e].order.replace(/^(\w+)/, '"$1"')} LIMIT ${Math.min(Number(limit) || 500, 2000)}`;
  return (await adsQuery(sql, keys.map(k => value(e, k, where[k])))).map(r => shape(e, r));
}
export async function updateRow(e, id, patch) {
  check(e); await ensureAdsTables();
  const keys = Object.keys(patch).filter(k => k !== 'id');
  if (!keys.length) return getRow(e, id);
  const sql = `UPDATE ${ENTITIES[e].table} SET ${keys.map((k, i) => `${q(k)} = $${i + 2}${cast(e, k)}`).join(', ')}, updated_at = now() WHERE id = $1 RETURNING *`;
  return shape(e, (await adsQuery(sql, [id, ...keys.map(k => value(e, k, patch[k]))]))[0]);
}
export async function deleteRow(e, id) {
  check(e); await ensureAdsTables();
  await adsQuery(`DELETE FROM ${ENTITIES[e].table} WHERE id = $1`, [id]);
}

// One campaign with everything under it, for the campaign page
export async function campaignTree(id) {
  const campaign = await getRow('campaigns', id);
  if (!campaign) return null;
  const by = e => listRows(e, { campaign_id: id });
  const [adsets, creatives, copysets, ads, rules, actions] = await Promise.all(['adsets', 'creatives', 'copysets', 'ads', 'rules', 'actions'].map(by));
  return { campaign, adsets, creatives, copysets, ads, rules: rules[0] || null, actions };
}

// ---- Results (Ads PR 3). Meta's numbers a day at a time; the hourly sync writes them, the morning rules and the campaign page read them.
// A row is one day of one ad set (ad_id is empty) or of one ad inside it. The same day again is the same row updated, so the sync can run as often as it likes.
const RESULT_FIELDS = ['spend_cents', 'impressions', 'clicks', 'purchases', 'revenue_cents', 'leads'];
export async function upsertResults(rows) {
  await ensureAdsTables();
  for (let i = 0; i < rows.length; i += 100) {
    const part = rows.slice(i, i + 100), params = [];
    const values = part.map(r => {
      const p = [`dly_${globalThis.crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`, r.date, r.campaign_id, r.adset_id || '', r.ad_id || '', ...RESULT_FIELDS.map(f => Math.round(Number(r[f]) || 0))];
      params.push(...p); return `(${p.map((_, k) => `$${params.length - p.length + k + 1}`).join(', ')})`;
    });
    await adsQuery(`INSERT INTO ads_results (id, "date", campaign_id, adset_id, ad_id, ${RESULT_FIELDS.join(', ')}) VALUES ${values.join(', ')} ON CONFLICT ("date", campaign_id, adset_id, ad_id) DO UPDATE SET ${RESULT_FIELDS.map(f => `${f} = EXCLUDED.${f}`).join(', ')}, synced_at = now(), updated_at = now()`, params);
  }
  return rows.length;
}
// One campaign's results from a date on (YYYY-MM-DD), oldest first
export async function listResults(campaignId, since) {
  await ensureAdsTables();
  return (await adsQuery('SELECT * FROM ads_results WHERE campaign_id = $1 AND "date" >= $2 ORDER BY "date", adset_id, ad_id', [campaignId, since])).map(r => shape('results', r));
}
// What each ad set has spent and earned (from a date on, or all of it); ad set rows only, so an ad's own row is never counted twice
export async function resultTotals({ campaignId, since, until } = {}) {
  await ensureAdsTables();
  const where = ["ad_id = ''", "adset_id <> ''"], params = [];
  if (campaignId) { params.push(campaignId); where.push(`campaign_id = $${params.length}`); }
  if (since) { params.push(since); where.push(`"date" >= $${params.length}`); }
  if (until) { params.push(until); where.push(`"date" <= $${params.length}`); }
  return (await adsQuery(`SELECT campaign_id, adset_id, SUM(spend_cents)::bigint AS spend_cents, SUM(revenue_cents)::bigint AS revenue_cents, SUM(purchases)::bigint AS purchases, SUM(leads)::bigint AS leads FROM ads_results WHERE ${where.join(' AND ')} GROUP BY campaign_id, adset_id`, params))
    .map(r => ({ campaign_id: r.campaign_id, adset_id: r.adset_id, spend_cents: Number(r.spend_cents), revenue_cents: Number(r.revenue_cents), purchases: Number(r.purchases), leads: Number(r.leads) }));
}
// Each ad's whole life so far (Creative results): what it spent, earned, and was shown and clicked, from the ad's own rows. Reads only; makes nothing if the tables are not there.
export async function adTotals() {
  if (!(await adsTablesExist())) return { rows: [], synced_at: '' };
  const rows = await adsQuery("SELECT ad_id, SUM(spend_cents)::bigint AS spend_cents, SUM(revenue_cents)::bigint AS revenue_cents, SUM(purchases)::bigint AS purchases, SUM(leads)::bigint AS leads, SUM(impressions)::bigint AS impressions, SUM(clicks)::bigint AS clicks, MAX(synced_at) AS synced_at FROM ads_results WHERE ad_id <> '' GROUP BY ad_id");
  const at = rows.map(r => r.synced_at).filter(Boolean).map(v => new Date(v).toISOString()).sort().pop() || '';
  return { rows: rows.map(r => ({ ad_id: r.ad_id, spend_cents: Number(r.spend_cents), revenue_cents: Number(r.revenue_cents), purchases: Number(r.purchases), leads: Number(r.leads), impressions: Number(r.impressions), clicks: Number(r.clicks) })), synced_at: at };
}
// Meta's numbers added up from a date on (Outside research, "Your numbers"): ad set rows only, so nothing is counted twice. Only reads; null if there are no tables.
export async function periodTotals(since) {
  if (!(await adsTablesExist())) return null;
  const r = (await adsQuery('SELECT SUM(spend_cents)::bigint AS spend_cents, SUM(impressions)::bigint AS impressions, SUM(clicks)::bigint AS clicks, SUM(purchases)::bigint AS purchases, SUM(leads)::bigint AS leads FROM ads_results WHERE ad_id = \'\' AND adset_id <> \'\' AND "date" >= $1', [since]))[0] || {};
  return { spend_cents: Number(r.spend_cents) || 0, impressions: Number(r.impressions) || 0, clicks: Number(r.clicks) || 0, purchases: Number(r.purchases) || 0, leads: Number(r.leads) || 0 };
}
// Every campaign's changes from a moment on, newest first (the Ads list's "What the Ad Agent did today")
export async function listActionsSince(iso) {
  await ensureAdsTables();
  return (await adsQuery('SELECT * FROM ads_actions WHERE "at" >= $1 ORDER BY "at" DESC LIMIT 200', [iso])).map(r => shape('actions', r));
}
// Changes made with the buttons on campaigns that were made in Meta (their actions carry the Meta id, not an Ops id), newest first. Only looks: no table, no rows.
export async function peekMetaActions(iso, limit = 60) {
  if ((await adsQuery("SELECT to_regclass('ads_actions') AS t"))[0]?.t == null) return [];
  return (await adsQuery("SELECT * FROM ads_actions WHERE campaign_id NOT LIKE 'cmp\\_%' AND \"at\" >= $1 ORDER BY \"at\" DESC LIMIT $2", [iso, limit])).map(r => shape('actions', r));
}
// Reverse is pressed once: whoever claims the change first does it. releaseReversal puts the claim back if Meta then refuses.
export async function claimReversal(id, who) {
  await ensureAdsTables();
  return shape('actions', (await adsQuery('UPDATE ads_actions SET reversed_at = now(), reversed_by = $2, updated_at = now() WHERE id = $1 AND reversed_at IS NULL RETURNING *', [id, who]))[0]);
}
export const releaseReversal = id => adsQuery("UPDATE ads_actions SET reversed_at = NULL, reversed_by = '', updated_at = now() WHERE id = $1", [id]);

// ---- Audience library (Ads PR 4)
// How many separate days each ad set has spent money on (the library's "minimum days" test); ad set rows only
export async function resultDays() {
  await ensureAdsTables();
  return (await adsQuery("SELECT campaign_id, adset_id, COUNT(DISTINCT \"date\")::int AS days FROM ads_results WHERE ad_id = '' AND adset_id <> '' AND spend_cents > 0 GROUP BY campaign_id, adset_id")).map(r => ({ campaign_id: r.campaign_id, adset_id: r.adset_id, days: Number(r.days) }));
}
