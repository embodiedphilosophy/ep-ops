// A member's schedule (Circle page /c/schedule, public/circle/schedule.js) and their private calendar feed
// (/api/member/schedule/ics). Built from the events sheet (lib/events.js): each membership sees its own events,
// with real start times (the sheet's "9am ET" read as New York time, so clock changes are handled), and
// mentees also get the monthly one-to-one window with Jacob.
import crypto from 'crypto';

export const BOOKING = 'https://calendly.com/embodied-philosophy/sah-daya-upaya-monthly-1-1-mentorship';
// Where to join a live session in Circle, by program (change the Sādhana School one each season)
export const LIVE_LINKS = { sadhana: '/c/fall-live-sessions' };

// Which events each membership sees (program / series from the sheet)
const SS = ['ss_season', 'ss_year', 'mentee'];
export function forTier(e, tier) {
  const p = String(e.program || '').toLowerCase(), s = String(e.series || '').toLowerCase();
  if (SS.includes(tier)) return p === 'sadhana';
  if (tier === 'wisdom' || tier === 'wisdom_plus') return p === 'wisdom';
  if (tier === 'meditation') return s === 'meditation-mondays';
  return true; // course buyers and staff: everything published
}

// How each event is labelled and how long it runs (minutes), when the sheet doesn't say
export function kindOf(e) {
  const s = String(e.series || '').toLowerCase(), t = String(e.title || '');
  if (/^sadhana-(fall|winter|spring|summer)/.test(s)) return 'session';
  if (/weekend workshop|immersion|open session|practicum/i.test(t)) return 'immersion';
  if (/orientation/i.test(t)) return 'orientation';
  if (s === 'meditation-mondays') return 'meditation';
  return 'event';
}
export const KIND_LABEL = { session: 'Wednesday session', immersion: 'Weekend immersion', orientation: 'Orientation', meditation: 'Meditation Monday', event: 'Event', one: 'One-to-one' };
const MINUTES = { session: 150, immersion: 180, orientation: 90, meditation: 60, event: 90 };

// "9am ET", "9:30 am ET", "12pm", "6pm PT", "7.30pm UK" → { h, m, zone } (ET when no zone is given)
const ZONES = { ET: 'America/New_York', EST: 'America/New_York', EDT: 'America/New_York', PT: 'America/Los_Angeles', PST: 'America/Los_Angeles', PDT: 'America/Los_Angeles', UK: 'Europe/London', GMT: 'Europe/London', BST: 'Europe/London', CET: 'Europe/Paris' };
export function parseTime(text) {
  const m = String(text || '').match(/(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)\b\s*([A-Za-z]{2,3})?/i);
  if (!m) return null;
  let h = Number(m[1]) % 12; if (/pm/i.test(m[3])) h += 12;
  const zone = ZONES[String(m[4] || 'ET').toUpperCase()] || ZONES.ET;
  return { h, m: Number(m[2] || 0), zone };
}

// The UTC instant of a wall-clock time in a time zone (handles daylight saving)
function offsetMinutes(utcMs, zone) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: zone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
    .formatToParts(new Date(utcMs)).filter(x => x.type !== 'literal').map(x => [x.type, Number(x.value)]));
  return (Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute) - utcMs) / 60000;
}
export function zonedToUtc(day, h, m, zone) {
  const [y, mo, d] = day.split('-').map(Number);
  const guess = Date.UTC(y, mo - 1, d, h, m);
  let t = guess - offsetMinutes(guess, zone) * 60000;
  t = guess - offsetMinutes(t, zone) * 60000; // second pass settles the hour around a clock change
  return new Date(t);
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const addDays = (s, n) => { const d = new Date(s + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const monthName = (y, m) => new Date(Date.UTC(y, m, 1)).toLocaleDateString('en-US', { month: 'long', timeZone: 'UTC' });

// The monthly one-to-one: the last seven days of each month, booked through Calendly
export function oneToOnes(today, months = 3) {
  const [y, m] = today.split('-').map(Number);
  const out = [];
  for (let i = 0; i < months; i++) {
    const yy = y + Math.floor((m - 1 + i) / 12), mm = (m - 1 + i) % 12;
    const last = new Date(Date.UTC(yy, mm + 1, 0)).toISOString().slice(0, 10);
    const first = addDays(last, -6);
    if (last < today) continue;
    const open = first <= addDays(today, 21); // booking shows from three weeks before the window
    out.push({
      id: `one-${yy}-${mm + 1}`, kind: 'one', label: KIND_LABEL.one, title: `${monthName(yy, mm)} one-to-one with Jacob`,
      date: first, end_date: last, allDay: true, sub: open ? '45 minutes · book a time in the last week of the month' : '45 minutes · booking opens nearer the time',
      book: open ? BOOKING : '',
    });
  }
  return out;
}

// Pure: the member's schedule from the events list
export function buildSchedule(events, tier, today) {
  const items = (events || []).filter(e => DAY.test(e.date || '') && (e.end_date || e.date) >= today && forTier(e, tier)).map(e => {
    const kind = kindOf(e), t = parseTime(e.time);
    const item = {
      id: e.id || `${e.date}-${e.title}`, kind, label: KIND_LABEL[kind], title: e.title || 'Event', date: e.date,
      end_date: e.end_date && e.end_date !== e.date ? e.end_date : null, time: e.time || '', sub: e.host ? `with ${e.host}` : '',
      live: LIVE_LINKS[String(e.program || '').toLowerCase()] || '', url: e.registration_url || e.url || '',
      program: String(e.program || '').toLowerCase(), series: String(e.series || '').toLowerCase(),
    };
    if (t && !item.end_date) {
      const start = zonedToUtc(e.date, t.h, t.m, t.zone);
      item.start = start.toISOString();
      item.end = new Date(start.getTime() + (MINUTES[kind] || 90) * 60000).toISOString();
    } else item.allDay = true;
    return item;
  });
  if (tier === 'mentee') items.push(...oneToOnes(today));
  return items.sort((a, b) => (a.start || a.date + 'T00').localeCompare(b.start || b.date + 'T00'));
}

// ---- the private calendar feed: a long-lived signed link, one per member ----
const secret = () => { const s = process.env.MEMBER_SECRET || process.env.OPS_SECRET; if (!s) throw new Error('MEMBER_SECRET is not set'); return s; };
export function feedToken({ uid, email, tier }) {
  const body = Buffer.from(JSON.stringify({ k: 'feed', uid, email, tier })).toString('base64url');
  return `${body}.${crypto.createHmac('sha256', secret()).update('feed:' + body).digest('base64url').slice(0, 32)}`;
}
export function readFeedToken(token) {
  const [body, sig] = String(token || '').split('.');
  if (!body || !sig) return null;
  const good = crypto.createHmac('sha256', secret()).update('feed:' + body).digest('base64url').slice(0, 32);
  if (good.length !== sig.length || !crypto.timingSafeEqual(Buffer.from(good), Buffer.from(sig))) return null;
  try { const d = JSON.parse(Buffer.from(body, 'base64url').toString()); return d.k === 'feed' ? d : null; } catch { return null; }
}

// Pure: an iCalendar file for the items
const icsText = s => String(s || '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/[,;]/g, m => '\\' + m);
const icsStamp = iso => iso.replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const icsDay = d => d.replace(/-/g, '');
function fold(line) { const out = []; let s = line; while (Buffer.byteLength(s) > 74) { let n = 74; while (Buffer.byteLength(s.slice(0, n)) > 74) n--; out.push(s.slice(0, n)); s = ' ' + s.slice(n); } out.push(s); return out.join('\r\n'); }
export function toIcs(items, { name = 'Embodied Philosophy', site = 'https://ss.embodiedphilosophy.com', now = new Date() } = {}) {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Embodied Philosophy//Schedule//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    `X-WR-CALNAME:${icsText(name)}`, 'X-WR-TIMEZONE:America/New_York', 'REFRESH-INTERVAL;VALUE=DURATION:PT6H', 'X-PUBLISHED-TTL:PT6H'];
  for (const it of items) {
    lines.push('BEGIN:VEVENT', `UID:${icsText(it.id)}@embodiedphilosophy.com`, `DTSTAMP:${icsStamp(now.toISOString())}`);
    if (it.start) lines.push(`DTSTART:${icsStamp(it.start)}`, `DTEND:${icsStamp(it.end)}`);
    else lines.push(`DTSTART;VALUE=DATE:${icsDay(it.date)}`, `DTEND;VALUE=DATE:${icsDay(addDays(it.end_date || it.date, 1))}`);
    lines.push(`SUMMARY:${icsText(it.title)}`);
    const desc = [it.label, it.sub, it.book ? 'Book: ' + it.book : '', it.live ? 'Join in Circle: ' + site + it.live : ''].filter(Boolean).join('\n');
    if (desc) lines.push(`DESCRIPTION:${icsText(desc)}`);
    lines.push(`URL:${it.book || (it.live ? site + it.live : site)}`, 'END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}
