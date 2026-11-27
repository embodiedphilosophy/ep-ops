import { redirect } from 'next/navigation';
import { listTasks } from '@/lib/ops/taskstore';
import { loadTeam, dedupe, visibleTo } from '@/lib/ops/tasks';
import { loadCalendar } from '@/lib/calendar';
import { emailsOf, todayET } from '@/lib/events';
import { joinUrlFor, seriesLinksOf, upcomingMeetings, inCircle } from '@/lib/ops/joinurl';
import { readinessRows, labelOf } from '@/lib/ops/readiness';
import { kitConfigured, tagCounts } from '@/lib/kit';
import { isTeacher, isStaff, canEditEvents, canEditSite } from '@/lib/ops/nav';
import { readPlain } from '@/lib/ops/store';
import { parse } from '@/lib/ops/launches';
import { listOfferings } from '@/lib/ops/offerings';
import { GROUPS, groupOf, programHref, libraryFor, readyChecks } from '@/lib/ops/programindex';
import { evId } from '@/lib/ops/emailkit';
import { SITE } from '@/lib/siteurl';
import Shell, { opsUser } from '../../Shell';
import TaskList from '../../TaskList';
import EventEditor from '../../events/EventEditor';
import CirclePanel from '../../events/CirclePanel';
import { ProgramEditor, ProgramTitle } from '../../events/ProgramEditor';
import { Launches, LaunchTimeline } from '../../email/Launches';
import { Media } from '../../email/Media';
import '../../social/social.css';
import '../../email/email.css';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Program — Embodied Philosophy', robots: { index: false, follow: false } };

// One program (EP Ops 2, step 4): the old event drawer opened into a page with tabs. Overview (the count cards, "Is it ready?", the
// launch timeline, tasks, links), Sessions (the program editor and the one-session editor), Faculty, Launch (the Launches wizard on
// this program), Circle (the Circle panel), Recordings (the replays), Library (its Course Library listing).
const first = v => (Array.isArray(v) ? v[0] : v) || '';
const day = (d, year) => d ? new Date(`${d}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', ...(year ? { year: 'numeric' } : {}), timeZone: 'UTC' }) : '';
const short = d => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
const between = (a, b) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 864e5);
const names = s => String(s || '').split(',').map(x => x.trim()).filter(Boolean);
const TABS = [['overview', 'Overview'], ['sessions', 'Sessions'], ['faculty', 'Faculty'], ['launch', 'Launch'], ['circle', 'Circle'], ['recordings', 'Recordings'], ['library', 'Library']];

export default async function ProgramPage({ params, searchParams }) {
  const key = decodeURIComponent((await params).id), sp = (await searchParams) || {};
  const user = await opsUser();
  const teacherView = isTeacher(user), staff = isStaff(user), editor = canEditEvents(user);
  let tasks = [];
  try { tasks = dedupe(await listTasks()); if (teacherView) tasks = visibleTo(user, tasks); } catch { /* the task lists say so when empty */ }
  const find = rows => rows.find(r => r.key === key) || rows.find(r => r.events.some(e => e.sched_id === key || e.id === key));
  let r = find(await readinessRows(user, tasks, { teacherView, weeks: 26 }).catch(() => []));
  r ||= find(await readinessRows(user, tasks, { teacherView, weeks: 104 }).catch(() => []));
  if (r && r.key !== key) redirect(`/ops/programs/${encodeURIComponent(r.key)}${first(sp.tab) ? `?tab=${encodeURIComponent(first(sp.tab))}` : ''}`);
  if (!r) return (
    <Shell user={user} current="programs" title="We can’t find that program">
      <p className="ops-empty">It may be over, or not yours to see. <a href="/ops/programs">Back to everything EP runs</a>, or look in <a href="/ops/programs?show=past">Past events</a>.</p>
    </Shell>);

  const today = todayET(), full = await loadCalendar().catch(() => []);
  const all = (r.program ? full.filter(e => e.series === r.program && !/cancel/i.test(e.status)) : r.events).slice().sort((a, b) => a.date.localeCompare(b.date));
  // upcoming sessions first: a new launch starts on the next one (the Launches wizard offers upcoming sessions)
  const ids = [...all.filter(e => e.date >= today), ...all.filter(e => e.date < today)].map(e => evId(e)).filter(Boolean);
  const group = groupOf(r), groupLabel = (GROUPS.find(g => g[0] === group) || [])[1] || '';
  const tabs = TABS.filter(([k]) => k === 'overview' || k === 'sessions' || (k === 'faculty') || (staff && ['launch', 'recordings'].includes(k)) || (editor && k === 'circle') || (canEditSite(user) && k === 'library'));
  const tab = tabs.some(t => t[0] === first(sp.tab)) ? first(sp.tab) : 'overview';
  const base = `/ops/programs/${encodeURIComponent(key)}`;

  // Launches tied to this program's sessions (read only), and the Email Plan for their counts
  let launch = null;
  if (staff) {
    const l = await readPlain('Launches', { light: true }).catch(() => null);
    const mine = (l?.rows || []).map(x => ({ ...x.values, dates: parse(x.values.dates_json, {}) })).filter(x => x.event_id && ids.includes(String(x.event_id).toUpperCase()));
    launch = mine.find(x => x.status !== 'Done') || mine[0] || null;
  }
  const title = r.title, when = (() => {
    const wd = [...new Set(all.map(e => new Date(`${e.date}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' })))];
    const span = all.length > 1 ? `${day(all[0].date)} – ${day(all[all.length - 1].end_date || all[all.length - 1].date, all[all.length - 1].date.slice(0, 4) !== today.slice(0, 4))}` : day(r.date, r.date.slice(0, 4) !== today.slice(0, 4));
    return [`${wd.length === 1 && all.length > 1 ? `${wd[0]}s ` : ''}${span}`, r.events[0]?.time, r.teachers].filter(Boolean).join(' · ');
  })();
  const crumb = (
    <nav className="ops-crumb" aria-label="Breadcrumb"><a href="/ops/programs">Programs</a><span aria-hidden="true">/</span>{groupLabel && groupLabel !== title && <><span>{groupLabel}</span><span aria-hidden="true">/</span></>}<span>{title}</span></nav>);
  const titleEl = r.program ? <ProgramTitle as="h1" key={`t-${r.key}`} series={r.program} title={title} saved={r.program_name} parent={r.parent} editable={editor} /> : <h1 className="ops-name">{title}</h1>;
  const head = (
    <nav className="ops-filters" aria-label="Program tabs">
      {tabs.map(([k, label]) => <a key={k} href={k === 'overview' ? base : `${base}?tab=${k}`} aria-current={k === tab ? 'page' : undefined}>{label}{k === 'sessions' && all.length > 1 ? <span className="n">{all.length}</span> : null}</a>)}
    </nav>);

  let body = null;
  if (tab === 'overview') body = await Overview({ r, all, user, tasks, today, launch, staff, teacherView, editor, base, full });
  else if (tab === 'sessions') body = (
    <div className="ops-wsp">
      <div className="pg-scroll"><table className="pg-table pg-sessions"><thead><tr><th>#</th><th>Date</th><th>Session</th><th>Teacher</th></tr></thead>
        <tbody>{all.map((e, i) => <tr key={e.sched_id || e.id}><td>{i + 1}</td><td className="pg-when">{short(e.date)}</td><td><b>{e.module_title || e.title}</b></td><td className="pg-fac">{e.teachers || <span className="none">No teacher yet</span>}</td></tr>)}</tbody></table></div>
      {(editor || teacherView) && r.program && <ProgramEditor key={`p-${r.key}-${r.title}-${r.parent}`} series={r.program} />}
      {editor && <EventEditor key={r.key} label={r.program ? 'Edit one session' : undefined} sessions={r.events.filter(e => e.sched_id).map(e => ({ id: e.sched_id, date: e.date, track: e.track, label: `${short(e.date)} · ${e.title}` }))} />}
    </div>);
  else if (tab === 'faculty') body = <Faculty r={r} all={all} staff={staff} teacherView={teacherView} />;
  else if (tab === 'launch') body = <section aria-label="Launch"><Launches scope={{ eventIds: ids, name: title, base: `${base}?tab=launch` }} /></section>;
  else if (tab === 'circle') {
    const cids = all.filter(e => e.sched_id && inCircle(e)).map(e => e.sched_id);
    body = cids.length ? <section aria-label="Circle"><CirclePanel key={`c-${r.key}`} ids={cids} /></section>
      : <p className="ops-empty">None of this program’s sessions are taught in Circle. A session’s “Where it happens” setting (Sessions → Edit one session) decides that.</p>;
  } else if (tab === 'recordings') body = <section aria-label="Recordings"><Media only={ids} /></section>;
  else if (tab === 'library') body = await Library({ r, all, group });

  return (
    <Shell user={user} current="programs" eyebrow={crumb} titleEl={titleEl} desc={when} head={head}>
      {body}
    </Shell>);
}

async function Overview({ r, all, user, tasks, today, launch, staff, teacherView, editor, base, full }) {
  // Enrolled = people carrying the program's Enrolled Tag in Kit (the biggest tag if there are several). Staff only; Kit is only read.
  const tagsOf = [...new Set(r.events.flatMap(e => e.enrolled_tags || []))];
  const counts = staff && kitConfigured() && tagsOf.length ? await tagCounts(tagsOf).catch(() => ({})) : {};
  const ns = tagsOf.map(t => counts[t.toLowerCase()]).filter(n => n != null), enrolled = ns.length ? Math.max(...ns) : null;
  const doors = launch?.dates?.open || '';
  const titleDue = r.checks.filter(c => c.key === 'title' && !c.ready).map(c => c.due).sort()[0] || '';
  const titled = all.filter(e => e.module_title || (!r.program && e.public_title)).length;
  const taught = all.filter(e => names(e.teachers).length).length;
  const teacherLate = r.checks.some(c => c.key === 'teacher' && !c.ready && c.due < today);
  const first = r.date;
  const cards = [
    doors && doors >= today ? { l: 'Days to doors open', n: between(today, doors), c: day(doors, true) }
      : first > today ? { l: 'Days to the first session', n: between(today, first), c: day(first, true) }
      : { l: 'Sessions so far', n: `${all.filter(e => e.date <= today).length} / ${all.length}`, c: r.end_date >= today ? 'Running now' : 'All done' },
    { l: 'Sessions titled', n: `${titled} / ${all.length}`, c: titleDue ? `due ${day(titleDue)}` : titled === all.length ? 'all titled' : '', late: titleDue && titleDue < today },
    { l: 'Sessions with a teacher', n: `${taught} / ${all.length}`, c: taught === all.length ? 'everyone named' : `${all.length - taught} still to name`, late: teacherLate },
    ...(staff ? [{ l: 'Enrolled', n: enrolled ?? '—', c: enrolled != null ? 'in Kit' : tagsOf.length ? 'Kit has no count yet' : 'no Kit tag yet' }] : []),
  ];
  const steps = readyChecks(r.checks, today);
  const teamAll = await loadTeam().catch(() => []);
  const roleNames = {};
  for (const m of teamAll) for (const x of m.roles) (roleNames[x] ||= []).push(m.name);
  const teamNames = teamAll.filter(m => String(m.type).toLowerCase() !== 'teacher').map(m => m.name);
  // Join / registration / website, as the old drawer showed them
  const cal = await loadCalendar().catch(() => []), upcoming = await upcomingMeetings();
  const ev0 = r.events[0], zoom = await joinUrlFor(ev0, seriesLinksOf(cal), upcoming);
  const circle = inCircle(ev0), emails = [...new Set(r.events.flatMap(e => emailsOf(e)))];
  const missing = r.program ? r.checks.filter(c => !c.ready).sort((a, b) => a.due.localeCompare(b.due)) : [];
  return (
    <div className="ops-wsp">
      <div className="ops-tiles" role="list">
        {cards.map(c => <div key={c.l} role="listitem" className={`ops-tile${c.late ? ' late' : ''}`}><span className="l">{c.l}</span><span className="n">{c.n}</span><span className="l sub">{c.c || ' '}</span></div>)}
      </div>
      <div className="pg-two">
        <section className="pg-card" aria-label="Launch timeline">
          <div className="pg-card-head"><h2>{launch ? `Launch: ${launch.name}` : 'Launch'}</h2>{staff && <a href={`${base}?tab=launch${launch ? `&id=${launch.id}` : ''}`}>{launch ? 'Open launch' : 'Start a launch'}</a>}</div>
          {launch ? <LaunchTimeline id={launch.id} /> : <p className="ops-empty">{staff ? 'No launch for this program yet.' : 'Nothing to show here.'}</p>}
        </section>
        <section className="pg-card" aria-label="Is it ready?">
          <div className="pg-card-head"><h2>Is it ready?</h2><span className={`ops-status ${{ red: 'risk', amber: 'soon', green: 'ok', grey: 'none' }[r.status]}`}>{labelOf(r)}</span></div>
          {steps.length === 0 ? <p className="ops-empty">Nothing to check yet.</p> : (
            <ul className="pg-ready">{steps.map(s => <li key={s.label}><span>{s.label}{s.detail && <span className="sub"> · {s.detail}</span>}</span><span className={`ops-status ${s.cls}`}>{s.word}</span></li>)}</ul>)}
          {missing.length > 0 && (
            <details className="ops-done">
              <summary>{missing.length} missing across the sessions</summary>
              <ul className="ops-checks">{missing.map((c, i) => (
                <li key={i} className={c.due < today ? 'late' : 'todo'}><span className="mk" aria-hidden="true" />
                  <span>{c.label}<span className="sub"> · {short(c.event.date)} · {c.detail ? `${c.detail}, ` : ''}due {short(c.due)}{c.field && editor ? ' · fix in Sessions' : ''}</span></span></li>))}</ul>
            </details>)}
        </section>
      </div>
      <div className="pg-two">
        <section className="pg-card" aria-label="Tasks">
          <div className="pg-card-head"><h2>Tasks</h2><span className="sub">{r.done} of {r.total} done</span></div>
          <TaskList tasks={r.tasks.filter(t => !t.completed).sort((a, b) => (a.due || '9').localeCompare(b.due || '9'))} showWho={!teacherView} team={teamNames} roleNames={roleNames} short
            empty={r.total ? 'Everything is done.' : 'No tasks yet. The daily job makes them about four weeks ahead.'} />
          {r.done > 0 && <details className="ops-done"><summary>Done ({r.done})</summary><TaskList tasks={r.tasks.filter(t => t.completed)} showWho={!teacherView} short done empty="" /></details>}
        </section>
        <section className="pg-card" aria-label="Links">
          <div className="pg-card-head"><h2>Links</h2></div>
          <dl className="pg-dl">
            <dt>Join</dt><dd>{zoom ? <>{circle ? 'Circle: ' : ''}<a href={zoom} target="_blank" rel="noopener">{zoom}</a></> : circle ? 'Circle live stream: the event isn’t made yet' : 'Zoom link not set yet'}</dd>
            <dt>Registration</dt><dd>{ev0.registration_url ? <a href={ev0.registration_url} target="_blank" rel="noopener">{ev0.registration_url}</a> : '—'}</dd>
            <dt>Website</dt><dd>{ev0.website ? <a href={`${SITE}/events`} target="_blank" rel="noopener">Listed on /events</a> : 'Not on the website'}</dd>
            {!teacherView && emails.length > 0 && <><dt>Reminders go to</dt><dd>{emails.join(', ')}</dd></>}
          </dl>
        </section>
      </div>
    </div>);
}

function Faculty({ r, all, staff, teacherView }) {
  const by = new Map();
  for (const e of all) for (const n of names(e.teachers)) by.set(n, [...(by.get(n) || []), e]);
  const none = all.filter(e => !names(e.teachers).length);
  const emails = [...new Set(all.flatMap(e => emailsOf(e)))];
  return (
    <div className="ops-wsp">
      <section className="pg-card" aria-label="Faculty">
        <div className="pg-card-head"><h2>Who teaches</h2>{staff && <a href="/ops/people">Open People</a>}</div>
        {by.size === 0 ? <p className="ops-empty">No teacher is named yet.</p> : (
          <table className="pg-table"><thead><tr><th>Teacher</th><th>Sessions</th></tr></thead>
            <tbody>{[...by.entries()].map(([n, es]) => <tr key={n}><td><b>{n}</b></td><td className="pg-fac">{es.length} of {all.length}: {es.map(e => short(e.date)).join(' · ')}</td></tr>)}</tbody></table>)}
        {none.length > 0 && <p className="sub pg-gap">Still to name: {none.map(e => short(e.date)).join(' · ')}. Choose a teacher in Sessions.</p>}
        <dl className="pg-dl">
          <dt>Course host</dt><dd>{r.course_host || '—'}</dd>
          {!teacherView && emails.length > 0 && <><dt>Reminders go to</dt><dd>{emails.join(', ')}</dd></>}
        </dl>
      </section>
    </div>);
}

async function Library({ r, all, group }) {
  const offerings = await listOfferings().catch(() => []);
  const mine = libraryFor(r, all, offerings);
  return (
    <div className="ops-wsp">
      <section className="pg-card" aria-label="Library listing">
        <div className="pg-card-head"><h2>Course Library listing</h2><a href="/ops/programs?view=library">Open the Library</a></div>
        {mine.length === 0 ? <p className="ops-empty">This program isn’t in the Course Library yet. Courses found in Circle are listed under “New from Circle” in the Library.</p> : (
          <ul className="pg-ready">{mine.map(o => <li key={o.offering_id}><span><b>{o.title}</b><span className="sub"> · {o.price_label || 'No price'}</span></span>
            <span><span className={`ops-status ${o.status === 'published' ? 'ok' : 'none'}`}>{o.status === 'published' ? 'Published' : 'Not published'}</span> <a href={`/ops/programs/library/${encodeURIComponent(o.offering_id)}`}>{o.status === 'published' ? 'Edit listing' : 'Prepare listing'}</a></span></li>)}</ul>)}
      </section>
    </div>);
}
