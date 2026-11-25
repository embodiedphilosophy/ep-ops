// Payroll: one place for a month's pay. Lines fill themselves in from three sources, and every part is editable:
//   faculty  each taught session or module, per teacher (Teacher/Host Emails on the Master Schedule). Hours come from
//            the session's length (Schedule/Track Defaults "duration", in minutes), the rate from the teacher's usual
//            rate (Payroll People). A signed or accepted invitation's fee wins (a fixed amount for that session).
//   salary   staff paid the same every month (Payroll People, kind salary)
//   hourly   staff who invoice their hours: the month's clocked hours (Hours) at their rate (Payroll People, else the
//            Team tab's hourly_rate)
// Saved edits live on the "Payroll" tab (one row per line, by key) and win over what is worked out. "Finalize" saves
// every line as it stands and locks the month ("Payroll Months"); "Send" emails it to the payroll admin
// ("Payroll Settings"). Staff on the Team tab (not teachers) are paid as faculty only when their Payroll People row
// says sessions = yes (e.g. Floss, paid for the sessions she hosts as well as her staff work), at their session_rate.
// All tabs are dashboard-owned, on EP-Programming-Calendar; every write goes through store.js (Change Log).
import { readPlain, addPlain, updatePlain, createTab, ensureColumns } from './store';
import { loadCalendar } from '../calendar';
import { emailsOf } from '../events';
import { names } from './tasks';
import { loadInvites, earnings } from './faculty';
import { teamRows } from './people';
import { loadProfiles } from '../teach';
import { statusFor, clockAvailable, monthNow } from './hours';
import { sendEmail, layout, esc } from './email';

export const LINES = 'Payroll', PEOPLE = 'Payroll People', MONTHS = 'Payroll Months', SETTINGS = 'Payroll Settings';
const LINE_COLS = ['key', 'month', 'kind', 'name', 'email', 'what', 'date', 'hours', 'rate', 'amount', 'fixed', 'note', 'removed', 'updated_by', 'updated_at'];
const PEOPLE_COLS = ['email', 'name', 'kind', 'rate', 'monthly', 'session_rate', 'sessions', 'note'];
const MONTH_COLS = ['month', 'status', 'total', 'lines', 'finalized_at', 'finalized_by', 'sent_at', 'sent_by', 'sent_to'];
const SETTING_COLS = ['key', 'value'];
const lower = s => String(s || '').trim().toLowerCase();
const num = v => { const n = Number(String(v ?? '').replace(/[^0-9.\-]/g, '')); return Number.isFinite(n) && String(v ?? '').trim() !== '' ? n : null; };
const money = n => Math.round(n * 100) / 100;
export const MONTH = /^\d{4}-\d{2}$/;
export const KINDS = { faculty: 'Faculty', salary: 'Salaried staff', hourly: 'Hourly staff', other: 'Other' };

async function tab(title, cols) {
  try { await readPlain(title, { light: false }); await ensureColumns(title, cols); }
  catch { await createTab(title, cols); }
}
const rowsOf = async (title, light = false) => (await readPlain(title, { light }).catch(() => ({ rows: [] }))).rows.map(r => ({ row: r.row, ...r.values }));

// ---------- settings, people, months ----------
export async function settings() {
  const s = Object.fromEntries((await rowsOf(SETTINGS)).map(r => [r.key, r.value]));
  return { admin_name: s.admin_name || '', admin_email: s.admin_email || '' };
}
export async function saveSettings({ admin_name, admin_email }, who) {
  const e = lower(admin_email);
  if (e && !/^[^\s@,]+@[^\s@,]+\.[a-z]{2,}$/i.test(e)) throw new Error('A valid email address for the payroll admin, please');
  await tab(SETTINGS, SETTING_COLS);
  const have = await rowsOf(SETTINGS);
  for (const [key, value] of [['admin_name', String(admin_name || '').trim().slice(0, 120)], ['admin_email', e]]) {
    const r = have.find(x => x.key === key);
    if (r) await updatePlain(SETTINGS, r.row, { value }, { who }); else await addPlain(SETTINGS, { key, value }, { who });
  }
  return settings();
}

export const loadPeople = async () => (await rowsOf(PEOPLE)).filter(r => r.email || r.name).map(r => ({ ...r, email: lower(r.email), kind: lower(r.kind) || 'faculty' }));
export async function savePerson(p, who) {
  const email = lower(p.email), kind = lower(p.kind);
  if (!/^[^\s@,]+@[^\s@,]+\.[a-z]{2,}$/i.test(email)) throw new Error('A valid email address, please');
  if (!['faculty', 'salary', 'hourly'].includes(kind)) throw new Error('Pick how they’re paid');
  const rate = num(p.rate), monthly = num(p.monthly), sessionRate = num(p.session_rate), sessions = p.sessions === true || /^(yes|true)$/i.test(String(p.sessions || ''));
  if (kind === 'salary' && monthly == null) throw new Error('Their monthly amount, please');
  await tab(PEOPLE, PEOPLE_COLS);
  const values = { email, name: String(p.name || '').trim().slice(0, 120), kind, rate: rate == null ? '' : String(rate), monthly: monthly == null ? '' : String(monthly),
    session_rate: kind === 'faculty' || sessionRate == null ? '' : String(sessionRate), sessions: kind !== 'faculty' && sessions ? 'yes' : '', note: String(p.note || '').slice(0, 300) };
  const cur = (await rowsOf(PEOPLE)).find(r => lower(r.email) === email);
  if (cur) await updatePlain(PEOPLE, cur.row, values, { who }); else await addPlain(PEOPLE, values, { who });
}
export async function removePerson(email, who) {
  const cur = (await rowsOf(PEOPLE)).find(r => lower(r.email) === lower(email));
  if (!cur) throw new Error('Not on the list');
  // Blank the row rather than delete it (store.js never deletes); blank rows are ignored
  await updatePlain(PEOPLE, cur.row, { email: '', name: '', kind: '', rate: '', monthly: '', session_rate: '', sessions: '', note: `removed ${new Date().toISOString().slice(0, 10)} (${cur.email})` }, { who });
}

const monthRow = async m => (await rowsOf(MONTHS)).find(r => r.month === m) || null;
async function setMonth(m, values, who) {
  await tab(MONTHS, MONTH_COLS);
  const cur = await monthRow(m);
  if (cur) await updatePlain(MONTHS, cur.row, values, { who }); else await addPlain(MONTHS, { month: m, ...values }, { who });
}

// ---------- lines ----------
const amountOf = l => l.fixed === 'yes' || num(l.hours) == null || num(l.rate) == null ? num(l.amount) : money(num(l.hours) * num(l.rate));

// What the month's lines would be, worked out from the schedule, invitations, people and hours
async function autoLines(month) {
  const [cal, invites, people, team, profiles] = await Promise.all([loadCalendar({ fresh: true }), loadInvites({ light: false }).catch(() => []), loadPeople(), teamRows().catch(() => []), loadProfiles().catch(() => [])]);
  const P = Object.fromEntries(people.map(p => [p.email, p]));
  // Staff aren't paid per session unless their Payroll People row says so
  const staff = new Set(team.filter(t => t.active && lower(t.type) !== 'teacher').map(t => t.email).filter(e => P[e]?.sessions !== 'yes'));
  const nameOf = Object.fromEntries([...profiles.map(p => [lower(p.email), p.name]), ...team.map(t => [t.email, t.name])].filter(([, n]) => n));
  // An invitation's fee for (email, date): per session, or the whole fee on the last date
  const fee = {};
  for (const inv of invites) for (const e of earnings(inv)) fee[`${lower(inv.email)}|${e.date}`] = { amount: e.amount, flat: inv.fee_unit === 'flat', what: e.what };
  const out = [];
  for (const e of cal.filter(x => x.date?.slice(0, 7) === month && !/cancel/i.test(x.status))) {
    const emails = emailsOf(e).map(lower), listed = names(e.teachers);
    const mins = num(e.duration_minutes);
    emails.forEach((email, i) => {
      if (staff.has(email)) return;
      const f = fee[`${email}|${e.date}`], p = P[email];
      out.push({ key: `f:${e.sched_id || e.id}:${email}`, month, kind: 'faculty', name: nameOf[email] || p?.name || listed.at(i) || email, email, what: e.title, date: e.date,
        hours: mins ? String(Math.round((mins / 60) * 4) / 4) : '', rate: (p?.kind === 'faculty' ? p.rate : p?.session_rate) || '', amount: f ? String(f.amount) : '', fixed: f ? 'yes' : '',
        note: f ? `From the invitation: ${f.flat ? 'flat fee for the whole offering' : 'per session'}` : mins ? '' : 'No session length on the schedule: add the hours' });
    });
    // Names with no email on the session still need paying: flag them
    if (!emails.length && listed.length) for (const n of listed) out.push({ key: `f:${e.sched_id || e.id}:${lower(n)}`, month, kind: 'faculty', name: n, email: '', what: e.title, date: e.date, hours: mins ? String(Math.round((mins / 60) * 4) / 4) : '', rate: '', amount: '', fixed: '', note: 'No teacher email on this session in Programming' });
  }
  for (const p of people.filter(p => p.kind === 'salary')) out.push({ key: `s:${p.email}`, month, kind: 'salary', name: p.name || nameOf[p.email] || p.email, email: p.email, what: 'Monthly pay', date: `${month}-28`, hours: '', rate: '', amount: p.monthly, fixed: 'yes', note: p.note || '' });
  const hourly = new Map(people.filter(p => p.kind === 'hourly').map(p => [p.email, p]));
  for (const t of team.filter(t => t.active && !['teacher', 'director'].includes(lower(t.type)) && num(t.hourly_rate) != null)) if (!hourly.has(t.email) && P[t.email]?.kind !== 'salary') hourly.set(t.email, { email: t.email, name: t.name, rate: t.hourly_rate });
  for (const p of hourly.values()) {
    const member = team.find(t => t.email === p.email) || { email: p.email, name: p.name };
    let used = null;
    if (clockAvailable()) try { used = (await statusFor(member, month)).used; } catch { /* clock unreachable: hours typed by hand */ }
    out.push({ key: `h:${p.email}`, month, kind: 'hourly', name: p.name || member.name || p.email, email: p.email, what: 'Hours', date: `${month}-28`, hours: used == null ? '' : String(used), rate: p.rate || member.hourly_rate || '', amount: '', fixed: '', note: used == null ? 'Hours from the time clock weren’t available: type them in' : 'From the time clock' });
  }
  return out;
}

// The month as shown: saved lines, plus worked-out lines not saved yet (unsaved: true). A finalized month is its snapshot.
export async function monthView(month) {
  if (!MONTH.test(month)) throw new Error('Pick a month');
  const [saved, m] = await Promise.all([rowsOf(LINES).then(r => r.filter(x => x.month === month)), monthRow(month)]);
  const status = m?.status || 'open', locked = status !== 'open';
  const have = new Set(saved.map(l => l.key));
  const fresh = locked ? [] : (await autoLines(month)).filter(l => !have.has(l.key)).map(l => ({ ...l, unsaved: true }));
  const lines = [...saved.map(({ row, ...l }) => l), ...fresh].map(l => ({ ...l, amount_due: amountOf(l) }))
    .sort((a, b) => Object.keys(KINDS).indexOf(a.kind) - Object.keys(KINDS).indexOf(b.kind) || String(a.name).localeCompare(String(b.name)) || String(a.date).localeCompare(String(b.date)));
  const live = lines.filter(l => l.removed !== 'yes');
  return { month, status, monthRow: m, locked, lines, total: money(live.reduce((s, l) => s + (l.amount_due || 0), 0)),
    missing: live.filter(l => l.amount_due == null).length };
}

// Save one line's edits (a worked-out line is written the first time it's edited); key 'new' adds a line by hand
export async function saveLine(month, key, f, who) {
  const v = await monthView(month);
  if (v.locked) throw new Error('This month is finalized. Reopen it to make changes.');
  await tab(LINES, LINE_COLS);
  const cur = key === 'new' ? null : v.lines.find(l => l.key === key);
  if (key !== 'new' && !cur) throw new Error('That line isn’t in this month any more. Reload.');
  const clean = (k, max) => String(f[k] ?? cur?.[k] ?? '').trim().slice(0, max);
  const hours = 'hours' in f ? num(f.hours) : num(cur?.hours), rate = 'rate' in f ? num(f.rate) : num(cur?.rate), amount = 'amount' in f ? num(f.amount) : num(cur?.amount);
  if ([hours, rate, amount].some(n => n != null && n < 0)) throw new Error('No negative numbers, please');
  // Typing an amount fixes it; clearing it goes back to hours × rate
  const fixed = 'amount' in f ? (amount != null ? 'yes' : '') : (cur?.fixed || '');
  const values = { month, kind: KINDS[f.kind] ? f.kind : (cur?.kind || 'other'), name: clean('name', 120), email: lower(clean('email', 200)), what: clean('what', 200), date: clean('date', 10) || `${month}-28`,
    hours: hours == null ? '' : String(hours), rate: rate == null ? '' : String(rate), amount: amount == null ? '' : String(amount), fixed,
    // A reminder to add the hours clears itself once they're added
    note: hours != null && /^(No session length|Hours from the time clock weren)/.test(clean('note', 300)) && !('note' in f) ? '' : clean('note', 300), removed: 'removed' in f ? (f.removed ? 'yes' : '') : (cur?.removed || ''), updated_by: who, updated_at: new Date().toISOString() };
  if (key === 'new' && !values.name) throw new Error('Who is it for?');
  const row = (await rowsOf(LINES)).find(r => r.key === key && r.month === month);
  if (row) await updatePlain(LINES, row.row, values, { who });
  else await addPlain(LINES, { key: key === 'new' ? `m:${Date.now().toString(36)}` : key, ...values }, { who });
}

// Set the month's accounting: every line saved as it stands, the month locked
export async function finalize(month, who) {
  const v = await monthView(month);
  if (v.locked) throw new Error('Already finalized');
  if (v.missing) throw new Error(`${v.missing} line${v.missing === 1 ? ' has' : 's have'} no amount yet. Add the hours and rate (or an amount), or remove ${v.missing === 1 ? 'it' : 'them'}.`);
  await tab(LINES, LINE_COLS);
  const now = new Date().toISOString();
  for (const l of v.lines.filter(l => l.unsaved)) { const { unsaved, amount_due, ...rest } = l; await addPlain(LINES, { ...rest, updated_by: who, updated_at: now }, { who }); }
  const live = v.lines.filter(l => l.removed !== 'yes');
  await setMonth(month, { status: 'finalized', total: String(v.total), lines: String(live.length), finalized_at: now, finalized_by: who }, who);
  return { total: v.total, lines: live.length };
}
export async function reopen(month, who) {
  const m = await monthRow(month);
  if (!m || m.status === 'open') throw new Error('This month is already open');
  await setMonth(month, { status: 'open' }, who);
}

const label = m => new Date(`${m}-15T12:00:00Z`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const usd = n => n == null ? '' : `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const csvCell = v => /[",\n]/.test(String(v ?? '')) ? `"${String(v).replace(/"/g, '""')}"` : String(v ?? '');

// Email the finalized month to the payroll admin: a total per person, every line, and the same as a CSV file
export async function sendToAdmin(month, who) {
  const v = await monthView(month), s = await settings();
  if (!v.locked) throw new Error('Finalize the month first');
  if (!s.admin_email) throw new Error('Add the payroll admin’s email in Settings first');
  if (!process.env.RESEND_API_KEY) throw new Error('Email isn’t set up here, so nothing was sent');
  const live = v.lines.filter(l => l.removed !== 'yes');
  const people = new Map();
  for (const l of live) { const k = l.email || l.name; const p = people.get(k) || { name: l.name, email: l.email, total: 0, kinds: new Set() }; p.total = money(p.total + (l.amount_due || 0)); p.kinds.add(KINDS[l.kind] || l.kind); people.set(k, p); }
  const ppl = [...people.values()].sort((a, b) => a.name.localeCompare(b.name));
  const th = 'style="text-align:left;padding:6px 8px;border-bottom:1px solid #ddd;font-size:13px"', td = 'style="padding:6px 8px;border-bottom:1px solid #eee;font-size:13px"', tdr = 'style="padding:6px 8px;border-bottom:1px solid #eee;font-size:13px;text-align:right"';
  const first = String(s.admin_name || '').split(' ')[0] || 'there';
  const html = layout(`Payroll for ${label(month)}`, `
    <p>Hi ${esc(first)},</p><p>Here is Embodied Philosophy’s payroll for <b>${label(month)}</b>: <b>${usd(v.total)}</b> to ${ppl.length} ${ppl.length === 1 ? 'person' : 'people'}. Every line is in the attached spreadsheet file too.</p>
    <table style="border-collapse:collapse;width:100%"><tr><th ${th}>Name</th><th ${th}>Email</th><th ${th}>For</th><th ${th}>Amount</th></tr>
    ${ppl.map(p => `<tr><td ${td}>${esc(p.name)}</td><td ${td}>${esc(p.email)}</td><td ${td}>${esc([...p.kinds].join(', '))}</td><td ${tdr}><b>${usd(p.total)}</b></td></tr>`).join('')}
    <tr><td ${td} colspan="3"><b>Total</b></td><td ${tdr}><b>${usd(v.total)}</b></td></tr></table>
    <p style="margin-top:22px"><b>Line by line</b></p>
    <table style="border-collapse:collapse;width:100%"><tr><th ${th}>Name</th><th ${th}>What</th><th ${th}>Date</th><th ${th}>Hours</th><th ${th}>Rate</th><th ${th}>Amount</th></tr>
    ${live.map(l => `<tr><td ${td}>${esc(l.name)}</td><td ${td}>${esc(l.what)}${l.note ? `<br><span style="color:#6E6658">${esc(l.note)}</span>` : ''}</td><td ${td} nowrap>${esc(l.kind === 'faculty' && l.date ? new Date(`${l.date}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }) : '')}</td><td ${tdr}>${esc(l.hours)}</td><td ${tdr}>${l.rate ? usd(l.rate) : ''}</td><td ${tdr}>${usd(l.amount_due)}</td></tr>`).join('')}</table>
    <p style="color:#6E6658;font-size:13px">Sent from EP Ops by ${esc(who)}. Reply to this email with any questions.</p>`);
  const csv = [['Name', 'Email', 'Kind', 'What', 'Date', 'Hours', 'Rate (USD)', 'Amount (USD)', 'Note'], ...live.map(l => [l.name, l.email, KINDS[l.kind] || l.kind, l.what, l.kind === 'faculty' ? l.date : '', l.hours, l.rate, l.amount_due ?? '', l.note]), [], ['Total', '', '', '', '', '', '', v.total, '']]
    .map(r => r.map(csvCell).join(',')).join('\n');
  await sendEmail({ to: s.admin_email, subject: `EP payroll for ${label(month)}: ${usd(v.total)}`, html, attachments: [{ filename: `ep-payroll-${month}.csv`, content: csv }] });
  const now = new Date().toISOString();
  await setMonth(month, { status: 'sent', sent_at: now, sent_by: who, sent_to: s.admin_email }, who);
  return { to: s.admin_email, total: v.total };
}

// Who can see payroll besides directors: the Payroll role on the Team tab (only a director changes it)
export async function setAccess(email, on, who) {
  const p = (await teamRows()).find(r => r.email === lower(email) && r.active);
  if (!p) throw new Error('That person isn’t on the team');
  const roles = String(p.roles || '').split(',').map(s => s.trim()).filter(Boolean).filter(r => !/^payroll$/i.test(r));
  if (on) roles.push('Payroll');
  await updatePlain('Team', p.row, { roles: roles.join(', ') }, { before: { roles: p.roles || '' }, who });
  try { const { revalidateTag } = await import('next/cache'); const { TEAM_TAG } = await import('../calendar'); revalidateTag(TEAM_TAG, { expire: 0 }); } catch { /* outside a request */ }
}

export { monthNow };
