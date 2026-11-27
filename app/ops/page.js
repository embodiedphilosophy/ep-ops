import { redirect } from 'next/navigation';
import { listTasks } from '@/lib/ops/taskstore';
import { loadCalendar } from '@/lib/calendar';
import { meetingsFor, loadTeam, dedupe, needsOwner, needsYouFor, groupByEvent, addDays, ESCALATE_DAYS } from '@/lib/ops/tasks';
import { eventOptions, staffNames } from '@/lib/ops/pickers';
import AddTask from './AddTask';
import { waitingOnYou, kindsLine } from '@/lib/ops/waiting';
import { overnightLog } from '@/lib/ops/overnight';
import { todayET } from '@/lib/events';
import { onboardingState } from '@/lib/teach';
import { upcomingSocial } from '@/lib/social';
import { teamMeetingsFor } from '@/lib/ops/teamcal';
import { getNote } from '@/lib/ops/note';
import { isStaff, isTeacher, canEditSite, canApproveSocial, canSupport } from '@/lib/ops/nav';
import { zendeskConfigured, listQueue } from '@/lib/ops/support';
import { readinessRows, atRisk } from '@/lib/ops/readiness';
import Shell, { opsUser } from './Shell';
import TaskList from './TaskList';
import Note from './Note';
import Meetings from './Meetings';
import { flagOf } from './SocialGrid';
import { TABS as SUPPORT_TABS, onePerPerson, ago } from './students/SupportView';
import Cards from './today/Cards';
import Waiting from './today/Waiting';
import Overnight from './today/Overnight';

const dayLong = d => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).replace(',', '');
const shortDate = d => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
const weekday = d => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' });
const plain = n => String(n || '').replace(/ — .+\(\d{4}-\d{2}-\d{2}\)$/, '').replace(/^\[[^\]]+\]\s*/, '');
const clip = (s, n) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
// Good morning / afternoon / evening, by the dashboard's clock (New York)
const greeting = () => { const h = Number(new Date().toLocaleString('en-US', { hour: 'numeric', hourCycle: 'h23', timeZone: 'America/New_York' })); return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'; };
// A slow neighbour (Zendesk) never holds the page up
const within = (p, ms = 4000) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('too slow')), ms))]);

export const dynamic = 'force-dynamic';

// Today (EP Ops 2, step 9): count cards, what is waiting on your yes (from every area), what is happening this week, and what changed
// overnight. Everything is read from what the other places already read; each card and list shows only what this person may open or decide.
export default async function Home({ searchParams }) {
  const user = await opsUser();
  const sp = await searchParams;
  // Teachers finish onboarding first (bio, headshot, course page, Circle, dashboard tour)
  if (isTeacher(user) && !sp?.skip) {
    const st = await onboardingState(user.email).catch(() => null);
    if (st?.needed) redirect('/teach');
  }
  const allTeam = await loadTeam().catch(() => []);
  // Directors can look at Today as any one person
  const viewing = user.director && sp?.person ? allTeam.find(t => t.name === sp.person) || user : user;
  const asUser = viewing === user ? user : { ...viewing, director: false };
  const own = viewing === user;

  let all = [], error = '';
  try { all = dedupe(await listTasks()); } catch (e) { error = e.message; }
  const triageOn = user.director && own;
  // Needs you: the same list the sidebar badge counts. Nobody-owns-it and week-late work lives in Tasks
  // (the cards at the top link there), so Today stays one list.
  const { b, blocked, list: needsYou } = needsYouFor(asUser, all);
  const later = b.upcoming.filter(t => t.due <= addDays(todayET(), 35) && !blocked.includes(t)).length;
  const cal = await loadCalendar().catch(() => []);
  const groups = groupByEvent(needsYou, cal);

  const roleNames = {};
  for (const m of allTeam) for (const r of m.roles) (roleNames[r] ||= []).push(m.name);
  const teamNames = staffNames(allTeam);
  const cutoff = addDays(todayET(), -ESCALATE_DAYS);
  const veryLate = triageOn ? all.filter(t => !t.completed && !needsOwner(t) && t.due && t.due <= cutoff) : [];
  const listProps = { showWho: false, team: teamNames, roleNames, short: true, assign: isStaff(user) };

  // The Social Engine's upcoming posts are read once and shared by the "Waiting on your yes" list and the posts line
  const socialP = isStaff(asUser) ? upcomingSocial(60).catch(() => null) : Promise.resolve(null);
  const decides = own && isStaff(user) && (canEditSite(user) || canApproveSocial(user));
  const [programming, meetings, note, social, waiting, rows, support, log] = await Promise.all([
    meetingsFor(asUser, 6, { all: isStaff(asUser) }).catch(() => []),
    teamMeetingsFor(asUser, 7).catch(e => ({ meetings: [], error: e.message })),
    getNote(),
    socialP,
    decides ? waitingOnYou(user, { social: socialP }).catch(() => []) : [],
    triageOn ? readinessRows(user, all).catch(() => []) : [],
    own && isStaff(user) && canSupport(user) ? supportCount() : null,
    triageOn ? overnightLog({ people: allTeam, me: user, titleOf: id => cal.find(e => e.sched_id === id)?.title || '' }) : null,
  ]);
  const director = allTeam.find(m => m.director);
  const first = (viewing.name || 'there').split(' ')[0];
  const socialLine = social && !social.error && social.posts.length
    ? (() => { const n = social.posts.slice(0, 9).filter(p => flagOf(p)).length, m = Math.min(9, social.posts.length); return n ? `Social: ${n} of ${m} posts still need images` : `Social: the next ${m} posts are ready`; })()
    : '';

  // ---- the count cards: only the ones this person may open ----
  const cards = [];
  const waitN = waiting.reduce((n, w) => n + (w.count || 1), 0);
  if (decides) cards.push({ key: 'waiting', label: 'Waiting on your yes', n: waitN, detail: kindsLine(waiting) || 'Nothing is waiting', href: '#waiting' });
  const nextTask = b.thisWeek.find(t => t.due) || b.thisWeek[0];
  const tasksHref = !isStaff(asUser) ? '#needs-you' : own ? '/ops/tasks' : `/ops/tasks?who=${encodeURIComponent(viewing.name)}`;
  const nThisWeek = b.thisWeek.length + blocked.length;
  cards.push({ key: 'tasks', label: own ? 'Your tasks this week' : `${first}’s tasks this week`, n: nThisWeek, href: tasksHref,
    detail: nextTask ? `Next: ${clip(plain(nextTask.name), 34)}${nextTask.due ? `, ${weekday(nextTask.due)}` : ''}` : 'Nothing due this week' });
  const oldest = b.pastDue[0];
  const lateDays = oldest ? Math.round((Date.parse(todayET()) - Date.parse(oldest.due)) / 864e5) : 0;
  cards.push({ key: 'late', label: 'Late', n: b.pastDue.length, late: b.pastDue.length > 0, tone: b.pastDue.length ? 'late' : '', href: triageOn ? '/ops/tasks?show=late' : tasksHref,
    detail: triageOn && veryLate.length ? `${plural(veryLate.length, 'task')} a week or more late across the team` : oldest ? `Oldest: ${clip(plain(oldest.name), 28)}, ${plural(lateDays, 'day')}` : 'Nothing is late' });
  if (support) cards.push({ key: 'students', label: 'Students to answer', n: support.n, href: '/ops/students?view=support&tab=reply',
    detail: support.off ? 'Zendesk isn’t connected here yet' : support.down ? 'Zendesk didn’t answer just now' : support.n ? `Oldest asked ${ago(support.oldest)}` : 'Nobody is waiting' });
  if (triageOn) {
    const risk = rows.filter(atRisk);
    cards.push({ key: 'risk', label: 'Programs at risk', n: risk.length, late: risk.length > 0, tone: risk.length ? 'late' : '', href: '/ops/programs', detail: risk[0] ? clip(risk[0].title, 40) : 'Nothing at risk' });
    const unowned = all.filter(needsOwner).length;
    cards.push({ key: 'owner', label: 'Tasks need an owner', n: unowned, late: unowned > 0, tone: unowned ? 'late' : '', href: '/ops/tasks?show=unowned', detail: unowned ? 'Hand them to someone in Tasks' : 'Every task has an owner' });
  }
  const things = waitN + needsYou.length;

  const add = isStaff(user) && own && <AddTask team={teamNames} me={user.name} events={eventOptions(cal)} />;
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
    <Shell user={user} current="home" desc={own ? (things ? `${plural(things, 'thing')} ${things === 1 ? 'needs' : 'need'} you this week.` : 'Nothing needs you this week.') : 'What needs them this week.'}
      eyebrow={own ? dayLong(todayET()) : 'Viewing as'} title={own ? `${greeting()}, ${first}` : viewing.name} head={head}>
      <Note note={note} editable={user.director && own} author={(director?.name || 'Jacob').split(' ')[0]} />
      {error && <p className="ops-note">Couldn’t load tasks right now ({error}).</p>}

      <Cards cards={cards} />

      <div className="ops-grid td-grid">
      <section className="ops-col">
        {decides && <Waiting items={waiting} />}
        <section className="td-panel" id="needs-you">
          <h2 className={b.pastDue.length ? 'late' : ''}>Needs you <span>{needsYou.length}</span></h2>
          {needsYou.length === 0 ? <p className="ops-empty">Nothing overdue or due this week.</p> : groups.map(g => (
            <div className="ops-group" key={g.key || 'other'}>
              <h3>{g.title} <span>{g.date ? `· ${shortDate(g.date)} ` : ''}— {g.tasks.length} task{g.tasks.length === 1 ? '' : 's'}</span></h3>
              <TaskList tasks={g.tasks} {...listProps} short={!!g.key} empty="" />
            </div>
          ))}
          {later > 0 && <p className="ops-more"><a href={own ? '/ops/tasks' : `/ops/tasks?who=${encodeURIComponent(viewing.name)}`}>{later} more in the next 4 weeks →</a></p>}
          {socialLine && <p className="ops-more"><a href="/ops/publish">{socialLine} →</a></p>}
        </section>
      </section>

      <aside className="ops-col td-side">
        <div className="td-panel"><Meetings programming={programming} team={meetings} director={user.director} stacked /></div>
        {isTeacher(user) && <p className="ops-more"><a href="/ops/people">Contacts and your teacher guide →</a></p>}
      </aside>
      </div>

      {log && <Overnight log={log} />}
    </Shell>
  );
}

// Students who need a reply: the Support tab's own "Needs a reply" list (the Zendesk queue, one line per person)
async function supportCount() {
  if (!zendeskConfigured()) return { off: true };
  try {
    const queue = await within(listQueue());
    const people = onePerPerson(queue.filter(SUPPORT_TABS[0].test).sort((a, b) => Date.parse(a.updated) - Date.parse(b.updated)));
    return { n: people.length, oldest: people[0]?.updated };
  } catch (e) { console.error('Today, support queue', e.message); return { down: true }; }
}
