// Faculty → People: add someone to the Team tab, take them off (active = FALSE: they can no longer sign in, nothing is
// deleted and they can be brought back), and send a teacher their onboarding link. The Team tab decides who can sign
// in and as what (lib/ops/nav.js), so every change goes through store.js (Change Log) and expires the team cache.
import { revalidateTag } from 'next/cache';
import { readPlain, addPlain, updatePlain } from './store';
import { TEAM_TAG } from '../calendar';
import { sign } from './auth';
import { sendEmail, layout, button, esc } from './email';

const TAB = 'Team';
const lower = s => String(s || '').trim().toLowerCase();
const EMAIL = /^[^\s@,]+@[^\s@,]+\.[a-z]{2,}$/i;
const off = v => String(v).trim().toUpperCase() === 'FALSE';
// The kinds of person on the Team tab, in words. Directors, the general manager and the project manager can edit
// events and the website, so only a director can give someone one of those.
export const TYPES = [
  { value: 'teacher', label: 'Teacher', note: 'Sees only their own sessions and onboarding' },
  { value: 'contractor', label: 'Contractor', note: 'Staff access; what they can edit comes from their roles' },
  { value: 'marketing', label: 'Marketing', note: 'Staff access, plus email and social with the right roles' },
  { value: 'projects', label: 'Project manager', note: 'Edits events and the website', director: true },
  { value: 'manager', label: 'General manager', note: 'Edits events and the website', director: true },
  { value: 'director', label: 'Director', note: 'Everything, including Finance and Settings', director: true },
];
const expire = () => { try { revalidateTag(TEAM_TAG, { expire: 0 }); } catch { /* outside a request (tests) */ } };

// Everyone on the Team tab, including people who were taken off
export async function teamRows() {
  return (await readPlain(TAB)).rows.filter(r => r.values.email || r.values.name)
    .map(r => ({ row: r.row, ...r.values, email: lower(r.values.email), active: !off(r.values.active) }));
}

export async function addPerson({ name, email, type = 'contractor', roles = '' }, actor) {
  const n = String(name || '').trim().slice(0, 120), e = lower(email), t = TYPES.find(x => x.value === type);
  if (!n) throw new Error('Their name, please');
  if (!EMAIL.test(e)) throw new Error('A valid email address, please');
  if (!t) throw new Error('Pick what kind of person they are');
  if (t.director && !actor.director) throw new Error('Only a director can add a director, general manager or project manager');
  const who = actor.name || actor.email;
  const have = (await teamRows()).find(r => r.email === e);
  if (have?.active) throw new Error(`${have.name || e} is already on the team`);
  const r = String(roles || '').split(',').map(s => s.trim()).filter(Boolean).join(', ').slice(0, 200) || t.label;
  if (have) await updatePlain(TAB, have.row, { name: n, type: t.value, roles: r, active: 'TRUE' }, { before: { active: have.active ? 'TRUE' : 'FALSE' }, who });
  else await addPlain(TAB, { name: n, email: e, type: t.value, roles: r, active: 'TRUE', notes: `Added in Ops by ${who}` }, { who });
  expire();
  return { name: n, email: e, type: t.value, back: !!have };
}

export async function setActive(email, on, actor) {
  const e = lower(email), rows = await teamRows(), p = rows.find(r => r.email === e);
  if (!p) throw new Error('That person isn’t on the Team tab');
  if (!on) {
    if (e === lower(actor.email)) throw new Error('You can’t take yourself off the team');
    if (String(p.type).toLowerCase() === 'director' && !actor.director) throw new Error('Only a director can take a director off the team');
    if (String(p.type).toLowerCase() === 'director' && rows.filter(r => r.active && String(r.type).toLowerCase() === 'director').length < 2) throw new Error('There has to be at least one director');
  }
  await updatePlain(TAB, p.row, { active: on ? 'TRUE' : 'FALSE' }, { before: { active: p.active ? 'TRUE' : 'FALSE' }, who: actor.name || actor.email });
  expire();
  return p;
}

// A sign-in link that lands on teacher onboarding, good for a week (the everyday sign-in link lasts 30 minutes)
export async function sendOnboardingLink({ name, email }, base) {
  if (!process.env.RESEND_API_KEY) return { sent: false, why: 'Email isn’t set up here.' };
  const e = lower(email), first = String(name || '').trim().split(' ')[0] || 'there';
  const link = `${base}/api/ops/verify?token=${encodeURIComponent(sign({ email: e, purpose: 'login', next: '/teach' }, 7 * 24 * 3600))}`;
  try {
    await sendEmail({ to: e, subject: 'Welcome to Embodied Philosophy: your teacher onboarding', html: layout(`Welcome, ${esc(first)}`,
      `<p>Here is your link to teacher onboarding. It takes a few minutes: your bio and headshot, then the details for what you’re teaching with us.</p>${button(link, 'Start onboarding')}
      <p style="color:#6E6658;font-size:13px">The link works for 7 days. After that, sign in at ${esc(base)}/ops/login with this email address and we’ll send a fresh one.</p>`) });
    return { sent: true };
  } catch (err) { console.error('Onboarding link failed', err.message); return { sent: false, why: 'The email couldn’t be sent just now.' }; }
}
