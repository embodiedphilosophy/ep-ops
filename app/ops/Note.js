'use client';
import { useState } from 'react';

// "From Jacob": one pinned line, the one dark element on Today. Directors edit it inline; everyone else just reads it.
export default function Note({ note, editable, author }) {
  const [text, setText] = useState(note.text);
  const [draft, setDraft] = useState(note.text);
  const [editing, setEditing] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  if (!text && !editable) return null;
  const save = async () => {
    setBusy(true); setErr('');
    const res = await fetch('/api/ops/note', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: draft }) }).catch(() => null);
    const j = await res?.json().catch(() => ({}));
    setBusy(false);
    if (!res?.ok) return setErr(j?.error || 'Couldn’t save, try again');
    setText(draft.trim()); setEditing(false);
  };
  if (editing) return (
    <div className="ops-pin is-editing">
      <input value={draft} onChange={e => setDraft(e.target.value)} maxLength={400} placeholder="This week’s priorities, in one line (leave empty to hide)" autoFocus
        onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false); }} />
      <button className="chip" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
      <button className="chip" onClick={() => { setDraft(text); setEditing(false); }} disabled={busy}>Cancel</button>
      {err && <span className="err">{err}</span>}
    </div>
  );
  return (
    <div className={`ops-pin${text ? '' : ' is-empty'}`}>
      <span className="who">From {author}</span>
      <span className="txt">{text || 'No note this week. Add one line of priorities for the team.'}</span>
      {editable && <button className="chip" onClick={() => { setDraft(text); setEditing(true); }}>{text ? 'Edit' : 'Add'}</button>}
    </div>
  );
}
