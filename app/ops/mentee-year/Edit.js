'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

// Small "Edit" buttons for the mentee year page. They only draw when `can` is true; saving goes to /api/ops/mentee-year and the page reloads its data.
async function send(body) {
  const res = await fetch('/api/ops/mentee-year', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).catch(() => null);
  const j = await res?.json().catch(() => ({}));
  return res?.ok ? null : (j?.error || 'Couldn’t save. Try again.');
}
const HINT = 'Use **bold**, _italic_, ~quiet~ and ^dates^ for emphasis.';

// A piece of text with an Edit button beside it. children = how it is shown now; value = the raw text to edit.
export function E({ can, path, value, long, rich, children, label }) {
  const router = useRouter();
  const [open, setOpen] = useState(false), [draft, setDraft] = useState(value || ''), [err, setErr] = useState(''), [busy, setBusy] = useState(false);
  if (!can) return children;
  const save = async v => { setBusy(true); setErr(''); const e = await send({ kind: 'text', path, value: v }); setBusy(false); if (e) return setErr(e); setOpen(false); router.refresh(); };
  if (open) return (
    <span className="ops-my-edit open">
      {long ? <textarea aria-label={label || 'Edit text'} rows={4} value={draft} onChange={e => setDraft(e.target.value)} maxLength={1500} autoFocus /> : <input aria-label={label || 'Edit text'} value={draft} onChange={e => setDraft(e.target.value)} maxLength={1500} autoFocus />}
      {rich && <small>{HINT}</small>}
      <span className="acts"><button type="button" className="chip primary" disabled={busy} onClick={() => save(draft)}>{busy ? 'Saving…' : 'Save'}</button>
        <button type="button" className="chip" disabled={busy} onClick={() => { setDraft(value || ''); setOpen(false); setErr(''); }}>Cancel</button>
        <button type="button" className="chip" disabled={busy} title="Go back to the original wording" onClick={() => save('')}>Reset</button></span>
      {err && <small className="err" role="alert">{err}</small>}
    </span>
  );
  return <>{children}<button type="button" className="ops-my-pen" aria-label={`Edit ${label || 'this text'}`} onClick={() => { setDraft(value || ''); setOpen(true); }}>Edit</button></>;
}

// A dated project step: title, what it is, the evidence, the date and which project. Saves to the Mentee Schedule tab, which the mentee page reads.
export function EditStep({ can, step }) {
  const router = useRouter();
  const start = { title: step.title || '', detail: step.detail || '', evidence: step.evidence || '', date: step.date, project: step.project };
  const [open, setOpen] = useState(false), [f, setF] = useState(start), [err, setErr] = useState(''), [busy, setBusy] = useState(false);
  if (!can) return null;
  const set = k => e => setF(x => ({ ...x, [k]: e.target.value }));
  const save = async () => {
    const changes = {}, before = {}; for (const k of Object.keys(start)) if (f[k] !== start[k]) { changes[k] = f[k]; before[k] = start[k]; }
    if (!Object.keys(changes).length) return setOpen(false);
    setBusy(true); setErr(''); const e = await send({ kind: 'step', id: step.id, changes, before }); setBusy(false);
    if (e) return setErr(e); setOpen(false); router.refresh();
  };
  if (!open) return <button type="button" className="ops-my-pen" aria-label={`Edit the step ${step.title}`} onClick={() => { setF(start); setOpen(true); }}>Edit step</button>;
  return (
    <div className="ops-my-edit open form">
      <label>Title<input value={f.title} onChange={set('title')} maxLength={200} /></label>
      <label>What it is<textarea rows={3} value={f.detail} onChange={set('detail')} maxLength={700} /></label>
      <label>Evidence (what the mentee brings)<input value={f.evidence} onChange={set('evidence')} maxLength={700} /></label>
      <div className="row"><label>Due date<input type="date" value={f.date} onChange={set('date')} /></label>
        <label>Project<select value={f.project} onChange={set('project')}><option value="both">Both projects</option><option value="talk">60-minute talk</option><option value="offering">Three-session offering</option></select></label></div>
      <small>Mentees see the change on their page straight away.</small>
      <span className="acts"><button type="button" className="chip primary" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save'}</button><button type="button" className="chip" disabled={busy} onClick={() => { setOpen(false); setErr(''); }}>Cancel</button></span>
      {err && <small className="err" role="alert">{err}</small>}
    </div>
  );
}

// A month's theme, focus and reflection due date (the Mentee Months tab)
export function EditMonth({ can, id, theme, focus, reflectionDue }) {
  const router = useRouter();
  const start = { theme: theme || '', focus: focus || '', reflection_due: reflectionDue || '' };
  const [open, setOpen] = useState(false), [f, setF] = useState(start), [err, setErr] = useState(''), [busy, setBusy] = useState(false);
  if (!can) return null;
  const set = k => e => setF(x => ({ ...x, [k]: e.target.value }));
  const save = async () => {
    const changes = {}, before = {}; for (const k of Object.keys(start)) if (f[k] !== start[k]) { changes[k] = f[k]; before[k] = start[k]; }
    if (!Object.keys(changes).length) return setOpen(false);
    setBusy(true); setErr(''); const e = await send({ kind: 'month', id, changes, before }); setBusy(false);
    if (e) return setErr(e); setOpen(false); router.refresh();
  };
  if (!open) return <button type="button" className="ops-my-pen" aria-label="Edit this month’s theme and focus" onClick={() => { setF(start); setOpen(true); }}>Edit theme and focus</button>;
  return (
    <div className="ops-my-edit open form">
      <label>Theme<input value={f.theme} onChange={set('theme')} maxLength={600} /></label>
      <label>Focus<textarea rows={3} value={f.focus} onChange={set('focus')} maxLength={600} /></label>
      <label>Reflection due (blank = the last Monday of the month)<input type="date" value={f.reflection_due} onChange={set('reflection_due')} /></label>
      <small>Mentees see the change on their page straight away.</small>
      <span className="acts"><button type="button" className="chip primary" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save'}</button><button type="button" className="chip" disabled={busy} onClick={() => { setOpen(false); setErr(''); }}>Cancel</button></span>
      {err && <small className="err" role="alert">{err}</small>}
    </div>
  );
}
