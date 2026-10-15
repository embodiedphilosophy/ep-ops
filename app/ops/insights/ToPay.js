'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

const usd = n => `$${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
const post = async body => {
  const res = await fetch('/api/ops/payables', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).catch(() => null);
  const j = await res?.json().catch(() => ({}));
  return res?.ok ? j : { error: j?.error || 'Couldn’t save. Try again.' };
};

// Finance → To pay: who is owed what, grouped by person. Pay in Gusto, then mark paid here.
export default function ToPay({ rows }) {
  const router = useRouter();
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');
  const due = rows.filter(r => r.status !== 'paid');
  const people = [...new Set(due.map(r => r.email))].map(email => {
    const items = due.filter(r => r.email === email);
    return { email, name: items[0].name, items, total: items.reduce((s, r) => s + (Number(r.amount) || 0), 0), unpriced: items.some(r => !r.amount) };
  });
  const total = people.reduce((s, p) => s + p.total, 0);
  const pay = async (keys, label) => {
    if (!confirm(`Mark ${label} as paid? Do this after paying in Gusto.`)) return;
    setBusy(label); setMsg('');
    const j = await post({ action: 'paid', keys });
    setBusy(''); setMsg(j.error || `Marked ${j.paid} paid.`); router.refresh();
  };
  const gusto = people.map(p => `${p.name}\t${p.email}\t${p.total.toFixed(2)}\t${p.items.map(i => i.what).join('; ')}`).join('\n');
  const copy = async () => { try { await navigator.clipboard.writeText(gusto); setMsg('Copied: paste it beside Gusto’s contractor payment screen.'); } catch { prompt('Copy', gusto); } };
  if (!people.length) return <p className="ops-empty">Nobody is owed anything right now. Fees from signed faculty agreements appear here once each session is taught; staff hours once submitted.</p>;
  return (
    <div className="ops-topay">
      <p className="ops-empty"><b>{usd(total)}</b> owed to {people.length} {people.length === 1 ? 'person' : 'people'}. Pay them in Gusto, then mark them paid here.</p>
      <ul>
        {people.map(p => (
          <li key={p.email}>
            <div className="who"><b>{p.name}</b><span>{usd(p.total)}{p.unpriced ? ' + hours without a rate' : ''}</span>
              <button className="chip" disabled={!!busy} onClick={() => pay(p.items.map(i => i.key), p.name)}>{busy === p.name ? 'Saving…' : 'Mark paid'}</button></div>
            <ul>{p.items.map(i => <li key={i.key}>{i.what}<span>{i.amount ? usd(i.amount) : 'no rate'}{i.unsaved ? ' · new' : ''}</span></li>)}</ul>
          </li>
        ))}
      </ul>
      <div className="bar">
        <button className="chip" onClick={copy}>Copy the list for Gusto</button>
        <a className="chip" href="/ops/settings?t=team">Hourly rates</a>
        {msg && <span className="hint">{msg}</span>}
      </div>
    </div>
  );
}
