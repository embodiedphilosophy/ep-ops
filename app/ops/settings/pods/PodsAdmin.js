'use client';
import { useEffect, useState } from 'react';

const day = iso => iso ? new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : '';

// Three jobs: (1) students asking to lead a pod, approve or decline; (2) begun pods that need a chat: make a small-group chat in Circle,
// paste its link; (3) every pod and who is in it. Circle does not let the website create group chats, so (2) is done by hand.
export default function PodsAdmin() {
  const [data, setData] = useState(null);
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState('');
  const [links, setLinks] = useState({});

  const load = async () => {
    const res = await fetch('/api/ops/pods').catch(() => null);
    const j = await res?.json().catch(() => ({}));
    setData(res?.ok ? j : { error: j?.error || 'Couldn’t load the pods. Try again.' });
  };
  useEffect(() => { load(); }, []);
  const act = async (key, body, ok) => {
    setBusy(key); setMsg(null);
    const res = await fetch('/api/ops/pods', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).catch(() => null);
    const j = await res?.json().catch(() => ({}));
    setBusy('');
    if (!res?.ok) { setMsg({ error: j?.error || 'Couldn’t save. Try again.' }); return; }
    setData(j); setMsg({ ok });
  };

  if (!data) return <p className="ops-empty">Loading…</p>;
  if (data.error) return <p className="ops-empty">{data.error} <button className="chip" onClick={load}>Try again</button></p>;
  const waiting = data.leaders.filter(l => l.status === 'applied'), approved = data.leaders.filter(l => l.status === 'approved');
  const needChat = data.pods.filter(p => p.needsChat), running = data.pods.filter(p => ['open', 'active'].includes(p.status) && !p.needsChat);

  return (
    <section className="ops-pods">
      <p className="ops-empty">Students on the Sādhana School dashboard (Study pods tab) can ask to lead a study pod. You approve leaders here. A pod begins when {data.min} students have joined (the leader counts) and holds up to {data.max}.</p>
      {!data.enabled && <p className="ops-empty" role="alert"><strong>Study pods are switched off for students.</strong> You can set things up here first. To open them to students, set <code>STUDY_PODS</code> to <code>on</code> in Vercel (Settings → Environment Variables) and redeploy.</p>}
      {msg?.error && <p className="ops-empty" role="alert">{msg.error}</p>}
      {msg?.ok && <p className="ops-empty" role="status">{msg.ok}</p>}

      <h2>Asking to lead a pod ({waiting.length})</h2>
      {!waiting.length && <p className="ops-empty">No one is waiting.</p>}
      <ul className="ops-site-rows">
        {waiting.map(l => (
          <li key={l.uid} style={{ padding: '10px 0' }}>
            <strong>{l.name}</strong> <span className="ops-empty">{l.email} · asked {day(l.at)}</span>
            <div style={{ whiteSpace: 'pre-wrap', margin: '4px 0 8px' }}>{l.note}</div>
            <button className="chip primary" disabled={!!busy} onClick={() => act('a' + l.uid, { action: 'approve', uid: l.uid }, `${l.name} can now start pods.`)}>Approve</button>{' '}
            <button className="chip" disabled={!!busy} onClick={() => confirm(`Decline ${l.name}’s request? They can ask again later.`) && act('d' + l.uid, { action: 'decline', uid: l.uid }, 'Declined.')}>Decline</button>
          </li>
        ))}
      </ul>

      <h2>Pods that need a chat ({needChat.length})</h2>
      <p className="ops-empty">These pods have begun. In Circle, make a small group chat with the members listed, then paste the chat’s link. The members see it on their pod straight away.</p>
      {!needChat.length && <p className="ops-empty">None right now.</p>}
      <ul className="ops-site-rows">
        {needChat.map(p => (
          <li key={p.id} style={{ padding: '10px 0' }}>
            <strong>{p.topic}</strong> <span className="ops-empty">led by {p.leader} · {p.count} people</span>
            <div className="ops-empty">{p.members.join(', ')}</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 6 }}>
              <input aria-label={`Chat link for ${p.topic}`} placeholder="https://ss.embodiedphilosophy.com/c/…" value={links[p.id] || ''} onChange={e => setLinks(x => ({ ...x, [p.id]: e.target.value }))} style={{ flex: '1 1 260px' }} />
              <button className="chip primary" disabled={!!busy || !(links[p.id] || '').trim()} onClick={() => act('c' + p.id, { action: 'chat', id: p.id, url: links[p.id] }, 'Saved. The members can open their chat now.')}>Save the link</button>
            </div>
          </li>
        ))}
      </ul>

      <h2>Running pods ({running.length})</h2>
      {!running.length && <p className="ops-empty">None yet.</p>}
      <ul className="ops-site-rows">
        {running.map(p => (
          <li key={p.id} style={{ padding: '10px 0' }}>
            <strong>{p.topic}</strong> <span className="ops-empty">led by {p.leader} · {p.status === 'open' ? `${p.count} of ${data.min} to begin` : `${p.count} of ${data.max}`}</span>
            {p.chatUrl && <> · <a href={p.chatUrl} target="_blank" rel="noopener">chat ↗</a></>}
            <div className="ops-empty">{p.members.join(', ')}</div>
            <button className="chip" disabled={!!busy} onClick={() => confirm(`Cancel “${p.topic}”? It disappears for everyone.`) && act('x' + p.id, { action: 'cancel', id: p.id }, 'The pod was cancelled.')}>Cancel this pod</button>
          </li>
        ))}
      </ul>

      <h2>Approved leaders ({approved.length})</h2>
      <p className="ops-empty">{approved.length ? approved.map(l => l.name).join(', ') : 'No one yet.'}</p>
    </section>
  );
}
