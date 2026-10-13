'use client';
import { useState } from 'react';
import { ACCESS } from '@/lib/ops/library';

async function call(body) {
  const r = await fetch('/api/ops/library', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || 'Something went wrong');
  return j;
}
const day = iso => iso ? new Date(iso).toLocaleDateString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric' }) : '';
const initials = t => String(t || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();

export function SyncButton() {
  const [busy, setBusy] = useState(false), [msg, setMsg] = useState('');
  async function go() {
    setBusy(true); setMsg('');
    try {
      const { result } = await call({ action: 'sync' });
      setMsg(!result.circle.configured ? (result.notes[0] || 'Circle isn’t connected here.') : `Checked. ${result.created} new, ${result.updated} changed.`);
      setTimeout(() => location.reload(), 900);
    } catch (e) { setMsg(e.message); setBusy(false); }
  }
  return <span className="ops-sync"><button className="btn primary" onClick={go} disabled={busy}>{busy ? 'Checking Circle…' : 'Check Circle now'}</button>{msg && <span role="status" className="ops-say">{msg}</span>}</span>;
}

export function AddByLink() {
  const [open, setOpen] = useState(false), [url, setUrl] = useState(''), [err, setErr] = useState(''), [busy, setBusy] = useState(false);
  async function add(e) {
    e.preventDefault(); setBusy(true); setErr('');
    try { const { offering } = await call({ action: 'add_url', url }); location.href = `/ops/library/${offering.offering_id}`; }
    catch (x) { setErr(x.message); setBusy(false); }
  }
  if (!open) return <button className="btn ghost" onClick={() => setOpen(true)}>Add from a Circle link</button>;
  return (
    <form className="ops-inline" onSubmit={add}>
      <label className="sr" htmlFor="circle-url">Circle course link</label>
      <input id="circle-url" value={url} onChange={e => setUrl(e.target.value)} placeholder="Paste the course address from Circle" required />
      <button className="btn primary" disabled={busy}>Add</button>
      {err && <span className="ops-err" role="alert">{err}</span>}
    </form>
  );
}

const EMPTY = { new: 'Nothing new in Circle. When a teacher or the team adds a course there, it appears here within the hour.', changed: 'Nothing has changed since you last published.', published: 'Nothing is published yet.', skipped: 'Nothing skipped.' };

export default function Desk({ rows, tab }) {
  const [gone, setGone] = useState({}), [err, setErr] = useState('');
  async function act(action, id) {
    setErr('');
    try { await call({ action, id }); setGone(g => ({ ...g, [id]: true })); setTimeout(() => location.reload(), 300); } catch (e) { setErr(e.message); }
  }
  const shown = rows.filter(r => !gone[r.id]);
  if (!shown.length) return <p className="ops-empty-box">{EMPTY[tab]}</p>;
  return (
    <>
      {err && <p className="ops-err" role="alert">{err}</p>}
      <ul className="ops-lib-rows">
        {shown.map(r => (
          <li key={r.id} className="ops-lib-row">
            <span className="thumb" aria-hidden="true">{r.cover ? <img src={r.cover} alt="" width="96" height="64" loading="lazy" /> : <small>No cover yet</small>}</span>
            <span className="body">
              <a className="ttl" href={`/ops/library/${r.id}`}>{r.title}</a>
              <span className="meta">
                <span className="tag">Circle course</span>
                {r.prefilled && <span className="tag-pine">Pre-filled from onboarding</span>}
              </span>
              <span className="mono">{r.found ? `Found ${day(r.found)}` : ''}</span>
              {tab === 'changed' && <span className="why">
                {r.circleChanged.length > 0 && <span><b>Changed in Circle:</b> {r.circleChanged.join(', ')}</span>}
                {r.onboardingChanged.length > 0 && <span><b>Changed in onboarding:</b> {r.onboardingChanged.join(', ')}. Not live until you press Update.</span>}
              </span>}
              {r.autoHidden && <span className="why"><span>Hidden on the site because it was unpublished in Circle.</span></span>}
            </span>
            <span className="pricecol mono">{r.price || 'No paywall yet'}<br /><span className="st"><i className={`sq ${r.circleStatus === 'published' ? 'green' : 'amber'}`} />{r.circleStatus === 'published' ? 'Published in Circle' : r.circleStatus === 'removed' ? 'Removed from Circle' : 'Draft in Circle'}</span></span>
            {(tab === 'new' || tab === 'skipped') ? <span className="bar" title={`${r.done} of 9 fields`}><span className="mono">{r.done} of 9 fields</span><span className="track"><i style={{ width: `${(r.done / 9) * 100}%` }} /></span></span> : <span />}
            <span className="acts">
              {tab === 'new' && <><a className="btn primary" href={`/ops/library/${r.id}`}>Prepare listing</a><button className="btn ghost" onClick={() => act('skip', r.id)}>Skip</button></>}
              {tab === 'changed' && <><a className="btn primary" href={`/ops/library/${r.id}`}>Review</a>{r.circleChanged.length > 0 && !r.onboardingChanged.length && <button className="btn ghost" onClick={() => act('seen', r.id)}>Mark as seen</button>}</>}
              {tab === 'published' && <a className="btn ghost" href={`/ops/library/${r.id}`}>Edit listing</a>}
              {tab === 'skipped' && <button className="btn ghost" onClick={() => act('unskip', r.id)}>Bring back</button>}
            </span>
          </li>
        ))}
      </ul>
    </>
  );
}

export function AccessMap({ paywalls }) {
  const [vals, setVals] = useState(() => Object.fromEntries(paywalls.map(p => [p.id, { access: p.access || '', requires: p.requires || '', unlock_note: p.unlock_note || '' }])));
  const [saved, setSaved] = useState(''), [err, setErr] = useState('');
  if (!paywalls.length) return null;
  const unmapped = paywalls.filter(p => !vals[p.id].access).length;
  async function save(p) {
    setErr('');
    try { await call({ action: 'map', circle_id: p.id, title: p.title, ...vals[p.id] }); setSaved(p.id); } catch (e) { setErr(e.message); }
  }
  const set = (id, k, v) => { setSaved(''); setVals(s => ({ ...s, [id]: { ...s[id], [k]: v } })); };
  return (
    <section className="ops-panel" aria-labelledby="map-h">
      <h2 id="map-h">Access map</h2>
      <p className="ops-help">Which Circle paywall unlocks which access level on the site. {unmapped ? <b>{unmapped} still need{unmapped === 1 ? 's' : ''} a mapping.</b> : 'All mapped.'}</p>
      {err && <p className="ops-err" role="alert">{err}</p>}
      <ul className="ops-map">
        {paywalls.map(p => (
          <li key={p.id}>
            <span className="n">{p.title} <small className="mono">#{p.id}</small></span>
            <label className="sr" htmlFor={`a-${p.id}`}>Access for {p.title}</label>
            <select id={`a-${p.id}`} value={vals[p.id].access} onChange={e => set(p.id, 'access', e.target.value)}>
              <option value="">Needs a mapping</option>
              {ACCESS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
            <label className="chk"><input type="checkbox" checked={vals[p.id].requires === 'year_long'} onChange={e => set(p.id, 'requires', e.target.checked ? 'year_long' : '')} /> Year-long students only</label>
            {vals[p.id].requires === 'year_long' && <input aria-label="Unlock note" placeholder="Unlock note, e.g. Opens when your year begins" value={vals[p.id].unlock_note} onChange={e => set(p.id, 'unlock_note', e.target.value)} />}
            <button className="btn ghost" onClick={() => save(p)}>{saved === p.id ? 'Saved' : 'Save'}</button>
          </li>
        ))}
      </ul>
    </section>
  );
}
