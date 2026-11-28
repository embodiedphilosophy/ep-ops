'use client';
import { useEffect, useRef, useState } from 'react';

// Ads › What we’ve learned. See lib/ops/adshistory.js (how the history is read) and lib/ops/adslearned.js (how a statement is made and checked).
const API = '/api/ops/ads-learned';
const usd = c => '$' + ((c || 0) / 100).toLocaleString('en-US', { minimumFractionDigits: (c || 0) % 100 ? 2 : 0, maximumFractionDigits: 2 });
const monthYear = d => d ? new Date(d + 'T12:00:00Z').toLocaleDateString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' }) : '';
const at = iso => iso ? new Date(iso).toLocaleString('en-US', { timeZone: 'America/New_York', weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) + ' ET' : '';
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

function Totals({ totals, target }) {
  const p = totals?.purchase, l = totals?.lead;
  if (!p?.ads && !l?.ads) return null;
  return (
    <ul className="ls-totals" aria-label="All the ads together">
      {p?.ads > 0 && <li><b>Sales ads, all together</b><span>{usd(p.spend_cents)} spent, {p.ret != null ? `${p.ret.toFixed(2)}× back` : 'no return yet'} ({plural(p.purchases, 'purchase', 'purchases')} across {plural(p.ads, 'ad', 'ads')} in {plural(p.campaigns, 'campaign', 'campaigns')}). The aim is {target}×.</span></li>}
      {l?.ads > 0 && <li><b>Sign-up ads, all together</b><span>{usd(l.spend_cents)} spent, {l.cpl_cents != null ? `${usd(Math.round(l.cpl_cents))} a sign-up` : 'no sign-ups'} ({plural(l.leads, 'sign-up', 'sign-ups')} across {plural(l.ads, 'ad', 'ads')} in {plural(l.campaigns, 'campaign', 'campaigns')}).</span></li>}
    </ul>);
}

function Finding({ f }) {
  return (
    <li data-key={f.key} data-side={f.side} data-reliability={f.reliability}>
      <p>{f.text}</p>
      <div className="ls-pills"><span className={`ads-pill ${f.reliability === 'enough' ? 'good' : 'calm'}`}>{f.reliability_text}</span>
        {f.status_text && <span className={`ads-pill ${f.status === 'newer' ? 'warn' : 'calm'}`} data-status={f.status}>{f.status_text}</span>}
        <span className="sub">First seen {f.first_seen ? new Date(f.first_seen + 'T12:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : ''} · {f.period}</span></div>
      <details><summary>See the ads and the numbers</summary>
        <h4>The numbers</h4>
        <ul>{f.metrics.map(m => <li key={m.id}><b>{m.text}</b> {m.label}<span className="sub"> · Meta · {f.period} · {m.id}</span></li>)}</ul>
        <h4>The ads behind it</h4>
        <ul className="ls-ads">{f.sources.map(s => (
          <li key={s.ad_id}><span><b>{s.name}</b> <span className="sub">in {s.campaign_name || 'a campaign no longer listed'} · {usd(s.spend_cents)} spent{s.result != null ? (f.kind === 'purchase' ? ` · ${s.result.toFixed(2)}× back` : ` · ${usd(s.result)} a sign-up`) : ''}</span></span>
            <a className="acct-open" href={s.url} target="_blank" rel="noopener noreferrer">Open in Meta Ads Manager</a></li>))}
          {f.more > 0 && <li className="sub">and {plural(f.more, 'more ad', 'more ads')}</li>}</ul>
        <p className="sub">Ads like these did this. They were not set up as tests, so this shows a pattern and not the reason for it.</p>
      </details>
    </li>);
}

function List({ title, sub, rows, empty, name }) {
  return (
    <section className="ls-sec" aria-label={title} data-list={name}>
      <h3>{title} <span className="n">{rows.length}</span></h3>
      <p className="sub">{sub}</p>
      {rows.length ? <ul className="ls-find">{rows.map(f => <Finding key={f.key} f={f} />)}</ul> : <p className="ops-empty">{empty}</p>}
    </section>);
}

export default function Learned() {
  const [d, setD] = useState(null), [err, setErr] = useState(''), [busy, setBusy] = useState(false), [msg, setMsg] = useState(''), [wait, setWait] = useState(0);
  const timer = useRef(null);
  const load = () => fetch(API).then(r => r.json().then(j => (r.ok ? setD(j) : setErr(j.error || 'Couldn’t read what has been learned just now.')))).catch(() => setErr('Couldn’t read what has been learned just now.'));
  useEffect(() => { load(); return () => clearInterval(timer.current); }, []);   // eslint-disable-line react-hooks/exhaustive-deps
  const cool = s => { setWait(s); clearInterval(timer.current); timer.current = setInterval(() => setWait(w => { if (w <= 1) { clearInterval(timer.current); return 0; } return w - 1; }), 1000); };
  const run = async () => {
    setBusy(true); setMsg(''); setErr('');
    try {
      const res = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'run' }) }), j = await res.json().catch(() => ({}));
      if (res.status === 429) { setMsg(j.error); cool(j.wait || 60); }
      else if (!res.ok) setErr(j.error || 'Couldn’t read the history just now.');
      else { setD(j.view); cool(60); setMsg(j.run.notConnected ? j.run.note : j.run.weeks.read ? `Read ${plural(j.run.weeks.read, 'more week', 'more weeks')}.${j.run.rate_limited ? ' Meta asked us to slow down, so the rest waits for the next hourly run.' : ''}` : j.run.note || 'Nothing new to read right now.'); }
    } catch { setErr('Couldn’t read the history just now.'); }
    setBusy(false);
  };
  const c = d?.coverage;
  const head = (
    <div className="ph"><div><h2>What we’ve learned from past ads</h2><p className="sub">Read from the ads already run in your Meta account. These are patterns, not proof: the ads were not set up as tests, so “ads like this did better” never means “this made them do better”.</p></div>
      <div className="acct-tools"><button type="button" className="soc-btn small ls-btn" onClick={run} disabled={busy || wait > 0 || !d || !d.meta.connected}>{busy ? 'Reading…' : wait > 0 ? `Read the history now (${wait}s)` : 'Read the history now'}</button></div></div>);
  let body;
  if (err && !d) body = <p className="hint err" role="alert">{err}</p>;
  else if (!d) body = <p className="ops-empty">Opening what has been learned…</p>;
  else if (d.db === false) body = <p className="ads-mode warn" role="status"><b>The dashboard’s database isn’t connected yet.</b> This page keeps what it learns there, so it has nothing to show until it is.</p>;
  else if (!d.exists) body = (
    <>
      {!d.meta.connected && <p className="ads-mode warn" role="status"><b>Meta isn’t connected yet.</b> {d.meta.text.replace(/^Meta isn’t connected yet:\s*/, '')}</p>}
      <p className="ops-empty ls-empty">{d.meta.connected ? 'Nothing has been read yet. The history is read automatically, a few weeks every hour. To start now, press “Read the history now”.' : 'Once Meta is connected, the history of your ads is read here, a few weeks at a time.'}</p>
    </>);
  else body = (
    <>
      <div className="ls-cover" role="status" aria-label="How much history has been read">
        {c.importing
          ? <><p className="ls-progress"><b>Reading your history: {c.weeks_done} of {c.weeks_total} weeks so far.</b> The rest is read automatically, a few weeks every hour{c.slowed ? ' (Meta asked us to slow down, so it is going a little slower than usual)' : ''}.</p>
              <span className="ls-bar" aria-hidden="true"><span style={{ width: `${Math.max(2, Math.round(100 * c.weeks_done / Math.max(1, c.weeks_total)))}%` }} /></span></>
          : <p className="ls-progress"><b>All {c.weeks_total} weeks are read</b>, from {monthYear(c.from)} to {monthYear(c.to)}.{c.gave_up > 0 ? ` ${plural(c.gave_up, 'week', 'weeks')} couldn’t be read after several tries.` : ''}</p>}
        <p className="sub">{c.last_read_at ? `Last read ${at(c.last_read_at)}. ` : ''}{c.importing ? 'What follows is provisional until all the weeks are read.' : 'The latest weeks are read again about once a day.'}</p>
      </div>
      {(d.notes || []).map(n => <p key={n} className="ads-mode warn" role="status">{n}</p>)}
      {!d.meta.connected && <p className="ads-mode warn" role="status"><b>Meta isn’t connected right now,</b> so this is what was read earlier.</p>}
      <Totals totals={d.totals} target={d.thresholds.target} />
      <List name="working" title="What’s working" rows={d.working} sub={`Kinds of ads that returned at least ${d.thresholds.target}× (or cost less per sign-up than the average).`} empty={c.importing ? 'Nothing is clear yet. This fills in as more weeks are read.' : 'No kind of ad has enough behind it yet to say.'} />
      <List name="not-working" title="What isn’t" rows={d.not_working} sub={`Kinds of ads that returned less than ${d.thresholds.target}× (or cost more per sign-up than the average).`} empty={c.importing ? 'Nothing is clear yet. This fills in as more weeks are read.' : 'No kind of ad has enough behind it yet to say.'} />
      <section className="ls-sec" aria-label="Not enough to say yet" data-list="not-enough">
        <h3>Not enough to say yet <span className="n">{d.not_enough.length}</span></h3>
        <p className="sub">Kinds of ads with too little spent or too few results to read anything into. “Enough to read” needs at least {usd(d.thresholds.enough.spend_cents)} spent, {d.thresholds.enough.purchases} purchases ({d.thresholds.enough.leads} sign-ups), {d.thresholds.enough.ads} ads and {d.thresholds.enough.campaigns} campaigns; an “early sign” needs {usd(d.thresholds.early.spend_cents)} and {d.thresholds.early.purchases} purchases ({d.thresholds.early.leads} sign-ups).</p>
        {d.not_enough.length ? <ul className="ls-few">{d.not_enough.map(g => <li key={g.group}><b>{g.label}</b><span className="sub">{usd(g.spend_cents)} spent, {plural(g.count, g.kind === 'purchase' ? 'purchase' : 'sign-up', g.kind === 'purchase' ? 'purchases' : 'sign-ups')}, {plural(g.ads, 'ad', 'ads')} in {plural(g.campaigns, 'campaign', 'campaigns')}</span></li>)}</ul> : <p className="ops-empty">Every kind of ad with spending has enough to read.</p>}
      </section>
      {d.gone.length > 0 && <details className="ls-sec ls-gone" data-list="gone"><summary>No longer true ({d.gone.length})</summary><p className="sub">These were found in an earlier read and the history no longer shows them.</p><ul className="ls-find">{d.gone.map(f => <Finding key={f.key} f={f} />)}</ul></details>}
      {d.left_out > 0 && <p className="sub">{plural(d.left_out, 'statement was', 'statements were')} left out because {d.left_out === 1 ? 'its' : 'their'} numbers didn’t check against the sources.</p>}
      <p className="sub">{d.phrasing === 'model' ? 'Some statements were phrased by the model from the numbers alone, then checked against them.' : d.ai ? 'Each statement is written from the numbers and checked against them.' : 'Each statement is written directly from the numbers (the key for the written phrasing isn’t set up).'} Return is as Meta counts it. Findings are patterns in past ads, not causes, and nothing here changes anything in Meta.</p>
    </>);
  return (
    <section className="ads-panel ls" aria-label="What we’ve learned">
      {head}
      {msg && <p className="hint" role="status">{msg}</p>}{err && d && <p className="hint err" role="alert">{err}</p>}
      {body}
    </section>);
}
