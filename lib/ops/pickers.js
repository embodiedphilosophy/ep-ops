import { todayET } from '../events';
import { addDays } from './tasks';

const short = d => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });

// Events in the next `weeks` as { id, label } for the "+ Task" event picker (cancelled ones left out)
export function eventOptions(cal, weeks = 10) {
  const from = addDays(todayET(), -7), to = addDays(todayET(), weeks * 7);
  return cal.filter(e => e.id && e.date >= from && e.date <= to && !/cancel/i.test(e.status || ''))
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(e => ({ id: e.id, label: `${short(e.date)} · ${e.title}` }));
}
// Staff names (not teachers) for owner pickers
export const staffNames = team => team.filter(m => String(m.type).toLowerCase() !== 'teacher').map(m => m.name);
