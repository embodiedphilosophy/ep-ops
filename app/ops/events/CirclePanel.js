'use client';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';

const short = d => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
const CHANGE = { starts_at: 'time', duration_in_seconds: 'length', name: 'name', body: 'description' };
// One session's state in Circle: dot colour + word
function stateOf(s) {
  if (s.action === 'create') return ['', 'Not in Circle yet'];
  if (s.changes.length) return ['amber', `Changes to push: ${s.changes.map(c => CHANGE[c] || c).join(', ')}`];
  if (s.status === 'draft') return ['amber', 'Draft: members can’t see it yet'];
  return ['green', 'Live in Circle'];
}

// Events drawer → Circle: what each session looks like in Circle, and one button to publish it there.
// ids: the drawer's event IDs. Editors only (the API checks too).
export default function CirclePanel({ ids }) {
  const router = useRouter();
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState('');
  const [result, setResult] = useState(null);
  const q = ids.join(',');

  const load = useCallback(async () => {
    setErr('');
    const res = await fetch(`/api/ops/circle-push?ids=${encodeURIComponent(q)}`).catch(() => null);
    const j = await res?.json().catch(() => ({}));
    if (!res?.ok) { setErr(j?.error || 'Couldn’t reach Circle. Try again shortly.'); setData(null); return; }
    setData(j);
  }, [q]);
  useEffect(() => { load(); }, [load]);

  const run = async (action, confirmText) => {
    if (!confirm(confirmText)) return;
    setBusy(action); setResult(null);
    const res = await fetch('/api/ops/circle-push', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, ids }) }).catch(() => null);
    const j = await res?.json().catch(() => ({}));
    setBusy('');
    setResult(res ? { done: j.done || [], errors: j.errors || (j.error ? [j.error] : []) } : { done: [], errors: ['Couldn’t reach the dashboard. Try again.'] });
    await load(); router.refresh();
  };

  if (err) return (<><h3>Circle</h3><p className="hint">{err} <button className="chip" onClick={load}>Try again</button></p></>);
  if (!data) return (<><h3>Circle</h3><p className="hint">Checking Circle…</p></>);

  const { sessions, course, live } = data;
  // Before a standalone course has its spaces, "no Circle space chosen" is expected: the set-up button fixes it
  const flags = course && !course.has ? data.flags.filter(f => !/No Circle space chosen/.test(f)) : data.flags;
  const waiting = sessions.filter(s => s.action === 'create' || s.changes.length || s.status === 'draft').length;
  const needsCourse = course && !course.has;
  const space = [...new Set(sessions.map(s => s.space))].join(', ');
  const live_n = sessions.length - waiting;

  return (<>
    <h3>Circle <span>{sessions.length ? `${live_n} of ${sessions.length} live` : ''}</span></h3>
    {!live && <p className="ops-note">Circle is switched off for the dashboard, so this only shows what would happen. Turn it on with CIRCLE_EVENT_SYNC=live in Vercel.</p>}

    {course && (
      <div className="ops-circle-course">
        {course.has
          ? <p className="hint">{course.hidden === false
            ? 'This course has its own course space and live-sessions space in Circle, visible to their members.'
            : 'This course has its own course space and live-sessions space in Circle. They stay hidden until you push.'}</p>
          : <>
            <p className="hint">A standalone course: it needs its own home in Circle first. This makes a hidden course space (a draft lesson per session) and a hidden live-sessions space.</p>
            <button className="chip" disabled={!live || !!busy} onClick={() => run('setup', 'Make this course’s spaces in Circle? They stay hidden, and members aren’t told, until you push to Circle.')}>
              {busy === 'setup' ? 'Setting up…' : 'Set up course in Circle'}
            </button>
          </>}
      </div>
    )}

    {sessions.length > 0 && (
      <ul className="ops-checks ops-circle">
        {sessions.map(s => { const [cls, word] = stateOf(s); return (
          <li key={`${s.id}-${s.day}`} className={cls === 'green' ? 'ok' : 'todo'}>
            <span className={`dot ${cls}`} aria-hidden="true" />
            <span>{short(s.day)} · {word}
              <span className="sub"> · {s.space}{s.url ? <> · <a href={s.url} target="_blank" rel="noopener">Open in Circle</a></> : ''}</span></span>
          </li>); })}
      </ul>
    )}
    {flags.length > 0 && <ul className="ops-circle-flags">{flags.map((f, i) => <li key={i} className="hint">{f}</li>)}</ul>}

    {(sessions.length > 0 || (course && course.has)) && (
      <p className="ops-edit-open">
        <button className="chip primary" disabled={!live || !!busy || needsCourse || (!waiting && !(course?.has && course.hidden !== false))}
          onClick={() => run('push', `Push to Circle? ${waiting ? `${waiting} session${waiting === 1 ? '' : 's'} will be made or updated and published in ${space}` : 'Everything is published; this re-checks it'}${course?.has ? ', and the course space and its lessons become visible to members' : ''}.`)}>
          {busy === 'push' ? 'Pushing…' : 'Push to Circle'}
        </button>
        {needsCourse && <span className="hint"> Set up the course first.</span>}
        {!needsCourse && !waiting && sessions.length > 0 && !(course?.has && course.hidden !== false) && <span className="hint"> Everything is live.</span>}
      </p>
    )}
    {result && (
      <div className="ops-note">
        {result.done.map((d, i) => <p key={i}>{d}</p>)}
        {result.errors.map((d, i) => <p key={`e${i}`}><b>Didn’t work:</b> {d}</p>)}
        {!result.done.length && !result.errors.length && <p>Nothing needed changing.</p>}
      </div>
    )}
  </>);
}
