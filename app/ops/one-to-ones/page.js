import { loadOpsYear } from '@/lib/ops/menteeyearops';
import { todayET } from '@/lib/events';
import Shell, { opsUser } from '../Shell';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'One-to-ones — Embodied Philosophy', robots: { index: false, follow: false } };

const when = iso => new Date(iso).toLocaleString('en-US', { timeZone: 'America/New_York', weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const FILTERS = [['all', 'All'], ['none', 'No summary'], ['unbooked', 'Not booked'], ['past', 'Past']];

// The booked one-to-ones with what each mentee wrote to prepare: their own summary from the page, or Calendly's answer. Times are New York.
export default async function OneToOnes({ searchParams }) {
  const user = await opsUser(u => !!u.director);
  const sp = await searchParams, f = FILTERS.some(x => x[0] === sp?.f) ? sp.f : 'all';
  const y = await loadOpsYear({ today: todayET() }).catch(e => ({ error: e.message, bookings: [], notBooked: [], configured: true }));
  const rows = f === 'unbooked' ? [] : y.bookings.filter(b => f === 'all' ? !b.past : f === 'none' ? !b.past && !b.summary.length : b.past);
  const hrefOf = k => (k === 'all' ? '/ops/one-to-ones' : `/ops/one-to-ones?f=${k}`);
  return (
    <Shell user={user} current="home" eyebrow="Sahṛdaya Upāya" title="One-to-ones"
      head={<nav className="ops-filters" aria-label="Filter one-to-ones">{FILTERS.map(([k, l]) => <a key={k} href={hrefOf(k)} aria-current={f === k ? 'page' : undefined}>{l}</a>)}</nav>}>
      {!y.configured && <p className="ops-note">Calendly isn’t connected here yet (CALENDLY_TOKEN). Once it is, each booking appears with what the mentee wrote.</p>}
      {y.error && <p className="ops-note" role="alert">Couldn’t read the one-to-ones just now. Try again shortly.</p>}
      {y.configured && !y.error && (
        <section className="ops-col">
          {f === 'unbooked' ? (<>
            <h2>Not booked <span>{y.notBooked.length}</span></h2>
            {y.notBooked.length === 0 ? <p className="ops-empty">Everyone has a one-to-one booked.</p> : <ul className="ops-my-grid">{y.notBooked.map(m => <li key={m.email}><span>{m.name}</span><b>Not booked</b></li>)}</ul>}
          </>) : (<>
            <h2>{f === 'past' ? 'Past, last 30 days' : 'Booked'} <span>{rows.length}</span></h2>
            {rows.length === 0 ? <p className="ops-empty">{f === 'none' ? 'Every booking has a summary.' : f === 'past' ? 'Nothing in the last 30 days.' : 'Nothing is booked in the next three months.'}</p> : (
              <div>{rows.map(x => (
                <details key={x.uuid} className="ops-o2o-row">
                  <summary><span className="w">{when(x.start)}</span><b>{x.name || x.email}</b><span className="pv">{x.summary.length ? x.summary.map(s => s.a).join(' ').slice(0, 120) : ''}</span><span className={`ops-pill ${x.status.key}`}>{x.status.label}</span></summary>
                  <div className="full">{x.summary.length ? x.summary.map((s, i) => <p key={i} style={{ margin: '0 0 6px' }}><em style={{ fontStyle: 'normal', color: 'var(--mute)', fontSize: 12.5 }}>{s.q}</em><br />{s.a}</p>) : 'No summary yet. They are reminded three days before; you can message them.'}{x.joinUrl && <p style={{ margin: '8px 0 0' }}><a href={x.joinUrl} target="_blank" rel="noopener">Zoom</a></p>}</div>
                </details>))}</div>)}
          </>)}
          <p className="ops-more">Summaries come from the Calendly question or the mentee page. Amber 3 days before the session, red 1 day before.</p>
        </section>
      )}
    </Shell>
  );
}
