'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { FIELDS, WHERE, STATUSES, whereOf } from '@/lib/ops/eventfields';
import { SessionActions } from './EventActions';

const GROUPS = ['Session', 'People', 'Website', 'After', 'Planning'];
// A past session: just what a replay needs, replay first (the rest is one click away)
const PAST = ['Vimeo Video ID', 'Replay Link', 'Summary', 'Public Title', 'Website', 'Teachers & Hosts'];
const PAST_GROUPS = ['After', 'Website', 'People'];

// Edit one session's details (Schedule + Event Details) from the event drawer.
// sessions: [{ id: 'E028', date, label, track }] — more than one for a weekly series or multi-session course
export default function EventEditor({ sessions, past = false, label = 'Edit details' }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [sid, setSid] = useState(sessions[0]?.id || '');
  const [orig, setOrig] = useState(null);   // values as loaded
  const [vals, setVals] = useState({});
  const [locked, setLocked] = useState([]);
  const [msg, setMsg] = useState('');
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [allFields, setAllFields] = useState(!past);
  const track = sessions.find(s => s.id === sid)?.track || '';

  const load = async id => {
    setBusy(true); setMsg(''); setErrors({}); setOrig(null);
    const res = await fetch(`/api/ops/event?id=${encodeURIComponent(id)}`).catch(() => null);
    const j = await res?.json().catch(() => ({}));
    setBusy(false);
    if (!res?.ok) { setMsg(j?.error || 'Couldn’t load this event'); return; }
    setOrig(j.values); setVals(j.values); setLocked(j.locked || []);
  };
  const start = () => { setOpen(true); load(sid); };
  const pick = id => { setSid(id); load(id); };
  // Past sessions open straight to the form
  useEffect(() => { if (past && sid) start(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const changed = orig ? Object.keys(vals).filter(k => String(vals[k] ?? '') !== String(orig[k] ?? '')) : [];
  const save = async () => {
    setBusy(true); setMsg(''); setErrors({});
    const changes = Object.fromEntries(changed.map(k => [k, vals[k]]));
    const before = Object.fromEntries(changed.map(k => [k, orig[k]]));
    const res = await fetch('/api/ops/event', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: sid, changes, before }) }).catch(() => null);
    const j = await res?.json().catch(() => ({}));
    setBusy(false);
    if (res?.ok) { setOrig(vals); setMsg(j.written?.length ? `Saved ${j.written.length} change${j.written.length === 1 ? '' : 's'}. The website updates within a minute.` : 'Nothing to save.'); router.refresh(); return; }
    if (res?.status === 409) { setMsg(`${j.error}. Their version is shown now; make your change again.`); setOrig(o => ({ ...o, ...j.conflict })); setVals(v => ({ ...v, ...j.conflict })); return; }
    setErrors(j?.errors || {}); setMsg(j?.error || 'Couldn’t save. Try again.');
  };

  if (!open) return <p className="ops-edit-open"><button className="chip" onClick={start}>{label}</button></p>;
  const set = (k, v) => setVals(s => ({ ...s, [k]: v }));
  const input = f => {
    const v = vals[f.key] ?? '', dis = busy || locked.includes(f.key), id = `f-${f.key.replace(/\W+/g, '-')}`;
    if (f.type === 'where') return (
      <select id={id} value={whereOf(v, track)} disabled={dis} onChange={e => set(f.key, e.target.value)}>
        {WHERE.map(w => <option key={w.value} value={w.value}>{w.label}</option>)}
      </select>);
    if (f.type === 'bool') return (
      <select id={id} value={v.toUpperCase()} disabled={dis} onChange={e => set(f.key, e.target.value)}>
        <option value="">Track default</option><option value="TRUE">Yes</option><option value="FALSE">No</option>
      </select>);
    if (f.type === 'status') return (
      <select id={id} value={v} disabled={dis} onChange={e => set(f.key, e.target.value)}>
        {[...new Set([v, ...STATUSES])].map(s => <option key={s} value={s}>{s || '—'}</option>)}
      </select>);
    if (f.type === 'textarea') return <textarea id={id} rows={3} value={v} disabled={dis} onChange={e => set(f.key, e.target.value)} />;
    return <input id={id} value={v} disabled={dis} inputMode={f.type === 'minutes' ? 'numeric' : undefined} onChange={e => set(f.key, e.target.value)} />;
  };
  // The Zoom link only matters when the session isn't in Circle
  const hidden = f => (!allFields && !PAST.includes(f.key)) || (f.key === 'Zoom Link' && whereOf(vals['Zoom Type'], track) === 'circle' && !vals['Zoom Link']);
  const groups = allFields ? GROUPS : PAST_GROUPS;

  return (
    <form className="ops-edit" onSubmit={e => { e.preventDefault(); save(); }}>
      {sessions.length > 1 && (
        <label className="ops-edit-session">Session
          <select value={sid} onChange={e => pick(e.target.value)} disabled={busy}>
            {sessions.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </label>
      )}
      {!orig ? <p className="hint">{busy ? 'Loading…' : msg}</p> : groups.map(g => (
        <fieldset key={g}>
          <legend>{g}</legend>
          {FIELDS.filter(f => f.group === g && !hidden(f)).map(f => (
            <div key={f.key} className={`row${errors[f.key] ? ' bad' : ''}${changed.includes(f.key) ? ' changed' : ''}`}>
              <label htmlFor={`f-${f.key.replace(/\W+/g, '-')}`}>{f.label}</label>
              {input(f)}
              {(errors[f.key] || f.help || locked.includes(f.key)) && <span className="hint">{errors[f.key] || (locked.includes(f.key) ? 'Filled in automatically' : f.help)}</span>}
            </div>
          ))}
        </fieldset>
      ))}
      {orig && past && <p className="ops-edit-open"><button type="button" className="chip" onClick={() => setAllFields(a => !a)}>{allFields ? 'Just the replay fields' : 'Show all fields'}</button></p>}
      {orig && !past && <SessionActions id={sid} date={sessions.find(s => s.id === sid)?.date} />}
      {orig && (
        <div className="bar">
          <button type="submit" className="chip primary" disabled={busy || !changed.length}>{busy ? 'Saving…' : changed.length ? `Save ${changed.length} change${changed.length === 1 ? '' : 's'}` : 'No changes'}</button>
          <button type="button" className="chip" disabled={busy} onClick={() => { setVals(orig); setErrors({}); setMsg(''); }}>Reset</button>
          {!past && <button type="button" className="chip" onClick={() => setOpen(false)}>Close</button>}
          {msg && <span className="hint">{msg}</span>}
        </div>
      )}
    </form>
  );
}
