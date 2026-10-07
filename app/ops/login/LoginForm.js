'use client';
import { useState } from 'react';
export default function LoginForm() {
  const [email, setEmail] = useState(''); const [state, setState] = useState('idle');
  const submit = async e => {
    e.preventDefault(); setState('sending');
    await fetch('/api/ops/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) }).catch(() => {});
    setState('sent');
  };
  if (state === 'sent') return <p className="ops-note">If we have that address on file, a sign-in link is on its way. Check your inbox (and spam).</p>;
  return (
    <form onSubmit={submit} className="ops-form">
      <input type="email" required placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} aria-label="Email address" />
      <button className="btn btn-primary" disabled={state === 'sending'}>{state === 'sending' ? 'Sending…' : 'Email me a link'}</button>
    </form>
  );
}
