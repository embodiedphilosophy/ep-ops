'use client';
import { useEffect, useState } from 'react';
import Draft from './Draft';
import Live from './Live';

// One campaign: its four draft steps while it is a draft, the live page once it is in Meta. "?step=1..4" always shows the draft steps (read-only once it is in Meta).
export default function Campaign({ id }) {
  const [d, setD] = useState(null), [err, setErr] = useState(''), [steps, setSteps] = useState(false);
  useEffect(() => {
    setSteps(new URLSearchParams(window.location.search).has('step'));
    fetch(`/api/ops/ads?id=${encodeURIComponent(id)}`).then(r => r.json().then(j => (r.ok ? setD(j) : setErr(j.error || 'Couldn’t read this campaign')))).catch(() => setErr('Couldn’t read this campaign'));
  }, [id]);
  if (err) return <p className="hint err" role="alert">{err}</p>;
  if (!d) return <p className="ops-empty">Opening the campaign…</p>;
  return d.campaign.status === 'draft' || steps ? <Draft id={id} /> : <Live id={id} first={d} />;
}
