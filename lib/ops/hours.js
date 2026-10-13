// Time clock: staff and contractors clock in and out from the sidebar; each person's monthly cap comes from
// the Team tab's monthly_hours column (blank = no cap). Shifts and extra-hours requests live in the
// dashboard's database (the same Neon database as tasks). Months and days are New York time, like the rest
// of the dashboard.
import { neon } from '@neondatabase/serverless';
import { sendEmail, layout, button, esc } from './email';

const TZ = 'America/New_York';
const url = () => process.env.DATABASE_URL || process.env.POSTGRES_URL || '';
let sqlFn = null;
const sql = () => { if (!url()) throw new Error('The database isn’t connected (DATABASE_URL)'); return (sqlFn ||= neon(url())); };
export const clockAvailable = () => !!url();

let ready = null;
function ensure() {
  return (ready ||= (async () => {
    const q = sql();
    await q`CREATE TABLE IF NOT EXISTS ops_shifts (
      id bigserial PRIMARY KEY, email text NOT NULL, name text NOT NULL DEFAULT '',
      start_at timestamptz NOT NULL, end_at timestamptz,
      tags text[] NOT NULL DEFAULT '{}', note text NOT NULL DEFAULT '',
      edited boolean NOT NULL DEFAULT false, auto_closed boolean NOT NULL DEFAULT false, reminded boolean NOT NULL DEFAULT false
    )`;
    await q`CREATE INDEX IF NOT EXISTS ops_shifts_who ON ops_shifts (email, start_at)`;
    await q`CREATE TABLE IF NOT EXISTS ops_hour_requests (
      id bigserial PRIMARY KEY, email text NOT NULL, name text NOT NULL DEFAULT '', month text NOT NULL,
      hours numeric NOT NULL, why text NOT NULL DEFAULT '', status text NOT NULL DEFAULT 'pending',
      at timestamptz NOT NULL DEFAULT now(), decided_by text, decided_at timestamptz
    )`;
    await q`CREATE TABLE IF NOT EXISTS ops_hour_alerts (email text NOT NULL, month text NOT NULL, level int NOT NULL, PRIMARY KEY (email, month, level))`;
  })().catch(e => { ready = null; throw e; }));
}

// ---- New York dates ----
const nyDate = (d = new Date()) => new Date(d).toLocaleDateString('en-CA', { timeZone: TZ });
export const monthNow = () => nyDate().slice(0, 7);
const offsetMs = instant => {
  const d = new Date(instant);
  return Date.parse(d.toLocaleString('en-US', { timeZone: 'UTC' })) - Date.parse(d.toLocaleString('en-US', { timeZone: TZ }));
};
// The instant of a New York wall-clock time, e.g. ('2026-10-09', '23:59:59')
const nyInstant = (date, time) => { const guess = Date.parse(`${date}T${time}Z`); return new Date(guess + offsetMs(guess)); };
const monthStart = m => nyInstant(`${m}-01`, '00:00:00');
const nextMonth = m => { const [y, mo] = m.split('-').map(Number); return mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, '0')}`; };
const daysIn = m => { const [y, mo] = m.split('-').map(Number); return new Date(Date.UTC(y, mo, 0)).getUTCDate(); };
// Weekdays from today to the end of the month, today included
function weekdaysLeft(m) {
  const today = nyDate(); let n = 0;
  for (let d = Number(today.slice(8)); d <= daysIn(m); d++) { const wd = new Date(`${m}-${String(d).padStart(2, '0')}T12:00:00Z`).getUTCDay(); if (wd && wd < 6) n++; }
  return n;
}

export const capOf = member => { const n = Number(String(member?.monthly_hours ?? '').replace(/[^0-9.]/g, '')); return n > 0 ? n : null; };
const hrs = ms => Math.round((ms / 36e5) * 100) / 100;
const shape = r => ({
  id: String(r.id), email: r.email, name: r.name, start: new Date(r.start_at).toISOString(), end: r.end_at ? new Date(r.end_at).toISOString() : null,
  hours: hrs((r.end_at ? new Date(r.end_at) : new Date()) - new Date(r.start_at)), tags: r.tags || [], note: r.note || '',
  edited: !!r.edited, autoClosed: !!r.auto_closed, day: nyDate(r.start_at),
});

export async function shiftsFor(email, month = monthNow()) {
  await ensure();
  const rows = await sql()`SELECT * FROM ops_shifts WHERE email = ${email} AND start_at >= ${monthStart(month)} AND start_at < ${monthStart(nextMonth(month))} ORDER BY start_at DESC`;
  return rows.map(shape);
}
async function openShift(email) {
  await ensure();
  const [r] = await sql()`SELECT * FROM ops_shifts WHERE email = ${email} AND end_at IS NULL ORDER BY start_at DESC LIMIT 1`;
  return r ? shape(r) : null;
}
async function extraFor(email, month) {
  const [r] = await sql()`SELECT COALESCE(SUM(hours), 0) AS h FROM ops_hour_requests WHERE email = ${email} AND month = ${month} AND status = 'approved'`;
  return Number(r.h) || 0;
}
async function pendingFor(email, month) {
  const [r] = await sql()`SELECT id, hours FROM ops_hour_requests WHERE email = ${email} AND month = ${month} AND status = 'pending' ORDER BY at DESC LIMIT 1`;
  return r ? { id: String(r.id), hours: Number(r.hours) } : null;
}

// Everything the sidebar and My hours show for one person this month
export async function statusFor(member, month = monthNow()) {
  const [shifts, extra, pending] = await Promise.all([shiftsFor(member.email, month), extraFor(member.email, month), pendingFor(member.email, month)]);
  const used = Math.round(shifts.reduce((s, x) => s + x.hours, 0) * 10) / 10;
  const cap = capOf(member), limit = cap ? cap + extra : null;
  const day = Number(nyDate().slice(8)), total = daysIn(month), current = month === monthNow();
  const pace = current && day >= 3 ? Math.round((used / day) * total) : null;
  const left = limit ? Math.max(0, Math.round((limit - used) * 10) / 10) : null;
  const wl = current ? weekdaysLeft(month) : 0;
  const level = !limit ? 'none' : used >= limit ? 'at' : used >= 0.8 * limit ? 'near' : 'ok';
  return {
    month, used, cap, extra, limit, left, pace, level, pending,
    perDay: limit && wl ? Math.round((left / wl) * 10) / 10 : null, weekdaysLeft: wl,
    open: shifts.find(s => !s.end) || null, shifts,
  };
}

export async function clockIn(member) {
  if (await openShift(member.email)) throw new Error('You’re already on the clock');
  const st = await statusFor(member);
  if (st.level === 'at') { const e = new Error('You’re at your hours for this month. Ask for more hours first.'); e.atCap = true; throw e; }
  await sql()`INSERT INTO ops_shifts (email, name, start_at) VALUES (${member.email}, ${member.name}, now())`;
  return statusFor(member);
}

export async function clockOut(member, { tags = [], note = '' } = {}, { team = [], base = '' } = {}) {
  const open = await openShift(member.email);
  if (!open) throw new Error('You’re not on the clock');
  const t = tags.map(x => String(x).trim()).filter(Boolean).slice(0, 8);
  await sql()`UPDATE ops_shifts SET end_at = now(), tags = ${t}, note = ${String(note).slice(0, 500)} WHERE id = ${open.id}`;
  const st = await statusFor(member);
  await alertIfNeeded(member, st, team, base);
  return st;
}

// One email per threshold per month: at 80% and at 100% of the cap, to the person and the director
async function alertIfNeeded(member, st, team, base) {
  if (!st.limit) return;
  const level = st.used >= st.limit ? 100 : st.used >= 0.8 * st.limit ? 80 : 0;
  if (!level) return;
  const [row] = await sql()`INSERT INTO ops_hour_alerts (email, month, level) VALUES (${member.email}, ${st.month}, ${level}) ON CONFLICT DO NOTHING RETURNING level`;
  if (!row) return;
  const director = team.find(m => m.director);
  const first = member.name.split(' ')[0];
  const line = level === 100 ? `${esc(first)} has reached ${st.limit} hours for this month.` : `${esc(first)} has used ${st.used} of ${st.limit} hours this month (${st.left} left).`;
  const to = [member.email, ...(director && director.email !== member.email ? [director.email] : [])];
  for (const email of to) {
    try { await sendEmail({ to: email, subject: level === 100 ? `${first}: monthly hours reached` : `${first}: 80% of monthly hours`, html: layout('Hours this month', `<p>${line}</p>${level === 100 ? '<p>Clocking in again needs Jacob’s OK for extra hours.</p>' : ''}${button(`${base}/ops/hours`, 'See hours')}`) }); }
    catch (e) { console.error('Hours alert failed', e.message); }
  }
}

export async function requestHours(member, { hours, why = '' }, { team = [], base = '' } = {}) {
  const h = Math.min(Math.max(Number(hours) || 0, 0.5), 80);
  const month = monthNow();
  await ensure();
  await sql()`UPDATE ops_hour_requests SET status = 'withdrawn' WHERE email = ${member.email} AND month = ${month} AND status = 'pending'`;
  await sql()`INSERT INTO ops_hour_requests (email, name, month, hours, why) VALUES (${member.email}, ${member.name}, ${month}, ${h}, ${String(why).slice(0, 500)})`;
  const director = team.find(m => m.director);
  if (director) {
    try { await sendEmail({ to: director.email, subject: `${member.name} asks for ${h} more hours`, html: layout('Extra hours request', `<p><b>${esc(member.name)}</b> asks for <b>${h}</b> more hours this month.</p>${why ? `<p>“${esc(why)}”</p>` : ''}${button(`${base}/ops`, 'Approve or decline on Today')}`) }); }
    catch (e) { console.error('Hours request email failed', e.message); }
  }
  return { ok: true, hours: h };
}

export async function decideRequest(director, id, approve, { team = [], base = '' } = {}) {
  await ensure();
  const [r] = await sql()`UPDATE ops_hour_requests SET status = ${approve ? 'approved' : 'declined'}, decided_by = ${director.name}, decided_at = now()
    WHERE id = ${id} AND status = 'pending' RETURNING *`;
  if (!r) throw new Error('That request was already decided');
  try { await sendEmail({ to: r.email, subject: approve ? `Approved: ${Number(r.hours)} more hours` : 'Extra hours request declined', html: layout('Your hours request', `<p>${esc(director.name.split(' ')[0])} ${approve ? `approved <b>${Number(r.hours)}</b> more hours this month. You can clock in again.` : 'declined your request for more hours this month.'}</p>${button(`${base}/ops/hours`, 'See your hours')}`) }); }
  catch (e) { console.error('Decision email failed', e.message); }
  return { ok: true };
}

export async function pendingRequests() {
  await ensure();
  const rows = await sql()`SELECT * FROM ops_hour_requests WHERE status = 'pending' ORDER BY at`;
  return rows.map(r => ({ id: String(r.id), email: r.email, name: r.name, month: r.month, hours: Number(r.hours), why: r.why, at: new Date(r.at).toISOString() }));
}

// Fix a shift's times: your own, started in the last 7 days, 16 hours at most. Marked "edited" for the director.
export async function fixShift(member, id, { start, end }) {
  await ensure();
  const [r] = await sql()`SELECT * FROM ops_shifts WHERE id = ${id} AND email = ${member.email}`;
  if (!r) throw new Error('Shift not found');
  if (Date.now() - new Date(r.start_at) > 8 * 864e5) throw new Error('Only the last 7 days can be fixed. Ask Jacob for older ones.');
  const day = nyDate(r.start_at);
  const s = /^\d{2}:\d{2}$/.test(start || '') ? nyInstant(day, `${start}:00`) : new Date(r.start_at);
  const e = /^\d{2}:\d{2}$/.test(end || '') ? nyInstant(day, `${end}:00`) : null;
  if (!e) throw new Error('Give an end time');
  if (e <= s) throw new Error('The end has to be after the start');
  if (e - s > 16 * 36e5) throw new Error('A shift can be 16 hours at most');
  await sql()`UPDATE ops_shifts SET start_at = ${s}, end_at = ${e}, edited = true, auto_closed = false WHERE id = ${id}`;
  return { ok: true };
}

// Director's view: everyone with a cap or any hours this month, with their pace
export async function teamHours(team, month = monthNow()) {
  await ensure();
  const staff = team.filter(m => String(m.type).toLowerCase() !== 'teacher' && !m.director);
  const [open, pend] = await Promise.all([
    sql()`SELECT email FROM ops_shifts WHERE end_at IS NULL`,
    sql()`SELECT email, id, hours FROM ops_hour_requests WHERE status = 'pending' AND month = ${month}`,
  ]);
  const onClock = new Set(open.map(r => r.email));
  const out = [];
  for (const m of staff) {
    const st = await statusFor(m, month);
    if (!st.cap && !st.used) continue;
    const req = pend.find(r => r.email === m.email);
    out.push({ name: m.name, email: m.email, used: st.used, cap: st.cap, limit: st.limit, pace: st.pace, level: st.level, left: st.left,
      onClock: onClock.has(m.email), request: req ? { id: String(req.id), hours: Number(req.hours) } : null,
      edited: st.shifts.filter(s => s.edited || s.autoClosed).length });
  }
  return out;
}

// Every 15 minutes: a reminder for shifts open 10+ hours, and shifts still open after midnight (New York)
// are closed at 11:59pm on the day they started and flagged so the person fixes the end time.
export async function sweepShifts({ base = '' } = {}) {
  if (!clockAvailable()) return { skipped: true };
  await ensure();
  const out = { reminded: [], closed: [] };
  const open = await sql()`SELECT * FROM ops_shifts WHERE end_at IS NULL`;
  const today = nyDate();
  for (const r of open) {
    const day = nyDate(r.start_at);
    if (day < today) {
      const close = nyInstant(day, '23:59:59');
      await sql()`UPDATE ops_shifts SET end_at = ${close}, auto_closed = true WHERE id = ${r.id}`;
      out.closed.push(r.email);
      try { await sendEmail({ to: r.email, subject: 'Your shift was closed at midnight', html: layout('Fix your end time', `<p>You were still clocked in at midnight, so the shift that started ${new Date(r.start_at).toLocaleTimeString('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit' })} on ${day} was closed at 11:59pm. Please put in the real end time.</p>${button(`${base}/ops/hours`, 'Fix it')}`) }); } catch {}
    } else if (!r.reminded && Date.now() - new Date(r.start_at) > 10 * 36e5) {
      await sql()`UPDATE ops_shifts SET reminded = true WHERE id = ${r.id}`;
      out.reminded.push(r.email);
      try { await sendEmail({ to: r.email, subject: 'Still on the clock?', html: layout('10 hours on the clock', '<p>You’ve been clocked in for 10 hours. If you’ve stopped, clock out and fix the end time.</p>' + button(`${base}/ops/hours`, 'Open hours')) }); } catch {}
    }
  }
  return out;
}
