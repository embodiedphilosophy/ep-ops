'use client';
import { useEffect, useRef, useState } from 'react';

// "Relaunch": make a new draft from a campaign that is already in Meta. It only ever makes a draft (nothing goes to Meta); it opens in the usual four steps.
export default function Relaunch({ campaign, small }) {
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false), [err, setErr] = useState(''), [note, setNote] = useState('');
  const [dollars, setDollars] = useState(String((campaign.daily_cents || 0) / 100)), going = useRef(false), ok = useRef(null);
  useEffect(() => {
    if (!open) return;
    ok.current?.focus();
    const esc = e => { if (e.key === 'Escape' && !going.current) setOpen(false); };
    window.addEventListener('keydown', esc); return () => window.removeEventListener('keydown', esc);
  }, [open]);
  const make = async () => {
    if (going.current) return;   // a second click while the first is working does nothing
    going.current = true; setBusy(true); setErr(''); setNote('');
    try {
      const cents = Math.round(Number(String(dollars).replace(/[$,\s]/g, '') || 0) * 100);
      const res = await fetch('/api/ops/ads', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'relaunch', id: campaign.id, confirm: true, daily_cents: cents }) }), j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || 'That didn’t work. Try again in a moment.');
      setNote(j.existing ? 'There is already a draft from this campaign that has not been sent. Opening it.' : 'The new draft is ready. Opening it.');
      window.location.href = `/ops/ads/${j.id}`;
    } catch (e) { setErr(e.message); going.current = false; setBusy(false); }
  };
  return (
    <>
      <button type="button" className={`soc-btn${small ? ' small' : ''}`} onClick={() => { setOpen(true); setErr(''); }}>Relaunch</button>
      {open && (
        <div className="ads-modal" role="presentation" onClick={e => { if (e.target === e.currentTarget && !going.current) setOpen(false); }}>
          <div className="box" role="dialog" aria-modal="true" aria-labelledby={`rl-${campaign.id}`}>
            <h2 id={`rl-${campaign.id}`}>Relaunch “{campaign.name}”?</h2>
            <p>Make a new draft from this campaign. Fresh words will be written; the old campaign stays as it is.</p>
            <p className="sub">The new draft keeps the goal, the audiences, the pictures, the link and the button. It opens in the four steps so you can read the new words and check the pictures. This is a draft. Nothing goes to Meta until you press Send.</p>
            <label>Daily budget<input inputMode="decimal" aria-label="Daily budget in dollars" value={dollars} disabled={busy} onChange={e => setDollars(e.target.value)} /></label>
            {err && <p className="hint err" role="alert">{err}</p>}{note && <p className="hint" role="status">{note}</p>}
            <div className="soc-act">
              <button type="button" className="soc-btn primary" ref={ok} disabled={busy} onClick={make}>{busy ? 'Making the draft…' : 'Make a new draft'}</button>
              <button type="button" className="soc-btn" disabled={busy} onClick={() => setOpen(false)}>Cancel</button>
            </div>
          </div>
        </div>)}
    </>);
}
