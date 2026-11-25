import { redirect } from 'next/navigation';
import { teacherContext } from '@/lib/ops/auth';
import { onboardingState, profileFor } from '@/lib/teach';
import { onboardingData } from '@/lib/teachdata';
import { loadCalendar } from '@/lib/calendar';
import { todayET, emailsOf } from '@/lib/events';
import Onboarding from './Onboarding';
import Shell from '../ops/Shell';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Teacher onboarding — Embodied Philosophy', robots: { index: false, follow: false } };

export default async function Teach({ searchParams }) {
  const sp = await searchParams;
  const ctx = await teacherContext(sp?.as);
  if (!ctx) redirect('/ops/login');
  if (ctx.director && !ctx.actingAs) return <DirectorView user={ctx.user} />;

  return <Onboarding data={await onboardingData(ctx.email, { actingAs: ctx.actingAs, userName: ctx.user.name })} />;
}

// Directors see who's on the schedule and where each teacher is in onboarding, and can try it as them
async function DirectorView({ user }) {
  const today = todayET();
  const cal = (await loadCalendar()).filter(e => (e.end_date || e.date) >= today);
  const people = new Map();
  for (const ev of cal) for (const em of emailsOf(ev)) {
    if (!people.has(em)) people.set(em, { email: em, next: ev, count: 0 });
    people.get(em).count++;
  }
  const rows = await Promise.all([...people.values()].sort((a, b) => a.next.date.localeCompare(b.next.date)).map(async p => {
    const st = await onboardingState(p.email).catch(() => null);
    const prof = st?.profile || await profileFor(p.email).catch(() => null);
    return { ...p, name: prof?.name || '', status: !st ? 'unknown' : !st.needed ? 'Done' : prof ? `${st.pending.length} course page${st.pending.length === 1 ? '' : 's'} to go` : 'Not started' };
  }));
  return (
    <Shell user={user} current="team" title="Teacher onboarding">
      <p className="ops-empty" style={{ maxWidth: 640 }}>Everyone with an email on an upcoming event (Event Details → Teacher/Host Emails, or named in Schedule → Teachers & Hosts and on the Team tab). “Try it as” opens onboarding as that teacher; nothing is saved to the sheet, Motion, Circle or anyone’s inbox while you’re trying it out.</p>
      <ul className="ops-tasks" style={{ marginTop: 18 }}>
        {rows.map(r => (
          <li key={r.email}>
            <span><b>{r.name || r.email}</b>{r.name ? <span className="meta"> · {r.email}</span> : null}<br /><span className="meta">Next: {r.next.title}, {r.next.date} · {r.count} session{r.count === 1 ? '' : 's'}</span></span>
            <span className="meta">{r.status} · <a href={`/teach?as=${encodeURIComponent(r.email)}`}>Try it as</a></span>
          </li>
        ))}
      </ul>
      {rows.length === 0 && <p className="ops-empty">No one is assigned yet. Add teacher emails in Event Details → Teacher/Host Emails.</p>}
    </Shell>
  );
}
