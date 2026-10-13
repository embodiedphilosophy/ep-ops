'use client';
import { useState } from 'react';

// Copies a landing page's live address. Falls back to selecting the text when the clipboard isn't allowed.
export default function CopyLink({ url }) {
  const [done, setDone] = useState('');
  async function copy() {
    try { await navigator.clipboard.writeText(url); setDone('Copied'); }
    catch { window.prompt('Copy this link', url); setDone(''); }
    setTimeout(() => setDone(''), 1800);
  }
  return (
    <button type="button" className="btn ghost lp-copy" onClick={copy} aria-label={`Copy link ${url}`}>
      {done || 'Copy link'}
      <span className="sr" role="status">{done}</span>
    </button>
  );
}
