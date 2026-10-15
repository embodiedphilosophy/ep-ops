// Faculty invitations: staff invite a teacher to an offering from the dashboard; the teacher answers Yes or No
// from the email, signs the standard contract online (Jacob's countersignature is added automatically), and is
// then put on the offering's sessions (Teachers + reminder email), so tasks, reminders and onboarding pick
// them up. Everything lives on two tabs of EP-Programming-Calendar, written through store.js (Change Log):
//   Faculty Invitations  one row per invitation, including the signed contract's full text (the archive)
//   Contract Templates   the standard contracts, with {{placeholders}} (Settings → Contracts)
import crypto from 'crypto';
import { readPlain, addPlain, updatePlain, createTab, ensureColumns, updateRows, readRows } from './store';
import { sign, verify } from './auth';
import { sendEmail, layout, button, esc } from './email';
import { loadCalendar, loadTeam } from '../calendar';
import { todayET } from '../events';

export const INVITES = 'Faculty Invitations';
export const TEMPLATES = 'Contract Templates';
export const INVITE_COLS = ['id', 'created_at', 'created_by', 'name', 'email', 'kind', 'offering', 'offering_title', 'dates', 'fee', 'fee_unit',
  'message', 'template', 'terms', 'status', 'email_status', 'responded_at', 'signer_name', 'signed_at', 'signer_ip', 'countersigned_by',
  'countersigned_at', 'contract_hash', 'contract_text'];
export const KINDS = ['Course', 'Workshop', 'Lecture', 'Meditation Mondays', 'Wisdom School', 'Sādhana School', 'Teacher training', 'Other'];
export const FEE_UNITS = [{ value: 'session', label: 'per session' }, { value: 'flat', label: 'for the whole offering' }];
export const STATUS_LABEL = { sent: 'Invited', declined: 'Declined', signed: 'Signed', cancelled: 'Cancelled' };
// The placeholders a contract template can use
export const PLACEHOLDERS = {
  teacher_name: 'the teacher’s name', teacher_email: 'their email', kind: 'Course, Lecture…', offering: 'the offering’s title',
  dates: 'the session dates', sessions: 'how many sessions', fee: 'the fee, e.g. $300 per session', terms: 'the course-specific terms you add',
  today: 'the date it is signed', director: 'the countersigner (Jacob Kyle)',
};

const TTL = 60 * 24 * 3600; // invitation links work for 60 days
const usd = n => `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: Number(n) % 1 ? 2 : 0 })}`;
const nice = d => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });

async function ensureTab(title, cols) {
  try { await readPlain(title, { light: false }); }
  catch { await createTab(title, cols); return; }
  await ensureColumns(title, cols);
}

export async function loadInvites({ light = true } = {}) {
  try { return (await readPlain(INVITES, { light })).rows.map(r => ({ row: r.row, ...r.values })).filter(r => r.id); }
  catch { return []; }
}
export async function loadTemplates() {
  try { return (await readPlain(TEMPLATES, { light: false })).rows.map(r => r.values).filter(t => t.name && t.body && String(t.active).toUpperCase() !== 'FALSE'); }
  catch { return []; }
}

// What can be offered: programs (by series) and single upcoming sessions, from the Master Schedule
export async function offerings() {
  const today = todayET();
  const cal = (await loadCalendar()).filter(e => (e.end_date || e.date) >= today && e.sched_id);
  const bySeries = new Map(), out = [];
  for (const e of cal.sort((a, b) => a.date.localeCompare(b.date))) {
    if (e.series && e.track !== 'MM') {
      if (!bySeries.has(e.series)) bySeries.set(e.series, { key: `series:${e.series}`, title: e.program_name || e.title.split(':')[0].trim(), track: e.track, dates: [] });
      bySeries.get(e.series).dates.push(e.date);
    } else out.push({ key: `event:${e.sched_id}`, title: e.title, track: e.track, dates: [e.date] });
  }
  return [...bySeries.values(), ...out].sort((a, b) => a.dates[0].localeCompare(b.dates[0]))
    .map(o => ({ ...o, label: `${nice(o.dates[0]).replace(/, \d{4}$/, '')} · ${o.title}${o.dates.length > 1 ? ` (${o.dates.length} sessions)` : ''}` }));
}

const feeText = inv => inv.fee ? `${usd(inv.fee)} ${inv.fee_unit === 'flat' ? 'for the whole offering' : 'per session'}` : 'as agreed';
// The contract with its placeholders filled in
export function fillContract(body, inv, { signedOn = todayET(), director = 'Jacob Kyle' } = {}) {
  const dates = String(inv.dates || '').split(',').map(s => s.trim()).filter(Boolean);
  const v = {
    teacher_name: inv.signer_name || inv.name, teacher_email: inv.email, kind: inv.kind, offering: inv.offering_title,
    dates: dates.map(nice).join('; '), sessions: String(dates.length || ''), fee: feeText(inv), terms: inv.terms || '',
    today: nice(signedOn), director,
  };
  return String(body).replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (m, k) => k in v ? v[k] : m);
}

export const inviteToken = inv => sign({ inv: inv.id, email: inv.email }, TTL);
export function readToken(token) { const d = verify(token); return d?.inv ? d : null; }
export const inviteUrl = (base, inv, answer) => `${base}/invite/${inviteToken(inv)}${answer ? `?a=${answer}` : ''}`;

function inviteEmail(inv, base) {
  const first = String(inv.name).split(' ')[0];
  return {
    subject: `An invitation to teach: ${inv.offering_title}`,
    html: layout(`Will you teach ${inv.offering_title}?`, `<p>Dear ${esc(first)},</p>
      ${inv.message ? `<p>${esc(inv.message).replace(/\n/g, '<br>')}</p>` : `<p>We would love you to teach <b>${esc(inv.offering_title)}</b> with Embodied Philosophy.</p>`}
      <p><b>${esc(inv.kind)}</b> · ${String(inv.dates).split(',').filter(Boolean).map(d => esc(nice(d.trim()))).join(' · ')}<br>Fee: ${esc(feeText(inv))}</p>
      ${button(inviteUrl(base, inv, 'yes'), 'Yes, I’d love to')}
      <p><a href="${esc(inviteUrl(base, inv, 'no'))}" style="color:#5A5346">Not this time</a></p>
      <p style="color:#6E6658;font-size:13px">Saying yes takes you to our standard agreement to read and sign online, then to a short onboarding for your bio, photo and course details.</p>`),
  };
}

// Send (or re-send) the email. Without email set up, the invitation still works: staff copy the link.
async function deliver(inv, base) {
  if (!process.env.RESEND_API_KEY) return 'not sent: email isn’t set up here, copy the link';
  try { await sendEmail({ to: inv.email, ...inviteEmail(inv, base) }); return `sent ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`; }
  catch (e) { console.error('Invitation email failed', e.message); return 'email failed, copy the link'; }
}

export async function createInvite(f, who, base) {
  await ensureTab(INVITES, INVITE_COLS);
  const offs = await offerings();
  const off = offs.find(o => o.key === f.offering);
  if (!off) throw new Error('Pick what you are inviting them to');
  const tpls = await loadTemplates();
  if (!tpls.some(t => t.name === f.template)) throw new Error(tpls.length ? 'Pick a contract' : 'Add your standard contract in Settings → Contracts first');
  const id = 'F' + crypto.randomBytes(4).toString('hex');
  const inv = {
    id, created_at: new Date().toISOString(), created_by: who, name: f.name, email: f.email, kind: f.kind, offering: off.key,
    offering_title: f.title || off.title, dates: off.dates.join(', '), fee: f.fee, fee_unit: f.fee_unit, message: f.message,
    template: f.template, terms: f.terms, status: 'sent',
  };
  inv.email_status = await deliver(inv, base);
  await addPlain(INVITES, inv, { who });
  return { ...inv, link: inviteUrl(base, inv) };
}

export async function resendInvite(id, who, base) {
  const inv = (await loadInvites({ light: false })).find(r => r.id === id);
  if (!inv) throw new Error('No such invitation');
  if (inv.status !== 'sent') throw new Error('Only an open invitation can be sent again');
  const email_status = await deliver(inv, base);
  await updatePlain(INVITES, inv.row, { email_status }, { before: { status: inv.status }, who });
  return { link: inviteUrl(base, inv), email_status };
}

export async function cancelInvite(id, who) {
  const inv = (await loadInvites({ light: false })).find(r => r.id === id);
  if (!inv) throw new Error('No such invitation');
  if (inv.status === 'signed') throw new Error('A signed contract can’t be cancelled here');
  await updatePlain(INVITES, inv.row, { status: 'cancelled' }, { before: { status: inv.status }, who });
}

export async function findByToken(token) {
  const t = readToken(token);
  if (!t) return null;
  const inv = (await loadInvites({ light: false })).find(r => r.id === t.inv && r.email.toLowerCase() === String(t.email).toLowerCase());
  return inv || null;
}

async function notifyStaff(inv, line, base) {
  if (!process.env.RESEND_API_KEY) return;
  const team = await loadTeam().catch(() => []);
  const to = [...new Set([inv.created_by, ...team.filter(m => m.director).map(m => m.name)])]
    .map(n => team.find(m => m.name === n || m.email === n)?.email).filter(Boolean);
  if (to.length) await sendEmail({ to, subject: `${inv.name}: ${line}`, html: layout(line, `<p><b>${esc(inv.name)}</b> ${esc(line.toLowerCase())} for <b>${esc(inv.offering_title)}</b>.</p>${button(`${base}/ops/team?tab=invitations`, 'Open Faculty')}`) }).catch(e => console.error('Notify failed', e.message));
}

export async function decline(token, base) {
  const inv = await findByToken(token);
  if (!inv) throw new Error('This link has expired. Please reply to the email instead.');
  if (inv.status !== 'sent') return inv;
  await updatePlain(INVITES, inv.row, { status: 'declined', responded_at: new Date().toISOString() }, { before: { status: 'sent' }, who: inv.email });
  await notifyStaff(inv, 'Declined the invitation', base);
  return { ...inv, status: 'declined' };
}

// Sign: archive the exact text they agreed to (with a fingerprint), countersign, and put them on the sessions
export async function signContract(token, { name, agree }, { ip = '', base = '' } = {}) {
  const inv = await findByToken(token);
  if (!inv) throw new Error('This link has expired. Please reply to the email instead.');
  if (inv.status === 'signed') return inv;
  if (inv.status !== 'sent') throw new Error('This invitation is no longer open.');
  const signer = String(name || '').trim();
  if (signer.length < 3) throw new Error('Type your full name to sign');
  if (!agree) throw new Error('Tick the box to agree');
  const tpl = (await loadTemplates()).find(t => t.name === inv.template);
  if (!tpl) throw new Error('The contract is missing. Please reply to the email and we’ll sort it out.');
  const team = await loadTeam().catch(() => []);
  const director = team.find(m => m.director)?.name || 'Jacob Kyle';
  const now = new Date().toISOString(), today = todayET();
  const text = fillContract(tpl.body, { ...inv, signer_name: signer }, { signedOn: today, director });
  const fields = {
    status: 'signed', responded_at: inv.responded_at || now, signer_name: signer, signed_at: now, signer_ip: String(ip).slice(0, 60),
    countersigned_by: director, countersigned_at: now, contract_text: text,
    contract_hash: crypto.createHash('sha256').update(text).digest('hex').slice(0, 16),
  };
  await updatePlain(INVITES, inv.row, fields, { before: { status: 'sent' }, who: inv.email });
  const done = { ...inv, ...fields };
  await addToSessions(done).catch(e => console.error('Adding the teacher to sessions failed', e.message));
  if (process.env.RESEND_API_KEY) {
    await sendEmail({ to: inv.email, subject: `Signed: your agreement for ${inv.offering_title}`, html: layout('Thank you, and welcome', `<p>Your agreement for <b>${esc(inv.offering_title)}</b> is signed and countersigned by ${esc(director)}. Keep this link to read or print it any time:</p>
      ${button(`${base}/invite/${token}/contract`, 'Your signed agreement')}
      <p>Next: a short onboarding for your bio, photo and course details. Sign in with this email address.</p>${button(`${base}/teach`, 'Start onboarding')}
      <p style="color:#6E6658;font-size:13px">You’ll also get an invitation from Gusto, our payroll service, to add your payment details. We never see your bank details.</p>`) }).catch(e => console.error('Signed email failed', e.message));
  }
  await notifyStaff(done, 'Signed the agreement', base);
  return done;
}

// The signed teacher goes on every session of the offering: their name in Teachers and their email in the
// reminder emails (added to whoever is there already, never replacing anyone)
export async function addToSessions(inv) {
  const [kind, ref] = String(inv.offering).split(':');
  const [sched, det] = await Promise.all([readRows('schedule'), readRows('details')]);
  const D = Object.fromEntries(det.map(r => [r.id, r.fields]));
  const ids = kind === 'event' ? [ref] : sched.filter(r => String(D[r.id]?.Series || '').trim() === ref && !/cancel/i.test(r.fields.Status)).map(r => r.id);
  const add = (list, v, sep) => { const xs = String(list || '').split(/[,;]/).map(s => s.trim()).filter(Boolean); return xs.some(x => x.toLowerCase() === v.toLowerCase()) ? xs.join(sep) : [...xs, v].join(sep); };
  const S = Object.fromEntries(sched.map(r => [r.id, r.fields]));
  const who = 'Faculty invitation';
  await updateRows('schedule', ids.filter(id => S[id]).map(id => ({ id, changes: { 'Teachers & Hosts': add(S[id]['Teachers & Hosts'], inv.name, ', ') } })), { who });
  await updateRows('details', ids.map(id => ({ id, changes: { 'Teacher/Host Emails': add(D[id]?.['Teacher/Host Emails'], inv.email.toLowerCase(), ', ') } })), { who, create: true });
  return ids.length;
}

// What a signed invitation owes, session by session (Finance → To pay reads this)
export function earnings(inv) {
  if (inv.status !== 'signed' || !Number(inv.fee)) return [];
  const dates = String(inv.dates).split(',').map(s => s.trim()).filter(Boolean).sort();
  if (inv.fee_unit === 'flat') return dates.length ? [{ key: `${inv.id}:all`, date: dates.at(-1), amount: Number(inv.fee), what: inv.offering_title }] : [];
  return dates.map((d, i) => ({ key: `${inv.id}:${d}`, date: d, amount: Number(inv.fee), what: `${inv.offering_title}, session ${i + 1}` }));
}
