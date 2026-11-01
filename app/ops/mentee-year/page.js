import raw from '@/data/mentee-year.json';
import { isStaff, canEditEvents } from '@/lib/ops/nav';
import { applyOverrides, CONTENT_TAB } from '@/lib/mentee/yearcontent';
import { readTab } from '@/lib/mentee/content';
import { E, EditStep, EditMonth } from './Edit';
import { todayET } from '@/lib/events';
import { segments, nextSteps, currentMonth, reviewFor, daysUntil, PROJECTS, laneStyle } from '@/lib/ops/menteeyear';
import { loadOpsYear } from '@/lib/ops/menteeyearops';
import Shell, { opsUser } from '../Shell';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Mentee year — Embodied Philosophy', robots: { index: false, follow: false } };

const TABS = [['now', 'Now'], ['rhythm', 'The rhythm'], ['months', 'Month by month'], ['projects', 'Final projects'], ['one-to-ones', 'One-to-ones']];
const dayFmt = d => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).replace(',', '');
const dayYear = d => `${dayFmt(d)} ${d.slice(0, 4)}`;

// Rich text from the data file: bold, italic, quiet, dates
const Rich = ({ text }) => segments(text).map((x, i) => x.t === 'b' ? <b key={i}>{x.s}</b> : x.t === 'i' ? <i key={i}>{x.s}</i> : x.t === 'q' ? <span key={i} className="my-q"><Rich text={x.s} /></span> : x.t === 'd' ? <span key={i} className="my-d">{x.s}</span> : x.s);
const Proj = ({ p }) => <span className={`ops-my-proj ${p}`}><i />{PROJECTS[p]}</span>;

function Step({ s, today, detail, can }) {
  const n = daysUntil(s.date, today);
  return (
    <li className="ops-my-step">
      <span className="when"><b>{dayFmt(s.date)}</b><small>{n < 0 ? 'past' : n === 0 ? 'today' : n === 1 ? 'tomorrow' : `in ${n} days`}</small></span>
      <span className="what"><Proj p={s.project} /><b>{s.title || s.text}</b>{detail && s.detail && <span className="det">{s.detail}</span>}{detail && s.evidence && <span className="ev">Evidence: {s.evidence}</span>}<EditStep can={can} step={s} /></span>
    </li>
  );
}

export default async function MenteeYear({ searchParams }) {
  const user = await opsUser(u => !!u.director || isStaff(u));
  const sp = await searchParams;
  const tab = TABS.some(t => t[0] === sp?.tab) ? sp.tab : 'now';
  const filter = ['talk', 'offering'].includes(sp?.p) ? sp.p : 'all';
  const today = todayET();
  const can = canEditEvents(user);
  const data = applyOverrides(raw, await readTab(CONTENT_TAB).catch(() => []));
  const year = await loadOpsYear({ today, withBookings: false });
  const baseMonth = currentMonth(data.months, today), month = baseMonth && { ...baseMonth, theme: year.month?.theme || baseMonth.theme, focus: year.month?.focus || baseMonth.focus };
  const doneDate = iso => iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'America/New_York' }) : '';
  const dotOf = c => c.count === c.of && c.of ? 'ok' : c.count && c.step.date < today ? 'risk' : 'none';
  const href = (t, extra = '') => `/ops/mentee-year${t === 'now' && !extra ? '' : `?tab=${t}${extra}`}`;

  return (
    <Shell user={user} current="mentee-year" eyebrow="Sahṛdaya Upāya · 2026–27 cohort" title="The mentee year"
      head={<nav className="ops-filters" aria-label="Mentee year">{TABS.map(([k, l]) => <a key={k} href={href(k)} aria-current={tab === k ? 'page' : undefined}>{l}</a>)}</nav>}>
      <p className="ops-empty ops-my-lede"><E can={can} path="lede" value={data.lede} long rich label="the introduction">{data.lede}</E></p>
      <p className="ops-more"><a href="/school/mentee-year" target="_blank" rel="noopener">View the mentee version (what mentees see) →</a></p>

      {tab === 'now' && (<div className="ops-my-cols">
        <section>
          <h2>Next three project steps</h2>
          {year.upcoming.length === 0 ? <p className="ops-empty">Every step is past its date: the year is complete.</p> : <ul className="ops-my-steps">{year.upcoming.map(c => (
            <li key={c.step.id} className="ops-my-step">
              <span className="when"><b>{dayFmt(c.step.date)}</b><small>{daysUntil(c.step.date, today) === 0 ? 'today' : `in ${daysUntil(c.step.date, today)} days`}</small></span>
              <span className="what"><Proj p={c.step.project} /><b>{c.step.title}</b>{c.step.detail && <span className="det">{c.step.detail}</span>}{c.step.evidence && <span className="ev">Evidence: {c.step.evidence}</span>}<EditStep can={can} step={c.step} />
                <details className="ops-my-who"><summary><span className={`ops-my-count ${dotOf(c)}`}><i />{c.count} of {c.of} done</span></summary>
                  <ul className="ops-my-grid">{year.mentees.map(m => { const d = c.doneBy.find(x => x.email === m.email); return <li key={m.email}><span>{m.name}</span><b className={d ? 'ok' : ''}>{d ? `Done${d.at ? ` · ${doneDate(d.at)}` : ''}` : 'Not yet'}</b></li>; })}</ul>
                </details></span>
            </li>))}</ul>}
          {year.overdue.length > 0 && <p className="ops-note" role="status">Overdue: {year.overdue.length} {year.overdue.length === 1 ? 'step' : 'steps'} ({[...new Set(year.overdue.map(o => o.name))].slice(0, 4).join(', ')}{new Set(year.overdue.map(o => o.name)).size > 4 ? ', …' : ''})</p>}
          <p className="ops-more"><a href={href('projects')}>All dated steps →</a></p>
          {/* The quarterly review ticks are off: the review happens in the one-to-one, so there is nothing to show here. */}
        </section>
        {month && (() => { const mi = data.months.findIndex(m => m.id === month.id); return (<section className="ops-my-card current">
          <h2>This month <span>{month.title}</span></h2>
          <p className="theme">{month.theme}{month.tag ? <> · <E can={can} path={`months.${mi}.tag`} value={month.tag} label="the tag">{month.tag}</E></> : ''}</p>
          <p className="focus">{month.focus}<EditMonth can={can} id={month.id} theme={month.theme} focus={month.focus} reflectionDue={year.month?.reflectionDue || ''} /></p>
          <ul className="ops-my-items">{month.items.map((t, i) => <li key={i}><E can={can} path={`months.${mi}.items.${i}`} value={t} long rich label="this line"><Rich text={t} /></E></li>)}</ul>
          {year.steps.some(s => s.date.slice(0, 7) === month.id) && (<><h3>Project steps due this month</h3><ul className="ops-my-steps compact">{year.steps.filter(s => s.date.slice(0, 7) === month.id).map(s => <Step key={s.id} s={s} today={today} can={can} />)}</ul></>)}
        </section>); })()}
      </div>)}

      {tab === 'rhythm' && (<section>
        <p className="ops-empty">Five layers, from the daily sit to certification. The lower layers are what keep the upper ones from piling up.</p>
        <div className="ops-my-ladder">{data.rhythm.map((r, ri) => (
          <div key={r.level} className="row"><div className="lvl">{r.level}<small>{r.note}</small></div><ul>{r.items.map((t, i) => <li key={i}><E can={can} path={`rhythm.${ri}.items.${i}`} value={t} long rich label="this line"><Rich text={t} /></E></li>)}</ul></div>
        ))}</div>
        <h2 style={{ marginTop: 28 }}>A typical month, week by week</h2>
        <p className="ops-empty">The same four-week shape repeats each month. The immersion weekend moves to wherever it falls; everything else stays put.</p>
        <div className="ops-my-weeks">{data.week.map((w, wi) => <div key={w.title} className="ops-my-card"><h3><E can={can} path={`week.${wi}.title`} value={w.title} label="this heading">{w.title}</E></h3><ul className="ops-my-items">{w.items.map((t, i) => <li key={i}><E can={can} path={`week.${wi}.items.${i}`} value={t} long rich label="this line"><Rich text={t} /></E></li>)}</ul></div>)}</div>
      </section>)}

      {tab === 'months' && (<section>
        <p className="ops-empty">Each card gives the month's focus, its fixed points and the project steps due. Immersion dates follow the cohort calendar.</p>
        <div className="ops-my-months">{data.months.map((m, mi) => (
          <article key={m.id} id={`m-${m.id}`} className={`ops-my-card${month && m.id === month.id ? ' current' : ''}`}>
            <header><div><h3>{m.title}</h3><p className="theme">{year.monthsById?.[m.id]?.theme || m.theme}</p></div>{m.tag && <span className="ops-my-tag"><E can={can} path={`months.${mi}.tag`} value={m.tag} label="the tag">{m.tag}</E></span>}</header>
            <p className="focus">{year.monthsById?.[m.id]?.focus || m.focus}<EditMonth can={can} id={m.id} theme={year.monthsById?.[m.id]?.theme || m.theme} focus={year.monthsById?.[m.id]?.focus || m.focus} reflectionDue={year.monthsById?.[m.id]?.reflectionDue || ''} /></p>
            <ul className="ops-my-items">{m.items.map((t, i) => <li key={i}><E can={can} path={`months.${mi}.items.${i}`} value={t} long rich label="this line"><Rich text={t} /></E></li>)}</ul>
            {year.steps.some(s => s.date.slice(0, 7) === m.id) && (<><h4>Project steps due this month</h4><ul className="ops-my-steps compact">{year.steps.filter(s => s.date.slice(0, 7) === m.id).map(s => <li key={s.id} className="ops-my-step"><span className="when"><b>{dayFmt(s.date)}</b></span><span className="what"><Proj p={s.project} />{s.title}<EditStep can={can} step={s} /></span></li>)}</ul></>)}
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
        <p className="ops-note"><E can={can} path="spacing" value={data.spacing} long label="the spacing rule">{data.spacing}</E></p>
        <nav className="ops-filters" aria-label="Filter steps">{[['all', 'All steps'], ['talk', '60-min talk'], ['offering', 'Three-session offering']].map(([k, l]) => <a key={k} href={href('projects', k === 'all' ? '' : `&p=${k}`)} aria-current={filter === k ? 'page' : undefined}>{l}</a>)}</nav>
        <ul className="ops-my-steps full">{year.cohort.filter(c => filter === 'all' || c.step.project === filter || c.step.project === 'both').map(c => (
          <li key={c.step.id} className={`ops-my-step${c.step.date < today ? ' past' : ''}`}>
            <span className="when"><b>{dayYear(c.step.date)}</b></span>
            <span className="what"><Proj p={c.step.project} /><b>{c.step.title}</b><span className="det">{c.step.detail}</span><span className="ev">Evidence: {c.step.evidence}</span><EditStep can={can} step={c.step} /><span className={`ops-my-count ${dotOf(c)}`}><i />{c.count} of {c.of} done</span></span>
          </li>
        ))}</ul>
      </section>)}

      {tab === 'one-to-ones' && (<section className="ops-my-cols">
        <div className="ops-my-card">
          <h2>How mentees book</h2>
          <ol className="ops-my-items">{data.oneToOne.howTo.map((t, i) => <li key={i}><E can={can} path={`oneToOne.howTo.${i}`} value={t} long rich label="this line"><Rich text={t} /></E></li>)}</ol>
        </div>
        <div className="ops-my-card">
          <h2>Booking summary</h2>
          <ul className="ops-my-items">{data.oneToOne.template.map((t, i) => <li key={i}><E can={can} path={`oneToOne.template.${i}`} value={t} label="this line">{t}</E></li>)}</ul>
          <p className="ops-empty"><E can={can} path="oneToOne.note" value={data.oneToOne.note} long label="this note">{data.oneToOne.note}</E></p>
        </div>
      </section>)}

      <p className="ops-more"><E can={can} path="footer" value={data.footer} long label="the footer">{data.footer}</E></p>
    </Shell>
  );
}
