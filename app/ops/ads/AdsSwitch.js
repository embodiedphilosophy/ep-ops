'use client';
import { useEffect, useState } from 'react';
import { usd } from './Campaigns';
import './ads.css';

const day = d => d ? new Date(d + 'T12:00:00Z').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }) : 'No date yet';
const GOALS = [['Purchase', 'Purchase', 'Optimise for checkouts on the Circle paywall. Judged on return on ad spend.'], ['Lead', 'Lead', 'Optimise for sign-ups (Kit or the quiz). Judged on cost per lead.'], ['Traffic', 'Traffic', 'Landing page visits. Only for warming an audience; no automatic rules.']];
const TYPES = [['test', 'Targeting test · 5 × 5', '5 ad sets, each a different audience, each with the same 5 ads.'], ['advantage', 'Advantage+', '1 ad set. Meta finds the audience; the same 5 ads.']];
const STEPS = [['Landing page address becomes the ad link', 'its address, with tags so sign-ups can be matched to the ad'], ['Words drafted from the launch', '5 copy sets, only from its own emails, course page and real testimonials'], ['Pictures chosen', 'from the launch’s art and the image library, cut to 9:16, 4:5, 1:1 and 1.91:1'], ['Audiences suggested', 'from what has worked before, plus new tests'], ['Draft lands in Ads', 'for Rebecka or Jacob to edit and start; nothing goes to Meta yet']];

// The choice itself (the wizard and the launch page both show it). v = { on, goal, structure, dollars }; dates = what the launch's key dates give
export function AdsChoice({ v, set, dates, budgets, locked }) {
  const dollars = v.dollars === '' ? '' : v.dollars;
  return (
    <section className="ads-switch" aria-label="Run Meta ads for this launch">
      <div className="ph"><div><h3>Run Meta ads for this launch?</h3><p className="sub">Asked once, when the launch is created. It can be changed until the campaign starts.</p></div>
        <div className="ads-seg" role="group" aria-label="Run Meta ads"><button type="button" disabled={locked} aria-pressed={v.on} onClick={() => set({ on: true })}>Yes</button><button type="button" disabled={locked} aria-pressed={!v.on} onClick={() => set({ on: false })}>No</button></div></div>
      {v.on && <>
        <div className="ads-cap">Goal</div>
        <div className="ads-choices" role="radiogroup" aria-label="Goal">{GOALS.map(([k, l, t]) => <button type="button" key={k} role="radio" aria-checked={v.goal === k} disabled={locked} onClick={() => set({ goal: k })}><b>{l}</b><span>{t}</span></button>)}</div>
        <div className="ads-cap">Campaign type</div>
        <div className="ads-choices two" role="radiogroup" aria-label="Campaign type">{TYPES.map(([k, l, t]) => <button type="button" key={k} role="radio" aria-checked={v.structure === k} disabled={locked} onClick={() => set({ structure: k, ...(v.dollarsTouched ? {} : { dollars: String((budgets?.[k] || 0) / 100) }) })}><b>{l}</b><span>{t}</span></button>)}</div>
        <div className="ads-facts">
          <div><span className="ads-cap">Start</span><b>{day(dates?.start_date)}</b></div>
          <div><span className="ads-cap">End</span><b>{day(dates?.end_date)}</b></div>
          <label><span className="ads-cap">Starting budget / day</span><input inputMode="decimal" aria-label="Starting budget per day in dollars" value={dollars} disabled={locked} onChange={e => set({ dollars: e.target.value.replace(/[^0-9.]/g, ''), dollarsTouched: true })} /></label>
        </div>
        <p className="sub">Dates come from the launch’s key dates and move with them. Budget and rules start from the launch type and can be changed on the campaign.</p>
        <ol className="ads-how" aria-label="How the draft gets built">{STEPS.map(([a, b]) => <li key={a}><b>{a}</b><span>{b}</span></li>)}</ol>
      </>}
    </section>);
}
export const startValue = (budgets, current) => current ? { on: true, goal: current.goal, structure: current.structure, dollars: String(current.daily_cents / 100), dollarsTouched: true } : { on: false, goal: 'Purchase', structure: 'test', dollars: String((budgets?.test || 5000) / 100) };
export const centsOf = v => Math.round(Number(v.dollars || 0) * 100);

// On a launch's own page: shows the saved choice and saves changes (making or removing the draft). Only for people who may use Ads.
export function AdsPanel({ launchId }) {
  const [d, setD] = useState(null), [v, setV] = useState(null), [msg, setMsg] = useState(''), [err, setErr] = useState(''), [busy, setBusy] = useState(false);
  const load = () => fetch(`/api/ops/ads?launch=${encodeURIComponent(launchId)}`).then(r => r.json().then(j => { if (!r.ok) throw new Error(j.error); setD(j); setV(startValue(j.budgets, j.campaign)); })).catch(e => setErr(e.message || 'Couldn’t read the ads choice'));
  useEffect(() => { load(); }, [launchId]);   // eslint-disable-line react-hooks/exhaustive-deps
  if (err) return <p className="hint err" role="alert">{err}</p>;
  if (!d) return null;
  const c = d.campaign, locked = !!c && c.status !== 'draft', set = p => { setMsg(''); setV(x => ({ ...x, ...p })); };
  const save = async () => {
    setBusy(true); setErr(''); setMsg('');
    try {
      if (!v.on && c && !confirm('Take the ads away from this launch? The draft campaign and its words and pictures are removed.')) { setBusy(false); return; }
      const res = await fetch('/api/ops/ads', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'saveSwitch', launch_id: launchId, on: v.on, goal: v.goal, structure: v.structure, daily_cents: centsOf(v) }) });
      const j = await res.json().catch(() => ({})); if (!res.ok) throw new Error(j.error || 'Couldn’t save that');
      setMsg(v.on ? (c ? 'Saved.' : 'The draft is ready.') : 'Ads are off for this launch.'); await load();
    } catch (e) { setErr(e.message); }
    setBusy(false);
  };
  return (
    <div className="ads">
      <AdsChoice v={v} set={set} dates={d.dates} budgets={d.budgets} locked={locked} />
      {err && <p className="hint err" role="alert">{err}</p>}{msg && <p className="hint" role="status">{msg}</p>}
      <div className="soc-act">
        {!locked && <button className="soc-btn primary" disabled={busy || (v.on && !centsOf(v))} onClick={save}>{busy ? 'Saving…' : v.on ? (c ? 'Save the ads choice' : 'Save and make the draft') : (c ? 'Save: no ads' : 'Save')}</button>}
        {c && <a className="soc-btn" href={`/ops/ads/${c.id}`}>Open the draft in Ads</a>}
        {locked && <span className="sub">This campaign is already in Meta ({usd(c.daily_cents)} a day), so it is changed in Ads.</span>}
      </div>
    </div>);
}
