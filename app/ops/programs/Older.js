import { redirect } from 'next/navigation';
import { listTasks } from '@/lib/ops/taskstore';
import { dedupe, bucket, visibleTo } from '@/lib/ops/tasks';
import { loadCalendar } from '@/lib/calendar';
import { todayET } from '@/lib/events';
import { longDate } from '@/lib/dates';
import { isTeacher, canEditEvents } from '@/lib/ops/nav';
import EventEditor from '../events/EventEditor';
import { AddEvent, AddPastEvent, Restore } from '../events/EventActions';
import { readRange, toObjects } from '@/lib/google';
import Shell, { opsUser } from '../Shell';
import TaskList from '../TaskList';
import { SITE } from '@/lib/siteurl';

export const dynamic = 'force-dynamic';

// The three older lists of Programming: Past events (add a replay, or add an older session), Cancelled sessions (restore one) and
// Recently done (tasks). They were modes of the old Programming page; the upcoming list is now the Programs index and one program
// is its own page (app/ops/programs/[id]).
const short = d => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
const qs = (sp, extra) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries({ show: sp?.show, track: sp?.track, ...extra })) if (v) p.set(k, v);
  const s = p.toString();
  return s ? `/ops/programs?${s}` : '/ops/programs';
};

export default async function Older({ searchParams }) {
  const user = await opsUser();
  const sp = await searchParams;
  if (!['past', 'cancelled', 'done'].includes(sp?.show)) redirect('/ops/programs');
  const teacherView = isTeacher(user);
  const today = todayET();
  const editor = canEditEvents(user);
  const tracks = editor ? await readRange(process.env.CALENDAR_SHEET_ID, "'Track Defaults'!A1:A50").then(v => toObjects(v).map(r => String(r.track).toUpperCase()).filter(Boolean)).catch(() => []) : [];
  const head = <Filters sp={sp} editor={editor} tracks={tracks} />;
  let tasks = [];
  try { tasks = dedupe(await listTasks()); if (teacherView) tasks = visibleTo(user, tasks); } catch { /* the lists below say so when there is nothing */ }

  // Cancelled sessions from the last month on, to restore one
  if (sp?.show === 'cancelled' && editor) {
    const from = todayET();
    const gone = (await loadCalendar({ includeCancelled: true }).catch(() => [])).filter(e => /cancel/i.test(e.status) && (e.end_date || e.date) >= from).sort((a, b) => a.date.localeCompare(b.date));
    return (
      <Shell user={user} current="programs" desc="Is each offering ready? Readiness for every session on the calendar." title="Programming" head={head}>
        <h2 className="ops-sub">Cancelled</h2>
        {gone.length === 0 ? <p className="ops-empty">No upcoming sessions are cancelled.</p> : (
          <ul className="ops-cancelled">{gone.map(e => <li key={e.sched_id}><span>{short(e.date)} · {e.title} <span className="trk">{e.track}</span></span><Restore id={e.sched_id} /></li>)}</ul>
        )}
      </Shell>
    );
  }

  // Past events: add replays (Vimeo ID, summary) to sessions that are over, or add an older one that was never scheduled
  if (sp?.show === 'past' && editor) {
    const T = String(sp?.track || '').toUpperCase();
    const all = (await loadCalendar().catch(() => [])).filter(e => (e.end_date || e.date) < today && e.sched_id).sort((a, b) => b.date.localeCompare(a.date));
    const trackList = [...new Set(all.map(e => e.track))].sort();
    const list = (T ? all.filter(e => e.track === T) : all).slice(0, 300);
    const pick = all.find(e => e.sched_id === sp?.event);
    const replay = e => e.video_id ? (e.website ? 'Replay on the site' : 'Has video, not on the site') : e.replay_link ? 'Replay in Circle' : 'No replay yet';
    const replayCls = e => e.video_id && e.website ? 'green' : e.video_id || e.replay_link ? 'amber' : 'grey';
    return (
      <Shell user={user} current="programs" desc="Is each offering ready? Readiness for every session on the calendar." title="Programming" head={<Filters sp={sp} editor={editor} tracks={tracks} past />}>
        <div className="ops-add-wrap"><AddPastEvent tracks={tracks} /></div>
        <nav className="ops-filters ops-past-tracks" aria-label="Track">
          <a href={qs({}, { show: 'past' })} aria-current={!T ? 'page' : undefined}>All tracks</a>
          {trackList.map(t => <a key={t} href={qs({}, { show: 'past', track: t })} aria-current={T === t ? 'page' : undefined}>{t}</a>)}
        </nav>
        {list.length === 0 ? <p className="ops-empty" style={{ marginTop: 16 }}>No past events{T ? ` on ${T}` : ''} in the Master Schedule. Use “+ Add past event” for one that was never scheduled.</p> : (
          <ul className="ops-events">
            {list.map(e => (
              <li key={e.sched_id} className={e.sched_id === pick?.sched_id ? 'is-open' : ''}>
                <a href={qs(sp, { event: e.sched_id })}>
                  <span className={`st ${replayCls(e)}`}><span className={`dot ${replayCls(e)}`} aria-hidden="true" />{replay(e)}</span>
                  <span className="date">{short(e.date)}{e.date.slice(0, 4) !== today.slice(0, 4) ? `, ${e.date.slice(0, 4)}` : ''}</span>
                  <span className="what">
                    <span><span className="ttl">{e.title}</span><span className="trk">{e.track}</span></span>
                    <span className="sub">{e.teachers || 'No teacher listed'}</span>
                  </span>
                </a>
              </li>
            ))}
          </ul>
        )}
        {pick && (
          <aside className="ops-drawer" aria-label={pick.title}>
            <a className="close" href={qs(sp, { event: '' })} aria-label="Close">×</a>
            <span className={`pill ${replayCls(pick)}`}>{replay(pick)}</span>
            <h2>{pick.title}</h2>
            <p className="when">{longDate(pick.date)}{pick.time ? ` · ${pick.time}` : ''}{pick.teachers ? ` · ${pick.teachers}` : ''}</p>
            <p className="hint">Paste the Vimeo ID to put the replay on the website{pick.track === 'LRL' ? <> (<a href={`${SITE}/living-room-lectures#past`} target="_blank" rel="noopener">Living Room Lectures → Past lectures</a>)</> : ''}. Visitors see the first 15 minutes free and sign up to watch the rest.</p>
            <EventEditor key={pick.sched_id} past sessions={[{ id: pick.sched_id, date: pick.date, track: pick.track, label: `${short(pick.date)} · ${pick.title}` }]} />
          </aside>
        )}
      </Shell>
    );
  }

  // "Recently done" lives here now, as a filter
  if (sp?.show === 'done') {
    const done = bucket(tasks).done;
    return (
      <Shell user={user} current="programs" desc="Is each offering ready? Readiness for every session on the calendar." title="Programming" head={head}>
        <h2 className="ops-sub">Recently done</h2>
        <TaskList tasks={done} showWho={!teacherView} done empty="Nothing completed recently." />
      </Shell>
    );
  }

  redirect('/ops/programs');
}

function Filters({ sp, editor, tracks }) {
  const done = sp?.show === 'done', cancelled = sp?.show === 'cancelled', past = sp?.show === 'past';
  return (<>
    <nav className="ops-filters" aria-label="Filter">
      <a href="/ops/programs">Upcoming</a>
      <a href={qs({}, { show: 'done' })} aria-current={done ? 'page' : undefined}>Recently done</a>
      {editor && <a href={qs({}, { show: 'past' })} aria-current={past ? 'page' : undefined}>Past</a>}
      {editor && <a href={qs({}, { show: 'cancelled' })} aria-current={cancelled ? 'page' : undefined}>Cancelled</a>}
    </nav>
    {editor && !past && <div className="pg-add"><AddEvent tracks={tracks} /></div>}
  </>);
}
