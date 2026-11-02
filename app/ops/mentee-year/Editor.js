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

// ---- the month list: one Edit per row, the fields depending on what the row is ----
const SPEC = {
  immersion: [['name', 'Name of the weekend', 'text'], ['date', 'Saturday', 'date'], ['end', 'Sunday', 'date'], ['link', 'Prepare lesson link', 'url', 'the “Open the Prepare lesson” button; leave blank to use the Workbook’s own lesson'], ['sat_link', 'Saturday Open Session link (Zoom)', 'url', 'the whole school'], ['sun_link', 'Sunday Practicum link (Zoom)', 'url', 'mentees only'], ['line', 'Line under it', 'long', 'optional']],
  words: [['title', 'Title', 'text'], ['line', 'Line under it', 'long']],
  window: [['date', 'Booking window opens', 'date'], ['end', 'Window closes', 'date'], ['title', 'Title', 'text'], ['line', 'Line under it', 'long']],
  reflection: [['due', 'Due', 'date'], ['title', 'Title', 'text'], ['line', 'Line under it', 'long']],
  book: [['title', 'Book title', 'text'], ['author', 'Author', 'text'], ['note', 'A line under it', 'text', 'optional'], ['kind', 'Kind', 'kind'], ['starts', 'Reading starts', 'date', 'the book shows in the month of this date']],
};
const startOf = (row, kind) => kind === 'immersion' ? { name: row.name, date: row.date, end: row.end, link: row.link, sat_link: row.satLink, sun_link: row.sunLink, line: row.line }
  : kind === 'window' ? { date: row.date, end: row.end, title: row.title, line: row.line }
    : kind === 'reflection' ? { due: row.date, title: row.title, line: row.line }
      : kind === 'book' ? { ...row.book } : { title: row.title, line: row.line };

function Fields({ spec, v, set, fields }) {
  return (<div className="ops-my-fields">{spec.map(([k, label, type, hint]) => (
    <label key={k} className="ops-my-f"><span>{label}{hint && <small> · {hint}</small>}</span>
      {type === 'long' ? <textarea rows={2} value={v[k] || ''} onChange={e => set({ ...v, [k]: e.target.value })} maxLength={600} />
        : type === 'kind' ? <select value={v[k] || 'required'} onChange={e => set({ ...v, [k]: e.target.value })}><option value="required">Required (the reflection is on it)</option><option value="suggested">Suggested</option></select>
          : <input type={type === 'date' ? 'date' : type === 'url' ? 'url' : 'text'} value={v[k] || ''} onChange={e => set({ ...v, [k]: e.target.value })} maxLength={type === 'text' ? 160 : undefined} />}
      {fields[k] && <em className="hint err">{fields[k]}</em>}</label>))}</div>);
}

export function RowEdit({ month, row }) {
  const kind = row.edit, spec = SPEC[kind];
  const [open, setOpen] = useState(false), [v, set] = useState({});
  const s = useSave();
  const hideable = ['immersion', 'words', 'window', 'reflection'].includes(kind);
  const body = vals => kind === 'book' ? { what: 'book', month, original: { title: row.book.title, starts: row.book.starts }, values: vals }
    : kind === 'reflection' ? { what: 'reflection', values: { month, ...vals } }
      : { what: 'row', values: { month, row: row.key, ...(kind === 'immersion' ? { title: vals.name, line: vals.line, date: vals.date, end: vals.end, link: vals.link, sat_link: vals.sat_link, sun_link: vals.sun_link } : vals) } };
  if (row.hidden) return <button type="button" className="chip ops-my-editbtn" disabled={s.busy} onClick={() => s.run({ what: 'row', values: { month, row: row.key }, show: true })}>{s.busy ? 'Putting back…' : 'Put back on the mentee page'}</button>;
  if (!spec) return null;
  if (!open) return <button type="button" className="chip ops-my-editbtn" onClick={() => { set(startOf(row, kind)); setOpen(true); }}>Edit</button>;
  return (<div className="ops-my-edit">
    <Fields spec={spec} v={v} set={set} fields={s.fields} />
    {s.err && <p className="hint err" role="alert">{s.err}</p>}
    <div className="ops-my-acts">
      <button type="button" className="chip primary" disabled={s.busy} onClick={() => s.run(body(v), () => setOpen(false))}>{s.busy ? 'Saving…' : 'Save'}</button>
      <button type="button" className="chip" disabled={s.busy} onClick={() => setOpen(false)}>Cancel</button>
      {hideable && <button type="button" className="chip danger" disabled={s.busy} onClick={() => { if (window.confirm(`Take “${row.title}” off the mentees’ page for this month? You can put it back.`)) s.run({ what: 'row', values: { month, row: row.key }, hide: true }, () => setOpen(false)); }}>Remove from mentee page</button>}
      {kind === 'book' && <button type="button" className="chip danger" disabled={s.busy} onClick={() => { if (window.confirm(`Take “${row.book.title}” off the reading list?`)) s.run({ what: 'book', month, original: { title: row.book.title, starts: row.book.starts }, hide: true }, () => setOpen(false)); }}>Take off the reading list</button>}
    </div>
  </div>);
}

export function AddBook({ month, starts }) {
  const [open, setOpen] = useState(false), [v, set] = useState({});
  const s = useSave();
  const fresh = { title: '', author: '', note: '', kind: 'required', starts };
  if (!open) return <button type="button" className="chip ops-my-addbtn" onClick={() => { set(fresh); setOpen(true); }}>+ Add a book</button>;
  return (<div className="ops-my-edit">
    <h4>New book for this month</h4>
    <Fields spec={SPEC.book} v={v} set={set} fields={s.fields} />
    {s.err && <p className="hint err" role="alert">{s.err}</p>}
    <div className="ops-my-acts">
      <button type="button" className="chip primary" disabled={s.busy} onClick={() => s.run({ what: 'book', month, values: v }, () => setOpen(false))}>{s.busy ? 'Adding…' : 'Add to the reading list'}</button>
      <button type="button" className="chip" disabled={s.busy} onClick={() => setOpen(false)}>Cancel</button>
    </div>
  </div>);
}

// ↑ ↓ on a row of the month list: saves the whole order (mentees see the same order in Circle and on their Your Year page)
export function Move({ month, keys, index }) {
  const s = useSave();
  const go = d => { const k = [...keys], j = index + d; [k[index], k[j]] = [k[j], k[index]]; s.run({ what: 'order', month, keys: k }); };
  return (<span className="ops-my-move">
    <button type="button" className="chip" aria-label="Move up" title="Move up" disabled={s.busy || index === 0} onClick={() => go(-1)}>↑</button>
    <button type="button" className="chip" aria-label="Move down" title="Move down" disabled={s.busy || index === keys.length - 1} onClick={() => go(1)}>↓</button>
    {s.err && <em className="hint err"> {s.err}</em>}
  </span>);
}
