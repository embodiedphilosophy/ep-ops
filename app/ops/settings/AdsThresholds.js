'use client';
import { useEffect, useState } from 'react';
import '../ads/ads.css';

// Settings › Connections and jobs › Ads audience library (directors). The five numbers that decide an audience's standing in the Audience library. They are kept in the
// dashboard's own database, never in an environment variable; every change goes on the Change Log. The library reads them each morning and whenever it explains itself.
const asShown = (k, v) => (k === 'min_spend_cents' ? String(v / 100) : String(v));
export default function AdsThresholds() {
  const [d, setD] = useState(null), [vals, setVals] = useState({}), [err, setErr] = useState(''), [msg, setMsg] = useState(''), [busy, setBusy] = useState(false);
  useEffect(() => { fetch('/api/ops/ads-library?settings=1').then(r => r.json().then(j => { if (!r.ok) throw new Error(j.error); setD(j); setVals(Object.fromEntries(Object.entries(j.values).map(([k, v]) => [k, asShown(k, v)]))); })).catch(e => setErr(e.message || 'Couldn’t read the settings')); }, []);
  if (err && !d) return <p className="hint err" role="alert">{err}</p>;
  if (!d) return <p className="ops-empty">Reading the settings…</p>;
  const save = async e => {
    e.preventDefault(); setErr(''); setMsg(''); setBusy(true);
    const body = Object.fromEntries(Object.entries(vals).map(([k, v]) => [k, k === 'min_spend_cents' ? Math.round(Number(v) * 100) : Number(v)]));
    const res = await fetch('/api/ops/ads-library', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'saveThresholds', values: body }) }), j = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setErr(j.error || 'That didn’t save. Try again in a moment.'); return; }
    setVals(Object.fromEntries(Object.entries(j.values).map(([k, v]) => [k, asShown(k, v)]))); setMsg(j.changed?.length ? 'Saved. The library uses these from the next morning update.' : 'Nothing changed.');
  };
  return (
    <div className="ads ads-set">
      <section className="ads-panel" aria-label="Audience library thresholds">
        <div className="ph"><h2>Audience library</h2></div>
        <p className="sub">How the Audience library decides where an audience stands. “Target” and “floor” are each campaign’s own: its return (or cost per lead) to aim for, and the value below which the rules turn an ad set off. These numbers say how many campaigns, and how much spend, before an audience is judged.</p>
        <form onSubmit={save} className="ads-facts" aria-label="Thresholds" noValidate>
          {Object.entries(d.fields).map(([k, f]) => (
            <label key={k}><span>{f.label}</span>
              <input type="number" inputMode="numeric" min={k === 'min_spend_cents' ? f.min / 100 : f.min} max={k === 'min_spend_cents' ? f.max / 100 : f.max} step="1" value={vals[k] ?? ''} onChange={e => setVals({ ...vals, [k]: e.target.value })} aria-label={f.label} />
              <span className="ads-cap">{f.help}</span></label>))}
          <div className="soc-act"><button className="soc-btn primary" disabled={busy} type="submit">{busy ? 'Saving…' : 'Save'}</button></div>
        </form>
        {err && <p className="hint err" role="alert">{err}</p>}{msg && <p className="hint" role="status">{msg}</p>}
        <p className="sub">Starting values: Proven after 2 campaigns, Promising after 1, retired after 3 times below the floor, judged after $40 and 3 days. Directors only. Each change is written on the Change Log.</p>
      </section>
    </div>);
}
