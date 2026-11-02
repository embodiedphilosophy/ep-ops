import data from '@/data/mentee-year.json';
import { isStaff, canEditSite } from '@/lib/ops/nav';
import { todayET } from '@/lib/events';
import { segments, nextSteps, currentMonth, reviewFor, daysUntil, PROJECTS, laneStyle } from '@/lib/ops/menteeyear';
import { loadOpsYear } from '@/lib/ops/menteeyearops';
import Shell, { opsUser } from '../Shell';
import { EditItem, AddItem, ShowAgain, EditMonth, RowEdit, AddBook, Orderable, EditText, AddLine, PublishManual } from './Editor';
import { listView, textView } from '@/lib/mentee/yearcontent';
const MANUAL_DOC_URL = 'https://docs.google.com/document/d/1u9O7F59dnj0I6mo0u0wIZ_SVjfbIMRZpcIsVzpnYuOw/edit';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Mentee year — Embodied Philosophy', robots: { index: false, follow: false } };

const TABS = [['now', 'Now'], ['rhythm', 'The rhythm'], ['months', 'Month by month'], ['projects', 'Final projects'], ['one-to-ones', 'One-to-ones'], ['manual', 'The manual']];
const dayFmt = d => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).replace(',', '');
const dayYear = d => `${dayFmt(d)} ${d.slice(0, 4)}`;

// Rich text from the data file: bold, italic, quiet, dates
const Rich = ({ text }) => segments(text).map((x, i) => x.t === 'b' ? <b key={i}>{x.s}</b> : x.t === 'i' ? <i key={i}>{x.s}</i> : x.t === 'q' ? <span key={i} className="my-q"><Rich text={x.s} /></span> : x.t === 'd' ? <span key={i} className="my-d">{x.s}</span> : x.s);
const Proj = ({ p }) => <span className={`ops-my-proj ${p}`}><i />{PROJECTS[p]}</span>;
const lastDay = ym => { const [y, m] = ym.split('-').map(Number); return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10); };

// One month's list: exactly what mentees see under "This month" on their page in Circle (and on /school/mentee-year), each row editable
const KIND = { immersion: 'Immersion', note: 'Note', book: 'Book', suggested: 'Suggested book', buddy: 'Buddy', 'one-to-one': 'One-to-one', reflection: 'Reflection', handin: 'Hand-in', task: 'Task' };
const span = (a, b) => (b && b !== a ? `${dayFmt(a)} – ${dayFmt(b)}` : dayFmt(a));
const NUM = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
// A row's two cells (the "when" and the "what"); MonthRow puts them in a list item, Orderable adds the ↑ ↓ around them
function RowBody({ r, ym, canEdit, counts, mentees }) {
  return (<>
    <span className="when"><b>{r.date ? span(r.date, r.end) : r.when || ''}</b><small>{KIND[r.kind]}</small></span>
    <span className="what"><b><Rich text={r.title} /></b>{r.line && <span className="det"><Rich text={r.line} /></span>}
      {r.kind === 'immersion' ? [['Prepare lesson', r.link, 'the Workbook’s own lesson'], ['Saturday Open Session', r.satLink, 'not set yet'], ['Sunday Practicum', r.sunLink, 'not set yet']].map(([l, u, none]) => <span key={l} className="ev">{l}: {u ? <a href={u} target="_blank" rel="noopener noreferrer">{u.replace(/^https:\/\//, '').slice(0, 50)}</a> : none}</span>)
        : r.link && <span className="ev"><a href={r.link} target="_blank" rel="noopener noreferrer">{r.link.replace(/^https:\/\//, '').slice(0, 60)}</a></span>}
      {r.hidden && <span className="ev">Taken off the mentee page</span>}
      {r.hint && <span className="ev">{r.hint}</span>}
      {r.kind === 'buddy' && <span className="ev">Who is paired with whom: <a href="/ops/settings/partners">Settings → Peer partners</a></span>}
      {r.kind === 'task' && mentees > 0 && <span className="ev">{counts[r.key] || 0} of {mentees} ticked</span>}
      {canEdit && (r.kind === 'task' ? <EditItem kind="task" item={r.task} /> : r.edit === 'settings' ? <a className="chip ops-my-editbtn" href="/ops/settings?t=massignments">Edit in Settings</a> : <RowEdit month={ym} row={r} />)}</span>
  </>);
}
const MonthRow = props => <li className={`ops-my-step${props.r.hidden ? ' off' : ''}`}><RowBody {...props} /></li>;
// One month's list: the mentee page's "This month" in Circle, row for row and in the same order (lib/mentee/monthlist.js), each row editable
function MonthList({ ym, rows, canEdit, today, counts, mentees }) {
  const inCircle = rows.filter(r => r.circle), only = rows.filter(r => !r.circle), n = inCircle.filter(r => !r.hidden).length;
  const bookStart = rows.find(r => r.kind === 'book' && r.date)?.date || `${ym}-01`;
  return (<div className="ops-my-tasks">
    <h4>This month, {NUM[n] || n} {n === 1 ? 'thing' : 'things'} <small>· what mentees see on their page in Circle (as at the start of the month), and on the Your Year page</small></h4>
    {canEdit ? <Orderable month={ym} items={inCircle.map(r => ({ key: r.key, off: !!r.hidden, body: <RowBody r={r} ym={ym} canEdit={canEdit} counts={counts} mentees={mentees} /> }))} />
      : <ul className="ops-my-steps compact ops-my-mlist">{inCircle.map(r => <MonthRow key={r.key} r={r} ym={ym} canEdit={canEdit} counts={counts} mentees={mentees} />)}</ul>}
    {canEdit && <div className="ops-my-acts"><AddItem kind="task" date={today.slice(0, 7) === ym ? (today < lastDay(ym) ? lastDay(ym) : today) : lastDay(ym)} /><AddBook month={ym} starts={bookStart} /></div>}
    {only.length > 0 && (<><h4 style={{ marginTop: 14 }}>Only on the Your Year page <small>· not a row in Circle</small></h4>
      <ul className="ops-my-steps compact ops-my-mlist">{only.map(r => <MonthRow key={r.key} r={r} ym={ym} canEdit={canEdit} counts={counts} mentees={mentees} />)}</ul></>)}
  </div>);
}

function Step({ s, today, detail }) {
  const n = daysUntil(s.date, today);
  return (
    <li className="ops-my-step">
      <span className="when"><b>{dayFmt(s.date)}</b><small>{n < 0 ? 'past' : n === 0 ? 'today' : n === 1 ? 'tomorrow' : `in ${n} days`}</small></span>
      <span className="what"><Proj p={s.project} /><b>{s.title || s.text}</b>{detail && s.detail && <span className="det">{s.detail}</span>}{detail && s.evidence && <span className="ev">Evidence: {s.evidence}</span>}</span>
    </li>
  );
}

export default async function MenteeYear({ searchParams }) {
  const user = await opsUser(u => !!u.director || isStaff(u));
  const sp = await searchParams;
  const tab = TABS.some(t => t[0] === sp?.tab) ? sp.tab : 'now';
  const filter = ['talk', 'offering'].includes(sp?.p) ? sp.p : 'all';
  const today = todayET();
  const year = await loadOpsYear({ today, withBookings: false });
  const baseMonth = currentMonth(data.months, today), month = baseMonth && { ...baseMonth, theme: year.month?.theme || baseMonth.theme, focus: year.month?.focus || baseMonth.focus };
  const doneDate = iso => iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'America/New_York' }) : '';
  const dotOf = c => c.count === c.of && c.of ? 'ok' : c.count && c.step.date < today ? 'risk' : 'none';
  const canEdit = canEditSite(user);
  const monthSteps = ym => year.steps.filter(s => s.month === ym).map(s => ({ ...s, text: s.title }));
  const themeOf = m => (year.months[m.id] && year.months[m.id].theme) || m.theme, focusOf = m => (year.months[m.id] && year.months[m.id].focus) || m.focus;
  // The Your Year page's wording, with the edits saved from here laid over data/mentee-year.json (lib/mentee/yearcontent.js)
  const T = path => textView(data, year.textRows, path);
  const Words = ({ v, list, long }) => (canEdit ? <EditText v={v} list={list} long={long}><Rich text={v.text} /></EditText> : <Rich text={v.text} />);
  const Lines = ({ base, as: Tag = 'ul', cls = 'ops-my-items' }) => {
    const l = listView(data, year.textRows, base);
    return (<><Tag className={cls}>{l.lines.filter(x => canEdit || !x.removed).map(x => <li key={x.path} className={x.removed ? 'ops-my-off' : ''}><Words v={x} list /></li>)}</Tag>{canEdit && <AddLine path={l.next} />}</>);
  };
  const href = (t, extra = '') => `/ops/mentee-year${t === 'now' && !extra ? '' : `?tab=${t}${extra}`}`;

  return (
    <Shell user={user} current="mentee-year" eyebrow="Sahṛdaya Upāya · 2026–27 cohort" title="The mentee year"
      head={<nav className="ops-filters" aria-label="Mentee year">{TABS.map(([k, l]) => <a key={k} href={href(k)} aria-current={tab === k ? 'page' : undefined}>{l}</a>)}</nav>}>
      <p className="ops-empty ops-my-lede"><Words v={T('lede')} long /></p>
      <p className="ops-more"><a href="/school/mentee-year" target="_blank" rel="noopener">View the mentee version (what mentees see) →</a></p>
      {canEdit && <p className="ops-note ops-my-howto">Everything here is editable, and it is what mentees see: every line of words (Edit, Remove, + Add a line), each month’s list as it appears under “This month” in Circle (immersions, books, the one-to-one, the reflection, tasks, and the order), the project steps, and the manual (The manual tab, in its Google Doc). Changes show for mentees within a minute.</p>}

      {tab === 'now' && (<div className="ops-my-cols">
        <section>
          <h2>Next three project steps</h2>
          {year.upcoming.length === 0 ? <p className="ops-empty">Every step is past its date: the year is complete.</p> : <ul className="ops-my-steps">{year.upcoming.map(c => (
            <li key={c.step.id} className="ops-my-step">
              <span className="when"><b>{dayFmt(c.step.date)}</b><small>{daysUntil(c.step.date, today) === 0 ? 'today' : `in ${daysUntil(c.step.date, today)} days`}</small></span>
              <span className="what"><Proj p={c.step.project} /><b>{c.step.title}</b>{c.step.detail && <span className="det">{c.step.detail}</span>}{c.step.evidence && <span className="ev">Evidence: {c.step.evidence}</span>}
                <details className="ops-my-who"><summary><span className={`ops-my-count ${dotOf(c)}`}><i />{c.count} of {c.of} done</span></summary>
                  <ul className="ops-my-grid">{year.mentees.map(m => { const d = c.doneBy.find(x => x.email === m.email); return <li key={m.email}><span>{m.name}</span><b className={d ? 'ok' : ''}>{d ? `Done${d.at ? ` · ${doneDate(d.at)}` : ''}` : 'Not yet'}</b></li>; })}</ul>
                </details></span>
            </li>))}</ul>}
          {year.overdue.length > 0 && <p className="ops-note" role="status">Overdue: {year.overdue.length} {year.overdue.length === 1 ? 'step' : 'steps'} ({[...new Set(year.overdue.map(o => o.name))].slice(0, 4).join(', ')}{new Set(year.overdue.map(o => o.name)).size > 4 ? ', …' : ''})</p>}
          <p className="ops-more"><a href={href('projects')}>All dated steps →</a></p>
          {/* The quarterly review ticks are off: the review happens in the one-to-one, so there is nothing to show here. */}
        </section>
        {month && (<section className="ops-my-card current">
          <h2>This month <span>{month.title}</span></h2>
          <p className="theme">{month.theme}{month.tag ? ` · ${month.tag}` : ''}</p>
          <p className="focus">{month.focus}</p>
          {monthSteps(month.id).length > 0 && (<><h3>Project steps due this month</h3><ul className="ops-my-steps compact">{monthSteps(month.id).map(s => <Step key={s.id} s={s} today={today} />)}</ul></>)}
          <MonthList ym={month.id} rows={year.lists[month.id] || []} canEdit={canEdit} today={today} counts={year.counts} mentees={year.mentees.length} />
          {canEdit && <EditMonth month={month.id} theme={month.theme || ''} focus={month.focus || ''} />}
        </section>)}
      </div>)}

      {tab === 'rhythm' && (<section>
        <p className="ops-empty">Five layers, from the daily sit to certification. The lower layers are what keep the upper ones from piling up.</p>
        <div className="ops-my-ladder">{data.rhythm.map((r, ri) => (
          <div key={r.level} className="row"><div className="lvl"><Words v={T(`rhythm.${ri}.level`)} /><small><Words v={T(`rhythm.${ri}.note`)} /></small></div><div><Lines base={`rhythm.${ri}.items`} cls="" /></div></div>
        ))}</div>
        <h2 style={{ marginTop: 28 }}>A typical month, week by week</h2>
        <p className="ops-empty">The same four-week shape repeats each month. The immersion weekend moves to wherever it falls; everything else stays put.</p>
        <div className="ops-my-weeks">{data.week.map((w, wi) => <div key={w.title} className="ops-my-card"><h3><Words v={T(`week.${wi}.title`)} /></h3><Lines base={`week.${wi}.items`} /></div>)}</div>
      </section>)}

      {tab === 'months' && (<section>
        <p className="ops-empty">Each card gives the month's focus, its fixed points and the project steps due. Immersion dates follow the cohort calendar.</p>
        <div className="ops-my-months">{data.months.map(m => (
          <article key={m.id} id={`m-${m.id}`} className={`ops-my-card${month && m.id === month.id ? ' current' : ''}`}>
            <header><div><h3>{m.title}</h3><p className="theme">{themeOf(m)}</p></div>{m.tag && <span className="ops-my-tag">{m.tag}</span>}</header>
            <p className="focus">{focusOf(m)}</p>
            {monthSteps(m.id).length > 0 && (<><h4>Project steps due this month</h4><ul className="ops-my-steps compact">{monthSteps(m.id).map(s => <li key={s.id} className="ops-my-step"><span className="when"><b>{dayFmt(s.date)}</b></span><span className="what"><Proj p={s.project} />{s.text}</span></li>)}</ul></>)}
            <MonthList ym={m.id} rows={year.lists[m.id] || []} canEdit={canEdit} today={today} counts={year.counts} mentees={year.mentees.length} />
            {canEdit && <EditMonth month={m.id} theme={themeOf(m) || ''} focus={focusOf(m) || ''} />}
          </article>
        ))}</div>
      </section>)}

      {tab === 'projects' && (<section>
        <p className="ops-empty">Two separate pieces, prepared side by side. The talk tests the mentee as a teacher; the offering is what certifies them to teach Sahṛdaya Meditation. Each step is small and dated so nothing waits for July.</p>
        <div className="ops-my-strip" role="img" aria-label="Phases of the two final projects from November to July">
          <div className="lab" />{data.lanes.months.map(m => <div key={m} className="mc">{m}</div>)}
          <div className="lab">60-min talk</div>{data.lanes.talk.map(b => <div key={b.label} className="bar talk" style={laneStyle(b)}>{b.label}</div>)}
          <div className="lab">Three-session offering</div>{data.lanes.offering.map(b => <div key={b.label} className="bar offering" style={laneStyle(b)}>{b.label}</div>)}
        </div>
        <p className="ops-note"><Words v={T('spacing')} long /></p>
        {canEdit && <AddItem kind="step" />}
        <nav className="ops-filters" aria-label="Filter steps">{[['all', 'All steps'], ['talk', '60-min talk'], ['offering', 'Three-session offering']].map(([k, l]) => <a key={k} href={href('projects', k === 'all' ? '' : `&p=${k}`)} aria-current={filter === k ? 'page' : undefined}>{l}</a>)}</nav>
        <ul className="ops-my-steps full">{year.cohort.filter(c => filter === 'all' || c.step.project === filter || c.step.project === 'both').map(c => (
          <li key={c.step.id} className={`ops-my-step${c.step.date < today ? ' past' : ''}`}>
            <span className="when"><b>{dayYear(c.step.date)}</b></span>
            <span className="what"><Proj p={c.step.project} /><b>{c.step.title}</b><span className="det">{c.step.detail}</span><span className="ev">Evidence: {c.step.evidence}</span><span className={`ops-my-count ${dotOf(c)}`}><i />{c.count} of {c.of} done</span>{canEdit && <EditItem kind="step" item={c.step} />}</span>
          </li>
        ))}</ul>
        {canEdit && year.hidden.length > 0 && (<div className="ops-my-hidden">
          <h4>Taken off the mentee page</h4>
          <ul>{year.hidden.map(h => <li key={h.id}>{h.date ? dayYear(h.date) : ''} · {h.kind === 'task' ? 'Task' : 'Step'}: {h.title}<ShowAgain kind={h.kind} id={h.id} /></li>)}</ul>
        </div>)}
      </section>)}

      {tab === 'one-to-ones' && (<section className="ops-my-cols">
        <div className="ops-my-card">
          <h2>How mentees book</h2>
          <Lines base="oneToOne.howTo" as="ol" />
        </div>
        <div className="ops-my-card">
          <h2>Booking summary</h2>
          <Lines base="oneToOne.template" cls="ops-my-template-lines" />
          <p className="ops-empty"><Words v={T('oneToOne.note')} long /></p>
        </div>
      </section>)}

      {tab === 'manual' && (<section className="ops-my-card">
        <h2>The Teacher Formation Manual</h2>
        <p>The manual mentees read on the Your Year page (and its Seminal Texts tab) is read straight from its Google Doc, <b>Sahṛdaya Upāya - Training Manual</b>. Edit it there as you would any document: the page follows within five minutes, or at once with the button below. The “Download the PDF” button always gives the doc as it is now.</p>
        <ul className="ops-my-items">
          <li>Keep the headings the page is built on: <b>Heading 2</b> for each part (“Part I. …” to “Part V. …”, “Appendix A. …” to “Appendix C. …”, and “Appendices and sources”), <b>Heading 3</b> and <b>Heading 4</b> for sections inside them.</li>
          <li>If an edit leaves out a part the page needs, the page keeps showing the last good version until it is fixed.</li>
          <li>Italic indented paragraphs become verses; a paragraph all in italics becomes a note; tables, lists and checkboxes (☐) carry over.</li>
        </ul>
        <div className="ops-my-acts"><a className="chip" href={MANUAL_DOC_URL} target="_blank" rel="noopener noreferrer">Open the Google Doc</a><a className="chip" href="https://www.embodiedphilosophy.com/school/mentee-year?tab=manual" target="_blank" rel="noopener noreferrer">View the manual page</a>{canEdit && <PublishManual />}</div>
        <p className="ops-empty" style={{ marginTop: 18 }}>Everything else on the Your Year page is edited here: the opening line (top of this page), The rhythm and the typical month, Month by month, Final projects and One-to-ones.</p>
      </section>)}

      <p className="ops-more"><Words v={T('footer')} long /></p>
    </Shell>
  );
}
