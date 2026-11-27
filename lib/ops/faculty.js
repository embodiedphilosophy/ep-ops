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
import { GENERAL_TEMPLATE, GENERAL_NAME } from './agreement';

export const INVITES = 'Faculty Invitations';
export const TEMPLATES = 'Contract Templates';
export const INVITE_COLS = ['id', 'created_at', 'created_by', 'name', 'email', 'kind', 'offering', 'offering_title', 'dates', 'fee', 'fee_unit',
  'message', 'template', 'terms', 'status', 'email_status', 'responded_at', 'signer_name', 'signed_at', 'signer_ip', 'countersigned_by',
  'countersigned_at', 'contract_hash', 'contract_text', 'source'];
// source: '' for an invitation, 'onboarding' for the general agreement a teacher signs during onboarding (/teach)
export const KINDS = ['Course', 'Workshop', 'Lecture', 'Meditation Mondays', 'Wisdom School', 'Sādhana School', 'Teacher training', 'Other'];
export const FEE_UNITS = [{ value: 'session', label: 'per session' }, { value: 'flat', label: 'for the whole offering' }];
export const STATUS_LABEL = { sent: 'Invited', declined: 'Declined', signed: 'Signed', accepted: 'Accepted', cancelled: 'Cancelled' };
// Agreed to teach: signed the agreement, or accepted an invitation that had none
export const isAgreed = s => s === 'signed' || s === 'accepted';
// The placeholders a contract template can use
export const PLACEHOLDERS = {
  teacher_name: 'the teacher’s name', teacher_email: 'their email', kind: 'Course, Lecture…', offering: 'the offering’s title',
  dates: 'the session dates', sessions: 'how many sessions', fee: 'the fee, e.g. $300 per session', terms: 'the course-specific terms you add',
  today: 'the date it is signed', director: 'the countersigner (Jacob Kyle)',
  offerings_list: 'each offering on its own line, with its dates', terms_or_none: 'the course-specific terms, or “None.”',
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
// The sheet's agreements, plus the built-in General Teaching Agreement unless the sheet has its own row of that
// name (which then replaces it; switching that row off with active = FALSE turns the general agreement off too)
export async function loadTemplates() {
  let rows = [];
  try { rows = (await readPlain(TEMPLATES, { light: false })).rows.map(r => r.values).filter(t => t.name); } catch { /* no tab yet */ }
  const live = rows.filter(t => t.body && String(t.active).toUpperCase() !== 'FALSE');
  return rows.some(t => t.name.trim() === GENERAL_NAME) ? live : [...live, GENERAL_TEMPLATE];
}
export const generalTemplate = async () => (await loadTemplates()).find(t => t.name.trim() === GENERAL_NAME) || null;

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

const feeText = inv => inv.fee_text ? inv.fee_text : inv.fee ? `${usd(inv.fee)} ${inv.fee_unit === 'flat' ? 'for the whole offering' : 'per session'}` : 'as agreed';
// The contract with its placeholders filled in
export function fillContract(body, inv, { signedOn = todayET(), director = 'Jacob Kyle' } = {}) {
  const dates = String(inv.dates || '').split(',').map(s => s.trim()).filter(Boolean);
  const v = {
    teacher_name: inv.signer_name || inv.name, teacher_email: inv.email, kind: inv.kind, offering: inv.offering_title,
    dates: dates.map(nice).join('; '), sessions: String(dates.length || ''), fee: feeText(inv), terms: inv.terms || '',
    today: nice(signedOn), director,
    offerings_list: inv.offerings_list || `  • ${inv.offering_title}${inv.kind ? ` (${inv.kind})` : ''}${dates.length ? `: ${dates.map(nice).join('; ')}` : ''}`,
    terms_or_none: String(inv.terms || '').trim() || 'None.',
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
      <p style="color:#6E6658;font-size:13px">${inv.template ? 'Saying yes takes you to our standard agreement to read and sign online, then to' : 'Saying yes takes you to'} a short onboarding for your bio, photo and course details.</p>`),
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
  // No agreement is allowed: the teacher then simply accepts (see accept below)
  if (f.template && !tpls.some(t => t.name === f.template)) throw new Error('That agreement isn’t in Settings → Contracts any more');
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
  if (isAgreed(inv.status)) throw new Error('They have already agreed to teach; this can’t be cancelled here');
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
  if (to.length) await sendEmail({ to, subject: `${inv.name}: ${line}`, html: layout(line, `<p><b>${esc(inv.name)}</b> ${esc(line.toLowerCase())} for <b>${esc(inv.offering_title)}</b>.</p>${button(`${base}/ops/people?tab=invitations`, 'Open Faculty')}`) }).catch(e => console.error('Notify failed', e.message));
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

// An invitation without an agreement: they accept, go on the sessions and get their onboarding link
export async function accept(token, { base = '' } = {}) {
  const inv = await findByToken(token);
  if (!inv) throw new Error('This link has expired. Please reply to the email instead.');
  if (isAgreed(inv.status)) return inv;
  if (inv.status !== 'sent') throw new Error('This invitation is no longer open.');
  if (inv.template) throw new Error('This invitation has an agreement to sign first.');
  const now = new Date().toISOString();
  await updatePlain(INVITES, inv.row, { status: 'accepted', responded_at: now }, { before: { status: 'sent' }, who: inv.email });
  const done = { ...inv, status: 'accepted', responded_at: now };
  await addToSessions(done).catch(e => console.error('Adding the teacher to sessions failed', e.message));
  const { sendOnboardingLink } = await import('./people');
  await sendOnboardingLink(inv, base);
  await notifyStaff(done, 'Accepted the invitation', base);
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
  if (!isAgreed(inv.status) || !Number(inv.fee)) return [];
  const dates = String(inv.dates).split(',').map(s => s.trim()).filter(Boolean).sort();
  if (inv.fee_unit === 'flat') return dates.length ? [{ key: `${inv.id}:all`, date: dates.at(-1), amount: Number(inv.fee), what: inv.offering_title }] : [];
  return dates.map((d, i) => ({ key: `${inv.id}:${d}`, date: d, amount: Number(inv.fee), what: `${inv.offering_title}, session ${i + 1}` }));
}

// ---------- the agreement step in teacher onboarding (/teach) ----------
// A teacher who reaches onboarding without having signed an agreement (staff added them, or the invitation had none)
// reads and signs the General Teaching Agreement there. It is archived on the same Faculty Invitations tab
// (source = onboarding), so Faculty → Invitations, the printable copy and the fingerprint all work the same way.
export const ONBOARDING_FEE = 'as agreed with EP in writing for each offering';
const offeringLines = offs => offs.length ? offs.map(o => {
  const ds = [...new Set((o.sessions || []).map(x => x.date))].sort();
  const when = ds.length > 3 ? `${ds.length} sessions, ${nice(ds[0])} to ${nice(ds.at(-1))}` : ds.map(nice).join('; ');
  return `  • ${o.title}${when ? `: ${when}` : ''}`;
}).join('\n') : '  • the offerings EP and the Contractor agree in writing';
const onboardingInv = (email, name, offs) => ({
  name, email, kind: 'General', offering_title: GENERAL_NAME, offerings_list: offeringLines(offs), fee_text: ONBOARDING_FEE,
  dates: [...new Set(offs.flatMap(o => (o.sessions || []).map(x => x.date)))].sort().join(', '),
});
const sameEmail = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
async function director() { return (await loadTeam().catch(() => [])).find(m => m.director)?.name || 'Jacob Kyle'; }

// Where this teacher stands: 'signed' (any agreement signed, by invitation or here), 'needed' (with the text to
// read), or 'none' (staff and contractors, who have their own agreements, or the general agreement is switched off)
export async function agreementFor(email, offs, { name = '' } = {}) {
  const signed = (await loadInvites({ light: true })).filter(r => sameEmail(r.email, email) && r.status === 'signed')
    .sort((a, b) => String(b.signed_at).localeCompare(String(a.signed_at)))[0];
  if (signed) return { status: 'signed', id: signed.id, title: signed.offering_title, signed_at: signed.signed_at, signer: signed.signer_name,
    countersigned_by: signed.countersigned_by, link: `/invite/${inviteToken(signed)}/contract` };
  const { teamRows } = await import('./people');
  const team = (await teamRows().catch(() => [])).find(r => r.active && sameEmail(r.email, email));
  if (team && String(team.type || '').toLowerCase() !== 'teacher') return { status: 'none', why: 'staff' };
  const tpl = await generalTemplate();
  if (!tpl) return { status: 'none', why: 'off' };
  return { status: 'needed', text: fillContract(tpl.body, onboardingInv(email, name || 'the Contractor', offs), { director: await director() }) };
}

// Sign it during onboarding. offs: the teacher's current offerings (read fresh by the caller).
export async function signOnboardingAgreement(email, offs, { name, agree }, { ip = '', base = '' } = {}) {
  const signer = String(name || '').trim();
  if (signer.length < 3) throw new Error('Type your full name to sign');
  if (!agree) throw new Error('Tick the box to agree');
  const now = await agreementFor(email, offs, { name: signer });
  if (now.status === 'signed') return now;
  if (now.status !== 'needed') throw new Error('There’s no agreement for you to sign here. If that’s a surprise, reply to your onboarding email.');
  const tpl = await generalTemplate(), dir = await director();
  const at = new Date().toISOString();
  const text = fillContract(tpl.body, onboardingInv(email, signer, offs), { director: dir });
  await ensureTab(INVITES, INVITE_COLS);
  const inv = {
    name: signer, kind: 'General', offering_title: GENERAL_NAME, dates: onboardingInv(email, signer, offs).dates, fee: '', fee_unit: '',
    id: 'F' + crypto.randomBytes(4).toString('hex'), created_at: at, created_by: 'Teacher onboarding', email: String(email).toLowerCase(),
    offering: '', template: tpl.name, status: 'signed', email_status: '', responded_at: at, signer_name: signer, signed_at: at,
    signer_ip: String(ip).slice(0, 60), countersigned_by: dir, countersigned_at: at, contract_text: text,
    contract_hash: crypto.createHash('sha256').update(text).digest('hex').slice(0, 16), source: 'onboarding',
  };
  await addPlain(INVITES, inv, { who: inv.email });
  const link = `${base}/invite/${inviteToken(inv)}/contract`;
  if (process.env.RESEND_API_KEY) {
    await sendEmail({ to: inv.email, subject: 'Signed: your teaching agreement with Embodied Philosophy', html: layout('Your agreement is signed', `<p>Thank you, ${esc(signer.split(' ')[0])}. Your General Teaching Agreement is signed and countersigned by ${esc(dir)}. Keep this link to read or print it any time:</p>
      ${button(link, 'Your signed agreement')}
      <p style="color:#6E6658;font-size:13px">You’ll also get an invitation from Gusto, our payroll service, to add your payment details. We never see your bank details.</p>`) }).catch(e => console.error('Signed email failed', e.message));
  }
  await notifyStaff({ ...inv, offering_title: 'their teaching (signed during onboarding)' }, 'Signed the General Teaching Agreement', base);
  return { status: 'signed', id: inv.id, title: inv.offering_title, signed_at: at, signer, countersigned_by: dir, link: `/invite/${inviteToken(inv)}/contract` };
}

// For lists of teachers (Faculty → Onboarding, /teach for directors): who has signed any agreement, in one read
export async function signedEmails() {
  return new Set((await loadInvites({ light: true })).filter(r => r.status === 'signed').map(r => String(r.email).trim().toLowerCase()));
}
