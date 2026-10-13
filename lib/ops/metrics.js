import { readRange } from '../google';

// Insights reads the "EP Revenue & Metrics System (2026)" sheet, which Make keeps filled from Stripe, PayPal
// and Meta (the sheet must be shared, Viewer, with the website's service account). Nothing is recalculated
// here that the sheet already calculates: P&L, Budget, Config, Overview and the Ad Agent are read as they are.
// Vercel (optional): METRICS_SHEET_ID
const SHEET = () => process.env.METRICS_SHEET_ID || '1gK_02Szjd76AYEUCNcUHAXZtJZh5PYIwSpzrek4OSYs';
export const METRICS_URL = () => `https://docs.google.com/spreadsheets/d/${SHEET()}/edit`;

// "$14,868" → 14868 · "($12,072)" → -12072 · "2.02x" → 2.02 · "28.4%" → 28.4 · "-" / "" → 0
export function num(v) {
  const s = String(v ?? '').trim();
  if (!s || s === '-' || s === '—') return 0;
  const neg = /^\(.*\)$/.test(s) || s.startsWith('-');
  const n = Number(s.replace(/[^0-9.]/g, ''));
  return isNaN(n) ? 0 : neg ? -n : n;
}
const clean = s => String(s ?? '').trim();
const MONTH = /^\d{4}-\d{2}$/;

// A tab laid out as Line | 2026-01 | 2026-02 … → { months, rows: [{ line, mapsTo, type, byMonth: { '2026-09': n } }] }
function byMonthTable(values, { mapsTo = false } = {}) {
  const h = values.findIndex(r => clean(r[0]) === 'Line');
  if (h < 0) return { months: [], rows: [] };
  const head = values[h].map(clean);
  const months = head.map((c, i) => [c, i]).filter(([c]) => MONTH.test(c));
  const rows = values.slice(h + 1).filter(r => clean(r[0])).map(r => ({
    line: clean(r[0]), mapsTo: mapsTo ? clean(r[1]) : '', type: mapsTo ? clean(r[2]) : '',
    byMonth: Object.fromEntries(months.map(([m, i]) => [m, num(r[i])])),
  }));
  return { months: months.map(([m]) => m), rows };
}
const pairs = values => Object.fromEntries(values.filter(r => clean(r[0])).map(r => [clean(r[0]), clean(r[1])]));

export async function loadMetrics() {
  const read = range => readRange(SHEET(), range); // cached 5 minutes, like every sheet read
  const [pl, budget, config, overview, agent] = await Promise.all([
    read("'P&L'!A1:AA80"), read("'Budget'!A1:AB60"), read("'Config'!A1:B30"), read("'Overview'!A1:C60"), read("'Ad Agent'!A1:V200"),
  ]);
  const P = byMonthTable(pl), B = byMonthTable(budget, { mapsTo: true });
  const cfg = pairs(config), ov = pairs(overview);
  const line = name => P.rows.find(r => r.line.toLowerCase().startsWith(name.toLowerCase()))?.byMonth || {};

  // Programs: the P&L revenue lines (between REVENUE and Gross revenue), each with its Budget plan
  const start = P.rows.findIndex(r => r.line === 'REVENUE'), end = P.rows.findIndex(r => r.line === 'Gross revenue');
  const programs = P.rows.slice(start + 1, end).map(r => ({
    name: r.line, actual: r.byMonth,
    plan: Object.fromEntries(P.months.map(m => [m, B.rows.filter(b => b.type === 'Revenue' && b.mapsTo === r.line).reduce((s, b) => s + (b.byMonth[m] || 0), 0)])),
  }));
  const gross = line('Gross revenue'), ads = line('Meta ad spend');
  // Planned Meta spend comes from the Budget tab's 'Ad spend' lines (the P&L only carries budgeted revenue)
  const budgetAds = Object.fromEntries(B.months.map(m => [m, B.rows.filter(b => b.type === 'Ad spend').reduce((s, b) => s + (b.byMonth[m] || 0), 0)]));
  const monthly = P.months.map(m => ({
    month: m, gross: gross[m] || 0, net: line('Net revenue')[m] || 0, ads: ads[m] || 0,
    afterAds: line('Net revenue after ads')[m] || 0, opex: line('Total operating expenses')[m] || 0,
    profit: line('Net operating profit')[m] || 0, plan: line('Budgeted revenue')[m] || 0, planAds: line('Budgeted ad spend')[m] || budgetAds[m] || 0,
    roas: ads[m] ? (gross[m] || 0) / ads[m] : 0,
    // Nothing imported yet for this month (no sales or ad spend on the Transactions / Ad Spend tabs)
    imported: !!(gross[m] || ads[m] || line('Refunds')[m] || line('Processor fees')[m]),
  }));

  // Ad sets as the Ad Agent judged them (newest 7-day window)
  const ah = agent.findIndex(r => clean(r[0]) === 'Ad Set ID');
  const adSets = ah < 0 ? [] : agent.slice(ah + 1).filter(r => clean(r[0])).map(r => ({
    id: clean(r[0]), name: clean(r[1]), campaign: clean(r[2]), product: clean(r[3]), spend: num(r[5]), purchases: num(r[6]),
    value: num(r[7]), roas: num(r[8]), leads: num(r[9]), cpl: num(r[10]), tier: clean(r[13]), action: clean(r[14]), why: clean(r[15]), status: clean(r[16]),
  }));
  const agentCfg = pairs(agent.slice(0, ah < 0 ? 20 : ah));

  const pick = (o, prefix) => o[Object.keys(o).find(k => k.toLowerCase().startsWith(prefix.toLowerCase()))] || '';
  return {
    months: P.months, monthly, programs, adSets,
    budgetLines: B.rows.filter(b => b.type === 'Revenue').map(b => ({ line: b.line, mapsTo: b.mapsTo, byMonth: b.byMonth })),
    goal: num(pick(cfg, 'Revenue-after-ads goal')) || 1000000,
    roasTarget: num(pick(cfg, 'ROAS target')) || 1.5,
    adCeiling: num(pick(cfg, 'Ad spend ceiling')) || 20,
    afterAdsTotal: num(pick(ov, 'Revenue after ads, all months')),
    monthsToGoal: num(pick(ov, 'Months to goal')),
    cash: num(pick(ov, 'Relay balance')), cashAsOf: pick(ov, 'Balance as of'), runway: num(pick(ov, 'Runway')),
    pauseBelow: num(pick(agentCfg, 'Pause below ROAS')) || 1.5, mode: pick(agentCfg, 'Mode'),
  };
}
