'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

const plusDays = n => { const d = new Date(); d.setDate(d.getDate() + n); return d.toLocaleDateString('en-CA', { timeZone: 'America/New_York' }); };

// "+ Task": a task for anyone on the team, due when you say, optionally tied to an event.
// team: names; me: the signer-in's name (the default owner); events: [{ id, label }] coming up.
export default function AddTask({ team = [], me = '', events = [], event = '', compact = false }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ name: '', who: team.includes(me) ? me : team[0] || '', due: plusDays(1), event, note: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const set = k => e => setF(s => ({ ...s, [k]: e.target.value }));
  if (!open) return <button className={compact ? 'chip' : 'chip primary'} onClick={() => setOpen(true)}>+ Task</button>;
  const save = async e => {
    e.preventDefault(); setBusy(true); setErr('');
    const res = await fetch('/api/ops/task', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'create', ...f }) }).catch(() => null);
    const j = await res?.json().catch(() => ({}));
    setBusy(false);
    if (!res?.ok) return setErr(j?.error || 'Couldn’t add the task. Try again.');
    setF(s => ({ ...s, name: '', note: '' })); setOpen(false); router.refresh();
  };
  return (
    <form className="ops-edit ops-addtask" onSubmit={save}>
      <p className="ops-edit-title">New task</p>
      <div className="row"><label htmlFor="nt-name">Task</label><input id="nt-name" value={f.name} onChange={set('name')} placeholder="e.g. Upload the session 2 readings" required autoFocus /></div>
      <div className="row"><label htmlFor="nt-who">Owner</label>
        <select id="nt-who" value={f.who} onChange={set('who')}>{team.map(n => <option key={n}>{n}</option>)}</select></div>
      <div className="row"><label htmlFor="nt-due">Due</label>
        <span className="inline"><input id="nt-due" type="date" value={f.due} onChange={set('due')} required />
          {[[0, 'Today'], [1, 'Tomorrow'], [7, 'In a week']].map(([n, l]) => <button key={n} type="button" className="chip" onClick={() => setF(s => ({ ...s, due: plusDays(n) }))}>{l}</button>)}</span></div>
      {events.length > 0 && (
        <div className="row"><label htmlFor="nt-ev">Event</label>
          <select id="nt-ev" value={f.event} onChange={set('event')}><option value="">None</option>{events.map(e => <option key={e.id} value={e.id}>{e.label}</option>)}</select></div>
      )}
      <div className="row"><label htmlFor="nt-note">Note</label><textarea id="nt-note" rows={2} value={f.note} onChange={set('note')} placeholder="Optional: links, what done looks like" /></div>
      <div className="bar">
        <button className="chip primary" disabled={busy}>{busy ? 'Adding…' : 'Add task'}</button>
        <button type="button" className="chip" onClick={() => setOpen(false)}>Cancel</button>
        {err && <span className="hint err">{err}</span>}
      </div>
    </form>
  );
}
