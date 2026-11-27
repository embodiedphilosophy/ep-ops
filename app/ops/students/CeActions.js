'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

const post = async body => {
  const res = await fetch('/api/ops/ce', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).catch(() => null);
  const j = await res?.json().catch(() => ({}));
  if (!res?.ok) throw new Error(j?.error || 'Couldn’t save that');
  return j;
};

// Held certificate: read the reflection, then approve (issues and emails it) or withdraw
export function HeldActions({ id, r1, r2 }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false), [err, setErr] = useState(''), [open, setOpen] = useState(false);
  const go = async (action, extra = {}) => { setBusy(true); setErr(''); try { await post({ action, id, ...extra }); router.refresh(); } catch (e) { setErr(e.message); setBusy(false); } };
  return (<span className="ce-acts">
    <button className="chip" onClick={() => setOpen(o => !o)} aria-expanded={open}>{open ? 'Hide reflection' : 'Read reflection'}</button>
    <button className="chip primary" disabled={busy} onClick={() => go('approve')}>Approve and issue</button>
    <button className="chip danger" disabled={busy} onClick={() => { const why = window.prompt('Why is this certificate being withdrawn? (kept in the record)'); if (why !== null) go('revoke', { why }); }}>Withdraw</button>
    {err && <span className="hint err">{err}</span>}
    {open && <span className="ce-reflection"><b>What shifted</b><span>{r1}</span><b>Bringing it into teaching</b><span>{r2}</span></span>}
  </span>);
}

// Issued certificate: change the name (sends the new PDF) or withdraw
export function IssuedActions({ id, name, pdf }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false), [err, setErr] = useState('');
  const go = async body => { setBusy(true); setErr(''); try { await post({ id, ...body }); router.refresh(); } catch (e) { setErr(e.message); } setBusy(false); };
  return (<span className="ce-acts">
    {pdf && <a className="chip" href={pdf} target="_blank" rel="noopener noreferrer">PDF</a>}
    <button className="chip" disabled={busy} onClick={() => { const n = window.prompt('Name as it should appear on the certificate', name); if (n && n !== name) go({ action: 'rename', name: n }); }}>Change name</button>
    <button className="chip danger" disabled={busy} onClick={() => { const why = window.prompt('Why is this certificate being withdrawn? (kept in the record)'); if (why !== null) go({ action: 'revoke', why }); }}>Withdraw</button>
    {err && <span className="hint err">{err}</span>}
  </span>);
}

// Mark a pathway finished for someone (lessons done before the Circle workflow was on, or anything Circle missed)
export function MarkDone({ pathways }) {
  const router = useRouter();
  const [f, setF] = useState({ email: '', slug: pathways[0]?.slug || '' }), [busy, setBusy] = useState(false), [msg, setMsg] = useState(''), [err, setErr] = useState('');
  const save = async e => {
    e.preventDefault(); setBusy(true); setErr(''); setMsg('');
    try { await post({ action: 'done', ...f }); setMsg(`Marked finished. ${f.email} can now write the reflection on the CE page in Circle.`); setF(s => ({ ...s, email: '' })); router.refresh(); }
    catch (x) { setErr(x.message); }
    setBusy(false);
  };
  return (<form className="ce-mark" onSubmit={save}>
    <label><span>Member’s email</span><input type="email" required value={f.email} onChange={e => setF(s => ({ ...s, email: e.target.value }))} /></label>
    <label><span>Pathway</span><select value={f.slug} onChange={e => setF(s => ({ ...s, slug: e.target.value }))}>{pathways.map(p => <option key={p.slug} value={p.slug}>{p.title}</option>)}</select></label>
    <button className="chip primary" disabled={busy}>Mark finished</button>
    {msg && <span className="hint" role="status">{msg}</span>}
    {err && <span className="hint err" role="alert">{err}</span>}
  </form>);
}
