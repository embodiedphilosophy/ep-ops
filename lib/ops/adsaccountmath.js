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
