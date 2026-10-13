// The event fields the dashboard edits, where each lives in EP-Programming-Calendar, and the checks that
// keep values in the shape the website, Zoom sync and reminders read. Date, Track and Event name are not
// here: they identify the event (moving or renaming an event is its own action).
// Shared by the server (validation) and the drawer form (labels, inputs, help).
export const WHERE = [
  { value: 'circle', label: 'Circle live stream' },
  { value: 'one-off', label: 'Zoom: its own meeting' },
  { value: 'series', label: 'Zoom: the series meeting' },
  { value: 'link', label: 'Zoom: a link I paste' },
];
// What a blank "Where it happens" means: Circle for Circle tracks, otherwise a pasted link (or none)
export const whereOf = (value, track) => value || (CIRCLE_TRACKS.includes(String(track).toUpperCase()) ? 'circle' : 'link');
// Tracks taught in Circle: a blank "Where it happens" means Circle for these
export const CIRCLE_TRACKS = ['SS', 'SSWW', 'EVENT'];

export const FIELDS = [
  { group: 'Session', key: 'Time', table: 'schedule', type: 'time', label: 'Time', help: 'e.g. 7pm ET or 9:30am ET. Blank uses the track default.' },
  { group: 'Session', key: 'Live Duration', table: 'details', type: 'minutes', label: 'Length (minutes)', help: 'Blank uses the track default.' },
  { group: 'Session', key: 'Zoom Type', table: 'details', type: 'where', label: 'Where it happens', help: 'Circle and both Zoom meeting options are set up automatically. Pick "a link I paste" to run your own Zoom.' },
  { group: 'Session', key: 'Zoom Link', table: 'details', type: 'url', label: 'Zoom link', help: 'Only when you run the meeting yourself. A link here always wins.' },
  { group: 'People', key: 'Teachers & Hosts', table: 'schedule', type: 'names', label: 'Teachers', help: 'Names, comma-separated, as on the Team tab.' },
  { group: 'People', key: 'Teacher/Host Emails', table: 'details', type: 'emails', label: 'Reminder emails', help: 'Only these addresses get session reminders.' },
  { group: 'People', key: 'Course Host', table: 'details', type: 'names', label: 'Course host' },
  { group: 'Website', key: 'Website', table: 'details', type: 'bool', label: 'Show on the website' },
  { group: 'Website', key: 'Public Title', table: 'details', type: 'text', label: 'Public title', help: 'Blank uses the track default, then the event name.' },
  { group: 'Website', key: 'Summary', table: 'details', type: 'textarea', label: 'Summary' },
  { group: 'Website', key: 'Public Note', table: 'details', type: 'text', label: 'Public note', help: 'One short line, e.g. "Ten sessions, Oct 11–20".' },
  { group: 'Website', key: 'Host Label', table: 'details', type: 'text', label: 'Host label', help: 'e.g. Wisdom School' },
  { group: 'Website', key: 'Price Label', table: 'details', type: 'text', label: 'Price label' },
  { group: 'Website', key: 'Registration URL', table: 'details', type: 'url', label: 'Registration link' },
  { group: 'Website', key: 'Series', table: 'details', type: 'slug', label: 'Series', help: 'Groups sessions of one course, e.g. sadhana-fall-2026.' },
  // A new column, added to Event Details the first time it's saved (ensure)
  { group: 'After', key: 'Replay Link', table: 'details', type: 'url', label: 'Replay in Circle', ensure: true, help: 'The Circle post or lesson with the recording.' },
  { group: 'After', key: 'Vimeo Video ID', table: 'details', type: 'video', label: 'Vimeo video ID', help: 'Only for the free preview player on the Living Room Lectures and Meditation Pass pages, e.g. 1231410525/33eeae6021' },
  { group: 'After', key: 'Enrolled Tag', table: 'details', type: 'text', label: 'Kit tag for enrolled students' },
  { group: 'Planning', key: 'Status', table: 'schedule', type: 'status', label: 'Status' },
  { group: 'Planning', key: 'Notes', table: 'schedule', type: 'textarea', label: 'Internal notes' },
];
// Cancelled is set with the drawer's Cancel button (which also closes the event's tasks), not from this list
export const STATUSES = ['Not started', 'Confirmed', 'Live', 'Done'];

const EMAIL = /^[^\s@,]+@[^\s@,]+\.[a-z]{2,}$/i;
// → { value } (cleaned) or { error }
export function check(field, raw) {
  const v = String(raw ?? '').replace(/\s+$/g, '').replace(/^\s+/, '');
  if (!v) return { value: '' };
  switch (field.type) {
    case 'time': return /^\d{1,2}(:\d{2})?\s*(am|pm)\s+ET$/i.test(v) ? { value: v.replace(/\s*(am|pm)/i, (_, x) => x.toLowerCase()) } : { error: 'Use a time like 7pm ET or 9:30am ET' };
    case 'minutes': return /^\d{1,3}$/.test(v) && +v > 0 ? { value: String(+v) } : { error: 'Minutes as a number, e.g. 90' };
    case 'where': return WHERE.some(w => w.value === v) ? { value: v } : { error: 'Pick where it happens' };
    case 'url': return /^https:\/\/\S+$/.test(v) ? { value: v } : { error: 'A full link starting with https://' };
    case 'emails': {
      const list = v.split(/[\s,;]+/).filter(Boolean);
      const bad = list.filter(e => !EMAIL.test(e));
      return bad.length ? { error: `Not an email address: ${bad.join(', ')}` } : { value: [...new Set(list.map(e => e.toLowerCase()))].join(', ') };
    }
    case 'names': return { value: v.split(',').map(s => s.trim()).filter(Boolean).join(', ') };
    case 'bool': return ['TRUE', 'FALSE'].includes(v.toUpperCase()) ? { value: v.toUpperCase() } : { error: 'Yes or no' };
    case 'slug': return /^[a-z0-9]+(-[a-z0-9]+)*$/.test(v) ? { value: v } : { error: 'Lower-case words joined by hyphens' };
    case 'video': return /^\d{5,}(\/[0-9a-f]{6,})?$/i.test(v) ? { value: v } : { error: 'The number from the Vimeo link (and the /code after it, if there is one)' };
    case 'status': return STATUSES.includes(v) ? { value: v } : { error: 'Pick a status' };
    case 'text': return v.length > 200 ? { error: 'Keep it under 200 characters' } : { value: v.replace(/\s*\n\s*/g, ' ') };
    default: return v.length > 4000 ? { error: 'Too long' } : { value: v };
  }
}
