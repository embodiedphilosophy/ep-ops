// Members' daily practice log (Circle Today strip). One row per member per day, in the member's own
// local date (the browser sends it; we accept today or yesterday relative to the server, ±1 day).
// Lives in the same Neon database as ops tasks (DATABASE_URL); the table is made on first use.
import { neon } from '@neondatabase/serverless';

const url = () => process.env.DATABASE_URL || process.env.POSTGRES_URL || '';
let sqlFn = null;
let testSql = null;
const sql = () => { if (testSql) return testSql; if (!url()) throw new Error('The practice log isn’t connected yet'); return (sqlFn ||= neon(url())); };
export const practiceAvailable = () => !!testSql || !!url();
export function _setSql(fn) { testSql = fn; ready = null; } // tests only

let ready = null;
function ensure() {
  return (ready ||= (async () => {
    const q = sql();
    await q`CREATE TABLE IF NOT EXISTS member_practice (
      uid text NOT NULL, email text NOT NULL, day date NOT NULL,
      minutes int NOT NULL DEFAULT 0, quality text NOT NULL DEFAULT '', extras text[] NOT NULL DEFAULT '{}',
      at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (uid, day)
    )`;
  })());
}

export const MILESTONES = [7, 21, 40, 108];
export const QUALITIES = ['Agitated', 'Distracted', 'Restless', 'Neutral', 'Calm', 'Focused', 'Blissful', 'Expansive', 'Silent'];
export const EXTRAS = ['Prāṇāyāma', 'Āsana', 'Mantra', 'Svādhyāya', 'Mauna', 'Ritual / Pūjā'];

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const toDate = s => new Date(s + 'T00:00:00Z');
const iso = d => d.toISOString().slice(0, 10);
const addDays = (s, n) => { const d = toDate(s); d.setUTCDate(d.getUTCDate() + n); return iso(d); };

// The browser's "today" is trusted only within a day of the server's UTC date.
export function cleanToday(s) {
  const server = iso(new Date());
  if (!DAY.test(String(s || ''))) return server;
  const diff = Math.round((toDate(s) - toDate(server)) / 86400000);
  return Math.abs(diff) <= 1 ? s : server;
}

// A day a member may log or change: today or up to BACKFILL_DAYS before it (never the future). Anything else → today.
export const BACKFILL_DAYS = 30;
export function cleanDay(s, today) {
  if (!DAY.test(String(s || '')) || s > today || s < addDays(today, -BACKFILL_DAYS)) return today;
  return s;
}

// Pure: { streak, loggedToday, weekCount, nextMilestone, reached, grid } from a list of 'YYYY-MM-DD' days.
export function summarise(days, today) {
  const set = new Set(days);
  const loggedToday = set.has(today);
  let streak = 0;
  let d = loggedToday ? today : addDays(today, -1); // a streak survives until today is over
  while (set.has(d)) { streak++; d = addDays(d, -1); }
  // Week starts Monday
  const dow = (toDate(today).getUTCDay() + 6) % 7;
  const monday = addDays(today, -dow);
  let weekCount = 0;
  for (let i = 0; i <= dow; i++) if (set.has(addDays(monday, i))) weekCount++;
  // 8 weeks, Monday-first columns, ending with this week
  const start = addDays(monday, -49);
  const grid = [];
  for (let w = 0; w < 8; w++) {
    const col = [];
    for (let i = 0; i < 7; i++) {
      const day = addDays(start, w * 7 + i);
      col.push({ day, state: day > today ? 'future' : set.has(day) ? 'done' : day === today ? 'today' : 'missed' });
    }
    grid.push(col);
  }
  const nextMilestone = MILESTONES.find(m => m > streak) || null;
  const reached = loggedToday && MILESTONES.includes(streak) ? streak : null;
  return { today, streak, loggedToday, weekCount, nextMilestone, reached, grid };
}

export async function practiceSummary(uid, today) {
  await ensure();
  const since = addDays(today, -200);
  const rows = await sql()`SELECT to_char(day, 'YYYY-MM-DD') AS day FROM member_practice WHERE uid = ${uid} AND day >= ${since} AND day <= ${today}`;
  return summarise(rows.map(r => r.day), today);
}

// What is logged for one day (to fill the form when a member changes an earlier day) → { minutes, quality, extras } | null
export async function practiceEntry(uid, day) {
  await ensure();
  const [r] = await sql()`SELECT minutes, quality, extras FROM member_practice WHERE uid = ${uid} AND day = ${day}`;
  return r ? { minutes: r.minutes, quality: r.quality || '', extras: r.extras || [] } : null;
}

// Every day this member has logged (the mālā counts days, not minutes)
export async function practiceDayCount(uid) {
  await ensure();
  const [r] = await sql()`SELECT count(*)::int AS n FROM member_practice WHERE uid = ${uid}`;
  return r?.n || 0;
}

// How many different members logged a sit on a day (shown on Today only when it is large enough that nobody is identifiable)
export const CROWD_MIN = 5;
export async function practisingOn(day) {
  await ensure();
  const [r] = await sql()`SELECT count(DISTINCT uid)::int AS n FROM member_practice WHERE day = ${day}`;
  const n = r?.n || 0;
  return n >= CROWD_MIN ? n : null;
}

// add: true adds the minutes to what is already logged for the day (a second sit), instead of replacing it
export async function logPractice({ uid, email, day, minutes, quality, extras, add = false }) {
  await ensure();
  const m = Math.max(0, Math.min(600, parseInt(minutes, 10) || 0));
  const q = QUALITIES.includes(quality) ? quality : '';
  const x = (Array.isArray(extras) ? extras : []).filter(e => EXTRAS.includes(e));
  if (add) {
    await sql()`INSERT INTO member_practice (uid, email, day, minutes, quality, extras)
      VALUES (${uid}, ${email}, ${day}, ${m}, ${q}, ${x})
      ON CONFLICT (uid, day) DO UPDATE SET minutes = LEAST(600, member_practice.minutes + EXCLUDED.minutes),
        quality = CASE WHEN EXCLUDED.quality = '' THEN member_practice.quality ELSE EXCLUDED.quality END, at = now()`;
    return;
  }
  await sql()`INSERT INTO member_practice (uid, email, day, minutes, quality, extras)
    VALUES (${uid}, ${email}, ${day}, ${m}, ${q}, ${x})
    ON CONFLICT (uid, day) DO UPDATE SET minutes = EXCLUDED.minutes, quality = EXCLUDED.quality, extras = EXCLUDED.extras, at = now()`;
}

// ---- Mentor view: the practice log of a group of members (by email), last eight weeks ----
// Signals only: days practised and minutes. Quality and other practices stay with the member.
export async function practiceByEmail(emails, today) {
  await ensure();
  const list = [...new Set((emails || []).map(e => String(e).trim().toLowerCase()).filter(Boolean))];
  if (!list.length) return {};
  const since = addDays(today, -200);
  const rows = await sql()`SELECT lower(email) AS email, to_char(day, 'YYYY-MM-DD') AS day, minutes FROM member_practice
    WHERE lower(email) = ANY(${list}) AND day >= ${since} AND day <= ${today}`;
  const out = {};
  for (const r of rows) (out[r.email] ||= []).push({ day: r.day, minutes: Number(r.minutes) || 0 });
  return out;
}

// Pure: one row per mentee plus a short "worth a word" list.
// mentees: [{ name, email }], logs: { email: [{ day, minutes }] }
export function cohortSummary(mentees, logs, today) {
  const rows = (mentees || []).map(m => {
    const email = String(m.email || '').trim().toLowerCase();
    const entries = logs[email] || [];
    const s = summarise(entries.map(e => e.day), today);
    const last = entries.map(e => e.day).sort().pop() || null;
    const daysSince = last ? Math.round((toDate(today) - toDate(last)) / 86400000) : null;
    const eightWeeks = addDays(today, -55);
    const recent = entries.filter(e => e.day >= eightWeeks);
    return {
      name: m.name || email, email, streak: s.streak, weekCount: s.weekCount, loggedToday: s.loggedToday,
      last, daysSince, days8w: recent.length, minutes8w: recent.reduce((a, e) => a + e.minutes, 0), grid: s.grid,
    };
  }).sort((a, b) => a.name.localeCompare(b.name));
  const attention = [];
  for (const r of rows) {
    if (r.last === null) attention.push({ email: r.email, name: r.name, why: 'Hasn’t logged any practice yet' });
    else if (r.daysSince >= 4) attention.push({ email: r.email, name: r.name, why: `No practice logged for ${r.daysSince} days` });
    else if (MILESTONES.includes(r.streak) && r.daysSince <= 1) attention.push({ email: r.email, name: r.name, why: `Reached ${r.streak} days in a row`, good: true });
  }
  return { today, rows, attention };
}
