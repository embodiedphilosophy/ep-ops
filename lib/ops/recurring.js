import { readPlain } from './store';
import { listTasks, createTask } from './taskstore';
import { todayET } from '../events';

const slug = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const parts = d => d.split('-').map(Number);
const iso = (y, m, d) => new Date(Date.UTC(y, m - 1, d, 12)).toISOString().slice(0, 10);
const daysIn = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();

// The first date on or after `from` that a row repeats on, or '' if the row can't be read.
// weekly: day = a weekday name · monthly: day = day of the month (31 means the last day of short months)
export function nextOccurrence({ every, day }, from) {
  const kind = String(every).trim().toLowerCase(), d = String(day).trim().toLowerCase();
  const [y, m, dd] = parts(from);
  if (kind === 'weekly') {
    const wd = WEEKDAYS.findIndex(w => w.startsWith(d.slice(0, 3)));
    if (wd < 0 || d.length < 3) return '';
    const here = new Date(Date.UTC(y, m - 1, dd, 12)).getUTCDay();
    return iso(y, m, dd + ((wd - here + 7) % 7));
  }
  if (kind === 'monthly') {
    const n = parseInt(d, 10);
    if (!(n >= 1 && n <= 31)) return '';
    const on = (yy, mm) => iso(yy, mm, Math.min(n, daysIn(yy, mm)));
    const this_ = on(y, m);
    return this_ >= from ? this_ : (m === 12 ? on(y + 1, 1) : on(y, m + 1));
  }
  return '';
}

// Daily job: for each active row of the Recurring Tasks tab, make the next occurrence once. A
// [rec:<slug>:<date>] tag in the description stops a second copy (the task can be done, deleted or moved).
export async function runRecurring(day = todayET()) {
  const report = { created: 0, alreadyThere: 0, skipped: [], errors: [] };
  let rows;
  try { rows = (await readPlain('Recurring Tasks')).rows; }
  catch (e) { if (/\(400\)|: 400/.test(e.message)) return { ...report, note: 'No Recurring Tasks tab yet' }; throw e; }
  const have = (await listTasks({ fresh: true })).map(t => t.description || '').join('\n');
  for (const { values: r } of rows) {
    if (!r.task?.trim() || /^(no|false|0)$/i.test(String(r.active).trim())) continue;
    const due = nextOccurrence(r, day);
    if (!due) { report.skipped.push(`${r.task}: can't read "${r.every} ${r.day}"`); continue; }
    const tag = `[rec:${slug(r.task)}:${due}]`;
    if (have.includes(tag)) { report.alreadyThere++; continue; }
    try {
      await createTask({ name: r.task.trim(), due, labels: r.owner?.trim() ? [r.owner.trim()] : [], description: `Repeats ${r.every.trim().toLowerCase()}. ${tag}` });
      report.created++;
    } catch (e) { report.errors.push(`${r.task}: ${e.message}`); }
  }
  return report;
}
