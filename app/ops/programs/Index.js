import { listTasks } from '@/lib/ops/taskstore';
import { dedupe, visibleTo } from '@/lib/ops/tasks';
import { loadCalendar } from '@/lib/calendar';
import { todayET } from '@/lib/events';
import { readinessRows } from '@/lib/ops/readiness';
import { isTeacher, canEditEvents, isStaff } from '@/lib/ops/nav';
import { sheetChecks } from '@/lib/ops/sheetchecks';
import { readRange, toObjects } from '@/lib/google';
import { readPlain } from '@/lib/ops/store';
import { parse } from '@/lib/ops/launches';
import { GROUPS, groupOf, programHref, launchFor, circleOf, readyOf, sections, campaignRows } from '@/lib/ops/programindex';
import { redirect } from 'next/navigation';
import Shell, { opsUser } from '../Shell';
import { AddEvent } from '../events/EventActions';
import { AddProgram } from '../events/ProgramEditor';

// Everything EP runs (EP Ops 2, step 4): the old Programming list as one table, needs attention first, then month by month, with the
// campaigns beside the programs. It reads exactly what the old page read; a row opens the program. The older modes of that page
// (Past, Cancelled, Recently done) are in Older.js; a program opens its own page.
const RANGES = [['8w', 8, '8 weeks'], ['3m', 13, '3 months'], ['6m', 26, '6 months'], ['12m', 52, '12 months']];
const rangeOf = sp => RANGES.find(([k]) => k === sp?.range) || RANGES[2];
const first = v => (Array.isArray(v) ? v[0] : v) || '';
const href = (sp, extra) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries({ range: first(sp?.range), program: first(sp?.program), layout: first(sp?.layout), ...extra })) if (v) p.set(k, v);
  const s = p.toString();
  return s ? `/ops/programs?${s}` : '/ops/programs';
};
const day = (d, year) => d ? new Date(`${d}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', ...(year ? { year: 'numeric' } : {}), timeZone: 'UTC' }) : '';
const monthName = m => new Date(`${m}-15T12:00:00Z`).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const labelOfGroup = k => (GROUPS.find(g => g[0] === k) || [])[1] || '';

export default async function ProgramsIndex({ searchParams }) {
  const sp = (await searchParams) || {};
  // The older lists of Programming: Past, Cancelled, Recently done. One program is its own page now (an old ?event= link is sent there).
  if (first(sp.show)) return (await import('./Older')).default({ searchParams: Promise.resolve(sp) });
  if (first(sp.event)) redirect(`/ops/programs/${encodeURIComponent(first(sp.event))}`);

  const user = await opsUser();
  const teacherView = isTeacher(user), staff = isStaff(user), editor = canEditEvents(user);
  let tasks = [], error = '';
  try { tasks = dedupe(await listTasks()); if (teacherView) tasks = visibleTo(user, tasks); } catch (e) { error = e.message; }
  const [, weeks, rangeLabel] = rangeOf(sp);
  const rows = await readinessRows(user, tasks, { teacherView, weeks }).catch(e => { error ||= e.message; return []; });
  const today = todayET();

  // Launches and their emails (read only; a missing tab just means no launches yet), staff only
  let launches = [], plan = [];
  if (staff) {
    const l = await readPlain('Launches', { light: true }).catch(() => null);
    launches = (l?.rows || []).map(r => ({ ...r.values, dates: parse(r.values.dates_json, {}), steps: parse(r.values.steps_json, []) }));
    plan = (await readPlain('Email Plan', { light: true }).catch(() => null))?.rows.map(r => r.values) || [];
  }
  const fullCal = editor ? await loadCalendar().catch(() => []) : [];
  const pastPrograms = editor ? (() => {
    const by = new Map();
    for (const e of fullCal) if (e.series && e.track !== 'MM') { const p = by.get(e.series) || { series: e.series, name: e.program_name || e.title.split(':')[0].trim(), track: e.track, first: e.date, count: 0 }; p.count++; if (e.date < p.first) p.first = e.date; by.set(e.series, p); }
    return [...by.values()].filter(p => p.count > 1).sort((a, b) => b.first.localeCompare(a.first)).map(p => ({ ...p, label: `${p.name} (${p.first.slice(0, 7)}, ${p.count} sessions)` }));
  })() : [];
  const tracks = editor ? await readRange(process.env.CALENDAR_SHEET_ID, "'Track Defaults'!A1:A50").then(v => toObjects(v).map(r => String(r.track).toUpperCase()).filter(Boolean)).catch(() => []) : [];

  // The rows, each with its launch, Circle state and group; campaigns come from the launches that no program claims
  const programs = rows.map(r => ({ ...r, group: groupOf(r), launch: staff ? launchFor(r, launches, plan) : null, circle: staff ? circleOf(r) : null }));
  const camps = staff ? campaignRows(launches, plan, programs, today) : [];
  const chip = ['all', ...GROUPS.slice(1).map(g => g[0])].includes(first(sp.program)) ? first(sp.program) : 'all';
  const shown = chip === 'campaigns' ? [] : chip === 'all' ? programs : programs.filter(r => r.group === chip);
  const shownCamps = chip === 'all' || chip === 'campaigns' ? camps : [];
  const count = k => k === 'all' ? programs.length + camps.length : k === 'campaigns' ? camps.length : programs.filter(r => r.group === k).length;
  const calendar = first(sp.layout) === 'calendar';
  const { attention, months } = sections([...shown, ...shownCamps], today);
  const sub = r => r.campaign ? r.kind : r.program ? `${labelOfGroup(r.group) || r.track} · ${r.allSessions} sessions` : `${labelOfGroup(r.group) || r.track}${r.events.length > 1 ? ` · ${r.events.length} sessions` : ''}`;
  const dates = r => !r.date ? 'No dates yet' : r.end_date && r.end_date !== r.date ? `${day(r.date)} – ${day(r.end_date, r.end_date.slice(0, 4) !== today.slice(0, 4))}` : day(r.date, r.date.slice(0, 4) !== today.slice(0, 4));
  const target = r => r.campaign ? r.href : programHref(r.key);

  const row = r => {
    const rd = r.campaign ? { word: r.launch.status, cls: r.status === 'green' ? 'ok' : 'none', next: '' } : readyOf(r);
    return (
      <tr key={r.key}>
        <td><a className="pg-name" href={target(r)}>{r.title}</a><span className="sub">{sub(r)}</span></td>
        <td className="pg-when">{dates(r)}</td>
        <td className="pg-fac">{r.teachers || (r.campaign ? '—' : 'To confirm')}</td>
        <td><span className={`ops-status ${rd.cls}`}>{rd.word}</span>{rd.next && <span className="sub pg-next">{rd.next}</span>}{r.late > 0 && <span className="sub pg-next late">{r.late} task{r.late === 1 ? '' : 's'} late</span>}</td>
        {staff && <td>{r.launch ? <a href={r.campaign ? r.href : `/ops/programs?view=launches&id=${encodeURIComponent(r.launch.id)}`}>{r.launch.text}</a> : <span className="none">—</span>}</td>}
        {staff && <td>{r.circle ? <span className={`pg-circle ${r.circle.state}`}>{r.circle.text}</span> : <span className="none">—</span>}</td>}
      </tr>);
  };
  const cols = staff ? 6 : 4;
  const head = (<>
    <nav className="ops-filters" aria-label="How to show the programs">
      <a href={href(sp, { layout: '' })} aria-current={!calendar ? 'page' : undefined}>List</a>
      <a href={href(sp, { layout: 'calendar' })} aria-current={calendar ? 'page' : undefined}>Calendar</a>
    </nav>
    {editor && <div className="pg-add"><AddEvent tracks={tracks} /><AddProgram tracks={tracks} past={pastPrograms} /></div>}
  </>);
  const issues = editor ? sheetChecks(fullCal) : [];

  return (
    <Shell user={user} current="programs" desc="Every program and campaign, what needs attention first." eyebrow={`Programs · next ${rangeLabel}${teacherView ? ', your events' : ''}`} title="Everything EP runs" head={head}>
      {error && <p className="ops-note">Couldn’t load everything right now ({error}).</p>}
      {staff && (
        <nav className="pg-chips" aria-label="Which programs">
          {GROUPS.map(([k, label]) => <a key={k} href={href(sp, { program: k === 'all' ? '' : k })} aria-current={chip === k ? 'page' : undefined}>{label}{k !== 'all' && count(k) > 0 && <span className="n">{count(k)}</span>}</a>)}
        </nav>)}
      {issues.length > 0 && (
        <details className="ops-sheetchecks">
          <summary>{issues.length} thing{issues.length === 1 ? '' : 's'} on the Master Schedule look{issues.length === 1 ? 's' : ''} off</summary>
          <ul>{issues.map((x, i) => <li key={i}><span className="trk">{x.kind}</span> {x.key ? <a href={programHref(x.key)}>{x.text}</a> : x.text}</li>)}</ul>
        </details>)}
      {shown.length + shownCamps.length === 0 ? <p className="ops-empty pg-empty">{chip === 'all' ? `No events in the next ${rangeLabel}.` : `Nothing here in the next ${rangeLabel}.`}</p>
        : calendar ? <MonthGrid items={[...shown, ...shownCamps]} today={today} target={target} /> : (
          <div className="pg-scroll"><table className="pg-table">
            <thead><tr><th>Program</th><th>Dates</th><th>Faculty</th><th>Ready?</th>{staff && <th>Launch</th>}{staff && <th>Circle</th>}</tr></thead>
            {attention.length > 0 && <tbody><tr className="pg-group"><th colSpan={cols} scope="colgroup">Needs attention</th></tr>{attention.map(row)}</tbody>}
            {months.map(m => <tbody key={m.month}><tr className="pg-group"><th colSpan={cols} scope="colgroup">{monthName(m.month)}</th></tr>{m.rows.map(row)}</tbody>)}
          </table></div>)}
      <nav className="pg-more" aria-label="Range and older sessions">
        <span>Show the next</span>
        {RANGES.map(([k, , label]) => <a key={k} href={href(sp, { range: k })} aria-current={rangeOf(sp)[0] === k ? 'page' : undefined}>{label}</a>)}
        <span className="gap" aria-hidden="true" />
        {editor && <a href="/ops/programs?show=past">Past events</a>}
        {editor && <a href="/ops/programs?show=cancelled">Cancelled sessions</a>}
        <a href="/ops/programs?show=done">Recently done</a>
      </nav>
    </Shell>
  );
}

// Calendar: one month grid per month, each session a small link to its program
function MonthGrid({ items, today, target }) {
  const byDay = {};
  for (const r of items) {
    if (r.campaign) { if (r.date) (byDay[r.date] ||= []).push({ r, title: r.title }); continue; }
    for (const e of r.events) (byDay[e.date] ||= []).push({ r, title: r.program ? r.title : e.title });
  }
  const months = [...new Set(Object.keys(byDay).map(d => d.slice(0, 7)))].sort();
  if (!months.length) return <p className="ops-empty pg-empty">Nothing dated in this stretch.</p>;
  return months.map(m => {
    const first = new Date(`${m}-01T12:00:00Z`), lead = (first.getUTCDay() + 6) % 7, n = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
    const cells = [...Array(lead).fill(null), ...Array.from({ length: n }, (_, i) => `${m}-${String(i + 1).padStart(2, '0')}`)];
    return (
      <section key={m} className="pg-month" aria-label={monthName(m)}>
        <h2 className="ops-sub">{monthName(m)}</h2>
        <div className="pg-cal-scroll"><div className="pg-cal" role="grid">
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(w => <b key={w} className="wd" role="columnheader">{w}</b>)}
          {cells.map((d, i) => d ? (
            <div key={d} role="gridcell" className={`cell${d === today ? ' today' : ''}`}><span className="num">{Number(d.slice(8))}</span>
              {(byDay[d] || []).map((x, j) => <a key={j} href={target(x.r)} className={`ev ${x.r.campaign ? 'none' : { red: 'risk', amber: 'soon', green: 'ok', grey: 'none' }[x.r.status]}`} title={x.title}>{x.title}</a>)}
            </div>) : <div key={`b${i}`} className="cell blank" aria-hidden="true" />)}
        </div></div>
      </section>);
  });
}
