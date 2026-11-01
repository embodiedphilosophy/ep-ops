// A time that suits a pair (or trio) living in different time zones, and how far apart they are. Pure, no network: scripts/member-test/window.mjs.
// The suggested window is the first two-hour block that falls between 8 am and 9 pm for everyone in the group, weekend first, shown in the
// viewer's own zone with the others' in brackets on the page.
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const fmt = {};
const parts = (t, tz) => {
  const f = fmt[tz] ||= new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  return Object.fromEntries(f.formatToParts(new Date(t)).map(x => [x.type, x.value]));
};
// Minutes the zone is ahead of UTC at instant t
const offsetAt = (t, tz) => { const p = parts(t, tz); return (Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - Math.floor(t / 1000) * 1000) / 60000; };
// The instant when the wall clock in `tz` reads y-m-d h:00
function wallToUtc(ymd, hour, tz) {
  const [y, m, d] = ymd.split('-').map(Number), wall = Date.UTC(y, m - 1, d, hour);
  let t = wall - offsetAt(wall, tz) * 60000;
  t = wall - offsetAt(t, tz) * 60000; // once more, in case the clocks change in between
  return t;
}
export const validZone = tz => { try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return typeof tz === 'string' && tz.includes('/') || tz === 'UTC'; } catch { return false; } };

const weekdayOf = ymd => new Date(`${ymd}T12:00:00Z`).getUTCDay();
const addDay = (ymd, n) => new Date(Date.parse(`${ymd}T12:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
const clock = h => (h === 0 || h === 24 ? '12 am' : h === 12 ? '12 pm' : h < 12 ? `${h} am` : `${h - 12} pm`);
// "9–11 am", "11 am–1 pm"
export function spanText(from, to) {
  const a = clock(from), b = clock(to), ap = a.split(' ')[1], bp = b.split(' ')[1];
  return ap === bp ? `${a.split(' ')[0]}–${b}` : `${a}–${b}`;
}

// Whole hours the zone `a` is ahead of zone `b` right now ("Milan is 7 hours ahead of you"), or null if they differ by a part of an hour
export function hoursAhead(a, b, at = Date.now()) { const d = (offsetAt(at, a) - offsetAt(at, b)) / 60; return Number.isInteger(d) ? d : null; }

/**
 * zones: [{ tz, label }], the viewer first. today: 'YYYY-MM-DD' (the viewer's day). Options: lo (earliest hour, 8), hi (latest end hour, 21), len (hours, 2).
 * → { days: 'Sat or Sun' | 'Sat' | 'Sun', spans: [{ label, text: '9–11 am' }] } or null when nothing fits everyone.
 */
export function suggestWindow(zones, today, { lo = 8, hi = 21, len = 2 } = {}) {
  const list = (zones || []).filter(z => z && validZone(z.tz));
  if (list.length < 2 || !DAY.test(today || '')) return null;
  const viewer = list[0].tz;
  let sat = today; while (weekdayOf(sat) !== 6) sat = addDay(sat, 1);
  const fits = (ymd, h) => {
    const t = wallToUtc(ymd, h, viewer), spans = [];
    for (const z of list) {
      const p = parts(t, z.tz), start = +p.hour, end = start + len;
      // start no earlier than lo, end no later than hi in that person's own clock (across the date line it may be their Friday or Monday)
      if (start < lo || end > hi || +p.minute !== 0) return null;
      spans.push({ label: z.label, text: spanText(start, end), start });
    }
    return spans;
  };
  for (let h = 0; h + len <= 24; h++) {
    const a = fits(sat, h);
    if (a) {
      const b = fits(addDay(sat, 1), h);
      const same = b && b.every((x, i) => x.text === a[i].text);
      return { days: same ? 'Sat or Sun' : 'Sat', spans: a.map(({ label, text }) => ({ label, text })) };
    }
  }
  for (let h = 0; h + len <= 24; h++) {
    const b = fits(addDay(sat, 1), h);
    if (b) return { days: 'Sun', spans: b.map(({ label, text }) => ({ label, text })) };
  }
  return null;
}
