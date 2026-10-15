'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

const post = async body => {
  const res = await fetch('/api/ops/support', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).catch(() => null);
  const j = await res?.json().catch(() => ({}));
  if (!res?.ok) throw new Error(j?.error || 'That didn’t go through');
  return j;
};

const TOPICS = ['Your Course Dashboard', 'Live sessions & replays', 'Memberships & pricing', 'Billing, refunds & cancelling', 'The legacy platform', 'Certificates & CE hours', 'Email, account & privacy', 'Books & journal orders'];

// Reply box with suggested answers from the KB, and "save as a new answer" for questions the KB doesn't cover
export default function SupportReply({ id, status, picks, subject, firstMessage }) {
  const router = useRouter();
  const [text, setText] = useState('');
  const [note, setNote] = useState(false);
  const [busy, setBusy] = useState(false), [msg, setMsg] = useState(''), [err, setErr] = useState('');
  const [draft, setDraft] = useState(null);

  const send = async st => {
    setBusy(true); setErr(''); setMsg('');
    try { await post({ action: 'reply', id, body: text, status: st, note }); setText(''); setMsg(note ? 'Note added.' : 'Reply sent.'); router.refresh(); }
    catch (e) { setErr(e.message); }
    setBusy(false);
  };
  const saveDraft = async e => {
    e.preventDefault(); setBusy(true); setErr('');
    try { await post({ action: 'draft', id, ...draft }); setDraft(null); setMsg('Saved as a Draft answer in the KB sheet.'); }
    catch (x) { setErr(x.message); }
    setBusy(false);
  };

  return (
    <div className="ops-sup-reply">
      {picks.length > 0 && (
        <div className="ops-sup-picks">
          <h3>Suggested answers</h3>
          {picks.map(p => (
            <details key={p.id}>
              <summary><span className="tag">{p.id}</span>{p.question}</summary>
              <p>{p.answer}</p>
              {p.notes && <p className="hint">Note: {p.notes}</p>}
              {p.handoff && <p className="hint">Needs you when: {p.handoff}</p>}
              <button type="button" className="chip" onClick={() => setText(t => (t ? t + '\n\n' : '') + p.answer)}>Use this answer</button>
            </details>
          ))}
        </div>
      )}

      <label className="ops-sup-box">
        <span>{note ? 'Internal note (the customer won’t see it)' : 'Reply to the customer'}</span>
        <textarea rows={7} value={text} onChange={e => setText(e.target.value)} placeholder={note ? 'A note for the team…' : 'Write your reply…'} />
      </label>
      <div className="ops-sup-acts">
        <button className="chip primary" disabled={busy || !text.trim()} onClick={() => send(note ? undefined : 'pending')}>{note ? 'Add note' : 'Send'}</button>
        {!note && <button className="chip" disabled={busy || !text.trim()} onClick={() => send('solved')}>Send and mark solved</button>}
        <label className="ops-sup-toggle"><input type="checkbox" checked={note} onChange={e => setNote(e.target.checked)} /> Internal note</label>
        {status !== 'solved' && !text.trim() && <button className="chip" disabled={busy} onClick={async () => { setBusy(true); try { await post({ action: 'status', id, status: 'solved' }); router.refresh(); } catch (e) { setErr(e.message); } setBusy(false); }}>Mark solved</button>}
      </div>
      {msg && <p className="hint ok" role="status">{msg}</p>}
      {err && <p className="hint err" role="alert">{err}</p>}

      <div className="ops-sup-new">
        {!draft ? (
          <button type="button" className="more" onClick={() => setDraft({ question: subject.replace(/^\[Chat[^\]]*\]\s*/, ''), answer: text, topic: '' })}>
            {picks.length ? 'None of these fit? Save a new answer for the KB' : 'No answer in the KB yet. Save one for review'}
          </button>
        ) : (
          <form onSubmit={saveDraft}>
            <h3>New answer for the KB</h3>
            <p className="hint">It goes into the sheet as a Draft, so Ether and the Help Centre only use it once it’s marked Live.</p>
            <label>Question, as a customer would ask it<input value={draft.question} onChange={e => setDraft(d => ({ ...d, question: e.target.value }))} placeholder={firstMessage.slice(0, 80)} /></label>
            <label>Answer<textarea rows={4} value={draft.answer} onChange={e => setDraft(d => ({ ...d, answer: e.target.value }))} /></label>
            <label>Topic<select value={draft.topic} onChange={e => setDraft(d => ({ ...d, topic: e.target.value }))}><option value="">Choose…</option>{TOPICS.map(t => <option key={t}>{t}</option>)}</select></label>
            <div className="ops-sup-acts"><button className="chip primary" disabled={busy}>Save as draft</button><button type="button" className="chip" onClick={() => setDraft(null)}>Cancel</button></div>
          </form>
        )}
      </div>
    </div>
  );
}
