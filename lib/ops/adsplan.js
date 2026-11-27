// What an ads switch starts from, worked out from the launch alone (no database, no Meta), so the launch wizard on screen and the server agree.
// The launch's playbooks carry no ads settings, so the starting budget by playbook is here; it is edited on the campaign afterwards.
const BUDGET_BY_PLAYBOOK = { 'PB-enrol': 10000, 'PB-event': 5000, 'PB-countdown': 6000, 'PB-festival': 5000, 'PB-offer': 5500 };   // cents a day (a targeting test spreads it over 5 ad sets)
export const startingBudget = (playbookId, structure) => structure === 'advantage' ? 6000 : (BUDGET_BY_PLAYBOOK[playbookId] || 5000);

const addDays = (d, n) => { const x = new Date(d + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const ok = d => /^\d{4}-\d{2}-\d{2}$/.test(d || '');
// Start and end come from the launch's key dates: doors open and doors close when it has them, else two weeks before the day, to the day
export function adDates(dates) {
  const d = dates || {}, start = ok(d.open) ? d.open : ok(d.event) ? addDays(d.event, -14) : '', end = ok(d.close) ? d.close : ok(d.event) ? d.event : ok(d.term) ? d.term : '';
  return { start_date: start, end_date: end };
}

// The morning rules start from these (the handoff's: return 1.5×, cost per lead $1.50), then are edited on the campaign. Y = raise_threshold, Z = off_threshold.
export const RULE_DEFAULTS = {
  Purchase: { metric: 'roas', raise_threshold: 1.5, off_threshold: 1.2 }, Lead: { metric: 'cpl', raise_threshold: 1.5, off_threshold: 2.5 },
};
