'use client';
import { useState } from 'react';

const post = async body => {
  const res = await fetch('/api/invite', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).catch(() => null);
  const j = await res?.json().catch(() => ({}));
  return res?.ok ? j : { error: j?.error || 'Something went wrong. Please try again.' };
};

export default function Answer({ token, decline, text, name }) {
  const [mode, setMode] = useState(decline ? 'no' : 'yes');
  const [signer, setSigner] = useState('');
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState('');
  const go = async body => { setBusy(true); setErr(''); const j = await post({ token, ...body }); setBusy(false); if (j.error) setErr(j.error); else setDone(body.action); };
  if (done === 'decline') return <p>Thank you for letting us know. We hope to teach together another time.</p>;
  if (done === 'sign') { if (typeof window !== 'undefined') window.location.reload(); return <p>Signed. One moment…</p>; }
  if (mode === 'no') return (
    <div className="noprint">
      <p>Would you like to decline this invitation?</p>
      <p style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button className="btn" aria-disabled={busy} onClick={() => go({ action: 'decline' })}>Yes, decline</button>
        <button className="btn quiet" onClick={() => setMode('yes')}>Actually, I’d like to teach</button>
      </p>
      {err && <p className="err">{err}</p>}
    </div>
  );
  if (!text) return <p className="err">The agreement is missing. Please reply to the invitation email and we’ll sort it out.</p>;
  return (<>
    <h2 style={{ fontSize: 18, margin: '24px 0 8px' }}>The agreement</h2>
    <div className="contract">{text}</div>
    <form className="noprint" onSubmit={e => { e.preventDefault(); go({ action: 'sign', name: signer, agree }); }}>
      <label htmlFor="sig-name" style={{ flexDirection: 'column', gap: 6 }}>Type your full name to sign
        <input id="sig-name" type="text" value={signer} onChange={e => setSigner(e.target.value)} placeholder={name} autoComplete="name" required /></label>
      <label><input type="checkbox" checked={agree} onChange={e => setAgree(e.target.checked)} /> I have read this agreement and agree to it. Typing my name counts as my signature.</label>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button className="btn" type="submit" aria-disabled={busy || !agree || signer.trim().length < 3}>{busy ? 'Signing…' : 'Sign the agreement'}</button>
        <button className="btn quiet" type="button" onClick={() => setMode('no')}>Not this time</button>
      </div>
      {err && <p className="err">{err}</p>}
      <p className="muted">Jacob Kyle countersigns automatically for Embodied Philosophy. You’ll get a copy by email.</p>
    </form>
  </>);
}
