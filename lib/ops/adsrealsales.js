// REAL SALES for the ads system. Meta reports the purchases it thinks an ad caused, and it can over- or under-count. This reads the purchases that actually happened in Kit and in
// Circle (read only) and matches them to an Ops-made campaign by the campaign tag on the ad's link (utm_campaign, set by lib/ops/adsdraft.js `utmFor`).
//
// THE RULE: real sales may only make the system MORE cautious about spending, never less.
//   - Kit and Circle are two separate sources. A buyer can show up in both, and Ops keeps no buyer to tell, so the two are NEVER added together: a campaign's real sales are the LARGER of
//     the two (never the sum). If they really are different buyers this understates real sales, which only ever leads to more caution.
//   - Only anonymous totals are ever held: day, product, campaign tag, count, cents (what kitPurchaseTotals and circlePurchaseTotals return). No buyer, email or id is read here.
//   - A campaign can be matched only when it has its own campaign tag, no other Ops campaign shares it, and the sources show that tagging works at all (some purchase in the last 30 days
//     arrived with a tag). Otherwise "Meta's number only".
//   - One read per run, with a time limit; a source that can't be read never throws: it comes back { ok: false, note } and the callers hold (never raise) because of it.
import { kitConfigured, kitPurchaseTotals } from '../kit.js';
import { circlePurchaseTotals } from './circlepurchases.js';
import { readProblem } from './insightsverify.js';
import { peekRows } from './adsstore.js';

const LOOKBACK_DAYS = 30;           // how far back purchases are read: enough to see whether the campaign tag arrives at all
const READ_MS = 30000;                      // longest the Kit read may take (Circle has its own 20-second limit)
export const STATE_KEY = 'real_sales_state';
const x2 = v => `${+Number(v).toFixed(2)}×`;
const usd = c => `$${((c || 0) / 100).toLocaleString('en-US', { minimumFractionDigits: c % 100 ? 2 : 0, maximumFractionDigits: 2 })}`;

async function readKit(since, until) {
  if (!kitConfigured()) return { connected: false, ok: false, note: 'Kit isn’t connected.', rows: [] };
  try { return { connected: true, ok: true, note: '', rows: await kitPurchaseTotals(since, until, { maxMs: READ_MS }) }; }
  catch (e) { return { connected: true, ok: false, note: readProblem('Kit', 'purchases', e), rows: [] }; }
}
async function readCircle(since, until) {
  try { const r = await circlePurchaseTotals(since, until); return { connected: !!r.connected, ok: !!(r.connected && r.ok), note: r.note || '', rows: r.ok ? r.rows : [] }; }
  catch (e) { return { connected: true, ok: false, note: readProblem('Circle', 'purchases', e), rows: [] }; }
}

// → { kit, circle, readable, tagged, at }.  Never throws. `cache` (a Map the caller makes once per run) keeps it to one read per run.
export async function readRealSales({ now = new Date(), cache } = {}) {
  const key = 'sales';
  if (cache?.has(key)) return cache.get(key);
  const until = new Date(new Date(now).getTime() + 60e3).toISOString(), since = new Date(new Date(now).getTime() - LOOKBACK_DAYS * 864e5).toISOString();
  const [kit, circle] = await Promise.all([readKit(since, until), readCircle(since, until)]);
  const out = { kit, circle, readable: kit.ok || circle.ok, tagged: [kit, circle].some(s => s.ok && s.rows.some(r => r.utm_campaign)), at: new Date(now).toISOString() };
  cache?.set(key, out);
  return out;
}

// The campaign tags in use, to tell which are shared (a tag shared by two Ops campaigns can't say which one a sale belongs to)
const slugOf = c => String(c?.utm?.utm_campaign || '').trim().toLowerCase();
export function tagCounts(campaigns) {
  const n = new Map();
  for (const c of campaigns) if (c.meta_campaign_id && slugOf(c)) n.set(slugOf(c), (n.get(slugOf(c)) || 0) + 1);
  return n;
}
const within = (rows, from, to) => rows.filter(r => r.day >= from && r.day <= to);
const total = rows => rows.reduce((t, r) => ({ count: t.count + r.count, cents: t.cents + r.cents }), { count: 0, cents: 0 });

// One campaign's real sales over the full days from..to, set beside what Meta reported for the same days. Pure.
// meta: { spend_cents, revenue_cents, purchases }. tags: tagCounts(). Returns everything the rules, the safety net and the page need (aggregates only).
export function realFor({ sales, campaign, tags, from, to, meta }) {
  const slug = slugOf(campaign), per = s => (s.ok ? total(within(s.rows.filter(r => slug && r.utm_campaign === slug), from, to)) : null);
  const kit = sales?.kit ? per(sales.kit) : null, circle = sales?.circle ? per(sales.circle) : null;
  const have = [kit, circle].filter(Boolean), best = have.reduce((b, x) => (x.cents > b.cents ? x : b), { count: 0, cents: 0 });
  const r = { readable: !!sales?.readable, attributable: false, why: '', slug, kit, circle, count: best.count, cents: best.cents, spend_cents: meta.spend_cents, meta_cents: meta.revenue_cents, meta_purchases: meta.purchases };
  if (!r.readable) r.why = 'Ops couldn’t read your real sales (Kit and Circle)';
  else if (!slug) r.why = 'this campaign has no campaign tag on its link, so its sales can’t be matched to it';
  else if ((tags.get(slug) || 0) > 1) r.why = 'another campaign uses the same campaign tag, so its sales can’t be told apart';
  else if (!sales.tagged) r.why = 'none of your recent Kit or Circle purchases arrived with a campaign tag, so sales can’t be matched to ads yet';
  else r.attributable = true;
  r.roas = r.attributable && meta.spend_cents > 0 ? Math.round((r.cents / meta.spend_cents) * 100) / 100 : null;
  // the share of Meta's revenue that real sales back up, never more than 1: real sales can only lower a judgement
  r.factor = r.attributable ? (meta.revenue_cents > 0 ? Math.min(1, r.cents / meta.revenue_cents) : 1) : 1;
  return r;
}

// How an ad set's Meta return is judged once real sales are known.
// → { value, canRaise, line, why }.  value: the number the rules judge on (Meta's, lowered when real sales are lower). canRaise: real sales allow a budget raise at all.
// Without real sales the rules may still turn something off on Meta's number, but they never raise.
export function judge(real, metaValue) {
  if (!real || !real.readable) return { value: metaValue, canRaise: false, line: 'Real sales couldn’t be read', why: 'Ops couldn’t read your real sales (Kit and Circle)' };
  if (!real.attributable) return { value: metaValue, canRaise: false, line: 'Meta’s number only', why: real.why };
  const value = metaValue == null ? null : Math.round(metaValue * real.factor * 100) / 100, spent = real.spend_cents > 0;
  const line = real.factor < 1 ? `Meta says ${x2(metaValue)} for this ad set, real sales say ${spent ? x2(real.roas) : 'nothing yet'} for the whole campaign, so it is judged at ${value == null ? 'nothing' : x2(value)}`
    : `Real sales agree with Meta (${spent ? x2(real.roas) : 'nothing yet'} for the whole campaign)`;
  return { value, canRaise: true, line, why: '' };
}

// ---- Keeping and showing the latest reading (written by the hourly safety net, read by the campaign page; neither calls Kit or Circle on a page load)
export async function readRealState() { try { return (await peekRows('settings', { key: STATE_KEY }, { limit: 1 }))[0]?.value || null; } catch { return null; } }
// The sentences a campaign's page shows (plain English), or null if the safety net has not made a reading yet
export function realLines(state, campaignId, now = Date.now()) {
  if (!state || now - new Date(state.at).getTime() > 6 * 3600e3) return null;   // an old reading is not shown as if it were current
  const when = state.window ? `${state.window.from} to ${state.window.to}` : 'the last 3 full days';
  if (!state.readable) return [`Your real sales couldn’t be read at the last check, so the rules will not raise this budget. ${[state.sources?.kit, state.sources?.circle].filter(s => s && !s.ok && s.note).map(s => s.note.replace(/ The other sources still work\.$/, '')).join(' ')}`.trim()];
  const c = state.campaigns?.[campaignId];
  if (!c) return null;
  const out = [];
  if (!c.attributable) out.push(`Meta’s number only: ${c.why}. Until it can be matched, the rules will not raise this campaign’s budget.`);
  else out.push(`Meta says ${c.meta_roas == null ? 'nothing yet' : x2(c.meta_roas)}; real sales say ${c.real_roas == null ? 'nothing yet' : x2(c.real_roas)} (${c.count} real purchase${c.count === 1 ? '' : 's'}, ${usd(c.cents)}, ${when}). Kit and Circle are never added together: the larger one counts.`);
  const u = state.unmatched, n = Math.max(u?.kit?.count || 0, u?.circle?.count || 0);
  if (n) out.push(`${n} real sale${n === 1 ? '' : 's'} in that time had no matching campaign tag, so ${n === 1 ? 'it is' : 'they are'} not counted for any campaign.`);
  return out;
}

// The anonymous aggregate the safety net keeps: per Ops campaign plus what could not be matched
export function stateOf({ sales, campaigns, tags, from, to, metaOf, now }) {
  const sources = { kit: { ok: sales.kit.ok, note: sales.kit.ok ? '' : sales.kit.note }, circle: { ok: sales.circle.ok, note: sales.circle.ok ? '' : sales.circle.note } };
  const out = { at: new Date(now).toISOString(), window: { from, to }, readable: sales.readable, sources, tagged: sales.tagged, campaigns: {}, unmatched: {} };
  if (!sales.readable) return out;
  for (const c of campaigns) {
    const m = metaOf(c), r = realFor({ sales, campaign: c, tags, from, to, meta: m });
    out.campaigns[c.id] = { attributable: r.attributable, why: r.why, count: r.count, cents: r.cents, spend_cents: m.spend_cents, meta_roas: m.spend_cents > 0 ? Math.round((m.revenue_cents / m.spend_cents) * 100) / 100 : null, real_roas: r.roas };
  }
  const known = new Set([...tags.keys()]);
  for (const k of ['kit', 'circle']) if (sales[k].ok) out.unmatched[k] = total(within(sales[k].rows.filter(r => !r.utm_campaign || !known.has(r.utm_campaign)), from, to));
  return out;
}
