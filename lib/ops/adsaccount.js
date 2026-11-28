// Ads › Campaigns › "In your Meta account" (Ads account view). Every campaign in the REAL ad account, however it was made (Ops, Ads Manager, Make's Ad Agent), with its last 7 and 30 full
// days. This file only LOOKS: it uses the client's read functions only (account, campaigns, ad sets, campaign results a day at a time), writes nothing to Meta and makes no table.
// The hands-on buttons for the campaigns not made in Ops (Pause, Resume, +20%, an exact budget, Reverse) are in adsmanual.js, behind the one write gate; they only ever bring this kept
// look in line afterwards (noteChange). There are no automatic rules for these campaigns. Make's Ad Agent keeps doing its own work.
//
// Meta calls per fresh look: 1 (the account, for its time zone) + the campaigns (paged) + the ad sets (paged) + 31 days of results per campaign (paged). The answer is kept in this process
// for 5 minutes, so opening the page again costs nothing; "Refresh" asks Meta again, at most once a minute per person. A failed look is kept for a minute so a rate limit isn't hammered, and the
// last good look (if any) is shown beside the plain-English reason. Nothing here throws for what Meta says.
//
// "Needs a look" is the safety net's own judgement (evaluate() in adswatch.js, with the same thresholds from Settings): running past its end time, no end date and no cap, spending with nothing
// to show, return under the floor. "Made in Ops" is a campaign whose Meta id is in ads_campaigns (looked up only when the Ads tables exist; nothing is made to look).
import { hasToken, listAllCampaigns, listAllAdSets, getAccount, getAccountInsights, managerUrl, RATE_LIMIT_CODES } from './meta-ads.js';
import { adsTablesExist, peekRows } from './adsstore.js';
import { getConfig, DEFAULT_CONFIG } from './alerts.js';
import { evaluate, dayIn } from './adswatch.js';
import { addDays } from './adssync.js';
import { returnOf, resultsOf, sumRows, budgetPlan } from './adsaccountmath.js';

const NY = 'America/New_York', HOUR = 3600e3, TTL = 5 * 60e3, FAIL_TTL = 60e3, REFRESH_GAP = 60e3;
const REASON = {
  permission: 'Meta didn’t accept the ads access key. It may have expired, or it may not be allowed to read ads. Check the key in Vercel (Settings › Connections and jobs shows what is set).',
  rate_limit: 'Meta asked us to slow down (too many requests). Give it a few minutes and press Refresh.',
  timeout: 'Meta took too long to answer. Try again in a minute.',
  network: 'Couldn’t reach Meta (a network problem). Try again in a minute.',
  other: 'Meta answered with an error. Try again in a minute; if it keeps happening, tell Jacob.',
};
const NOT_CONNECTED = 'Meta isn’t connected yet: add the ads access key (META_ADS_TOKEN) in Vercel. Settings › Connections and jobs shows what is missing.';

// What went wrong, in one of five plain classes (never Meta's own wording: it can carry ids)
export function classify(r) {
  if (r?.notConnected) return 'not_connected';
  if (RATE_LIMIT_CODES.includes(r?.code)) return 'rate_limit';
  if (r?.timeout) return 'timeout';
  if (r?.network) return 'network';
  if ([10, 102, 190].includes(r?.code) || (r?.code >= 200 && r?.code <= 299) || [401, 403].includes(r?.status)) return 'permission';
  return 'other';
}

// ---- Looking at Meta (cached in this process)
let cache = null, inflight = null, lastGood = null;
const accountKey = () => (process.env.META_AD_ACCOUNT_ID || '').trim();
const refreshes = new Map();   // person → when they last pressed Refresh

async function look(now) {
  const t = now.getTime(), account = await getAccount();
  if (account.notConnected) return { state: 'not_connected', at: t, message: account.error };
  if (!account.ok && ['rate_limit', 'permission'].includes(classify(account))) return { state: 'error', at: t, reason: classify(account), message: REASON[classify(account)] };
  const tz = (account.ok && account.timezone_name) || NY, today = dayIn(now, tz), since = addDays(today, -30);
  const [campaigns, adsets, insights] = await Promise.all([listAllCampaigns(), listAllAdSets(), getAccountInsights({ level: 'campaign', since, until: today })]);
  if (campaigns.notConnected) return { state: 'not_connected', at: t, message: campaigns.error };
  if (!campaigns.ok) { const c = classify(campaigns); return { state: 'error', at: t, reason: c, message: REASON[c] }; }
  const notes = [];
  if (campaigns.truncated) notes.push('This ad account has more campaigns than could be read in one go, so the list stops short.');
  if (!adsets.ok) notes.push(`Ad set details couldn’t be read just now (${REASON[classify(adsets)].split('.')[0].toLowerCase()}), so “no end date” warnings are left out this time.`);
  if (!insights.ok) notes.push(`Spending and results couldn’t be read just now (${REASON[classify(insights)].split('.')[0].toLowerCase()}), so those columns show “—”.`);
  else if (insights.truncated) notes.push('There were more results than could be read in one go, so the spending shown may be a little short.');
  return { state: notes.length ? 'partial' : 'ok', at: t, tz, today, account, campaigns, adsets, insights, adsetsOk: adsets.ok, insightsOk: insights.ok, notes };
}

// force = Refresh (the caller has already checked the once-a-minute rule). Returns the snapshot and whether it came from the cache.
async function snapshot({ force = false, now = new Date() } = {}) {
  if (!hasToken()) return { snap: { state: 'not_connected', at: now.getTime(), message: NOT_CONNECTED }, cached: false };
  const t = now.getTime(), key = accountKey();
  if (!force && cache && cache.key === key && t - cache.snap.at < (cache.snap.state === 'error' ? FAIL_TTL : TTL)) return { snap: cache.snap, cached: true };
  if (inflight && inflight.key === key) return { snap: await inflight.p, cached: false };
  const p = look(now).then(snap => { cache = { key, snap }; if (snap.state === 'ok' || snap.state === 'partial') lastGood = { key, snap }; return snap; }).finally(() => { inflight = null; });
  inflight = { key, p };
  return { snap: await p, cached: false };
}

// Once a minute per person. Returns 0 when they may, else the seconds to wait.
export function refreshWait(who, now = Date.now()) {
  const wait = REFRESH_GAP - (now - (refreshes.get(who) || 0));
  return wait > 0 ? Math.ceil(wait / 1000) : 0;
}
export function noteRefresh(who, now = Date.now()) {
  refreshes.set(who, now);
  if (refreshes.size > 200) for (const [k, v] of refreshes) if (now - v > REFRESH_GAP) refreshes.delete(k);
}
// Tests only: forget what was seen (a new look is made next time)
export function forgetAccountCache() { cache = null; inflight = null; lastGood = null; refreshes.clear(); }

// After a button changed a campaign in Meta, the kept look is brought in line (no new look: that would be 31 days of results for every campaign). what = { status?, units?: [{ id, to }] }
export function noteChange(metaId, what) {
  for (const k of new Set([cache?.snap, lastGood?.snap].filter(Boolean))) {
    const c = (k.campaigns?.data || []).find(x => x.id === metaId);
    if (c && what.status) { c.status = what.status; c.effective_status = what.status; }
    for (const u of what.units || []) {
      if (c && u.id === c.id) c.daily_budget = String(u.to);
      const a = (k.adsets?.data || []).find(x => x.id === u.id && x.campaign_id === metaId);
      if (a) a.daily_budget = String(u.to);
    }
  }
}

// ---- Turning what Meta said into rows (pure)
const STATUS = {
  ACTIVE: ['active', 'Active', 'good'], WITH_ISSUES: ['active', 'Active, with an issue', 'warn'], IN_PROCESS: ['review', 'Being set up', 'calm'],
  PAUSED: ['paused', 'Paused', 'calm'], CAMPAIGN_PAUSED: ['paused', 'Paused', 'calm'], ADSET_PAUSED: ['paused', 'Paused', 'calm'],
  ARCHIVED: ['archived', 'Archived', 'calm'], DELETED: ['deleted', 'Deleted', 'calm'],
};
const kindOf = objective => (/LEAD/i.test(objective || '') ? 'lead' : /SALES|CONVERSIONS|CATALOG/i.test(objective || '') ? 'purchase' : 'other');
const NO_END = /^Running with no end date/;

function windowsOf(rows, today) {
  const sum = (from) => rows.filter(r => r.date >= from && r.date < today).reduce((w, r) => ({ spend_cents: w.spend_cents + r.spend_cents, purchases: w.purchases + r.purchases, leads: w.leads + r.leads, revenue_cents: w.revenue_cents + r.revenue_cents }), { spend_cents: 0, purchases: 0, leads: 0, revenue_cents: 0 });
  return { d7: sum(addDays(today, -7)), d30: sum(addDays(today, -30)) };
}

export function buildRows(snap, { cfg = DEFAULT_CONFIG, ops = [], now = new Date() } = {}) {
  const tz = snap.tz || NY, today = snap.today || dayIn(now, tz), t = now.getTime();
  const opsBy = new Map(ops.filter(o => o.meta_campaign_id && !String(o.meta_campaign_id).startsWith('dryrun-')).map(o => [o.meta_campaign_id, o]));
  const ev = evaluate({ account: { ok: false }, campaigns: snap.campaigns, adsets: snap.adsetsOk ? snap.adsets : { ok: false }, issues: null, acct: { ok: false },
    camp: snap.insightsOk ? { ok: true, rows: snap.insights.rows } : { ok: true, rows: [] }, pixel: null, ops, tz, today }, cfg, now);
  const flagged = new Map(ev.flagged.map(f => [f.id, f.problems]));
  const byCamp = new Map();
  for (const r of snap.insightsOk ? snap.insights.rows : []) { if (!byCamp.has(r.campaign_id)) byCamp.set(r.campaign_id, []); byCamp.get(r.campaign_id).push(r); }
  const sets = snap.adsetsOk ? snap.adsets.data || [] : [];
  const day = iso => (iso ? dayIn(iso, tz) : '');
  const rows = (snap.campaigns.data || []).map(c => {
    const eff = c.effective_status || c.status, [key0, word0, tone0] = STATUS[eff] || ['other', String(eff || 'Unknown').toLowerCase().replace(/[^a-z ]+/g, ' ').trim().replace(/^./, x => x.toUpperCase()), 'calm'];
    const ended = c.stop_time && Date.parse(c.stop_time) < t - 2 * HOUR && key0 !== 'active' && key0 !== 'archived' && key0 !== 'deleted';
    const [key, word, tone] = ended ? ['ended', 'Ended', 'calm'] : [key0, word0, tone0];
    const live = sets.filter(s => s.campaign_id === c.id && s.effective_status === 'ACTIVE'), setBudget = live.reduce((n, s) => n + (Number(s.daily_budget) || 0), 0);
    const budget = Number(c.daily_budget) ? { kind: 'daily', cents: Number(c.daily_budget) } : Number(c.lifetime_budget) ? { kind: 'lifetime', cents: Number(c.lifetime_budget) }
      : setBudget ? { kind: 'daily', cents: setBudget, on_ad_sets: true } : null;
    const kind = kindOf(c.objective), w = snap.insightsOk ? windowsOf(byCamp.get(c.id) || [], today) : { d7: null, d30: null };
    const plan = budgetPlan(c, snap.adsetsOk ? sets.filter(x => x.campaign_id === c.id) : null);   // what the buttons may do, and what the page looked like when it was opened (sent back, so a change made in Meta since is noticed)
    const o = opsBy.get(c.id), mine = (k) => (w[k] ? { ...w[k], results: resultsOf(kind, w[k]), ret: returnOf(kind, w[k]) } : null);
    return {
      id: c.id, name: c.name || 'Unnamed campaign', objective: c.objective || '', kind, status: key, status_word: word, status_tone: tone, effective_status: eff,
      made_in_ops: !!o, ops_id: o?.id || '', budget, start: day(c.start_time), end: day(c.stop_time), no_end: !c.stop_time,
      act: { pause: c.status === 'ACTIVE', resume: c.status === 'PAUSED', budget: plan, seen: { status: c.status, units: plan.units.map(u => ({ id: u.id, cents: u.cents })) } },
      d7: mine('d7'), d30: mine('d30'), needs: [...new Set((flagged.get(c.id) || []).filter(p => snap.adsetsOk || !NO_END.test(p)))], manager_url: managerUrl(c.id),
    };
  });
  rows.sort((a, b) => (b.d30?.spend_cents || 0) - (a.d30?.spend_cents || 0) || a.name.localeCompare(b.name));
  return rows;
}

// ---- What the API sends. who = the person's email (for the once-a-minute Refresh rule).
export async function accountView({ refresh = false, who = '', now = new Date() } = {}) {
  let throttled = 0;
  if (refresh) { throttled = refreshWait(who, now.getTime()); if (!throttled) noteRefresh(who, now.getTime()); }
  const { snap, cached } = await snapshot({ force: refresh && !throttled, now });
  const out = { status: { state: snap.state, as_of: new Date(snap.at).toISOString(), cached, message: snap.message || '', reason: snap.reason || '', notes: snap.notes || [], stale: false }, rows: [], totals: null };
  if (throttled) out.status.refresh_wait = throttled;
  if (snap.state === 'not_connected') return out;
  const use = snap.state === 'error' ? (lastGood && lastGood.key === accountKey() ? lastGood.snap : null) : snap;
  if (!use) return out;
  if (use !== snap) { out.status.stale = true; out.status.as_of = new Date(use.at).toISOString(); }
  let cfg = DEFAULT_CONFIG, ops = [];
  try { cfg = await getConfig(); } catch { /* the safety net's own thresholds; the starting values are used when they can't be read */ }
  try { if (await adsTablesExist()) ops = await peekRows('campaigns', {}, { limit: 500 }); } catch { /* no Ads database: nothing is marked "Made in Ops" */ }
  out.rows = buildRows(use, { cfg, ops, now });
  out.totals = sumRows(out.rows);
  out.status.tz = use.tz || NY;
  return out;
}
