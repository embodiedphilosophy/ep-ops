// Circle purchases as ANONYMOUS TOTALS (Ads PR 5). Read only. A purchase from Circle names the member who bought; the name, email and id are dropped on the line they are read.
// What is kept: for each day, product (the paywall or course) and the ad campaign tag if Circle recorded one, how many purchases and how much money.
// NOT VERIFIED against the real Circle: the list's address and field names below are the documented-looking ones; with a key that cannot list purchases the page says so.
import { circleConfigured, circleList } from '../circle';
import { etDay } from '../kit';
import { readProblem } from './insightsverify.js';

const PATHS = ['/paywall_purchases', '/purchases'];
const centsOf = p => {
  if (p.amount_cents != null) return Math.round(Number(p.amount_cents)) || 0;
  const v = p.amount ?? p.total ?? p.price ?? p.net_amount, n = Number(typeof v === 'object' ? v?.amount : v);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
};
const titleOf = p => String(p.paywall?.name || p.paywall_name || p.product?.name || p.product_name || p.course?.name || p.title || p.name || '').trim();

// → { connected, ok, note, rows: [{ day, product, utm_campaign, count, cents }] }
export async function circlePurchaseTotals(sinceIso, untilIso) {
  if (!circleConfigured()) return { connected: false, ok: false, note: 'Circle isn’t connected (CIRCLE_API_TOKEN).', rows: [] };
  let list = null, last = null;
  for (const path of PATHS) {
    try { list = await circleList(path, { timeoutMs: 20000 }); break; }
    catch (e) { last = e; if (e.status !== 404) return { connected: true, ok: false, note: readProblem('Circle', 'purchases', e), rows: [] }; }
  }
  if (!list) return { connected: false, ok: false, note: `Circle doesn’t offer a purchases list to this key: both places we tried (${PATHS.join(' and ')}) answered error ${last?.status || 404}, not found. The key may be the wrong kind (it needs to be an Admin V2 token), or Circle may not share purchases with the API at all. Nothing is guessed; Kit purchases still work.`, rows: [] };
  const out = new Map();
  for (const p of list) {
    const raw = p.created_at || p.purchased_at || p.transaction_time, at = raw && !Number.isNaN(+new Date(raw)) ? new Date(raw).toISOString() : '';
    if (!at || at < sinceIso || at >= untilIso || /refund|fail|cancel/i.test(String(p.status || ''))) continue;
    const product = titleOf(p) || 'Other', utm = String(p.utm_campaign || p.utm?.campaign || p.utm_params?.utm_campaign || '').trim().toLowerCase();
    const day = etDay(at), key = `${day}|${product}|${utm}`, row = out.get(key) || { day, product, utm_campaign: utm, count: 0, cents: 0 };
    row.count += 1; row.cents += centsOf(p); out.set(key, row);
  }
  return { connected: true, ok: true, note: '', rows: [...out.values()] };
}
