'use client';
import { useState } from 'react';
const fmt = d => d ? new Date(d + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' }) : 'No date';

export default function TaskList({ tasks, empty, showWho, done }) {
  const [state, setState] = useState({});
  if (!tasks.length) return <p className="ops-empty">{empty}</p>;
  const complete = async id => {
    setState(s => ({ ...s, [id]: 'saving' }));
    const res = await fetch('/api/ops/complete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) }).catch(() => null);
    setState(s => ({ ...s, [id]: res?.ok ? 'done' : 'error' }));
  };
  return (
    <ul className="ops-tasks">
      {tasks.map(t => {
        const st = done ? 'done' : state[t.id];
        return (
          <li key={t.id} className={st === 'done' ? 'is-done' : ''}>
            <label>
              <input type="checkbox" checked={st === 'done'} disabled={done || st === 'saving' || st === 'done'} onChange={() => complete(t.id)} />
              <span className="n">{t.name}</span>
            </label>
            <span className="meta">{fmt(t.due)}{showWho && t.labels.length ? ` · ${t.labels.join(', ')}` : ''}{st === 'error' ? ' · couldn’t save, try again' : ''}</span>
          </li>
        );
      })}
    </ul>
  );
}
