// Meta Marketing API (Graph API) client for Ads. Small on purpose: thin functions, one safety gate.
//
// THE RULE: nothing is created, changed or started in Meta unless META_ADS_LIVE is exactly 'live' (the same style as CIRCLE_EVENT_SYNC and
// META_PUBLISH). Every write goes through write() below. Without the switch a write does not leave the process: it returns
// { ok: true, dryRun: true, id: 'dryrun-…', would: { method, path, body } } and logs one line (method and path only, never the body).
// Reads call Meta only when META_ADS_TOKEN is set (a read spends and changes nothing); without it they answer { ok: false, notConnected: true }
// and make no request. Everything created is created PAUSED; starting it is a separate, gated write (setStatus).
//
// Settings, by name (values are never printed, logged or returned): META_ADS_TOKEN (a system-user token, kept apart from the Instagram one,
// META_ACCESS_TOKEN), META_AD_ACCOUNT_ID (act_…), META_PIXEL_ID, META_PAGE_ID, META_IG_USER_ID (already used for Instagram), META_ADS_LIVE.
// META_ADS_BASE is for tests only: read only when set, it points the client at scripts/ops-test/meta-mock.mjs. It is not set in production.
//
// No path, host or option here is read from Meta's answers: the token is only ever sent to the base address above.
import { createHash } from 'node:crypto';

const VERSION = 'v21.0';
const env = k => (process.env[k] || '').trim();
const BASE = () => (env('META_ADS_BASE') || 'https://graph.facebook.com').replace(/\/+$/, '') + '/' + VERSION;

// ---- What is set, and the mode. Reads only the names, never shows a value.
export const ADS_SETTINGS = [
  ['META_ADS_TOKEN', 'Access key for the ad account'],
  ['META_AD_ACCOUNT_ID', 'Ad account (starts act_)'],
  ['META_PIXEL_ID', 'Pixel (what counts a purchase or a sign-up)'],
  ['META_PAGE_ID', 'Facebook Page the ads run under'],
  ['META_IG_USER_ID', 'Instagram account'],
  ['META_ADS_LIVE', 'Safety switch (must say live for changes to reach Meta)'],
];
export const isLive = () => env('META_ADS_LIVE') === 'live';
export const hasToken = () => !!env('META_ADS_TOKEN');
const accountId = () => { const a = env('META_AD_ACCOUNT_ID'); return a && (a.startsWith('act_') ? a : 'act_' + a); };

// 'not_connected' (no key or no ad account), 'dry_run' (connected, switch off), 'live'
export const adsMode = () => (!hasToken() || !accountId() ? 'not_connected' : isLive() ? 'live' : 'dry_run');
export const MODE_TEXT = {
  not_connected: 'Not connected',
  dry_run: 'Dry run — nothing is sent to Meta',
  live: 'Live',
};
export function metaAdsStatus() {
  const mode = adsMode();
  return { mode, label: MODE_TEXT[mode], settings: ADS_SETTINGS.map(([name, what]) => ({ name, what, set: name === 'META_ADS_LIVE' ? isLive() : !!env(name) })) };
}

// ---- The two ways in. Both return { ok, … } and never throw for what Meta says.
const NOT_CONNECTED = { ok: false, notConnected: true, error: 'Meta isn’t connected yet: the ads access key (META_ADS_TOKEN) is not set in Vercel.' };
const ACCOUNT_MISSING = { ok: false, notConnected: true, error: 'The ad account (META_AD_ACCOUNT_ID) is not set in Vercel.' };

async function send(method, path, params, body) {
  const url = new URL(`${BASE()}/${path.replace(/^\/+/, '')}`);
  for (const [k, v] of Object.entries(params || {})) if (v != null) url.searchParams.set(k, typeof v === 'object' ? JSON.stringify(v) : String(v));
  try {
    const res = await fetch(url, {
      method, signal: AbortSignal.timeout(20000),
      headers: { Authorization: `Bearer ${env('META_ADS_TOKEN')}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok || j.error) return { ok: false, status: res.status, code: j.error?.code, error: `Meta said no: ${j.error?.error_user_msg || j.error?.message || `error ${res.status}`}` };
    return { ok: true, ...j };
  } catch (e) {
    const timeout = e?.name === 'TimeoutError';
    return { ok: false, timeout, network: !timeout, error: `Couldn’t reach Meta (${timeout ? 'it took too long' : 'network problem'}).` };
  }
}

// A read: only with a token. Changes nothing in Meta.
export async function read(path, params) {
  if (!hasToken()) return NOT_CONNECTED;
  return send('GET', path, params);
}

// A write: THE gate. Without META_ADS_LIVE=live, it returns what it would have done and sends nothing.
let dryCount = 0;
export async function write(kind, path, body = {}) {
  if (!isLive()) {
    console.log(`[meta-ads] dry run: ${kind} (POST ${path.replace(/^\/+/, '')}); nothing sent to Meta`);
    return { ok: true, dryRun: true, id: `dryrun-${kind}-${++dryCount}`, would: { kind, method: 'POST', path, body } };
  }
  if (!hasToken()) return NOT_CONNECTED;
  if (path.startsWith(NO_ACCOUNT)) return ACCOUNT_MISSING;
  return send('POST', path, null, body);
}

// Meta's codes for "too many requests, slow down" (the hourly sync, the safety net and the account view all treat them alike)
export const RATE_LIMIT_CODES = [4, 17, 32, 613];

// ---- Reads
const acct = () => accountId();
const NO_ACCOUNT = 'act_NOT_SET';   // a write path made with no ad account; write() refuses it when live
const inAcct = sub => `${acct() || NO_ACCOUNT}/${sub}`;
export const getAccount = () => acct() ? read(acct(), { fields: 'name,account_status,disable_reason,currency,timezone_name,amount_spent,funding_source_details' }) : ACCOUNT_MISSING;
export const hasPaymentMethod = a => !!(a?.ok && a.funding_source_details);   // from getAccount()
export const getPixel = () => env('META_PIXEL_ID') ? read(env('META_PIXEL_ID'), { fields: 'name,last_fired_time,is_unavailable' }) : { ok: false, notConnected: true, error: 'The pixel (META_PIXEL_ID) is not set in Vercel.' };
export const pixelFiredWithin = (px, hours = 24, now = Date.now()) => !!(px?.ok && px.last_fired_time && now - Date.parse(px.last_fired_time) <= hours * 3600e3);
export const getPage = () => env('META_PAGE_ID') ? read(env('META_PAGE_ID'), { fields: 'name,link' }) : { ok: false, notConnected: true, error: 'The Page (META_PAGE_ID) is not set in Vercel.' };
// One ad set or ad as Meta has it right now (budget in cents as text, status): the morning rules and Reverse check it before they change anything.
export const getObject = metaId => read(String(metaId), { fields: 'name,status,effective_status,daily_budget' });
export const searchInterests = (q, limit = 25) => read('search', { type: 'adinterest', q, limit });
export const listCampaigns = () => acct() ? read(`${acct()}/campaigns`, { fields: 'name,objective,status,effective_status', limit: 200 }) : ACCOUNT_MISSING;
export const listCustomAudiences = () => acct() ? read(`${acct()}/customaudiences`, { fields: 'name,subtype,approximate_count_lower_bound', limit: 200 }) : ACCOUNT_MISSING;

// Results for the ad account at campaign, ad set or ad level, a day at a time. Numbers come back as cents and whole counts.
// breakdowns (later: age, gender, placement) are passed straight through. since / until are YYYY-MM-DD.
const num = v => Number(v) || 0;
const act = (row, type, key = 'actions') => num((row[key] || []).find(a => a.action_type === type || a.action_type === `omni_${type}`)?.value);
export const normalizeInsight = r => ({
  date: r.date_start, campaign_id: r.campaign_id || '', adset_id: r.adset_id || '', ad_id: r.ad_id || '',
  spend_cents: Math.round(num(r.spend) * 100), impressions: num(r.impressions), clicks: num(r.clicks),
  purchases: act(r, 'purchase'), revenue_cents: Math.round(act(r, 'purchase', 'action_values') * 100), leads: act(r, 'lead'),
});
export async function getInsights({ level = 'adset', since, until, campaignId, breakdowns } = {}) {
  if (!acct()) return hasToken() ? ACCOUNT_MISSING : NOT_CONNECTED;
  const r = await read(`${acct()}/insights`, {
    level, time_increment: 1, time_range: { since, until }, limit: 500, breakdowns,
    fields: 'campaign_id,adset_id,ad_id,spend,impressions,clicks,actions,action_values,purchase_roas',
    filtering: campaignId ? [{ field: 'campaign.id', operator: 'EQUAL', value: campaignId }] : undefined,
  });
  return r.ok ? { ok: true, rows: (r.data || []).map(normalizeInsight) } : r;
}

// ---- Reads for the ad safety net (watches the WHOLE ad account, not only what Ops built). Reads only: they go through read(), never the write gate.
// Meta pages long lists: the next page is asked for with the `after` cursor Meta handed back (a value, never a link taken from its answer).
async function readAll(path, params, pages = 40) {
  const data = []; let after = null;
  for (let i = 0; i < pages; i++) {
    const r = await read(path, { ...params, ...(after ? { after } : {}) });
    if (!r.ok) return r;
    data.push(...(r.data || []));
    after = r.paging?.next ? r.paging?.cursors?.after : null;
    if (!after) return { ok: true, data };
  }
  return { ok: true, data, truncated: true };
}
export const listAllCampaigns = () => acct() ? readAll(`${acct()}/campaigns`, { fields: 'name,objective,status,effective_status,start_time,stop_time,daily_budget,lifetime_budget,spend_cap,created_time', limit: 200 }) : ACCOUNT_MISSING;
export const listAllAdSets = () => acct() ? readAll(`${acct()}/adsets`, { fields: 'name,campaign_id,status,effective_status,start_time,end_time,daily_budget,lifetime_budget', limit: 200 }) : ACCOUNT_MISSING;
export const listAdsWithIssues = () => acct() ? readAll(`${acct()}/ads`, { fields: 'name,campaign_id,adset_id,effective_status,issues_info', limit: 200, filtering: [{ field: 'effective_status', operator: 'IN', value: ['DISAPPROVED', 'WITH_ISSUES'] }] }) : ACCOUNT_MISSING;
// Every campaign's results (or the whole account's, level 'account') a day at a time, all pages
export async function getAccountInsights({ level = 'campaign', since, until } = {}) {
  if (!acct()) return hasToken() ? ACCOUNT_MISSING : NOT_CONNECTED;
  const r = await readAll(`${acct()}/insights`, { level, time_increment: 1, time_range: { since, until }, limit: 500, fields: 'campaign_id,spend,impressions,clicks,actions,action_values' });
  return r.ok ? { ok: true, rows: r.data.map(normalizeInsight), truncated: !!r.truncated } : r;
}
// Where a person can open an account's campaigns in Meta's own tool (the account number is not a secret; the key is never in a link)
export const managerUrl = campaignId => `https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=${encodeURIComponent((acct() || '').replace(/^act_/, ''))}${campaignId ? `&selected_campaign_ids=${encodeURIComponent(campaignId)}` : ''}`;

// ---- Writes. Everything made is PAUSED. Money is in cents (Meta's smallest unit for USD).
export const GOALS = {
  Purchase: { objective: 'OUTCOME_SALES', optimization: 'OFFSITE_CONVERSIONS', event: 'PURCHASE' },
  Lead: { objective: 'OUTCOME_LEADS', optimization: 'OFFSITE_CONVERSIONS', event: 'LEAD' },
  Traffic: { objective: 'OUTCOME_TRAFFIC', optimization: 'LANDING_PAGE_VIEWS', event: null },
};
const budget = (o, cents, life) => { if (cents) o.daily_budget = String(cents); if (life) o.lifetime_budget = String(life); return o; };

export function createCampaign({ name, goal, dailyBudgetCents, spendCapCents }) {
  if (!GOALS[goal]) return { ok: false, error: `The goal must be Purchase, Lead or Traffic (got “${goal}”).` };
  const body = budget({ name, objective: GOALS[goal].objective, status: 'PAUSED', special_ad_categories: [] }, dailyBudgetCents);
  if (!dailyBudgetCents) body.is_adset_budget_sharing_enabled = false;   // budgets sit on the ad sets
  if (spendCapCents) body.spend_cap = String(spendCapCents);
  return write('campaign', inAcct('campaigns'), body);
}
export function createAdSet({ campaignId, name, goal, targeting, dailyBudgetCents, startTime, endTime, advantage = false }) {
  const g = GOALS[goal]; if (!g) return { ok: false, error: `The goal must be Purchase, Lead or Traffic (got “${goal}”).` };
  const body = budget({
    name, campaign_id: campaignId, status: 'PAUSED', billing_event: 'IMPRESSIONS', optimization_goal: g.optimization, bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
    targeting: advantage ? { ...targeting, targeting_automation: { advantage_audience: 1 } } : targeting,
  }, dailyBudgetCents);
  if (g.event) body.promoted_object = { pixel_id: env('META_PIXEL_ID'), custom_event_type: g.event };
  if (startTime) body.start_time = startTime;
  if (endTime) body.end_time = endTime;
  return write('adset', inAcct('adsets'), body);
}
// One creative = one ad's pictures (or its video) plus all the copy sets, so each ad carries the same five texts. images is { '9:16': hash, '4:5': …, '1:1': …, '1.91:1': … }.
export function createAdCreative({ name, link, cta = 'LEARN_MORE', copySets, images, videoId }) {
  const spec = {
    bodies: copySets.map(c => ({ text: c.text })), titles: copySets.map(c => ({ text: c.headline })),
    link_urls: [{ website_url: link }], call_to_action_types: [cta], optimization_type: 'PLACEMENT',
    ...(videoId ? { ad_formats: ['SINGLE_VIDEO'], videos: [{ video_id: videoId }] }
      : { ad_formats: ['SINGLE_IMAGE'], images: Object.entries(images || {}).map(([ratio, hash]) => ({ hash, adlabels: [{ name: ratio }] })) }),
  };
  return write('creative', inAcct('adcreatives'), { name, object_story_spec: { page_id: env('META_PAGE_ID'), instagram_user_id: env('META_IG_USER_ID') }, asset_feed_spec: spec });
}
export const createAd = ({ adsetId, creativeId, name }) => write('ad', inAcct('ads'), { name, adset_id: adsetId, creative: { creative_id: creativeId }, status: 'PAUSED' });
export const uploadAdImage = ({ name, bytesBase64 }) => write('image', inAcct('adimages'), { name, bytes: bytesBase64 });

// Starting and stopping. 'ACTIVE' is what Start means; nothing here is called unless a person (or a switched-on morning rule) asks.
export const setStatus = (metaId, status) => ['ACTIVE', 'PAUSED'].includes(status) ? write('status', metaId, { status }) : { ok: false, error: 'A status is ACTIVE or PAUSED.' };
export const setBudget = (metaId, { dailyBudgetCents, lifetimeBudgetCents }) => write('budget', metaId, budget({}, dailyBudgetCents, lifetimeBudgetCents));

// Audiences. Emails are lower-cased, trimmed and hashed (SHA-256) before they leave this file, and only counts are logged.
export const hashEmail = e => createHash('sha256').update(String(e).trim().toLowerCase()).digest('hex');
export const createCustomAudience = ({ name, description = '' }) => write('audience', inAcct('customaudiences'), { name, description, subtype: 'CUSTOM', customer_file_source: 'USER_PROVIDED_ONLY' });
export async function addAudienceUsers(audienceId, emails) {
  const data = [...new Set(emails.map(e => String(e || '').trim().toLowerCase()).filter(e => e.includes('@')))].map(e => [hashEmail(e)]);
  const r = await write('audience-users', `${audienceId}/users`, { payload: { schema: ['EMAIL_SHA256'], data } });
  if (r.dryRun) r.would.body = { payload: { schema: ['EMAIL_SHA256'], count: data.length } };   // the hashes are not worth printing
  return r;
}
export const createLookalike = ({ name, originAudienceId, country = 'US', ratio = 0.01 }) =>
  write('lookalike', inAcct('customaudiences'), { name, subtype: 'LOOKALIKE', origin_audience_id: originAudienceId, lookalike_spec: { type: 'similarity', country, ratio } });

// ---- A whole campaign, paused: 1 campaign, then each ad's creative once, then the ad sets, then every ad in every ad set.
// A 5 × 5 test is 1 campaign, 5 ad sets, 5 creatives, 25 ads; Advantage+ is 1 ad set with the same 5 ads. Stops at the first refusal and says what was made.
export async function buildCampaign(spec) {
  const { name, goal, type = 'test', link, cta, copySets = [], ads = [], audiences = [], budget: bud = {}, spendCapCents, startTime, endTime } = spec;
  const want = type === 'advantage' ? 1 : 5;
  if (audiences.length !== want || ads.length !== 5 || copySets.length !== 5) return { ok: false, error: `${type === 'advantage' ? 'An Advantage+ campaign needs 1 audience' : 'A 5 × 5 test needs 5 audiences'}, 5 ads and 5 copy sets (got ${audiences.length}, ${ads.length}, ${copySets.length}).` };
  const made = { campaign: null, adsets: [], creatives: [], ads: [] };
  let dryRun = false;
  const step = async (p, onOk) => { const r = await p; if (!r.ok) return { ok: false, error: r.error, made }; dryRun ||= !!r.dryRun; onOk(r.id); return null; };
  let bad = await step(createCampaign({ name, goal, dailyBudgetCents: bud.campaignDailyCents, spendCapCents }), id => { made.campaign = id; });
  for (const a of ads) if (!bad) bad = await step(createAdCreative({ name: `${name} · ${a.name}`, link, cta, copySets, images: a.images, videoId: a.videoId }), id => made.creatives.push(id));
  for (const [i, aud] of audiences.entries()) if (!bad) bad = await step(createAdSet({ campaignId: made.campaign, name: `${name} · ${aud.name}`, goal, targeting: aud.targeting, dailyBudgetCents: aud.dailyBudgetCents ?? bud.perAdSetDailyCents, startTime, endTime, advantage: type === 'advantage' }), id => made.adsets.push(id));
  for (const setId of made.adsets) for (const [k, creativeId] of made.creatives.entries()) if (!bad) bad = await step(createAd({ adsetId: setId, creativeId, name: `${name} · ${ads[k].name}` }), id => made.ads.push(id));
  return bad || { ok: true, dryRun, made };
}
