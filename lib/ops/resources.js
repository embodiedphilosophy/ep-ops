import { readRange, toObjects } from '../google';

// Team → Resources hub links. "Resources" tab of the calendar sheet: group | title | url | teachers
// (teachers = TRUE also shows the link on the teachers' short Team page). Missing tab → no links.
export async function loadResources() {
  try {
    const rows = toObjects(await readRange(process.env.CALENDAR_SHEET_ID, "'Resources'!A1:D200"));
    return rows.filter(r => r.title && /^https?:\/\//.test(r.url))
      .map(r => ({ group: r.group || 'Other', title: r.title, url: r.url, teachers: String(r.teachers).toUpperCase() === 'TRUE' }));
  } catch { return null; }
}
