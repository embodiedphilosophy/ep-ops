'use client';
import { useEffect, useState } from 'react';
import AccountView from './AccountView';

export const usd = c => '$' + ((c || 0) / 100).toLocaleString('en-US', { maximumFractionDigits: 2 });
const day = d => d ? new Date(d + 'T12:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }) : '';
export const STATUS = { draft: ['Draft · review', 'warn'], sent_paused: ['Sent to Meta · paused', 'calm'], live: ['Running', 'good'], paused: ['Paused', 'calm'], ended: ['Ended', 'calm'] };
export const fmt = (metric, v) => v == null ? '—' : metric === 'cpl' ? (v === Infinity ? 'no leads' : `$${Number(v).toFixed(2)}`) : `${+Number(v).toFixed(2)}×`;
export const TYPES = { test: 'Targeting test · 5 × 5', advantage: 'Advantage+' };
export const Pill = ({ status }) => <span className={`ads-pill ${(STATUS[status] || [])[1] || ''}`}>{(STATUS[status] || [status])[0]}</span>;
export const ModeNote = ({ d }) => d.mode === 'live' ? null : <p className="ads-mode" role="status"><b>{d.mode_text}.</b> {d.mode === 'dry_run' ? 'Sending and starting only show what they would do.' : 'Add the access key and the ad account in Vercel to connect.'}</p>;

const FILTERS = [['all', 'All', () => true], ['live', 'Live', c => c.status === 'live'], ['draft', 'Drafts', c => c.status === 'draft'], ['paused', 'Paused', c => ['sent_paused', 'paused'].includes(c.status)]];
const at = iso => new Date(iso).toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' }) + ' ET';

export default function Campaigns() {
  const [d, setD] = useState(null), [err, setErr] = useState(''), [msg, setMsg] = useState(''), [f, setF] = useState('all');
  const load = () => fetch('/api/ops/ads').then(r => r.json().then(j => r.ok ? setD(j) : setErr(j.error || 'Couldn’t read the campaigns'))).catch(() => setErr('Couldn’t read the campaigns'));
  useEffect(() => { load(); }, []);
  if (err && !d) return <p className="hint err" role="alert">{err}</p>;
  if (!d) return <p className="ops-empty">Reading the campaigns…</p>;
  const rows = d.campaigns, shown = rows.filter((FILTERS.find(x => x[0] === f) || FILTERS[0])[2]);
  const drafts = rows.filter(c => c.status === 'draft').length, running = rows.filter(c => c.status === 'live'), spent = rows.reduce((n, c) => n + (c.spent_cents || 0), 0);
  const reverse = async a => {
    if (!confirm('Reverse this change?\n\nThe earlier value is put back in Meta. If it has been changed again since, nothing is done.')) return;
    setErr(''); setMsg('');
    const res = await fetch('/api/ops/ads', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'reverse', id: a.campaign_id, action_id: a.id, confirm: true }) }), j = await res.json().catch(() => ({}));
    if (!res.ok) setErr(j.error || 'That didn’t work. Try again in a moment.'); else { setMsg(j.message || 'Reversed.'); load(); }
  };
  return (
    <div className="ads">
      <ModeNote d={d} />
      <AccountView />
      <ul className="ads-kpis" aria-label="Campaigns at a glance">
        <li><span className="l">Running now</span><span className="v">{running.length}</span><span className="d">live in Meta</span></li>
        <li><span className="l">Drafts to review</span><span className="v">{drafts}</span><span className="d">built from launches</span></li>
        <li><span className="l">Spent so far</span><span className="v">{spent ? usd(spent) : '—'}</span><span className="d">{spent ? 'across every campaign in Meta' : 'spend arrives once campaigns run'}</span></li>
      </ul>
      <section className="ads-panel" aria-label="Campaigns">
        <div className="ph"><h2>Campaigns</h2>
          <div className="ads-seg" role="group" aria-label="Show">{FILTERS.map(([k, l, fn]) => <button key={k} type="button" aria-pressed={f === k} onClick={() => setF(k)}>{l} <span className="n">{rows.filter(fn).length}</span></button>)}</div></div>
        {!shown.length ? <p className="ops-empty">{rows.length ? 'Nothing in this list.' : <>No campaigns yet. Open a program’s <a href="/ops/programs">Launch</a> tab and switch on “Run Meta ads for this launch”: a draft appears here for you to review.</>}</p> : (
          <div className="ads-scroll"><table className="ads-table">
            <thead><tr><th>Campaign</th><th>Goal</th><th>Type</th><th>Status</th><th>Budget / day</th><th>Spent</th><th>Last 3 days</th><th>Dates</th></tr></thead>
            <tbody>{shown.map(c => (
              <tr key={c.id}>
                <td><a className="ads-name" href={`/ops/ads/${c.id}`}>{c.name}</a>
                  {c.launch_id && <div className="sub"><a href={c.event_id ? `/ops/programs/${c.event_id}?tab=launch&id=${c.launch_id}` : `/ops/programs?view=launches&id=${c.launch_id}`}>{c.launch_name || 'Its launch'}</a></div>}</td>
                <td>{c.goal}</td><td>{TYPES[c.structure]}</td><td><Pill status={c.status} /></td>
                <td className="num">{usd(c.daily_cents)}</td><td className="num">{c.spent_cents ? usd(c.spent_cents) : '—'}</td><td className="num">{c.spend72_cents ? `${fmt(c.metric, c.value72)} ${c.metric === 'cpl' ? 'a lead' : 'return'}` : '—'}</td><td>{c.start_date ? `${day(c.start_date)} – ${day(c.end_date)}` : 'No dates yet'}</td>
              </tr>))}</tbody></table></div>)}
      </section>
      <section className="ads-panel" aria-label="What the Ad Agent did today">
        <div className="ph"><h2>What the Ad Agent did today</h2><span className="sub">Ops’ automatic rules, across every campaign</span></div>
        {d.locks && !d.locks.open && <p className="ads-mode" role="status"><b>{d.locks.text}.</b> Ops’ rules are only watching, beside Make’s.</p>}
        {err && <p className="hint err" role="alert">{err}</p>}{msg && <p className="hint" role="status">{msg}</p>}
        {!d.today?.length ? <p className="ops-empty">{rows.some(c => c.rules_on) ? 'Nothing changed yet today. The rules run every morning.' : 'No campaign has its automatic rules switched on yet. Switch them on from a running campaign’s page.'}</p> : (
          <ul className="ads-acts">{d.today.map(a => (
            <li key={a.id}><div className="t"><div className="meta"><b>{a.label}</b>{a.dry_run && !a.failed && <span className="ads-pill dry">Dry run</span>}{a.reversed && <span className="ads-pill calm">Reversed</span>}</div><span><a href={`/ops/ads/${a.campaign_id}#change-${a.id}`}>{a.campaign}</a>: {a.detail}</span><span className="sub">{a.by} · {at(a.at)}{a.dry_run && !a.failed ? ' · would have, nothing was changed' : ''}</span></div>
              {a.can_reverse && <button className="soc-btn small" onClick={() => reverse(a)} aria-label={`Reverse: ${a.label}`}>Reverse</button>}</li>))}</ul>)}
        {d.holds_today > 0 && <p className="sub">{d.holds_today} ad set{d.holds_today === 1 ? ' was' : 's were'} left as {d.holds_today === 1 ? 'it was' : 'they were'} today.</p>}
      </section>
      <aside className="ads-note" aria-label="Who sees this"><b>Who sees this</b><p>Directors and the Ads role (Jacob and Rebecka). Rebecka sees ads and their results, not EP’s wider finances.</p></aside>
    </div>);
}
