'use client';
import { useEffect, useState } from 'react';

export const usd = c => '$' + ((c || 0) / 100).toLocaleString('en-US', { maximumFractionDigits: 2 });
const day = d => d ? new Date(d + 'T12:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }) : '';
export const STATUS = { draft: ['Draft · review', 'warn'], sent_paused: ['Sent to Meta · paused', 'calm'], live: ['Running', 'good'], paused: ['Paused', 'calm'], ended: ['Ended', 'calm'] };
export const TYPES = { test: 'Targeting test · 5 × 5', advantage: 'Advantage+' };
export const Pill = ({ status }) => <span className={`ads-pill ${(STATUS[status] || [])[1] || ''}`}>{(STATUS[status] || [status])[0]}</span>;
export const ModeNote = ({ d }) => d.mode === 'live' ? null : <p className="ads-mode" role="status"><b>{d.mode_text}.</b> {d.mode === 'dry_run' ? 'Sending and starting only show what they would do.' : 'Add the access key and the ad account in Vercel to connect.'}</p>;

const FILTERS = [['all', 'All', () => true], ['draft', 'Drafts', c => c.status === 'draft'], ['paused', 'Paused', c => c.status === 'sent_paused']];

export default function Campaigns() {
  const [d, setD] = useState(null), [err, setErr] = useState(''), [f, setF] = useState('all');
  useEffect(() => { fetch('/api/ops/ads').then(r => r.json().then(j => r.ok ? setD(j) : setErr(j.error || 'Couldn’t read the campaigns'))).catch(() => setErr('Couldn’t read the campaigns')); }, []);
  if (err) return <p className="hint err" role="alert">{err}</p>;
  if (!d) return <p className="ops-empty">Reading the campaigns…</p>;
  const rows = d.campaigns, shown = rows.filter((FILTERS.find(x => x[0] === f) || FILTERS[0])[2]);
  const drafts = rows.filter(c => c.status === 'draft').length, paused = rows.filter(c => c.status === 'sent_paused').length;
  return (
    <div className="ads">
      <ModeNote d={d} />
      <ul className="ads-kpis" aria-label="Campaigns at a glance">
        <li><span className="l">Drafts to review</span><span className="v">{drafts}</span><span className="d">built from launches</span></li>
        <li><span className="l">Sent to Meta, paused</span><span className="v">{paused}</span><span className="d">waiting for Start</span></li>
        <li><span className="l">Results</span><span className="v">—</span><span className="d">spend and results arrive once campaigns run</span></li>
      </ul>
      <section className="ads-panel" aria-label="Campaigns">
        <div className="ph"><h2>Campaigns</h2>
          <div className="ads-seg" role="group" aria-label="Show">{FILTERS.map(([k, l, fn]) => <button key={k} type="button" aria-pressed={f === k} onClick={() => setF(k)}>{l} <span className="n">{rows.filter(fn).length}</span></button>)}</div></div>
        {!shown.length ? <p className="ops-empty">{rows.length ? 'Nothing in this list.' : <>No campaigns yet. Open a program’s <a href="/ops/programs">Launch</a> tab and switch on “Run Meta ads for this launch”: a draft appears here for you to review.</>}</p> : (
          <div className="ads-scroll"><table className="ads-table">
            <thead><tr><th>Campaign</th><th>Goal</th><th>Type</th><th>Status</th><th>Budget / day</th><th>Dates</th></tr></thead>
            <tbody>{shown.map(c => (
              <tr key={c.id}>
                <td><a className="ads-name" href={`/ops/ads/${c.id}`}>{c.name}</a>
                  {c.launch_id && <div className="sub"><a href={c.event_id ? `/ops/programs/${c.event_id}?tab=launch&id=${c.launch_id}` : `/ops/programs?view=launches&id=${c.launch_id}`}>{c.launch_name || 'Its launch'}</a></div>}</td>
                <td>{c.goal}</td><td>{TYPES[c.structure]}</td><td><Pill status={c.status} /></td>
                <td className="num">{usd(c.daily_cents)}</td><td>{c.start_date ? `${day(c.start_date)} – ${day(c.end_date)}` : 'No dates yet'}</td>
              </tr>))}</tbody></table></div>)}
      </section>
      <aside className="ads-note" aria-label="Who sees this"><b>Who sees this</b><p>Directors and the Ads role (Jacob and Rebecka). Rebecka sees ads and their results, not EP’s wider finances.</p></aside>
    </div>);
}
