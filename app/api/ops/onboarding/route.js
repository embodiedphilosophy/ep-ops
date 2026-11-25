import { NextResponse } from 'next/server';
import { currentUser } from '@/lib/ops/auth';
import { canEditEvents } from '@/lib/ops/nav';
import { readPlain, addPlain, updatePlain, createTab, ConflictError } from '@/lib/ops/store';
import { loadCalendar } from '@/lib/calendar';
import { todayET, emailsOf } from '@/lib/events';
import { onboardingState, profileFor, offeringsFor } from '@/lib/teach';
import { onboardingData } from '@/lib/teachdata';
import { saveCopy } from '@/lib/teachcopy';
import { teamRows, addPerson, sendOnboardingLink } from '@/lib/ops/people';
import { refreshSite } from '@/lib/ops/refresh';

// Ops → Faculty → Onboarding: see a teacher's onboarding exactly as they will, edit its words (for every teacher) and
// this teacher's course page draft, then send the onboarding invitation. Previews are tried-as: nothing is saved or
// sent by the preview itself; only the edit panel's saves and the Send button change anything.
export const dynamic = 'force-dynamic';
export const maxDuration = 60;
const SENDS = 'Onboarding Sends';
const PAGES = 'Course Pages';
const lower = s => String(s || '').trim().toLowerCase();
const EMAIL = /^[^\s@,]+@[^\s@,]+\.[a-z]{2,}$/i;
const fail = (error, status = 400) => NextResponse.json({ error }, { status });
const PREFILL = ['title', 'subtitle', 'summary', 'explore', 'audience'];

async function editor() {
  const user = await currentUser();
  if (!user) return [null, fail('Please sign in again', 401)];
  if (!canEditEvents(user)) return [null, fail('Only Jacob, Irene and Floss can change onboarding', 403)];
  return [user];
}
const sends = async () => (await readPlain(SENDS).catch(() => ({ rows: [] }))).rows.map(r => r.values);
const lastSent = (all, email) => all.filter(s => lower(s.email) === lower(email)).map(s => s.sent_at).sort().at(-1) || '';

// GET → the people to onboard   GET ?email= → that teacher's onboarding, as they will see it
export async function GET(req) {
  const [user, denied] = await editor(); if (!user) return denied;
  const email = lower(new URL(req.url).searchParams.get('email'));
  try {
    const sent = await sends();
    if (email) {
      if (!EMAIL.test(email)) return fail('A valid email address, please');
      const data = await onboardingData(email, { actingAs: email });
      const team = (await teamRows().catch(() => [])).find(r => r.email === email);
      return NextResponse.json({ data, sent: lastSent(sent, email), onTeam: !!team?.active, teamType: team?.type || '', name: data.onFile?.name || data.nameGuess || team?.name || '' });
    }
    // Everyone with an email on an upcoming session, plus the teachers on the Team tab
    const today = todayET(), people = new Map();
    for (const ev of (await loadCalendar()).filter(e => (e.end_date || e.date) >= today).sort((a, b) => a.date.localeCompare(b.date)))
      for (const em of emailsOf(ev)) { const k = lower(em); if (!people.has(k)) people.set(k, { email: k, next: { title: ev.title, date: ev.date }, sessions: 0 }); people.get(k).sessions++; }
    for (const t of (await teamRows().catch(() => [])).filter(r => r.active && lower(r.type) === 'teacher')) if (!people.has(t.email)) people.set(t.email, { email: t.email, name: t.name, next: null, sessions: 0 });
    const list = await Promise.all([...people.values()].map(async p => {
      const st = await onboardingState(p.email).catch(() => null), prof = st?.profile || await profileFor(p.email).catch(() => null);
      return { ...p, name: prof?.name || p.name || '', status: !st ? '' : !st.needed ? 'Done' : st.profile ? `${st.pending.length} course page${st.pending.length === 1 ? '' : 's'} to go` : 'Not started', sent: lastSent(sent, p.email) };
    }));
    return NextResponse.json({ people: list });
  } catch (e) { console.error('Onboarding read failed', e.message); return fail('Couldn’t read onboarding just now', 502); }
}

// POST { action: 'copy', key, text }                               the words every teacher sees (blank = back to the default)
//      { action: 'prefill', email, offering, fields: {title…}, before: {title…} }   this teacher's course page draft
//      { action: 'send', email, name }                              the onboarding invitation (adds them to the Team tab as a teacher first)
export async function POST(req) {
  const [user, denied] = await editor(); if (!user) return denied;
  const b = await req.json().catch(() => ({})), who = user.name || user.email;
  try {
    if (b.action === 'copy') return NextResponse.json({ ok: true, text: await saveCopy(String(b.key || ''), b.text, who) });

    if (b.action === 'prefill') {
      const email = lower(b.email);
      const o = (await offeringsFor(email, { fresh: true })).find(x => x.key === b.offering);
      if (!o) return fail('That offering isn’t on this teacher’s schedule');
      const fields = Object.fromEntries(PREFILL.map(k => [k, String(b.fields?.[k] ?? '').replace(/\r/g, '').trim().slice(0, k === 'summary' || k === 'explore' || k === 'audience' ? 2000 : 200)]));
      const t = await readPlain(PAGES);
      const row = t.rows.find(r => r.values.offering === o.key);
      if (row && ['submitted', 'published'].includes(lower(row.values.status))) return fail('The teacher has already sent this course page. Change it in Teacher profiles → Review instead.');
      // Conflict check: what the panel showed must still be what's saved
      const before = Object.fromEntries(PREFILL.filter(k => b.before && k in b.before).map(k => [k, String(b.before[k] ?? '')]));
      const emails = [...new Set([...String(row?.values.teacher_emails || '').split(/[\s,]+/).filter(Boolean), email])].join(', ');
      if (row) await updatePlain(PAGES, row.row, { ...fields, teacher_emails: emails, status: row.values.status || 'draft' }, { before, who });
      else await addPlain(PAGES, { offering: o.key, track: o.track, ...fields, teacher_emails: emails, status: 'draft' }, { who });
      refreshSite();
      return NextResponse.json({ ok: true, message: 'Saved. The teacher will find it filled in, and can change it.' });
    }

    if (b.action === 'send') {
      const email = lower(b.email), name = String(b.name || '').trim();
      if (!EMAIL.test(email)) return fail('A valid email address, please');
      if (!name) return fail('Their name, please (it starts the email)');
      if (!process.env.RESEND_API_KEY) return fail('The invitation wasn’t sent: email isn’t set up here. Nothing was changed.', 503);
      const team = (await teamRows()).find(r => r.email === email);
      if (!team?.active) await addPerson({ name, email, type: 'teacher' }, user);
      const base = process.env.OPS_URL || new URL(req.url).origin;
      const mail = await sendOnboardingLink({ name, email }, base);
      if (!mail.sent) return fail(`The invitation wasn’t sent: ${mail.why}`, 502);
      let t = await readPlain(SENDS).catch(() => null);
      if (!t) await createTab(SENDS, ['email', 'name', 'sent_at', 'sent_by'], [], { who });
      await addPlain(SENDS, { email, name, sent_at: new Date().toISOString(), sent_by: who }, { who }).catch(e => console.error('Recording the send failed', e.message));
      return NextResponse.json({ ok: true, message: `Onboarding invitation sent to ${name} (${email}).${team?.active ? '' : ' They were added to the Team tab as a teacher so they can sign in.'}` });
    }
    return fail('Unknown action');
  } catch (e) {
    if (e instanceof ConflictError) return fail('Someone else changed this since you opened it. Reload and try again.', 409);
    console.error('Onboarding action failed', b.action, e.message);
    return fail(/^Sheets|^Google/.test(e.message) ? 'Could not save. Try again shortly.' : e.message, 502);
  }
}
