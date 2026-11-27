// Ads in the dashboard's own database (the same Neon database as tasks; see ./adsdb.js). Plain storage only: no business logic lives here.
// Create, get, list and update for each of the twelve kinds of thing, from one table of columns (ENTITIES) so the tables and the code cannot drift.
//
// Tables are made by ensureAdsTables(), which only Ads code may call. Nothing in the running app calls it yet, so merging this
// creates nothing in the real database; the first Ads page (PR 2) will call it when someone opens Ads.
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
    campaign_id: [T, 'NOT NULL REFERENCES ads_campaigns(id) ON DELETE CASCADE'], adset_id: s(), ad_id: s(),
    at: [TS, 'NOT NULL DEFAULT now()'],
    kind: s(),                          // raise_budget, turn_off, pause_ad, send_to_meta, start, pause, edit
    by: s(), dry_run: [B, 'NOT NULL DEFAULT true'],  // 'rules' or a person's name; dry run = said, not done
    detail: s(), before: [J, ''], after: [J, ''],
    reverse_to: [J, ''],                // what Reverse puts back (e.g. { daily_budget_cents: 5000 })
    reversed_at: [TS, ''], reversed_by: s(),
  }, after: ['CREATE INDEX IF NOT EXISTS ads_actions_campaign ON ads_actions (campaign_id, at DESC)'] },
  audiences: { table: 'ads_audiences', prefix: 'aud', order: 'name', cols: {
    name: s(), description: s(), source: s("'suggested'"),   // interest, lookalike, custom, quiz, suggested
    meta_settings: json('{}'),          // the exact Meta settings, saved for reuse
    meta_audience_id: s(),
    standing: s("'Not tested'"),        // Proven, Promising, Not tested, Retired
    campaigns_count: n(I), best_result: json('{}'),
    tags: json('[]'),                   // course types and topics it buys
    overlaps: json('[]'),               // quiz archetypes it overlaps with
    retired_at: [TS, ''], notes: s(),
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
    numbers: json('{}'), sources: json('[]'),
  } },
  topic_ideas: { table: 'ads_topic_ideas', prefix: 'tpc', order: 'created_at DESC', cols: {
    topic_key: [T, 'NOT NULL UNIQUE'],  // a dismissed key is never suggested again
    title: s(), summary: s(), format: s(), audience_hint: s(), evidence: json('[]'),
    status: s("'new'"),                 // new, sent, dismissed
    program_ref: s(), week_start: [D, ''], dismissed_at: [TS, ''], dismissed_by: s(),
  } },
};
export const ENTITY_NAMES = Object.keys(ENTITIES);

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
      for (const sql of after) await adsQuery(sql);
    }
  })().catch(err => { ready = null; throw err; }));
}
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
