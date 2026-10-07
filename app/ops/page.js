import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/ops/auth';
import { listTasks } from '@/lib/ops/motion';
import { visibleTo, bucket, meetingsFor, loadTeam } from '@/lib/ops/tasks';
import { longDate } from '@/lib/dates';
import TaskList from './TaskList';
import { onboardingState } from '@/lib/teach';

export const dynamic = 'force-dynamic';

export default async function Ops({ searchParams }) {
  const user = await currentUser();
  const sp0 = await searchParams;
  if (!user) redirect('/ops/login');
  // Teachers finish onboarding first (bio, headshot, course page, Circle, dashboard tour)
  if (!user.director && (user.newTeacher || String(user.type).toLowerCase() === 'teacher') && !sp0?.skip) {
    const st = await onboardingState(user.email).catch(() => null);
    if (st?.needed) redirect('/teach');
  }
  const sp = await searchParams;
  const team = user.director ? await loadTeam() : [];
  // Directors can look at the dashboard as any one person
  const viewing = user.director && sp?.person ? team.find(t => t.name === sp.person) || user : user;
  const asUser = viewing === user ? user : { ...viewing, director: false };

  let tasks = [], error = '';
  try { tasks = visibleTo(asUser, await listTasks()); } catch (e) { error = e.message; }
  const b = bucket(tasks);
  const meetings = await meetingsFor(asUser).catch(() => []);
  const first = (user.name || 'there').split(' ')[0];

  return (
    <main className="ops">
      <header className="ops-top">
        <a href="/ops" className="t-brand">Embodied <span>Philosophy</span></a>
        <div className="ops-who">{user.name}{user.director && ' · Director'} · <a href="/api/ops/logout">Sign out</a></div>
      </header>

      <div className="ops-head">
        <h1>{viewing === user ? `Hello, ${first}` : viewing.name}</h1>
        {user.director && (
          <form className="ops-view" action="/ops">
            <label>View as{' '}
              <select name="person" defaultValue={sp?.person || ''}>
                <option value="">Everyone</option>
                {team.map(t => <option key={t.name} value={t.name}>{t.name}</option>)}
              </select>
            </label>
            <button className="btn btn-ghost">Show</button>
          </form>
        )}
      </div>
      {error && <p className="ops-note">Couldn’t load tasks from Motion right now ({error}).</p>}

      <div className="ops-grid">
        <section className="ops-col">
          <h2 className="late">Past due <span>{b.pastDue.length}</span></h2>
          <TaskList tasks={b.pastDue} showWho={user.director && viewing === user} empty="Nothing past due." />
          <h2>This week <span>{b.thisWeek.length}</span></h2>
          <TaskList tasks={b.thisWeek} showWho={user.director && viewing === user} empty="Nothing due this week." />
          <h2>Coming up</h2>
          <TaskList tasks={b.upcoming} showWho={user.director && viewing === user} empty="Nothing scheduled yet." />
          {b.done.length > 0 && (<><h2>Recently done</h2><TaskList tasks={b.done} showWho={user.director && viewing === user} done /></>)}
        </section>
        <aside className="ops-col">
          <h2>Teaching & meetings</h2>
          {meetings.length === 0 ? <p className="ops-empty">No teachings or meetings in the next three weeks.</p> : (
            <ul className="ops-meet">
              {meetings.map(m => (
                <li key={m.id}>
                  <div className="d">{longDate(m.date)}{m.time ? ` · ${m.time}` : ''}</div>
                  <div className="t">{m.title}</div>
                  <div className="w">{[m.teachers && `Teaching: ${m.teachers}`, m.course_host && `Host: ${m.course_host}`].filter(Boolean).join(' · ') || m.owner}</div>
                  {m.join_url
                    ? <div className="z">Zoom: <a href={m.join_url} target="_blank" rel="noopener">{m.join_url}</a></div>
                    : <div className="z">No Zoom link yet{user.director ? ' (add it in the Master Schedule’s Zoom Link column, or set Zoom to one-off or series)' : ''}.</div>}
                </li>
              ))}
            </ul>
          )}
        </aside>
      </div>
    </main>
  );
}
