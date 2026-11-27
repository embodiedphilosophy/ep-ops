import { isStaff } from '@/lib/ops/nav';
import { loadTeam } from '@/lib/ops/tasks';
import { statusFor, teamHours, pendingRequests, clockAvailable, monthNow } from '@/lib/ops/hours';
import { redirect } from 'next/navigation';
import Shell, { opsUser } from '../Shell';
import { HoursDecide, FixShift, SubmitHours } from './HoursActions';

export const monthName = m => new Date(`${m}-15T12:00:00Z`).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const day = iso => new Date(iso).toLocaleDateString('en-US', { timeZone: 'America/New_York', weekday: 'short', month: 'short', day: 'numeric' });
const time = iso => new Date(iso).toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' });
const hm = h => `${Math.floor(h)}:${String(Math.round((h % 1) * 60)).padStart(2, '0')}`;
const hhmm = iso => new Date(iso).toLocaleTimeString('en-GB', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hour12: false });

const NO_CLOCK = 'The time clock starts once the database is connected.';
const rowOf = r => (
  <li key={r.email} className={r.level}>
    <span className="who"><i className={r.onClock ? 'live' : ''} aria-label={r.onClock ? 'On the clock now' : undefined} />{r.name}</span>
    <span className="bar" aria-hidden="true"><span style={{ width: `${r.limit ? Math.min(100, (r.used / r.limit) * 100) : 0}%` }} />{r.limit && r.pace ? <i style={{ left: `${Math.min(100, (r.pace / r.limit) * 100)}%` }} title={`On pace for ${r.pace} h`} /> : null}</span>
    <span className="n">{r.used}{r.limit ? ` of ${r.limit}` : ''} h</span>
    <span className="s">{r.level === 'at' ? 'At cap' : r.pace && r.limit && r.pace > r.limit ? `On pace for ${r.pace} h` : r.level === 'near' ? `${r.left} h left` : r.cap ? 'On track' : 'No cap'}{r.edited ? ` · ${r.edited} edited` : ''}</span>
  </li>);

// The team's hours (directors): requests waiting on a yes, and everyone against their cap
export function TeamHours({ rows, reqs }) {
  return (<>
    {reqs.length > 0 && (<section className="ops-col">
      <h2 className="late">Waiting on your yes <span>{reqs.length}</span></h2>
      <ul className="ops-hours-req">{reqs.map(r => (
        <li key={r.id}><span><b>{r.name}</b> asks for {r.hours} more hours{r.why ? ` · “${r.why}”` : ''}</span><HoursDecide id={r.id} hours={r.hours} /></li>
      ))}</ul>
    </section>)}
    <section className="ops-col">
      <h2>Everyone <span>{rows.length}</span></h2>
      {rows.length === 0 ? <p className="ops-empty">Nobody has a cap or any hours yet. Add monthly hours in Settings → Team.</p> : <ul className="ops-hours-team">{rows.map(rowOf)}</ul>}
      <p className="ops-more">The thin mark is where each person ends the month at their current pace. Caps live in <a href="/ops/settings?t=team">Settings → Team</a>.</p>
    </section>
  </>);
}

// One person's hours as the director sees them (their row of the team's hours, and a request waiting on a yes)
export function PersonHours({ row, req, name }) {
  return (<>
    {req && (<section className="ops-col">
      <h2 className="late">Waiting on your yes <span>1</span></h2>
      <ul className="ops-hours-req"><li><span><b>{name}</b> asks for {req.hours} more hours{req.why ? ` · “${req.why}”` : ''}</span><HoursDecide id={req.id} hours={req.hours} /></li></ul>
    </section>)}
    <section className="ops-col">
      <h2>This month</h2>
      {row ? <ul className="ops-hours-team">{rowOf(row)}</ul> : <p className="ops-empty">{name} has no cap and no hours this month.</p>}
      <p className="ops-more">Caps live in <a href="/ops/settings?t=team">Settings → Team</a>.</p>
    </section>
  </>);
}

// Your own hours: this month against your cap, your shifts, and asking for more
export function MyHours({ st, month }) {
  return (<>
    <div className="ops-glance">
      <a href="#shifts"><b>{st.used} h</b> {st.limit ? `of a ${st.limit} h cap` : 'this month'}</a>
      {st.pace != null && <a href="#shifts" className={st.limit && st.pace > st.limit ? 'is-bad' : ''}><b>{st.pace} h</b> at this pace{st.limit && st.pace > st.limit ? ` (${st.pace - st.limit} over)` : ''}</a>}
      {st.perDay != null && <a href="#shifts"><b>{st.perDay} h</b> a day to stay under ({st.weekdaysLeft} weekdays left)</a>}
    </div>
    <SubmitHours month={month} used={st.used} />
    <section className="ops-col" id="shifts">
      <h2>Shifts <span>{st.shifts.length}</span></h2>
      {st.shifts.length === 0 ? <p className="ops-empty">No shifts this month yet. Clock in from the sidebar.</p> : (
        <ul className="ops-shifts">{st.shifts.map(s => (
          <li key={s.id} className={s.autoClosed ? 'flag' : ''}>
            <span className="d">{day(s.start)}</span>
            <span className="span">{time(s.start)} – {s.end ? time(s.end) : 'now'}</span>
            <span className="h">{hm(s.hours)}</span>
            <span className="note">{s.autoClosed ? 'Closed at midnight: put in the real end time' : [s.tags.join(', '), s.note].filter(Boolean).join(' · ')}{s.edited ? ' · edited' : ''}</span>
            {s.end && Date.now() - Date.parse(s.start) < 7 * 864e5 ? <FixShift id={s.id} start={hhmm(s.start)} end={hhmm(s.end)} /> : <span />}
          </li>
        ))}</ul>
      )}
    </section>
  </>);
}
export const noClock = () => <p className="ops-note">{NO_CLOCK}</p>;
export const monthOf = sp => (/^\d{4}-\d{2}$/.test((Array.isArray(sp?.m) ? sp.m[0] : sp?.m) || '') ? (Array.isArray(sp.m) ? sp.m[0] : sp.m) : monthNow());

// People › Hours. Directors: the team's hours and the requests waiting on a yes. Everyone else: their own hours, which now live on
// their own record (People › me), so this address opens it.
export default async function HoursView({ searchParams }) {
  const user = await opsUser(isStaff);
  const sp = (await searchParams) || {};
  const month = monthOf(sp);
  if (!user.director) redirect(`/ops/people/${encodeURIComponent(String(user.email).toLowerCase())}?tab=hours${sp.m ? `&m=${month}` : ''}`);
  if (!clockAvailable()) return <Shell user={user} current="people" desc="Time worked this month, against each person’s cap." title="Team hours">{noClock()}</Shell>;
  const team = await loadTeam().catch(() => []);
  const [rows, reqs] = await Promise.all([teamHours(team, month), pendingRequests()]);
  return (
    <Shell user={user} current="people" desc="Time worked this month, against each person’s cap." eyebrow={monthName(month)} title="Team hours">
      <TeamHours rows={rows} reqs={reqs} />
    </Shell>);
}
