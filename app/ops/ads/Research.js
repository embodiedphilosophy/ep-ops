'use client';
import { useEffect, useState } from 'react';

const API = '/api/ops/ads-outside';
const at = iso => iso ? new Date(iso).toLocaleDateString('en-US', { timeZone: 'America/New_York', weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) : '';
const safe = u => /^https?:\/\//i.test(String(u || ''));

function Note({ n }) {
  return (
    <li className="ar-note" data-status={n.status}>
      <div className="ph"><p>{n.statement}</p><span className={`ads-pill ${n.status === 'New' ? 'warn' : 'calm'}`}>{n.status}</span></div>
      <p className="sub ar-src">Source{n.sources.length === 1 ? '' : 's'}: {n.sources.filter(s => safe(s.url)).map((s, i) => <span key={s.url}>{i > 0 && ' · '}<a href={s.url} target="_blank" rel="noopener noreferrer">{s.title || s.url}</a></span>)} · read on {at(n.read_at)}{n.sources[0]?.page_age ? ` · the page says it dates from ${n.sources[0].page_age}` : ''}</p>
      <details><summary>The words the statement rests on</summary>
        <ul>{n.sources.map(s => <li key={s.url}>“{s.snippet}”</li>)}</ul>
      </details>
    </li>);
}

export default function Research() {
  const [d, setD] = useState(null), [err, setErr] = useState(''), [msg, setMsg] = useState(''), [busy, setBusy] = useState(false);
  const load = w => fetch(`${API}${w ? `?week=${w}` : ''}`).then(r => r.json().then(j => r.ok ? (setD(j), setErr('')) : setErr(j.error || 'Couldn’t read the outside research'))).catch(() => setErr('Couldn’t read the outside research'));
  useEffect(() => { load(''); }, []);
  const look = async () => {
    setBusy(true); setErr(''); setMsg('Looking… this takes up to a minute.');
    try { const res = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'run' }) }), j = await res.json().catch(() => ({})); if (!res.ok) throw new Error(j.error || 'That didn’t work. Try again in a moment.'); setMsg(j.message); await load(''); }
    catch (e) { setMsg(''); setErr(e.message); }
    setBusy(false);
  };
  const w = d?.week;
  return (
    <section className="ads-panel ar" id="outside" aria-label="Outside research">
      <div className="ph"><div><h2>Outside research</h2><p className="sub">Once a week, a look at what is happening outside EP that could matter to the ads: changes to Meta’s ad rules, features and costs, and what similar advertisers pay. It only informs: it changes no rule and no ad.</p></div>
        <button className="soc-btn" disabled={busy || !d} onClick={look}>Look now</button></div>
      <p className="ar-label" role="note"><span className="ads-pill calm">Outside information</span> This is outside information, not about our own ads.</p>
      <p className="sub">Every statement below links to the page it came from, and is left out if its link, its numbers or its words don’t check against what the search returned. “Look now” makes one search run (up to {d?.max_searches || 5} web searches and one write-up) on our Anthropic account, in addition to the Monday one.</p>
      {err && <p className="hint err" role="alert">{err}</p>}{msg && <p className="hint" role="status">{msg}</p>}
      {!d && !err && <p className="ops-empty">Reading the outside research…</p>}
      {d && !d.ai && <p className="ads-mode" role="status"><b>Not connected yet.</b> The look needs the Anthropic key, which isn’t set up. Nothing is searched until it is.{d.exists ? ' What was found earlier is shown below.' : ''}</p>}
      {d && d.ai && !d.exists && <p className="ops-empty">Nothing here yet. The first look is made on Monday morning. To try it now, press “Look now”.</p>}
      {d && d.exists && !d.made_this_week && d.ai && <p className="sub" role="note">No look has been made yet for {d.this_week.toLowerCase()}. The Monday one makes it, or press “Look now”.</p>}
      {w && (
        <>
          <p className="sub">{w.label}{w.read_at ? `, pages read on ${at(w.read_at)}` : ''} · {w.searches} search{w.searches === 1 ? '' : 'es'}</p>
          {d.notes.length > 0
            ? <ol className="ar-notes">{d.notes.map(n => <Note key={n.id} n={n} />)}</ol>
            : <p className="ops-empty ar-none" role="status">Nothing new we could back with a source this week.</p>}
          {w.dropped > 0 && <p className="sub">{w.dropped} statement{w.dropped === 1 ? ' was' : 's were'} left out because {w.dropped === 1 ? 'its' : 'their'} source, numbers or words didn’t check.</p>}
        </>)}
      {d?.weeks?.length > 1 && <nav className="ai-weeks" aria-label="Past outside research"><span className="sub">Past weeks</span>{d.weeks.map(x => <button key={x.week_start} type="button" className="ai-wk" aria-pressed={w?.week_start === x.week_start} onClick={() => load(x.week_start)}>{x.label}</button>)}</nav>}
      {d && <details className="ai-all"><summary>What we ask</summary><ul>{d.questions.map(q => <li key={q}>{q}</li>)}</ul><p className="sub">Only these questions and a one-line description of EP’s kind of business are sent. Nothing from our own account is.</p></details>}
    </section>);
}
