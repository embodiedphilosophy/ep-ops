// The sums behind the Ads › Campaigns "In your Meta account" list. No imports, so the page (a browser file) and the server both load it and cannot disagree.
// A row's windows are d7 and d30: { spend_cents, purchases, leads, revenue_cents }. kind is 'purchase', 'lead' or 'other'.

// Below this much spend a return means nothing yet, so it shows as "—" (cents)
export const ENOUGH_CENTS = 500;

// The return for one window: 'roas' (money back for each $1, purchase campaigns) or 'cpl' (cents per lead, lead campaigns). null = too little to say.
export function returnOf(kind, w) {
  if (!w || w.spend_cents < ENOUGH_CENTS) return null;
  if (kind === 'purchase') return { type: 'roas', value: w.revenue_cents / w.spend_cents };
  if (kind === 'lead') return w.leads > 0 ? { type: 'cpl', value: Math.round(w.spend_cents / w.leads) } : { type: 'cpl', value: null };
  return null;
}
// What counts as a result for that kind of campaign
export const resultsOf = (kind, w) => (!w ? 0 : kind === 'purchase' ? w.purchases : kind === 'lead' ? w.leads : 0);

// Totals for a list of rows: all the spend, the purchases (from purchase campaigns), the leads (from lead campaigns), and one blended return across the purchase campaigns only
export function sumRows(rows) {
  const out = { campaigns: rows.length, d7: { spend_cents: 0, purchases: 0, leads: 0, roas: null, purchase_spend_cents: 0, purchase_revenue_cents: 0 }, d30: { spend_cents: 0, purchases: 0, leads: 0, roas: null, purchase_spend_cents: 0, purchase_revenue_cents: 0 } };
  for (const r of rows) for (const k of ['d7', 'd30']) {
    const w = r[k], t = out[k]; if (!w) continue;
    t.spend_cents += w.spend_cents;
    if (r.kind === 'purchase') { t.purchases += w.purchases; t.purchase_spend_cents += w.spend_cents; t.purchase_revenue_cents += w.revenue_cents; }
    if (r.kind === 'lead') t.leads += w.leads;
  }
  for (const k of ['d7', 'd30']) { const t = out[k]; t.roas = t.purchase_spend_cents >= ENOUGH_CENTS ? t.purchase_revenue_cents / t.purchase_spend_cents : null; }
  return out;
}

// ---- The hands-on buttons for campaigns not made in Ops (Pause, Resume, +20%, an exact daily budget). Pure, so the page (to say what a press will do) and the server (to
// check it and do it) use the same sums and cannot disagree. Money is whole cents.
// The most one budget may be raised to: the same $60 a day an Ops-made ad set starts with (the morning rules' ceiling, ensureRules in adsdraft.js). Lowering is always allowed.
export const SET_CEILING_CENTS = 6000;
export const RAISE_PCT = 20;
export const MIN_DAILY_CENTS = 100;
export const dollars = c => '$' + ((c || 0) / 100).toLocaleString('en-US', { minimumFractionDigits: (c || 0) % 100 ? 2 : 0, maximumFractionDigits: 2 });

// Where a campaign's daily budget lives, from Meta's own words. c = { id, name, daily_budget, lifetime_budget }; sets = that campaign's ad sets [{ id, name, status, daily_budget, lifetime_budget }]
// (sets = null when they could not be read). → { mode: 'campaign' | 'adsets' | 'none', units: [{ id, name, cents }], why }
export function budgetPlan(c, sets) {
  const day = Number(c.daily_budget) || 0, life = Number(c.lifetime_budget) || 0;
  if (day > 0) return { mode: 'campaign', units: [{ id: c.id, name: c.name || 'the campaign', cents: day }], why: '' };
  if (life > 0) return { mode: 'none', units: [], why: 'This campaign has a lifetime budget (one amount for its whole run), not a daily one, so it can only be paused or resumed here.' };
  if (!sets) return { mode: 'none', units: [], why: 'Its ad sets couldn’t be read just now, so the budget buttons are off. Press Refresh and try again.' };
  const on = sets.filter(s => s.status === 'ACTIVE');
  if (on.some(s => !(Number(s.daily_budget) > 0) && Number(s.lifetime_budget) > 0)) return { mode: 'none', units: [], why: 'Some of its ad sets have a lifetime budget (one amount for the whole run), so it can only be paused or resumed here.' };
  const units = on.filter(s => Number(s.daily_budget) > 0).map(s => ({ id: s.id, name: s.name || 'an ad set', cents: Number(s.daily_budget) }));
  if (!units.length) return { mode: 'none', units: [], why: 'It has no daily budget to change (none on the campaign, and none on a running ad set), so it can only be paused or resumed here.' };
  return { mode: 'adsets', units, why: '' };
}
export const totalOf = units => units.reduce((n, u) => n + u.cents, 0);
// +20%, rounded to the cent the way the morning rules round it
export const raised = (units, pct = RAISE_PCT) => units.map(u => ({ ...u, to: Math.round(u.cents * (1 + pct / 100)) }));
// An exact total a day. One budget: that amount. Ad sets: shared out in proportion to what each has now (the leftover cents go to the biggest first).
export function shareOut(units, total) {
  const sum = totalOf(units), out = units.map(u => ({ ...u, to: Math.floor((total * u.cents) / sum) }));
  let left = total - out.reduce((n, u) => n + u.to, 0);
  for (const u of [...out].sort((a, b) => b.cents - a.cents)) { if (left <= 0) break; u.to++; left--; }
  return out;
}
// Raising any one budget above the ceiling is refused; lowering is fine. → the first one that is over, or null
export const overCeiling = (changed, ceiling = SET_CEILING_CENTS) => changed.find(u => u.to > u.cents && u.to > ceiling) || null;
export const underMinimum = changed => changed.find(u => u.to < MIN_DAILY_CENTS) || null;
// What the person typed ("40", "40.50", "$40") → cents, or null
export function parseDollars(v) {
  const t = String(v ?? '').trim().replace(/^\$/, '').replace(/,/g, '');
  if (!/^\d{1,7}(\.\d{1,2})?$/.test(t)) return null;
  return Math.round(Number(t) * 100);
}
const list = us => us.map(u => `${u.name} ${dollars(u.cents)} → ${dollars(u.to)}`).join(', ');
// The "are you sure?" words for a press. row = { name, d7?, act: { budget: plan } }. changed = the units with their new amounts (budget presses only).
export function confirmText(what, row, changed, { live = true } = {}) {
  const plan = row.act?.budget, now = plan?.units?.length ? totalOf(plan.units) : 0, perDay = row.d7?.spend_cents ? Math.round(row.d7.spend_cents / 7) : 0;
  const spending = perDay ? `spending ${dollars(perDay)} a day` : now ? `budget ${dollars(now)} a day` : '';
  const name = `“${row.name}”`, tail = live ? '' : '\n\nLive changes are off here, so this will only be recorded: Meta will not be changed.';
  const undo = 'You can reverse this afterwards.';
  if (what === 'pause') return `Pause ${name}${spending ? ` (${spending})` : ''}?\n\nMeta will stop spending on it. Nothing about its ads or audiences is touched. ${undo}${tail}`;
  if (what === 'resume') return `Resume ${name}${now ? ` (budget ${dollars(now)} a day)` : ''}?\n\nMeta will start spending on it again. Nothing about its ads or audiences is touched. ${undo}${tail}`;
  const sets = plan.mode === 'adsets', n = plan.units.length, newTotal = totalOf(changed.map(u => ({ cents: u.to })));
  const where = sets ? `Its budget sits on its ${n} running ad set${n === 1 ? '' : 's'}, so that is where it changes: ${list(changed)}.` : '';
  if (what === 'raise') return `Raise the daily budget of ${name} by ${RAISE_PCT}%, from ${dollars(now)} to ${dollars(newTotal)} a day?\n\n${where ? where + ' ' : ''}${undo}${tail}`;
  return `Set the daily budget of ${name} to ${dollars(newTotal)} a day (now ${dollars(now)})?\n\n${sets ? `It is shared across its ${n} running ad set${n === 1 ? '' : 's'} in proportion to today: ${list(changed)}. ` : ''}${undo}${tail}`;
}
