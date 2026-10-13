import { listTasks } from '@/lib/ops/taskstore';
import { loadCalendar } from '@/lib/calendar';
import { loadTeam, dedupe, needsOwner, visibleTo, groupByEvent, bucket } from '@/lib/ops/tasks';
import { todayET } from '@/lib/events';
import { isStaff } from '@/lib/ops/nav';
import { eventOptions, staffNames } from '@/lib/ops/pickers';
import Shell, { opsUser } from '../Shell';
import TaskList from '../TaskList';
import AddTask from '../AddTask';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Tasks — Embodied Philosophy', robots: { index: false, follow: false } };

const short = d => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
const VIEWS = [['open', 'Open'], ['late', 'Late'], ['blocked', 'Blocked'], ['unowned', 'No owner'], ['done', 'Done']];

// Every task in one list: yours by default, everyone's for directors. Today shows only this week;
// this is the whole list, by person or by event, with the same row actions.
export default async function Tasks({ searchParams }) {
  const user = await opsUser(isStaff);
  const sp = await searchParams;
  const [team, cal] = await Promise.all([loadTeam().catch(() => []), loadCalendar().catch(() => [])]);
  let all = [], error = '';
  try { all = dedupe(await listTasks()); } catch (e) { error = e.message; }
  const today = todayET();
  const names = staffNames(team);
  const who = user.director ? (sp?.who ?? 'all') : user.name;
  const person = team.find(m => m.name === who);
  let tasks = !user.director ? visibleTo(user, all)
    : who === 'all' ? all
    : visibleTo({ ...person, name: who, roles: person?.roles || [], director: false }, all);
  if (sp?.event) tasks = tasks.filter(t => (t.description || '').includes(`[ep:${sp.event}:`));

  const open = tasks.filter(t => !t.completed);
  const counts = {
    open: open.filter(t => !needsOwner(t)).length,
    late: open.filter(t => t.due && t.due < today && !needsOwner(t)).length,
    blocked: open.filter(t => t.blockedOn).length,
    unowned: open.filter(needsOwner).length,
    done: tasks.filter(t => t.completed).length,
  };
  const view = VIEWS.some(([k]) => k === sp?.show) ? sp.show : 'open';
  const byDue = (a, b) => (a.due || '9').localeCompare(b.due || '9');
  const shown = view === 'done' ? bucket(tasks).done
    : view === 'unowned' ? open.filter(needsOwner).sort(byDue)
    : view === 'late' ? open.filter(t => t.due && t.due < today && !needsOwner(t)).sort(byDue)
    : view === 'blocked' ? open.filter(t => t.blockedOn).sort(byDue)
    : open.filter(t => !needsOwner(t)).sort(byDue);

  const roleNames = {};
  for (const m of team) for (const r of m.roles) (roleNames[r] ||= []).push(m.name);
  const qs = extra => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ who: user.director ? sp?.who : '', event: sp?.event, show: view, ...extra })) if (v) p.set(k, v);
    return `/ops/tasks?${p}`;
  };
  // Open work grouped by event (like Today); finished and triage views stay one flat list
  const groups = ['open', 'late', 'blocked'].includes(view) ? groupByEvent(shown, cal) : [{ key: 'all', title: '', tasks: shown }];
  const events = eventOptions(cal);
  const head = (<>
    {user.director && (
      <form className="ops-view" action="/ops/tasks">
        <input type="hidden" name="show" value={view} />
        <label>Person <select name="who" defaultValue={who}><option value="all">Everyone</option>{names.map(n => <option key={n}>{n}</option>)}</select></label>
        <label>Event <select name="event" defaultValue={sp?.event || ''}><option value="">Any</option>{events.map(e => <option key={e.id} value={e.id}>{e.label}</option>)}</select></label>
        <button className="chip">Show</button>
      </form>
    )}
    <AddTask team={names} me={user.name} events={events} event={sp?.event || ''} />
    <nav className="ops-filters" aria-label="Which tasks">
      {VIEWS.filter(([k]) => k !== 'unowned' || user.director).map(([k, l]) => (
        <a key={k} href={qs({ show: k })} aria-current={k === view ? 'page' : undefined}>{l} <span className="n">{counts[k] || ''}</span></a>
      ))}
    </nav>
  </>);

  return (
    <Shell user={user} current="tasks" eyebrow={!user.director ? 'Yours, and anything waiting on you' : who === 'all' ? 'Everyone' : who} title="Tasks" head={head}>
      {error && <p className="ops-note">Couldn’t load tasks right now ({error}).</p>}
      {shown.length === 0 ? <p className="ops-empty">{view === 'done' ? 'Nothing finished recently.' : view === 'open' ? 'No open tasks.' : 'None.'}</p> : groups.map(g => (
        <div className="ops-group" key={g.key || 'other'}>
          {g.title && <h3>{g.title} <span>{g.date ? `· ${short(g.date)} ` : ''}— {g.tasks.length}</span></h3>}
          <TaskList tasks={g.tasks} showWho={user.director} team={names} roleNames={roleNames} short={!!g.key && g.key !== 'all'}
            assign={user.director && view === 'unowned'} done={view === 'done'} empty="" />
        </div>
      ))}
    </Shell>
  );
}
