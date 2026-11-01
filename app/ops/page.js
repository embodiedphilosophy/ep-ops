import { redirect } from 'next/navigation';
import { listTasks } from '@/lib/ops/taskstore';
import { loadCalendar } from '@/lib/calendar';
import { meetingsFor, loadTeam, dedupe, needsOwner, needsYouFor, groupByEvent, addDays, ESCALATE_DAYS } from '@/lib/ops/tasks';
import { eventOptions, staffNames } from '@/lib/ops/pickers';
import AddTask from './AddTask';
import { teamHours, clockAvailable } from '@/lib/ops/hours';
import { HoursDecide } from './hours/HoursActions';
import { waitingOnYou } from '@/lib/ops/waiting';
import { oneToOnes } from '@/lib/ops/onetoones';
import { todayET } from '@/lib/events';
import { onboardingState } from '@/lib/teach';
import { upcomingSocial } from '@/lib/social';
import { teamMeetingsFor } from '@/lib/ops/teamcal';
import { getNote } from '@/lib/ops/note';
import { isStaff, isTeacher, canEditSite } from '@/lib/ops/nav';
import { podsWaiting } from '@/lib/ops/podswaiting';
import { readinessRows, atRisk } from '@/lib/ops/readiness';
import Shell, { opsUser } from './Shell';
import TaskList from './TaskList';
import Note from './Note';
import Meetings from './Meetings';
import { flagOf } from './SocialGrid';
import { PROJECTS } from '@/lib/ops/menteeyear';
import { loadOpsYear } from '@/lib/ops/menteeyearops';

const dayLong = d => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).replace(',', '');
const shortDate = d => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });

export const dynamic = 'force-dynamic';

// Home: only what needs you this week. Everything else is one click away.
export default async function Home({ searchParams }) {
  const user = await opsUser();
  const sp = await searchParams;
  // Teachers finish onboarding first (bio, headshot, course page, Circle, dashboard tour)
  if (isTeacher(user) && !sp?.skip) {
    const st = await onboardingState(user.email).catch(() => null);
    if (st?.needed) redirect('/teach');
  }
  const allTeam = await loadTeam().catch(() => []);
  // Directors can look at Home as any one person
  const viewing = user.director && sp?.person ? allTeam.find(t => t.name === sp.person) || user : user;
  const asUser = viewing === user ? user : { ...viewing, director: false };

  let all = [], error = '';
  try { all = dedupe(await listTasks()); } catch (e) { error = e.message; }
  const triageOn = user.director && viewing === user;
  // Needs you: the same list the sidebar badge counts. Nobody-owns-it and week-late work lives in Tasks
  // (the counts at the top link there), so Today stays one list.
  const { b, blocked, list: needsYou } = needsYouFor(asUser, all);
  const later = b.upcoming.filter(t => t.due <= addDays(todayET(), 35) && !blocked.includes(t)).length;
  const cal = await loadCalendar().catch(() => []);
  const pods = canEditSite(user) && viewing === user ? await podsWaiting().catch(e => { console.error('study pods card', e.message); return null; }) : null;
  const year = isStaff(user) && viewing === user ? await loadOpsYear({ today: todayET() }).catch(e => { console.error('mentee year card', e.message); return null; }) : null;
  const o2o = triageOn ? await oneToOnes({ days: 21 }).catch(() => ({ configured: false, items: [] })) : { configured: false, items: [] };
  const groups = groupByEvent(needsYou, cal);

  const roleNames = {};
  for (const m of allTeam) for (const r of m.roles) (roleNames[r] ||= []).push(m.name);
  const teamNames = staffNames(allTeam);
  const cutoff = addDays(todayET(), -ESCALATE_DAYS);
  const veryLate = triageOn ? all.filter(t => !t.completed && !needsOwner(t) && t.due && t.due <= cutoff) : [];
  const listProps = { showWho: false, team: teamNames, roleNames, short: true };

  const [programming, meetings, note, social] = await Promise.all([
    meetingsFor(asUser, 6, { all: isStaff(asUser) }).catch(() => []),
    teamMeetingsFor(asUser, 7).catch(e => ({ meetings: [], error: e.message })),
    getNote(),
    isStaff(asUser) ? upcomingSocial(9).catch(() => null) : null,
  ]);
  const director = allTeam.find(m => m.director);
  const first = (viewing.name || 'there').split(' ')[0];

  // Director's glance: three counts, each linking to where the detail lives
  let glance = null;
  if (user.director && viewing === user) {
    const rows = await readinessRows(user, all).catch(() => []);
    glance = {
      atRisk: rows.filter(atRisk).length,
      unowned: all.filter(needsOwner).length,
    };
  }
  // Director: everyone's hours this month, with any extra-hours requests to decide
  const hours = triageOn && clockAvailable() ? await teamHours(allTeam).catch(() => null) : null;
  const waiting = triageOn ? await waitingOnYou().catch(() => []) : [];
  const socialLine = social && !social.error && social.posts.length
    ? (() => { const n = social.posts.filter(p => flagOf(p)).length; return n ? `Social: ${n} of ${social.posts.length} posts still need images` : `Social: the next ${social.posts.length} posts are ready`; })()
    : '';

  const add = isStaff(user) && viewing === user && <AddTask team={teamNames} me={user.name} events={eventOptions(cal)} />;
  const head = (add || user.director) && (<>
    {user.director && <form className="ops-view" action="/ops">
      <label>View as{' '}
        <select name="person" defaultValue={sp?.person || ''}>
          <option value="">Me</option>
          {allTeam.filter(t => t.email !== user.email).map(t => <option key={t.name} value={t.name}>{t.name}</option>)}
        </select>
      </label>
      <button className="chip">Show</button>
    </form>}
    {add}
  </>);

  return (
    <Shell user={user} current="home" desc="What needs you this week." eyebrow={viewing === user ? dayLong(todayET()) : 'Viewing as'} title={viewing === user ? `Hello, ${first}` : viewing.name} head={head}>
      <Note note={note} editable={user.director && viewing === user} author={(director?.name || 'Jacob').split(' ')[0]} />
      {error && <p className="ops-note">Couldn’t load tasks right now ({error}).</p>}

      {glance && (
        <div className="ops-glance">
          <a href="/ops/events" className={glance.atRisk ? 'is-bad' : ''}><b>{glance.atRisk}</b> event{glance.atRisk === 1 ? '' : 's'} at risk</a>
          <a href="/ops/tasks?show=unowned" className={glance.unowned ? 'is-bad' : ''}><b>{glance.unowned}</b> task{glance.unowned === 1 ? '' : 's'} need{glance.unowned === 1 ? 's' : ''} an owner</a>
          <a href="/ops/tasks?show=late" className={veryLate.length ? 'is-bad' : ''}><b>{veryLate.length}</b> task{veryLate.length === 1 ? '' : 's'} a week+ late</a>
        </div>
      )}

      <div className="ops-grid">
      <section className="ops-col">
        {triageOn && (<div className="ops-waiting">
          <h2>Waiting on your yes <span>{waiting.length}</span></h2>
          {waiting.length === 0 ? <p className="ops-empty">Nothing is waiting on you.</p> : (<ul>{waiting.map(w => (
            <li key={w.key}>
              <span className="k">{w.kind}</span>
              <span className="t">{w.title}{w.detail && <span> — {w.detail}</span>}</span>
              {w.request ? <HoursDecide id={w.request.id} hours={w.request.hours} /> : <a className="chip primary" href={w.href}>{w.kind === 'Ad Agent' ? 'See it' : 'Review'}</a>}
            </li>))}</ul>)}
        </div>)}
        <h2 className={b.pastDue.length ? 'late' : ''}>Needs you <span>{needsYou.length}</span></h2>
        {needsYou.length === 0 ? <p className="ops-empty">Nothing overdue or due this week.</p> : groups.map(g => (
          <div className="ops-group" key={g.key || 'other'}>
            <h3>{g.title} <span>{g.date ? `· ${shortDate(g.date)} ` : ''}— {g.tasks.length} task{g.tasks.length === 1 ? '' : 's'}</span></h3>
            <TaskList tasks={g.tasks} {...listProps} short={!!g.key} empty="" />
          </div>
        ))}
        {later > 0 && <p className="ops-more"><a href={viewing === user ? '/ops/tasks' : `/ops/tasks?who=${encodeURIComponent(viewing.name)}`}>{later} more in the next 4 weeks →</a></p>}
        {socialLine && <p className="ops-more"><a href="/ops/content?tab=social">{socialLine} →</a></p>}

      </section>

      <aside className="ops-col">
        {hours && hours.length > 0 && (<div className="ops-week stacked" style={{ marginBottom: 28 }}><section>
          <h2>Team hours</h2>
          <ul className="ops-hours-team compact">{hours.map(r => (
            <li key={r.email} className={r.level}>
              <span className="who"><i className={r.onClock ? 'live' : ''} />{r.name.split(' ')[0]}</span>
              <span className="bar" aria-hidden="true"><span style={{ width: `${r.limit ? Math.min(100, (r.used / r.limit) * 100) : 0}%` }} /></span>
              <span className="s">{r.limit && r.pace && r.pace > r.limit ? `Pace ${r.pace}/${r.limit} h` : r.limit ? `${r.used}/${r.limit} h` : `${r.used} h`}</span>
            </li>
          ))}</ul>
          <p className="ops-more"><a href="/ops/hours">All hours →</a></p>
        </section></div>)}
        {pods && (<div className="ops-week stacked" style={{ marginBottom: 28 }}><section className="ops-today-card">
          <h2>Study pods {pods.requests.length + pods.needChat.length > 0 && <span>{pods.requests.length + pods.needChat.length} waiting</span>}</h2>
          {pods.requests.length === 0 && pods.needChat.length === 0 && <p className="ops-empty">Nothing waiting. {pods.open ? `${pods.open} ${pods.open === 1 ? 'pod is' : 'pods are'} open for members.` : 'No pods are open yet.'}</p>}
          {pods.requests.length > 0 && (<><h3 className="ops-my-h">Asked to lead a pod</h3><ul className="ops-my-wait">{pods.requests.slice(0, 5).map(r => (
            <li key={r.uid}><i className="soon" /><span><b>{r.name}</b>{r.note ? ` · ${r.note.length > 90 ? `${r.note.slice(0, 90)}…` : r.note}` : ''}</span></li>))}</ul></>)}
          {pods.needChat.length > 0 && (<><h3 className="ops-my-h">Running, needs a chat link</h3><ul className="ops-my-wait">{pods.needChat.slice(0, 5).map(p => (
            <li key={p.id}><i className="soon" /><span><b>{p.topic}</b> · {p.leader} · {p.count} {p.count === 1 ? 'member' : 'members'}</span></li>))}</ul></>)}
          <p className="ops-more"><a href="/ops/settings/pods">{pods.requests.length ? 'Approve or decline →' : 'Study pods →'}</a></p>
        </section></div>)}
        {triageOn && o2o.configured && (<div className="ops-week stacked" style={{ marginBottom: 28 }}><section>
          <h2>One-to-ones <span>{o2o.items.length}</span></h2>
          {o2o.items.length === 0 ? <p className="ops-empty">Nothing booked in the next three weeks.</p> : (<ul className="ops-o2o">{o2o.items.slice(0, 4).map(x => (
            <li key={x.uuid} className={x.summary.length ? '' : 'none'}>
              <div className="h"><b>{x.name || x.email}</b><span>{new Date(x.start).toLocaleString('en-US', { timeZone: 'America/New_York', weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span></div>
              <p>{x.summary.length ? (x.summary[0].a.length > 140 ? `${x.summary[0].a.slice(0, 140)}…` : x.summary[0].a) : 'No summary yet'}</p>
            </li>))}</ul>)}
          <p className="ops-more"><a href="/ops/one-to-ones">All one-to-ones →</a></p>
        </section></div>)}
        <Meetings programming={programming} team={meetings} director={user.director} stacked />
        {isStaff(user) && viewing === user && year && (() => {
          const d3 = (iso) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).replace(',', '');
          const dot = c => c.count === c.of && c.of ? 'ok' : c.count && c.step.date < year.today ? 'risk' : 'none';
          const names = list => list.slice(0, 2).map(x => x.name).join(', ') + (list.length > 2 ? `, +${list.length - 2}` : '');
          const od = year.overdue, ns = year.noSummary, rv = year.review;
          return (<div className="ops-week stacked" style={{ marginTop: 28 }}><section className="ops-today-card">
            <h2>Mentee year <a className="ops-my-open" href="/ops/mentee-year">Open</a></h2>
            {year.month && <p className="ops-empty">{year.month.title.split(' ')[0]} · {year.month.theme}</p>}
            {year.upcoming.length > 0 && <><h3 className="ops-my-h">Next three project steps</h3><ul className="ops-my-steps compact">{year.upcoming.map(c => (
              <li key={c.step.id} className="ops-my-step"><span className="when"><b>{d3(c.step.date)}</b></span><span className="what"><span className={`ops-my-proj ${c.step.project}`}><i />{PROJECTS[c.step.project]}</span><b>{c.step.title}</b></span><span className={`ops-my-count ${dot(c)}`}><i />{c.count} of {c.of}</span></li>
            ))}</ul></>}
            <h3 className="ops-my-h">Waiting on mentees</h3>
            <ul className="ops-my-wait">
              <li><i className={od.length ? 'risk' : 'none'} /><span>Steps overdue</span><b>{od.length ? `${od.length} · ${names(od)}` : 'None'}</b></li>
              {year.configured && <li><i className={ns.length ? 'soon' : 'none'} /><span>One-to-ones without a summary</span><b>{ns.length ? `${ns.length} · next on ${d3(new Date(ns[0].start).toISOString().slice(0, 10))}` : 'None'}</b></li>}
              {rv && <li><i className={rv.opens ? 'none' : 'soon'} /><span>{rv.name} review</span><b>{rv.opens ? `Opens ${new Date(`${rv.opensOn}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })}` : `${rv.progress.filter(x => x.state === 'ready').length} of ${rv.progress.length} ready`}</b></li>}
            </ul>
          </section></div>);
        })()}
        {isTeacher(user) && <p className="ops-more"><a href="/ops/team">Contacts and your teacher guide →</a></p>}
      </aside>
      </div>
    </Shell>
  );
}
