// "Which time works?" polls for the Sahṛdaya Upāya mentees (the mentorship orientation, and later anything similar). Pure helpers.
// Staff edit the options in Ops → Settings → Sahṛdaya Upāya → Polls; one row per time option on the "Mentee Polls" tab:
//   poll | title | note | start | closes | final | link | publish
// `poll` groups the rows (e.g. orientation-2026); `start` is a time like "2026-10-24 10:00 ET" (ET, UK or UTC); `closes` is optional (same format);
// `final` = Yes on one row confirms that time (mentees then see it, with the `link`); `publish` = No hides a row.
const ZONES = { ET: 'America/New_York', UK: 'Europe/London', UTC: 'UTC' };
const SLOT = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})\s*(ET|UK|UTC)$/i;

// "2026-10-24 10:00 ET" → "2026-10-24T14:00:00.000Z" (or '' if it isn't a time)
export function parseSlot(s) {
  const m = SLOT.exec(String(s || '').trim());
  if (!m) return '';
  const [, y, mo, d, h, mi, z] = m, zone = ZONES[z.toUpperCase()];
  if (+h > 23 || +mi > 59 || +mo < 1 || +mo > 12 || +d < 1 || +d > 31) return '';
  const wall = Date.UTC(+y, +mo - 1, +d, +h, +mi);
  const offsetAt = t => { // minutes the zone is ahead of UTC at instant t
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: zone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(new Date(t)).map(x => [x.type, x.value]));
    return (Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - Math.floor(t / 1000) * 1000) / 60000;
  };
  let t = wall - offsetAt(wall) * 60000;
  t = wall - offsetAt(t) * 60000; // once more, in case the clocks change in between
  const out = new Date(t);
  return isNaN(out) ? '' : out.toISOString();
}

const shown = r => !/^(false|no|hide)$/i.test(String(r.publish || '').trim());
const yes = v => /^(true|yes|y|1)$/i.test(String(v || '').trim());

// Sheet rows → the polls a mentee can see. A poll shows while it is open, and, once a time is confirmed, until two hours after that time.
// mine: { pollId: [iso, ...] } the mentee's own picks. → [{ id, title, note, closed, closes, final: { start, link } | null, options: [{ start, mine }] }]
export function pollsFrom(rows, mine = {}, now = Date.now()) {
  const by = new Map();
  for (const r of rows.filter(shown)) {
    const id = String(r.poll || '').trim(), start = parseSlot(r.start);
    if (!id || !start) continue;
    const p = by.get(id) || by.set(id, { id, title: '', note: '', closes: '', final: null, rows: [] }).get(id);
    p.title ||= String(r.title || '').trim(); p.note ||= String(r.note || '').trim(); p.closes ||= parseSlot(r.closes);
    if (yes(r.final)) p.final = { start, link: /^https:\/\/\S+$/.test(String(r.link || '').trim()) ? String(r.link).trim() : '' };
    p.rows.push(start);
  }
  const out = [];
  for (const p of by.values()) {
    const picked = new Set(mine[p.id] || []);
    const closed = !!p.final || (!!p.closes && Date.parse(p.closes) <= now);
    if (p.final && Date.parse(p.final.start) + 2 * 3600e3 < now) continue; // over
    if (!p.final && closed) continue; // closed without a decision: leave it for staff to confirm or remove
    out.push({ id: p.id, title: p.title || 'Which time works for you?', note: p.note, closed, closes: p.closes, final: p.final,
      options: [...new Set(p.rows)].sort().map(start => ({ start, mine: picked.has(start) })) });
  }
  return out;
}

// What a mentee may submit: only times that are options of an open poll
export function checkVotes(polls, pollId, slots) {
  const p = polls.find(x => x.id === pollId);
  if (!p) throw new Error('That survey isn’t open any more.');
  if (p.closed) throw new Error('That survey has closed.');
  const ok = new Set(p.options.map(o => o.start));
  const picks = [...new Set((Array.isArray(slots) ? slots : []).map(String))];
  if (picks.some(s => !ok.has(s))) throw new Error('One of those times isn’t an option.');
  return picks;
}
