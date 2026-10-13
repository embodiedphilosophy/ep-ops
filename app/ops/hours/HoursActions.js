'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

const post = async body => {
  const res = await fetch('/api/ops/clock', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).catch(() => null);
  const j = await res?.json().catch(() => ({}));
  if (!res?.ok) throw new Error(j?.error || 'Couldn’t save that');
  return j;
};

export function HoursDecide({ id, hours }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false), [err, setErr] = useState('');
  const go = async action => { setBusy(true); setErr(''); try { await post({ action, id }); router.refresh(); } catch (e) { setErr(e.message); setBusy(false); } };
  return (<span className="acts">
    <button className="chip primary" disabled={busy} onClick={() => go('approve')}>Approve +{hours} h</button>
    <button className="chip" disabled={busy} onClick={() => go('decline')}>Decline</button>
    {err && <span className="hint err">{err}</span>}
  </span>);
}

export function FixShift({ id, start, end }) {
  const router = useRouter();
  const [open, setOpen] = useState(false), [f, setF] = useState({ start, end }), [err, setErr] = useState(''), [busy, setBusy] = useState(false);
  if (!open) return <button className="more" onClick={() => setOpen(true)}>Fix</button>;
  const save = async e => { e.preventDefault(); setBusy(true); setErr(''); try { await post({ action: 'fix', id, ...f }); setOpen(false); router.refresh(); } catch (x) { setErr(x.message); } setBusy(false); };
  return (<form className="fix" onSubmit={save}>
    <input type="time" aria-label="Start" value={f.start} onChange={e => setF(s => ({ ...s, start: e.target.value }))} />
    <input type="time" aria-label="End" value={f.end} onChange={e => setF(s => ({ ...s, end: e.target.value }))} />
    <button className="chip primary" disabled={busy}>Save</button><button type="button" className="chip" onClick={() => setOpen(false)}>Cancel</button>
    {err && <span className="hint err">{err}</span>}
  </form>);
}
