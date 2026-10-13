'use client';
import { useEffect, useState } from 'react';

const since = iso => { const m = Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / 6e4)); return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`; };
const at = iso => new Date(iso).toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' });

async function call(body) {
  const res = await fetch('/api/ops/clock', { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }).catch(() => null);
  const j = await res?.json().catch(() => ({}));
  if (!res?.ok) throw new Error(j?.error || 'Couldn’t reach the clock');
  return j;
}

// Sidebar time clock: one button, with the month's hours against the cap always underneath.
// tags: the person's roles, offered as quick tags on clock-out.
export default function ClockWidget({ tags = [] }) {
  const [st, setSt] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [out, setOut] = useState(null);      // clock-out form: { tags: [], note }
  const [ask, setAsk] = useState(null);      // request form: { hours, why }
  const [, tick] = useState(0);
  const load = () => call().then(setSt).catch(e => setErr(e.message));
  useEffect(() => { load(); const t = setInterval(() => tick(n => n + 1), 30_000); return () => clearInterval(t); }, []);
  if (!st || st.off) return null;
  const run = async body => { setBusy(true); setErr(''); try { const j = await call(body); if (j.month) setSt(j); else await load(); setOut(null); setAsk(null); } catch (e) { setErr(e.message); } setBusy(false); };

  const pct = st.limit ? Math.min(100, (st.used / st.limit) * 100) : 0;
  const tone = st.level === 'at' ? 'at' : st.level === 'near' ? 'near' : '';
  const total = st.limit ? `${st.used} of ${st.limit} h this month` : `${st.used} h this month`;

  return (
    <div className={`ops-clock ${tone}`}>
      {st.open ? (<>
        <div className="row"><span className="on"><i aria-hidden="true" />On the clock</span><b className="t">{since(st.open.start)}</b></div>
        {!out ? <button className="btn-clock out" disabled={busy} onClick={() => setOut({ tags: [], note: '' })}>Clock out</button> : (
          <form className="form" onSubmit={e => { e.preventDefault(); run({ action: 'out', ...out }); }}>
            {tags.length > 0 && <div className="tags">{tags.map(t => (
              <button type="button" key={t} aria-pressed={out.tags.includes(t)} onClick={() => setOut(o => ({ ...o, tags: o.tags.includes(t) ? o.tags.filter(x => x !== t) : [...o.tags, t] }))}>{t}</button>
            ))}</div>}
            <label className="sr" htmlFor="clk-note">Note</label>
            <input id="clk-note" placeholder="What went into it? (optional)" value={out.note} onChange={e => setOut(o => ({ ...o, note: e.target.value }))} autoFocus />
            <div className="acts"><button className="btn-clock" disabled={busy}>Clock out</button><button type="button" className="linkish" onClick={() => setOut(null)}>Keep working</button></div>
          </form>
        )}
      </>) : st.level === 'at' ? (
        st.pending ? <p className="msg">Asked for {st.pending.hours} more hours. Waiting on Jacob.</p>
          : !ask ? <button className="btn-clock ask" onClick={() => setAsk({ hours: 5, why: '' })}>Ask for more hours</button> : (
          <form className="form" onSubmit={e => { e.preventDefault(); run({ action: 'request', ...ask }); }}>
            <label htmlFor="clk-h">Extra hours</label>
            <input id="clk-h" type="number" min="0.5" step="0.5" value={ask.hours} onChange={e => setAsk(a => ({ ...a, hours: e.target.value }))} />
            <input aria-label="Why" placeholder="What for? (optional)" value={ask.why} onChange={e => setAsk(a => ({ ...a, why: e.target.value }))} />
            <div className="acts"><button className="btn-clock" disabled={busy}>Send to Jacob</button><button type="button" className="linkish" onClick={() => setAsk(null)}>Cancel</button></div>
          </form>
        )
      ) : <button className="btn-clock" disabled={busy} onClick={() => run({ action: 'in' })}>Clock in</button>}

      {st.limit && <div className="bar" role="meter" aria-label="Hours this month" aria-valuemin={0} aria-valuemax={st.limit} aria-valuenow={st.used}><span style={{ width: `${pct}%` }} /></div>}
      <a className="sum" href="/ops/hours">
        {st.open ? `Since ${at(st.open.start)} · ` : ''}{st.level === 'near' ? `${st.left} h left this month` : st.level === 'at' ? `At your ${st.limit} h for this month` : total}
      </a>
      {err && <p className="msg err">{err}</p>}
    </div>
  );
}
