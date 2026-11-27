import { readRange } from '../google';

// "What happened overnight" on Today (EP Ops 2, step 9), built only from what the Change Log tab already records:
// when, who, which tab, which row, which field, from, to. Every save through store.js writes a line there, and so do the automatic jobs
// (they sign their lines: "Circle sync", "Kit sync", "Instagram sync", "daily job", "Reminder rule"…). Nothing is read from anywhere new, and
// nothing about where a change went afterwards (the website, Circle…) or about a job that failed is on the Change Log, so none of that is shown.
const SHEET = () => process.env.CALENDAR_SHEET_ID;
const TAIL = 600; // the newest lines are at the bottom: read only the end of the tab, so a long history never makes this slow

// The last TAIL lines of the Change Log: [[when, who, tab, id, field, from, to]]. Two light (5-minute cached, expired by every save) reads:
// how long the tab is, then its end. Quiet when the tab doesn't exist.
export async function changeLogTail() {
  const col = await readRange(SHEET(), "'Change Log'!A:A");
  const n = col.length;
  if (n < 2) return [];
  const from = Math.max(2, n - TAIL + 1);
  return readRange(SHEET(), `'Change Log'!A${from}:G${n}`);
}

// Which tab a line is about, in words ("Social: Weekly Plan" is the Social Engine's tab)
const TAB = {
  Schedule: 'the schedule', 'Event Details': 'event details', 'Email Plan': 'the email plan', 'Email Revisions': 'email revisions', 'Email Comments': 'email comments',
  Teachers: 'teacher profiles', 'Course Pages': 'course pages', Team: 'the team list', 'Task Templates': 'task templates', 'Track Defaults': 'track defaults',
  'Faculty Invitations': 'faculty invitations', 'Reminder Rules': 'reminder rules', 'Recurring Tasks': 'recurring tasks', 'Ops Note': 'the note on Today',
  'Social: Weekly Plan': 'the social plan', 'Social: Post History': 'post history', 'Social: Image Library': 'the image library', 'Social: Quote Library': 'the quote library',
  'Social: Caption Bank': 'the caption bank', 'Weekly Scaffolding': 'the weekly scaffolding',
};
const tabWords = t => TAB[t] || (/^Site /.test(t) ? `website copy (${t.replace(/^Site /, '')})` : `the ${String(t).replace(/^Social: /, 'social ')} tab`);
const fieldWords = f => String(f || '').replace(/_/g, ' ').trim().toLowerCase();
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
const list = a => a.length < 3 ? a.join(' and ') : `${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}`;
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const short = (s, n = 40) => (String(s).length > n ? `${String(s).slice(0, n - 1)}…` : String(s));

// ET date and 24-hour clock of an ISO time
const etParts = iso => {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(iso)).map(x => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` };
};
const addDays = (d, n) => new Date(new Date(`${d}T12:00:00Z`).getTime() + n * 864e5).toISOString().slice(0, 10);

// Where "Open" goes: only for lines that name one row we know how to open
function hrefFor(tab, id) {
  if ((tab === 'Schedule' || tab === 'Event Details') && /^E\d+$/i.test(id)) return `/ops/programs/${encodeURIComponent(id)}`;
  if (tab === 'Email Plan' && /^EM\d+$/i.test(id)) return `/ops/publish?view=compose&kind=email&id=${encodeURIComponent(id)}`;
  return '';
}

// rows: Change Log lines. people: [{ name, email }] (the Team tab). me: the person looking (their own changes are left out: they know).
// titleOf(id): a session's name for its E-number. now: a Date. Window: since 6 pm yesterday, New York time.
// → { lines: [{ at, when, text, href }] oldest first (at most `max`), more: older lines not shown, total }
export function overnightLines(rows, { people = [], me = {}, titleOf = () => '', now = new Date(), max = 8 } = {}) {
  const today = etParts(now.toISOString()).date, since = `${addDays(today, -1)} 18:00`;
  const first = new Map(people.flatMap(p => [[String(p.name || '').toLowerCase(), String(p.name || '').split(' ')[0]], [String(p.email || '').toLowerCase(), String(p.name || '').split(' ')[0]]]).filter(([k]) => k));
  const mine = new Set([me.name, me.email].filter(Boolean).map(s => String(s).toLowerCase()));
  const groups = new Map();
  for (const r of rows) {
    const [when, who = '', tab = '', id = '', field = '', , to = ''] = r.map(x => String(x ?? '').trim());
    const t = Date.parse(when);
    if (!t || !who || !tab) continue;
    const e = etParts(when);
    if (`${e.date} ${e.time}` < since || t > now.getTime() + 6e4) continue;
    if (mine.has(who.toLowerCase())) continue;
    if (/^header row/.test(id) || field === '(new tab)') continue; // the dashboard setting up a column or tab: nothing to tell
    const person = first.get(who.toLowerCase());
    const kind = field === '(new rows)' ? 'batch' : /^new row/.test(id) ? 'new' : 'change';
    const k = `${who}|${tab}|${kind}`;
    if (!groups.has(k)) groups.set(k, { who, person, tab, kind, entries: [] });
    groups.get(k).entries.push({ t, e, id, field, to });
  }
  const lines = [];
  for (const g of groups.values()) {
    const name = g.person || cap(g.who), where = tabWords(g.tab), ids = [...new Set(g.entries.map(x => x.id))];
    const latest = g.entries.reduce((a, b) => (b.t > a.t ? b : a));
    let text = '', href = '';
    if (g.kind === 'batch') text = `${name} added ${list([...new Set(g.entries.map(x => x.to).filter(Boolean))]) || plural(g.entries.length, 'row')} to ${where}`;
    else if (g.kind === 'new') text = `${name} added ${plural(ids.length, 'new row')} to ${where}`;
    else {
      const named = id => { const t = titleOf(id); return t ? `${id} (${short(t)})` : id; };
      const fields = [...new Set(g.entries.map(x => fieldWords(x.field)).filter(Boolean))];
      if (ids.length === 1) { text = `${name} changed ${list(fields.slice(0, 3)) || 'a row'}${fields.length > 3 ? ' and more' : ''} on ${named(ids[0])}`; href = hrefFor(g.tab, ids[0]); }
      else if (ids.length <= 3) text = `${name} made ${plural(g.entries.length, 'change')} to ${list(ids.map(named))}`;
      else text = `${name} made ${plural(g.entries.length, 'change')} across ${ids.length} rows of ${where}`;
    }
    const day = latest.e.date === today ? '' : 'Yesterday ';
    lines.push({ at: latest.t, when: `${day}${latest.e.time}`, text, href });
  }
  lines.sort((a, b) => a.at - b.at);
  const shown = lines.slice(-max);
  return { lines: shown, more: lines.length - shown.length, total: lines.length };
}

// For Today: read the tail and describe it. Never throws: a Change Log that can't be read just shows nothing.
export async function overnightLog(opts) {
  try { return { ok: true, ...overnightLines(await changeLogTail(), opts) }; }
  catch (e) { console.error('Today, overnight log', e.message); return { ok: false, lines: [], more: 0, total: 0 }; }
}
