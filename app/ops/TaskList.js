'use client';
import { useState } from 'react';
const fmt = d => d ? new Date(d + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' }) : 'No date';
// Days a due date is behind today in New York (the dashboard's day, as todayET), 0 when not late
const todayNY = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
const daysLate = d => { if (!d) return 0; const n = Math.round((Date.parse(todayNY()) - Date.parse(d)) / 864e5); return n > 0 ? n : 0; };
const firstNames = list => list.map(n => n.split(' ')[0]).join(', ');
// "[Marketing] Promo email #1" → role "Marketing", text "Promo email #1"
// Automatic ticks can be undone for a week (matches UNDO_DAYS in lib/ops/autocomplete)
const undoable = auto => !!auto && Date.now() - Date.parse(auto + 'T12:00:00Z') < 7 * 864e5;
const splitRole = name => { const m = String(name).match(/^\[([^\]]+)\]\s*/); return m ? [m[1], name.slice(m[0].length)] : ['', name]; };

async function post(body) {
  const res = await fetch('/api/ops/task', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).catch(() => null);
  const j = await res?.json().catch(() => ({}));
  if (!res?.ok) throw new Error(j?.error || 'Couldn’t save, try again');
  return j;
}

// One task's actions: snooze, blocked, comments (and assign, on the director's triage list)
function Actions({ t, team, assign, onChange }) {
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const [who, setWho] = useState('');
  const [to, setTo] = useState('');
  const [note, setNote] = useState('');
  const [comments, setComments] = useState(null);
  const [text, setText] = useState('');
  const [until, setUntil] = useState('');
  const today = new Date().toISOString().slice(0, 10);
  const run = async (label, body, after) => {
    setBusy(label); setErr('');
    try { const j = await post({ id: t.id, ...body }); after?.(j); } catch (e) { setErr(e.message); }
    setBusy('');
  };
  const loadComments = async () => {
    setComments('loading');
    const res = await fetch(`/api/ops/task?id=${encodeURIComponent(t.id)}`).catch(() => null);
    const j = await res?.json().catch(() => ({}));
    setComments(res?.ok ? j.comments : []);
  };
  return (
    <div className="ops-act">
      {assign ? (
        <div className="row">
          <span className="lbl">Assign to</span>
          <select value={to} onChange={e => setTo(e.target.value)}>
            <option value="">Choose…</option>
            {team.map(n => <option key={n}>{n}</option>)}
          </select>
          <button className="chip" disabled={!to || !!busy} onClick={() => run('assign', { action: 'assign', who: to }, () => onChange({ assigned: to }))}>Assign</button>
          <span className="hint">Teachers: add them in the Master Schedule and the task moves to them on the next sync.</span>
        </div>
      ) : null}
      <div className="row">
        <span className="lbl">Snooze</span>
        {[[1, '1 day'], [3, '3 days'], [7, '1 week']].map(([d, l]) => (
          <button key={d} className="chip" disabled={!!busy} onClick={() => run('snooze', { action: 'snooze', days: d }, j => onChange({ due: j.due }))}>{l}</button>
        ))}
        <input type="date" value={until} min={today} onChange={e => setUntil(e.target.value)} aria-label="Snooze until" style={{ flex: '0 0 auto' }} />
        <button className="chip" disabled={!until || !!busy} onClick={() => run('snooze', { action: 'snooze', date: until }, j => onChange({ due: j.due }))}>Snooze to date</button>
      </div>
      <div className="row">
        <span className="lbl">Blocked</span>
        {t.blockedOn ? (
          <button className="chip" disabled={!!busy} onClick={() => run('unblock', { action: 'unblock' }, () => onChange({ blockedOn: '' }))}>Clear block (waiting on {t.blockedOn.split(' ')[0]})</button>
        ) : (<>
          <select value={who} onChange={e => setWho(e.target.value)} aria-label="Waiting on">
            <option value="">Waiting on…</option>
            {team.map(n => <option key={n}>{n}</option>)}
          </select>
          <input value={note} onChange={e => setNote(e.target.value)} placeholder="What do you need? (optional)" />
          <button className="chip" disabled={!who || !!busy} onClick={() => run('block', { action: 'block', who, text: note }, j => onChange({ blockedOn: j.blockedOn }))}>Mark blocked</button>
        </>)}
      </div>
      <div className="row col">
        {comments === null ? <button className="chip" onClick={loadComments}>Show comments</button>
          : comments === 'loading' ? <span className="hint">Loading comments…</span>
          : comments.length === 0 ? <span className="hint">No comments yet.</span>
          : <ul className="ops-comments">{comments.map(c => <li key={c.id}>{c.content.replace(/<[^>]+>/g, '').replace(/\*\*/g, '')}</li>)}</ul>}
        <div className="row">
          <input value={text} onChange={e => setText(e.target.value)} placeholder="Add a comment" />
          <button className="chip" disabled={!text.trim() || !!busy} onClick={() => run('comment', { action: 'comment', text }, () => {
            setComments(c => [...(Array.isArray(c) ? c : []), { id: Date.now(), content: `You: ${text}` }]); setText('');
          })}>Post</button>
        </div>
      </div>
      {busy && <span className="hint">Saving…</span>}
      {err && <span className="hint err">{err}</span>}
    </div>
  );
}

// short: the list sits under its event's heading, so drop the " — Event (date)" part of each name
export default function TaskList({ tasks, empty, showWho, done, team = [], roleNames = {}, assign = false, short = false }) {
  const [state, setState] = useState({});
  const [open, setOpen] = useState('');
  const [patch, setPatch] = useState({});
  if (!tasks.length) return <p className="ops-empty">{empty}</p>;
  const complete = async id => {
    setState(s => ({ ...s, [id]: 'saving' }));
    const res = await fetch('/api/ops/complete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) }).catch(() => null);
    setState(s => ({ ...s, [id]: res?.ok ? 'done' : 'error' }));
  };
  const undo = async id => {
    setState(s => ({ ...s, [id]: 'saving' }));
    try { await post({ id, action: 'undo' }); setState(s => ({ ...s, [id]: 'undone' })); }
    catch { setState(s => ({ ...s, [id]: 'error' })); }
  };
  // The most common move after Done, one click from the row (the rest stay behind ⋯)
  const bump = async t => {
    setState(s => ({ ...s, [t.id]: 'saving' }));
    try { const j = await post({ id: t.id, action: 'snooze', days: 1 }); setPatch(s => ({ ...s, [t.id]: { ...(s[t.id] || {}), due: j.due } })); setState(s => ({ ...s, [t.id]: '' })); }
    catch { setState(s => ({ ...s, [t.id]: 'error' })); }
  };
  const who = labels => labels.map(l => roleNames[l]?.length ? `${l} (${firstNames(roleNames[l])})` : l).join(', ');
  return (
    <ul className="ops-tasks">
      {tasks.map(t0 => {
        const t = { ...t0, ...(patch[t0.id] || {}) };
        const st = done ? (['undone', 'saving', 'error'].includes(state[t.id]) ? state[t.id] : 'done') : state[t.id];
        const moved = t.assigned || (t.due !== t0.due && t.due);
        const [role, rest] = splitRole(short ? t.name.split(' — ')[0] : t.name);
        // The owner column already names the role when showWho is on
        const showRole = role && !(showWho && t.labels.includes(role));
        return (
          <li key={t.id} className={[st === 'done' ? 'is-done' : '', t.blockedOn ? 'is-blocked' : '', moved ? 'is-moved' : ''].join(' ')}>
            <div className="main">
              <label>
                <input type="checkbox" checked={st === 'done' || (done && st !== 'undone')} disabled={done || st === 'saving' || st === 'done'} onChange={() => complete(t.id)} />
                <span className="n">{showRole && <span className="role">{role}</span>}{rest}{t.escalated && <span className="esc"> · {t.escalated}</span>}</span>
              </label>
              <span className="meta">
                {!done && st !== 'done' && daysLate(t.due) ? <span className="late">{daysLate(t.due) === 1 ? '1 day late' : `${daysLate(t.due)} days late`}</span> : fmt(t.due)}
                {t.assigned ? ` · now with ${t.assigned}` : showWho && t.labels.length ? ` · ${who(t.labels)}` : ''}
                {t.blockedOn && <span className="blk"> · Waiting on {t.blockedOn.split(' ')[0]}</span>}
                {st === 'error' ? ' · couldn’t save, try again' : ''}
                {done && t.auto && st !== 'undone' && <span className="auto"> · Done · auto</span>}
                {done && st === 'undone' && ' · reopened'}
                {done && undoable(t.auto) && st !== 'undone' && (
                  <button className="more" disabled={st === 'saving'} onClick={() => undo(t.id)}>Undo</button>
                )}
                {!done && st !== 'done' && !t.blockedOn && (
                  <span className="quick"><button className="more" disabled={st === 'saving'} onClick={() => bump(t)}>+1 day</button></span>
                )}
                {!done && st !== 'done' && (
                  <button className="more" aria-expanded={open === t.id} aria-label="Task actions" onClick={() => setOpen(o => o === t.id ? '' : t.id)}>⋯</button>
                )}
              </span>
            </div>
            {open === t.id && <Actions t={t} team={team} assign={assign} onChange={p => setPatch(s => ({ ...s, [t.id]: { ...(s[t.id] || {}), ...p } }))} />}
          </li>
        );
      })}
    </ul>
  );
}
