'use client';
import { useEffect, useRef, useState } from 'react';
import { sumRows, raised, shareOut, parseDollars, confirmText, overCeiling, SET_CEILING_CENTS, dollars } from '@/lib/ops/adsaccountmath';

// Ads › Campaigns › "In your Meta account": every campaign in the real ad account. For the ones not made in Ops: Pause / Resume, +20%, an exact daily budget and Reverse, each after a question
// (lib/ops/adsmanual.js, through the one write gate; only recorded unless live). See lib/ops/adsaccount.js.
const money = c => '$' + ((c || 0) / 100).toLocaleString('en-US', { minimumFractionDigits: (c || 0) % 100 ? 2 : 0, maximumFractionDigits: 2 });
const day = d => d ? new Date(d + 'T12:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '';
const asOf = (iso, tz) => { try { return new Date(iso).toLocaleTimeString('en-US', { timeZone: tz || 'America/New_York', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }); } catch { return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }); } };
const FILTERS = [['all', 'All', () => true], ['active', 'Active', r => r.status === 'active'], ['paused', 'Paused', r => r.status === 'paused'],
  ['needs', 'Needs a look', r => r.needs.length > 0], ['notops', 'Not made in Ops', r => !r.made_in_ops]];
const results = (r, w) => (!w || !(w.results || w.spend_cents) ? '—' : r.kind === 'purchase' ? `${w.results} ${w.results === 1 ? 'purchase' : 'purchases'}` : r.kind === 'lead' ? `${w.results} ${w.results === 1 ? 'lead' : 'leads'}` : '—');
const ret = w => (!w || !w.ret ? '—' : w.ret.type === 'roas' ? `${w.ret.value.toFixed(2)}×` : w.ret.value == null ? 'No leads' : `${money(w.ret.value)} a lead`);
const budget = b => (!b ? '—' : `${money(b.cents)}${b.kind === 'daily' ? ' a day' : ' in all'}${b.on_ad_sets ? ' (on its ad sets)' : ''}`);

const PAGE = 25;
const at = iso => new Date(iso).toLocaleString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) + ' ET';

export default function AccountView() {
  const [d, setD] = useState(null), [err, setErr] = useState(''), [f, setF] = useState('all'), [busy, setBusy] = useState(false), [msg, setMsg] = useState(''), [wait, setWait] = useState(0), [limit, setLimit] = useState(PAGE), [typing, setTyping] = useState(''), [amount, setAmount] = useState(''), [working, setWorking] = useState(false);
  const timer = useRef(null);
  const load = () => fetch('/api/ops/ads-account').then(r => r.json().then(j => r.ok ? setD(j) : setErr(j.error || 'Couldn’t read your Meta account just now.'))).catch(() => setErr('Couldn’t read your Meta account just now.'));
  useEffect(() => { load(); return () => clearInterval(timer.current); }, []);
  // One press on a campaign not made in Ops: say what will happen, ask, then do it (the server looks at Meta again first, and only records unless live changes are on)
  const press = async (r, what, cents) => {
    const plan = r.act.budget, changed = what === 'raise' ? raised(plan.units) : what === 'set' ? shareOut(plan.units, cents) : null;
    if (changed && what === 'set' && overCeiling(changed)) { setErr(`That is above the ${dollars(SET_CEILING_CENTS)} a day ceiling Ops keeps for one budget. Nothing was changed.`); setMsg(''); return; }
    if (!confirm(confirmText(what, r, changed, { live: d.live }))) return;
    setErr(''); setMsg(''); setWorking(true);
    try {
      const res = await fetch('/api/ops/ads-account', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'act', id: r.id, what, dollars: what === 'set' ? String(cents / 100) : undefined, seen: r.act.seen, confirm: true }) }), j = await res.json().catch(() => ({}));
      if (!res.ok) setErr(j.error || 'That didn’t work. Nothing was changed. Try again in a moment.'); else { setMsg(j.message || 'Done.'); setTyping(''); setAmount(''); await load(); }
    } catch { setErr('That didn’t work. Nothing was changed. Try again in a moment.'); }
    setWorking(false);
  };
  const reverse = async a => {
    if (!confirm('Reverse this change?\n\nThe earlier value is put back in Meta. If it has been changed again since, nothing is done.')) return;
    setErr(''); setMsg(''); setWorking(true);
    try {
      const res = await fetch('/api/ops/ads-account', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'reverse', action_id: a.id, confirm: true }) }), j = await res.json().catch(() => ({}));
      if (!res.ok) setErr(j.error || 'That didn’t work. Nothing was changed. Try again in a moment.'); else { setMsg(j.message || 'Reversed.'); await load(); }
    } catch { setErr('That didn’t work. Nothing was changed. Try again in a moment.'); }
    setWorking(false);
  };
  const cool = s => { setWait(s); clearInterval(timer.current); timer.current = setInterval(() => setWait(w => { if (w <= 1) { clearInterval(timer.current); return 0; } return w - 1; }), 1000); };
  const refresh = async () => {
    setBusy(true); setMsg(''); setErr('');
    try {
      const res = await fetch('/api/ops/ads-account', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'refresh' }) }), j = await res.json().catch(() => ({}));
      if (!res.ok) setErr(j.error || 'Couldn’t read your Meta account just now.');
      else { setD(j); if (j.status.refresh_wait) { cool(j.status.refresh_wait); setMsg(`That was only just refreshed. You can ask Meta again in ${j.status.refresh_wait} seconds.`); } else { cool(60); setMsg('Asked Meta again.'); } }
    } catch { setErr('Couldn’t read your Meta account just now.'); }
    setBusy(false);
  };
  const s = d?.status, rows = d?.rows || [], shown = rows.filter((FILTERS.find(x => x[0] === f) || FILTERS[0])[2]), tot = sumRows(shown);
  const head = (
    <div className="ph"><div><h2>In your Meta account</h2><p className="sub">Every campaign in your real ad account, however it was made. For the ones not made in Ops there are buttons to pause, resume or change the daily budget: each one asks you first, and nothing else about a campaign is touched.</p></div>
      <div className="acct-tools">{s && s.state !== 'not_connected' && <span className="sub" role="status">{s.stale ? 'Last seen' : 'As of'} {asOf(s.as_of, s.tz)}{s.cached ? ' (kept from a moment ago)' : ''}</span>}
        <button type="button" className="soc-btn small" onClick={refresh} disabled={busy || wait > 0 || !d || s?.state === 'not_connected'} aria-label="Refresh from Meta">{busy ? 'Refreshing…' : wait > 0 ? `Refresh (${wait}s)` : 'Refresh'}</button></div></div>);
  let body;
  if (err && !d) body = <p className="hint err" role="alert">{err}</p>;
  else if (!d) body = <p className="ops-empty">Reading your Meta account…</p>;
  else if (s.state === 'not_connected') body = <p className="ads-mode warn" role="status"><b>Meta isn’t connected yet.</b> {s.message.replace(/^Meta isn’t connected yet:\s*/, '')}</p>;
  else if (s.state === 'error' && !rows.length) body = <p className="ads-mode bad" role="alert"><b>Meta couldn’t be read just now.</b> {s.message}</p>;
  else if (!rows.length) body = <p className="ops-empty">No campaigns in this ad account yet.</p>;
  else body = (
    <>
      {s.state === 'error' && <p className="ads-mode bad" role="alert"><b>Meta couldn’t be read just now.</b> {s.message} What you see is from {asOf(s.as_of, s.tz)}.</p>}
      {(s.notes || []).map(n => <p key={n} className="ads-mode warn" role="status">{n}</p>)}
      <div className="ads-seg" role="group" aria-label="Show">{FILTERS.map(([k, l, fn]) => <button key={k} type="button" aria-pressed={f === k} onClick={() => { setF(k); setLimit(PAGE); }}>{l} <span className="n">{rows.filter(fn).length}</span></button>)}</div>
      {!shown.length ? <p className="ops-empty">Nothing in this list.</p> : (
        <div className="ads-scroll"><table className="acct-table" aria-label="Campaigns in your Meta account">
          <thead>
            <tr><th rowSpan={2}>Campaign</th><th rowSpan={2}>Status</th><th rowSpan={2}>Budget</th><th rowSpan={2}>Dates</th><th colSpan={3} className="grp">Last 7 days</th><th colSpan={3} className="grp">Last 30 days</th><th rowSpan={2}><span className="sr-only">Open in Meta</span></th></tr>
            <tr><th>Spend</th><th>Results</th><th>Return</th><th>Spend</th><th>Results</th><th>Return</th></tr>
          </thead>
          <tbody>{shown.slice(0, limit).map(r => (
            <tr key={r.id} data-id={r.id}>
              <td className="c-name"><b>{r.name}</b>
                <div className="acct-badges">{r.made_in_ops ? <a className="ads-pill good" href={`/ops/ads/${r.ops_id}`}>Made in Ops</a> : <span className="ads-pill calm">Not made in Ops</span>}
                  {r.needs.map(n => <span key={n} className="ads-pill warn acct-why">{n}</span>)}</div>
                {d.can_act && !r.made_in_ops && r.act && (r.act.pause || r.act.resume) && (
                  <div className="acct-act" role="group" aria-label={`Change ${r.name}`}>
                    <button type="button" className="soc-btn small" disabled={working} onClick={() => press(r, r.act.pause ? 'pause' : 'resume')}>{r.act.pause ? 'Pause' : 'Resume'}</button>
                    {r.act.budget.mode !== 'none' && <button type="button" className="soc-btn small" disabled={working} onClick={() => press(r, 'raise')}>+20%</button>}
                    {r.act.budget.mode !== 'none' && <button type="button" className="soc-btn small" disabled={working} aria-expanded={typing === r.id} onClick={() => { setTyping(typing === r.id ? '' : r.id); setAmount(''); }}>Set budget</button>}
                    {r.act.budget.mode === 'none' && <span className="sub">{r.act.budget.why}</span>}
                    {typing === r.id && (
                      <form className="acct-amount" onSubmit={e => { e.preventDefault(); const c = parseDollars(amount); if (c == null) { setErr('Enter the new daily budget in dollars, like 40 or 40.50.'); setMsg(''); } else press(r, 'set', c); }}>
                        <label>New daily budget in all, in dollars{r.act.budget.mode === 'adsets' ? ` (shared across its ${r.act.budget.units.length} running ad sets)` : ''}
                          <input type="text" inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} placeholder="40" autoComplete="off" /></label>
                        <button type="submit" className="soc-btn small" disabled={working}>Review</button>
                        <span className="sub">Up to {dollars(SET_CEILING_CENTS)} a day for one budget.</span>
                      </form>)}
                  </div>)}</td>
              <td className="c-status"><span className={`ads-pill ${r.status_tone}`}>{r.status_word}</span></td>
              <td className="num c-budget">{budget(r.budget)}</td>
              <td className="c-dates">{r.start ? `From ${day(r.start)}` : ''}{r.start && r.end ? <br /> : null}{r.end ? `To ${day(r.end)}` : r.no_end ? <span className="ads-pill warn">No end date</span> : ''}{!r.start && !r.end && !r.no_end ? '—' : ''}</td>
              <td className="num c-spend7">{r.d7 ? money(r.d7.spend_cents) : '—'}</td><td className="num c-res7">{results(r, r.d7)}</td><td className="num c-ret7">{ret(r.d7)}</td>
              <td className="num c-spend30">{r.d30 ? money(r.d30.spend_cents) : '—'}</td><td className="num c-res30">{results(r, r.d30)}</td><td className="num c-ret30">{ret(r.d30)}</td>
              <td><a className="acct-open" href={r.manager_url} target="_blank" rel="noopener noreferrer">Open in Meta Ads Manager</a></td>
            </tr>))}</tbody>
          <tfoot><tr className="acct-total">
            <th scope="row" colSpan={4}>Total of all {tot.campaigns} in this list<div className="sub">Return is across purchase campaigns only, as Meta counts it</div></th>
            <td className="num c-spend7">{money(tot.d7.spend_cents)}</td><td className="num c-res7">{[tot.d7.purchases ? `${tot.d7.purchases} ${tot.d7.purchases === 1 ? 'purchase' : 'purchases'}` : '', tot.d7.leads ? `${tot.d7.leads} ${tot.d7.leads === 1 ? 'lead' : 'leads'}` : ''].filter(Boolean).join(', ') || '—'}</td><td className="num c-ret7">{tot.d7.roas == null ? '—' : `${tot.d7.roas.toFixed(2)}×`}</td>
            <td className="num c-spend30">{money(tot.d30.spend_cents)}</td><td className="num c-res30">{[tot.d30.purchases ? `${tot.d30.purchases} ${tot.d30.purchases === 1 ? 'purchase' : 'purchases'}` : '', tot.d30.leads ? `${tot.d30.leads} ${tot.d30.leads === 1 ? 'lead' : 'leads'}` : ''].filter(Boolean).join(', ') || '—'}</td><td className="num c-ret30">{tot.d30.roas == null ? '—' : `${tot.d30.roas.toFixed(2)}×`}</td>
            <td />
          </tr></tfoot></table></div>)}
      {shown.length > limit && (
        <p className="acct-more">Showing {limit} of {shown.length}.{' '}
          <button type="button" className="soc-btn small" onClick={() => setLimit(l => l + PAGE)}>Show {Math.min(PAGE, shown.length - limit)} more</button>{' '}
          <button type="button" className="soc-btn small" onClick={() => setLimit(shown.length)}>Show all</button></p>)}
      <p className="sub">Return and results are as Meta counts them. Real Circle and Kit sales come in a later update. “Last 7 days” and “Last 30 days” are whole days, not counting today. A return needs at least $5 spent to show.</p>
      <p className="sub">“Made in Ops” means the campaign was built here from a launch: it is paused, started and changed from its own page. “Not made in Ops” means it was made in Meta Ads Manager or by Make’s Ad Agent. For those, the buttons only pause, resume or change the daily budget when you press them, after asking you; Ops never changes them by itself, and never touches their words, audiences or pictures.</p>
      {d.can_act && !d.live && <p className="ads-mode warn" role="status"><b>Live changes are off.</b> The buttons ask and record what you pressed, but Meta is not changed.</p>}
    </>);
  return (
    <section className="ads-panel" aria-label="In your Meta account">
      {head}
      {msg && <p className="hint" role="status">{msg}</p>}{err && d && <p className="hint err" role="alert">{err}</p>}
      {body}
      {d?.can_act && (d.changes || []).length > 0 && (
        <div className="acct-changes" aria-label="Changes made here">
          <h3>Changes you made here</h3>
          <ul className="ads-acts">{d.changes.map(a => (
            <li key={a.id}><div className="t"><div className="meta">{a.dry_run && !a.failed && <span className="ads-pill dry">Recorded only</span>}{a.failed && <span className="ads-pill warn">Didn’t go through</span>}{a.reversed && <span className="ads-pill calm">Reversed</span>}</div><span>{a.detail}</span><span className="sub">{a.by} · {at(a.at)}</span></div>
              {a.can_reverse && <button type="button" className="soc-btn small" disabled={working} onClick={() => reverse(a)} aria-label={`Reverse: ${a.detail}`}>Reverse</button>}</li>))}</ul>
        </div>)}
    </section>);
}
