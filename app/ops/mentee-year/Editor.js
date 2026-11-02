'use client';
// Editing on Ops → Mentee year (Jacob, Irene, Floss): project steps, tasks on the mentees' "This month" list, and each month's
// theme and focus. Saves go to /api/ops/mentee-year, which writes the Mentee Schedule / Mentee Months tabs that the mentee page reads.
import { useState } from 'react';
import { useRouter } from 'next/navigation';

const post = async body => {
  const res = await fetch('/api/ops/mentee-year', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).catch(() => null);
  const j = await res?.json().catch(() => ({}));
  if (!res?.ok) { const e = new Error(j?.error || 'Couldn’t save that. Try again.'); e.fields = j?.errors || {}; throw e; }
  return j;
};
const PROJECTS = [['talk', '60-minute talk'], ['offering', 'Three-session offering'], ['both', 'Both']];
const FIELDS = { step: ['date', 'project', 'title', 'detail', 'evidence'], task: ['date', 'title', 'detail', 'link'] };
const blank = (kind, date) => Object.fromEntries(FIELDS[kind].map(k => [k, k === 'date' ? date || '' : '']));

function useSave() {
  const router = useRouter();
  const [busy, setBusy] = useState(false), [err, setErr] = useState(''), [fields, setFields] = useState({});
  const run = async (body, done) => {
    setBusy(true); setErr(''); setFields({});
    try { await post(body); done?.(); router.refresh(); }
    catch (e) { setErr(e.message); setFields(e.fields || {}); }
    setBusy(false);
  };
  return { busy, err, fields, run };
}

function Form({ kind, v, set, fields }) {
  const f = (k, label, input, hint) => (
    <label className="ops-my-f">
      <span>{label}{hint && <small> · {hint}</small>}</span>
      {input}
      {fields[k] && <em className="hint err">{fields[k]}</em>}
    </label>
  );
  const on = k => e => set({ ...v, [k]: e.target.value });
  return (<div className="ops-my-fields">
    {f('date', kind === 'task' ? 'Due' : 'Date', <input type="date" value={v.date} onChange={on('date')} required />, kind === 'task' ? 'shows on the mentees’ “This month” list for that month' : '')}
    {kind === 'step' && f('project', 'Project', <select value={v.project} onChange={on('project')}><option value="">Choose…</option>{PROJECTS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>)}
    {f('title', 'Title', <input value={v.title} onChange={on('title')} maxLength={140} placeholder={kind === 'task' ? 'e.g. Watch the orientation recording' : ''} />)}
    {f('detail', kind === 'task' ? 'A line under it' : 'What to do', <textarea rows={3} value={v.detail} onChange={on('detail')} maxLength={1200} />, 'optional')}
    {kind === 'step' && f('evidence', 'Evidence', <input value={v.evidence} onChange={on('evidence')} maxLength={200} placeholder="e.g. Shortlist brought to your one-to-one" />, 'optional')}
    {kind === 'task' && f('link', 'Link', <input type="url" value={v.link} onChange={on('link')} placeholder="https://ss.embodiedphilosophy.com/…" />, 'optional: gives the task an “Open” button')}
  </div>);
}

// "Edit" on an existing step or task: change it, or take it off the mentees' page
export function EditItem({ kind, item }) {
  const start = Object.fromEntries(FIELDS[kind].map(k => [k, String(item[k] ?? '')]));
  const [open, setOpen] = useState(false), [v, set] = useState(start);
  const s = useSave();
  if (!open) return <button type="button" className="chip ops-my-editbtn" onClick={() => { set(start); setOpen(true); }}>Edit</button>;
  return (<div className="ops-my-edit">
    <Form kind={kind} v={v} set={set} fields={s.fields} />
    {s.err && <p className="hint err" role="alert">{s.err}</p>}
    <div className="ops-my-acts">
      <button type="button" className="chip primary" disabled={s.busy} onClick={() => s.run({ what: kind, id: item.id, values: v, before: start }, () => setOpen(false))}>{s.busy ? 'Saving…' : 'Save'}</button>
      <button type="button" className="chip" disabled={s.busy} onClick={() => setOpen(false)}>Cancel</button>
      <button type="button" className="chip danger" disabled={s.busy} onClick={() => { if (window.confirm(`Take “${item.title}” off the mentees’ page? Ticks are kept, and you can put it back from the list at the bottom.`)) s.run({ what: kind, id: item.id, hide: true }); }}>Remove from mentee page</button>
    </div>
  </div>);
}

// "+ Add a task" / "+ Add a project step"
export function AddItem({ kind, date = '', label }) {
  const [open, setOpen] = useState(false), [v, set] = useState(blank(kind, date));
  const s = useSave();
  if (!open) return <button type="button" className="chip ops-my-addbtn" onClick={() => { set(blank(kind, date)); setOpen(true); }}>+ {label || (kind === 'task' ? 'Add a task' : 'Add a project step')}</button>;
  return (<div className="ops-my-edit">
    <h4>{kind === 'task' ? 'New task for every mentee' : 'New project step'}</h4>
    <Form kind={kind} v={v} set={set} fields={s.fields} />
    {s.err && <p className="hint err" role="alert">{s.err}</p>}
    <div className="ops-my-acts">
      <button type="button" className="chip primary" disabled={s.busy} onClick={() => s.run({ what: kind, values: v }, () => setOpen(false))}>{s.busy ? 'Adding…' : kind === 'task' ? 'Add to the mentee page' : 'Add step'}</button>
      <button type="button" className="chip" disabled={s.busy} onClick={() => setOpen(false)}>Cancel</button>
    </div>
  </div>);
}

// Put a removed step or task back on the mentees' page
export function ShowAgain({ kind, id }) {
  const s = useSave();
  return (<>{' '}<button type="button" className="chip" disabled={s.busy} onClick={() => s.run({ what: kind, id, show: true })}>{s.busy ? 'Putting back…' : 'Put back'}</button>{s.err && <em className="hint err"> {s.err}</em>}</>);
}

// A month's theme and focus (what mentees see under "This month")
export function EditMonth({ month, theme, focus }) {
  const [open, setOpen] = useState(false), [v, set] = useState({ theme, focus });
  const s = useSave();
  if (!open) return <button type="button" className="chip ops-my-editbtn" onClick={() => { set({ theme, focus }); setOpen(true); }}>Edit theme</button>;
  return (<div className="ops-my-edit">
    <div className="ops-my-fields">
      <label className="ops-my-f"><span>Theme <small>· shown in italics under “This month” on the mentee page</small></span><input value={v.theme} onChange={e => set({ ...v, theme: e.target.value })} maxLength={160} /></label>
      <label className="ops-my-f"><span>Focus <small>· staff view</small></span><textarea rows={3} value={v.focus} onChange={e => set({ ...v, focus: e.target.value })} maxLength={600} /></label>
    </div>
    {s.err && <p className="hint err" role="alert">{s.err}</p>}
    <div className="ops-my-acts">
      <button type="button" className="chip primary" disabled={s.busy} onClick={() => s.run({ what: 'month', values: { month, ...v } }, () => setOpen(false))}>{s.busy ? 'Saving…' : 'Save'}</button>
      <button type="button" className="chip" disabled={s.busy} onClick={() => setOpen(false)}>Cancel</button>
    </div>
  </div>);
}
