'use client';
import { useEffect, useState } from 'react';

// This month's articulation partners, as the mentees chose them on their Mentorship Dashboard. Read only.
const label = ym => { try { return new Date(`${ym}-15T12:00:00Z`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }); } catch { return ym; } };
const shift = (ym, n) => { const d = new Date(Date.UTC(+ym.slice(0, 4), +ym.slice(5, 7) - 1 + n, 15)); return d.toISOString().slice(0, 7); };

export default function Chosen() {
  const [month, setMonth] = useState('');
  const [data, setData] = useState(null);
  const load = async m => {
    setData(null);
    const res = await fetch(`/api/ops/partners/chosen${m ? `?month=${m}` : ''}`).catch(() => null);
    const j = await res?.json().catch(() => ({}));
    if (!res?.ok) { setData({ error: j?.error || 'Couldn’t load the partners. Try again.' }); return; }
    setData(j); setMonth(j.month);
  };
  useEffect(() => { load(''); }, []);
  return (
    <section className="ops-partners" style={{ marginBottom: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0 }}>Chosen by the mentees · {month ? label(month) : '…'}</h2>
        {month && <span style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button type="button" className="chip" onClick={() => load(shift(month, -1))}>← Earlier</button>
          <button type="button" className="chip" onClick={() => load(shift(month, 1))}>Later →</button>
        </span>}
      </div>
      <p className="ops-empty" style={{ margin: '6px 0 14px' }}>Each month the mentees choose their own articulation partner on their Mentorship Dashboard. If the cohort is an odd number, whoever is left over joins a pair to make a three. Nothing to do here unless someone needs a nudge.</p>
      {!data ? <p className="ops-empty">Loading…</p>
        : data.error ? <p role="alert">{data.error}</p>
        : !data.on ? <p className="ops-empty">The mentee record isn’t connected here yet.</p>
        : <>
          <h3 style={{ margin: '0 0 6px', fontSize: 15 }}>{data.groups.length ? `${data.groups.length} ${data.groups.length === 1 ? 'pair' : 'pairs'}` : 'No pairs yet'}</h3>
          <ul style={{ margin: '0 0 16px', paddingLeft: 18 }}>
            {data.groups.map(g => <li key={g.id}>{g.members.map(m => m.name).join(' and ')}{g.members.length === 3 ? ' (a three)' : ''}</li>)}
          </ul>
          <h3 style={{ margin: '0 0 6px', fontSize: 15 }}>Without a partner yet{data.unpaired.length ? ` · ${data.unpaired.length}` : ''}</h3>
          {data.unpaired.length
            ? <ul style={{ margin: 0, paddingLeft: 18 }}>{data.unpaired.map(u => <li key={u.email}>{u.name} <span className="ops-empty">· <a href={`mailto:${u.email}`}>{u.email}</a></span></li>)}</ul>
            : <p className="ops-empty" style={{ margin: 0 }}>Everyone has a partner this month.</p>}
        </>}
    </section>
  );
}
