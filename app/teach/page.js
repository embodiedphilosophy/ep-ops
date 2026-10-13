import { redirect } from 'next/navigation';
import { teacherContext } from '@/lib/ops/auth';
import { onboardingState, deliverables, siteTeacher, usesCircle, names, profileFor } from '@/lib/teach';
import { loadCalendar } from '@/lib/calendar';
import { listTasks } from '@/lib/ops/taskstore';
import { visibleTo, bucket } from '@/lib/ops/tasks';
import { todayET, emailsOf } from '@/lib/events';
import Onboarding from './Onboarding';
import Shell from '../ops/Shell';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Teacher onboarding — Embodied Philosophy', robots: { index: false, follow: false } };

const slim = t => ({ id: t.id, name: t.name, due: t.due, completed: t.completed });

export default async function Teach({ searchParams }) {
  const sp = await searchParams;
  const ctx = await teacherContext(sp?.as);
  if (!ctx) redirect('/ops/login');
  if (ctx.director && !ctx.actingAs) return <DirectorView user={ctx.user} />;

  const st = await onboardingState(ctx.email);
  const firstTeachers = st.offerings.flatMap(o => names(o.teachers));
  // Best guess at their name until they confirm it: profile → Team tab → the only name on their sessions
  const guess = st.profile?.name || (!ctx.actingAs && ctx.user.name) || (new Set(firstTeachers).size === 1 ? firstTeachers[0] : '');
  const site = st.profile ? null : await siteTeacher(guess).catch(() => null);
  const onFile = st.profile?.bio ? { name: st.profile.name, role: st.profile.role, bio: st.profile.bio, photo_url: st.profile.photo_url }
    : site?.bio ? { name: site.name, role: site.role, bio: site.bio, photo_url: site.photo_url } : null;

  // The bio/headshot item is listed once, on the first offering
  const offerings = await Promise.all(st.offerings.map(async (o, i) => ({
    ...o, circle: usesCircle(o.track), page: st.pages[o.key] || null,
    deliverables: await deliverables(o, { hasProfile: !!onFile || i > 0 }),
  })));

  let tasks = { pastDue: [], thisWeek: [], upcoming: [], done: [] };
  if (guess) {
    try { const b = bucket(visibleTo({ name: guess, roles: [], director: false }, await listTasks())); tasks = Object.fromEntries(Object.entries(b).map(([k, v]) => [k, v.map(slim)])); } catch {}
  }

  return (
    <Onboarding
      data={{
        email: ctx.email, actingAs: ctx.actingAs, today: todayET(), nameGuess: guess, onFile,
        profileDone: !!st.profile, onboarded: !!st.profile?.onboarded_on, needed: st.needed,
        offerings, tasks, opsUrl: '/ops', circleHost: 'ss.embodiedphilosophy.com',
      }}
    />
  );
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
