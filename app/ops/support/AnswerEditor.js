'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

const post = async body => {
  const res = await fetch('/api/ops/support', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).catch(() => null);
  const j = await res?.json().catch(() => ({}));
  if (!res?.ok) throw new Error(j?.error || 'That didn’t save');
  return j;
};

const TOPICS = ['Your Course Dashboard', 'Live sessions & replays', 'Memberships & pricing', 'Billing, refunds & cancelling', 'The legacy platform', 'Certificates & CE hours', 'Email, account & privacy', 'Books & journal orders', 'Handoff'];
const LONG = ['Public answer', 'Ether notes', 'Hand to Ichha when', 'Open question', 'Other phrasings'];
const HELP = {
  'Question': 'As a student would ask it.',
  'Other phrasings': 'Other ways people ask, separated by semicolons. Helps Ether recognise the question.',
  'Public answer': 'What Ether says and the Help Centre shows. Plain and warm, two short paragraphs at most.',
  'Ether notes': 'Private guidance for Ether. Never shown to students.',
  'Hand to Ichha when': 'The situation that sends the chat to Ichha, or “Never”.',
  'Public': 'Yes shows it on the Help Centre.',
  'Open question': 'Anything still to decide. Cleared when the answer is approved.',
};

// One answer from the EP Support KB: edit the text, and (for approvers) make it Live or retire it
export default function AnswerEditor({ answer, fields, approver, back }) {
  const router = useRouter();
  const [vals, setVals] = useState(() => Object.fromEntries(fields.map(f => [f, answer[f] || ''])));
  const [busy, setBusy] = useState(false), [msg, setMsg] = useState(''), [err, setErr] = useState('');
  const status = String(answer.Status || '').toLowerCase();
  const changed = Object.fromEntries(fields.filter(f => vals[f] !== (answer[f] || '')).map(f => [f, vals[f]]));
  const dirty = Object.keys(changed).length > 0;
  const before = { ...answer }; delete before.row;

  const run = async (body, done) => {
    setBusy(true); setErr(''); setMsg('');
    try { await post({ ...body, row: answer.row, before }); setMsg(done); router.refresh(); }
    catch (e) { setErr(e.message); }
    setBusy(false);
  };
  const save = e => { e.preventDefault(); run({ action: 'answer', changes: changed }, status === 'live' && !approver ? 'Saved. It’s back in Draft until it’s approved.' : 'Saved.'); };

  return (
    <form className="ops-sup-answer" onSubmit={save}>
      <div className="ops-sup-tickethead">
        <div>
          <a className="back" href={back}>← All answers</a>
          <h2><span className="tag">{answer.ID}</span>{answer.Question || 'Untitled'}</h2>
          <small><i className={`dot ans-${status}`} aria-hidden="true" />{answer.Status || 'No status'}{answer['Last reviewed'] ? ` · last reviewed ${answer['Last reviewed']}` : ''}{answer.Replaces ? ` · replaces ${answer.Replaces}` : ''}</small>
        </div>
        {approver && (
          <div className="ops-sup-acts">
            {status !== 'live' && <button type="button" className="chip primary" disabled={busy || dirty} title={dirty ? 'Save your changes first' : undefined} onClick={() => run({ action: 'approve' }, 'Approved. It’s live.')}>Approve</button>}
            {status === 'live' && <button type="button" className="chip" disabled={busy} onClick={() => run({ action: 'reopen' }, 'Back in Draft.')}>Move to draft</button>}
            {status !== 'retired' && <button type="button" className="chip" disabled={busy} onClick={() => run({ action: 'retire' }, 'Retired. Ether and the Help Centre no longer use it.')}>Retire</button>}
            {status === 'retired' && <button type="button" className="chip" disabled={busy} onClick={() => run({ action: 'reopen' }, 'Back in Draft.')}>Restore as draft</button>}
          </div>
        )}
      </div>

      {fields.map(f => (
        <label key={f} className="ops-sup-field">
          <span>{f}</span>
          {HELP[f] && <small>{HELP[f]}</small>}
          {f === 'Topic' ? (
            <select value={vals[f]} onChange={e => setVals(v => ({ ...v, [f]: e.target.value }))}>
              <option value="">Choose…</option>{[...new Set([...TOPICS, vals[f]].filter(Boolean))].map(t => <option key={t}>{t}</option>)}
            </select>
          ) : f === 'Public' ? (
            <select value={vals[f]} onChange={e => setVals(v => ({ ...v, [f]: e.target.value }))}><option>Yes</option><option>No</option></select>
          ) : LONG.includes(f) ? (
            <textarea rows={f === 'Public answer' ? 6 : 3} value={vals[f]} onChange={e => setVals(v => ({ ...v, [f]: e.target.value }))} />
          ) : (
            <input value={vals[f]} onChange={e => setVals(v => ({ ...v, [f]: e.target.value }))} />
          )}
        </label>
      ))}

      <div className="ops-sup-acts sticky">
        <button className="chip primary" disabled={busy || !dirty}>Save changes</button>
        {dirty && <button type="button" className="chip" disabled={busy} onClick={() => setVals(Object.fromEntries(fields.map(f => [f, answer[f] || ''])))}>Undo</button>}
        {msg && <span className="hint ok" role="status">{msg}</span>}
        {err && <span className="hint err" role="alert">{err}</span>}
      </div>
    </form>
  );
}
