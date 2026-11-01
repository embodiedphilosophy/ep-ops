// One-off: fills the Mentee Schedule and Mentee Months tabs from data/mentee-year.json.
//   node --import ./scripts/ce-test/register.mjs scripts/seed-mentee-schedule.mjs            → dry run: prints the rows, writes nothing
//   node --import ./scripts/ce-test/register.mjs scripts/seed-mentee-schedule.mjs --write    → writes (refuses if a tab already has rows)
// Needs CALENDAR_SHEET_ID and the Google service account in the environment. Ask Jacob before running with --write.
import { seedRows, seedMonths, SCHEDULE_HEAD, MONTHS_HEAD } from '../lib/mentee/year.js';
import { TABS } from '../lib/mentee/content.js';

const write = process.argv.includes('--write');
const sched = seedRows(), months = seedMonths();
console.log(`Mentee Schedule: ${sched.filter(r => r.kind === 'step').length} steps + ${sched.filter(r => r.kind === 'review_check').length} review checks`);
for (const r of sched) console.log(`  ${r.step_id.padEnd(48)} ${r.date || ''.padEnd(10)} ${r.project.padEnd(8)} ${r.title.slice(0, 50)}`);
console.log(`Mentee Months: ${months.length} rows`);
if (!write) { console.log('\nDry run: nothing written. Add --write to write.'); process.exit(0); }

const { readPlain, addPlain, createTab } = await import('../lib/ops/store.js');
for (const [tab, head, rows] of [[TABS.schedule, SCHEDULE_HEAD, sched], [TABS.months, MONTHS_HEAD, months]]) {
  let has = null;
  try { has = (await readPlain(tab)).rows.length; } catch { await createTab(tab, head); has = 0; }
  if (has) { console.error(`${tab} already has ${has} rows: refusing to write.`); process.exit(1); }
  for (const r of rows) await addPlain(tab, r, { who: 'seed-script' });
  console.log(`Wrote ${rows.length} rows to ${tab}.`);
}
