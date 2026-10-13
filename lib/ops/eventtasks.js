import { listTasks, updateTask, completeTask } from './taskstore';
import { eventIdFromTag } from './tasks';

const addDays = (d, n) => { const x = new Date(d + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const daysBetween = (a, b) => Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / 864e5);

// An event moved: its open Motion tasks follow it (tag, due date and the date in the name), so the daily
// sync doesn't make a second set. Returns how many moved.
export async function moveEventTasks(oldKey, newKey, oldDate, newDate) {
  const shift = daysBetween(oldDate, newDate);
  const open = (await listTasks({ fresh: true })).filter(t => !t.completed && eventIdFromTag(t.description) === oldKey);
  for (const t of open) {
    await updateTask(t.id, {
      name: t.name.replace(`(${oldDate})`, `(${newDate})`),
      description: t.description.split(`[ep:${oldKey}:`).join(`[ep:${newKey}:`),
      due: t.due ? addDays(t.due, shift) : undefined,
    });
  }
  return open.length;
}

// An event was cancelled: close its open tasks, marked so it's clear why
export async function closeEventTasks(key) {
  const open = (await listTasks({ fresh: true })).filter(t => !t.completed && eventIdFromTag(t.description) === key);
  for (const t of open) {
    await updateTask(t.id, { name: `${t.name} (event cancelled)` });
    await completeTask(t.id);
  }
  return open.length;
}
