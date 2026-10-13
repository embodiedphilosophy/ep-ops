import { redirect } from 'next/navigation';
import { listTasks } from '@/lib/ops/taskstore';
import { loadCalendar } from '@/lib/calendar';
import { bucket, meetingsFor, loadTeam, dedupe, needsOwner, forHome, groupByEvent, addDays, ESCALATE_DAYS } from '@/lib/ops/tasks';
import { eventOptions, staffNames } from '@/lib/ops/pickers';
import AddTask from './AddTask';
import { teamHours, clockAvailable } from '@/lib/ops/hours';
import { HoursDecide } from './hours/HoursActions';
import { waitingOnYou } from '@/lib/ops/waiting';
import { todayET } from '@/lib/events';
import { onboardingState } from '@/lib/teach';
import { upcomingSocial } from '@/lib/social';
import { teamMeetingsFor } from '@/lib/ops/teamcal';
import { getNote } from '@/lib/ops/note';
import { isStaff, isTeacher } from '@/lib/ops/nav';
import { readinessRows } from '@/lib/ops/readiness';
import Shell, { opsUser } from './Shell';
import TaskList from './TaskList';
import Note from './Note';
import Meetings from './Meetings';
import { flagOf } from './SocialGrid';

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
  // Directors: other people's 7+ day late tasks live in Triage below, not in Needs you
  const mine = forHome(asUser, all).filter(t => !needsOwner(t) && !(triageOn && t.escalated));
  const b = bucket(mine);
  // Someone is waiting on this person: on their Home whatever the due date
  const blocked = mine.filter(t => !t.completed && t.blockedOn && t.blockedOn === viewing.name && t.due > addDays(todayET(), 7));
  const needsYou = [...b.pastDue, ...b.thisWeek, ...blocked];
  const later = b.upcoming.filter(t => t.due <= addDays(todayET(), 35) && !blocked.includes(t)).length;
  const cal = await loadCalendar().catch(() => []);
  const groups = groupByEvent(needsYou, cal);

  const roleNames = {};
  for (const m of allTeam) for (const r of m.roles) (roleNames[r] ||= []).push(m.name);
  const teamNames = staffNames(allTeam);
  // Triage (director): tasks with no owner, then owned tasks 7+ days late
  const byDue = (a, b) => (a.due || '9').localeCompare(b.due || '9');
  const cutoff = addDays(todayET(), -ESCALATE_DAYS);
  const unowned = triageOn ? all.filter(needsOwner).sort(byDue) : [];
  const mineIds = new Set(mine.map(t => t.id));
  const veryLate = triageOn ? all.filter(t => !t.completed && !needsOwner(t) && !mineIds.has(t.id) && t.due && t.due <= cutoff).sort(byDue) : [];
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
      atRisk: rows.filter(r => r.status === 'red').length,
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
    <Shell user={user} current="home" eyebrow={viewing === user ? dayLong(todayET()) : 'Viewing as'} title={viewing === user ? `Hello, ${first}` : viewing.name} head={head}>
      <Note note={note} editable={user.director && viewing === user} author={(director?.name || 'Jacob').split(' ')[0]} />
      {error && <p className="ops-note">Couldn’t load tasks right now ({error}).</p>}

      {glance && (
        <div className="ops-glance">
          <a href="/ops/events" className={glance.atRisk ? 'is-bad' : ''}><b>{glance.atRisk}</b> event{glance.atRisk === 1 ? '' : 's'} at risk</a>
          <a href="#triage" className={glance.unowned ? 'is-bad' : ''}><b>{glance.unowned}</b> unowned task{glance.unowned === 1 ? '' : 's'}</a>
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

        {triageOn && (<div id="triage">
          <h2 className={unowned.length || veryLate.length ? 'late' : ''}>Triage <span>{unowned.length + veryLate.length}</span></h2>
          {unowned.length + veryLate.length === 0 && <p className="ops-empty">Every open task has an owner, and nothing is a week late.</p>}
          {unowned.length > 0 && (<div className="ops-group">
            <h3>Needs an owner <span>— assign here, or name the teacher or host on the Master Schedule</span></h3>
            <TaskList tasks={unowned} showWho team={teamNames} roleNames={roleNames} assign empty="" />
          </div>)}
          {veryLate.length > 0 && (<div className="ops-group">
            <h3>{ESCALATE_DAYS}+ days late <span>— owners were emailed at 3 days</span></h3>
            <TaskList tasks={veryLate} showWho team={teamNames} roleNames={roleNames} empty="" />
          </div>)}
        </div>)}
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
        <Meetings programming={programming} team={meetings} director={user.director} stacked />
        {isTeacher(user) && <p className="ops-more"><a href="/ops/team">Contacts and your teacher guide →</a></p>}
      </aside>
      </div>
    </Shell>
  );
}
