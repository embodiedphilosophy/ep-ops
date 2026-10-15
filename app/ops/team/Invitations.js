'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

const post = async body => {
  const res = await fetch('/api/ops/faculty', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).catch(() => null);
  const j = await res?.json().catch(() => ({}));
  return res?.ok ? j : { error: j?.error || 'Couldn’t save. Try again.' };
};

export function InviteForm({ offerings, templates, kinds, units }) {
  const router = useRouter();
  const [f, setF] = useState({ name: '', email: '', kind: kinds[0], offering: '', title: '', fee: '', fee_unit: 'session', message: '', template: templates[0] || '', terms: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [preview, setPreview] = useState('');
  const [sent, setSent] = useState(null);
  const set = k => e => setF(s => ({ ...s, [k]: e.target.value }));
  const run = async action => {
    setBusy(true); setErr('');
    const j = await post({ action, ...f });
    setBusy(false);
    if (j.error) return setErr(j.error);
    if (action === 'preview') return setPreview(j.text);
    setSent(j); router.refresh();
  };
  if (sent) return (
    <div className="ops-edit">
      <p className="ops-edit-title">Invitation made</p>
      <p className="hint">{/^sent/.test(sent.email_status) ? `Emailed to ${f.email}.` : `Not emailed (${sent.email_status}). Send them this link:`}</p>
      <input readOnly value={sent.link} onFocus={e => e.target.select()} style={{ width: '100%' }} />
      <div className="bar"><button className="chip" onClick={() => { setSent(null); setPreview(''); setF(s => ({ ...s, name: '', email: '', message: '', terms: '' })); }}>Invite someone else</button></div>
    </div>
  );
  return (
    <form className="ops-edit ops-add ops-invite-form" onSubmit={e => { e.preventDefault(); run("create"); }}>
      <div className="row"><label htmlFor="iv-name">Name</label><input id="iv-name" value={f.name} onChange={set('name')} required /></div>
      <div className="row"><label htmlFor="iv-email">Email</label><input id="iv-email" type="email" value={f.email} onChange={set('email')} required /></div>
      <div className="row"><label htmlFor="iv-kind">Kind</label><select id="iv-kind" value={f.kind} onChange={set('kind')}>{kinds.map(k => <option key={k}>{k}</option>)}</select></div>
      <div className="row"><label htmlFor="iv-off">For</label>
        <select id="iv-off" value={f.offering} onChange={set('offering')} required><option value="">Choose a program or session…</option>{offerings.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}</select>
        <span className="hint">Add the program or session in Programming first.</span></div>
      <div className="row"><label htmlFor="iv-title">Title in the email</label><input id="iv-title" value={f.title} onChange={set('title')} placeholder="Blank: the program’s name" /></div>
      <div className="row"><label htmlFor="iv-fee">Fee ($)</label>
        <div className="inline"><input id="iv-fee" inputMode="decimal" value={f.fee} onChange={set('fee')} style={{ width: 110 }} />
          <select aria-label="Fee is" value={f.fee_unit} onChange={set('fee_unit')}>{units.map(u => <option key={u.value} value={u.value}>{u.label}</option>)}</select></div>
        <span className="hint">Goes into the agreement and, once taught, into Finance → To pay.</span></div>
      <div className="row"><label htmlFor="iv-msg">Personal note</label><textarea id="iv-msg" rows={4} value={f.message} onChange={set('message')} placeholder="A few warm lines from you (blank: a short standard invitation)" /></div>
      <div className="row"><label htmlFor="iv-tpl">Agreement</label><select id="iv-tpl" value={f.template} onChange={set('template')}>{templates.map(t => <option key={t}>{t}</option>)}</select></div>
      <div className="row"><label htmlFor="iv-terms">Course-specific terms</label><textarea id="iv-terms" rows={3} value={f.terms} onChange={set('terms')} placeholder="Fills {{terms}} in the agreement, e.g. recording rights, number of sessions" /></div>
      {preview && <div className="row"><span className="hint">The agreement as they will read it</span><pre className="ops-contract">{preview}</pre></div>}
      <div className="bar">
        <button className="chip primary" disabled={busy}>{busy ? 'Working…' : 'Send invitation'}</button>
        <button type="button" className="chip" disabled={busy} onClick={() => run('preview')}>Preview the agreement</button>
        {err && <span className="hint">{err}</span>}
      </div>
    </form>
  );
}

export function InviteActions({ id, status, link, contract }) {
  const router = useRouter();
  const [msg, setMsg] = useState('');
  const act = async (action, confirmText) => {
    if (confirmText && !confirm(confirmText)) return;
    const j = await post({ action, id });
    setMsg(j.error || (action === 'resend' ? (/^sent/.test(j.email_status) ? 'Sent again' : 'Not emailed: copy the link') : 'Cancelled'));
    router.refresh();
  };
  const copy = async () => { const full = link.startsWith('http') ? link : location.origin + link; try { await navigator.clipboard.writeText(full); setMsg('Link copied'); } catch { prompt('Copy this link', full); } };
  return (
    <span className="acts">
      {contract && <a className="chip" href={contract} target="_blank" rel="noopener">Agreement</a>}
      {status === 'sent' && <button className="chip" onClick={copy}>Copy link</button>}
      {status === 'sent' && <button className="chip" onClick={() => act('resend')}>Send again</button>}
      {status === 'sent' && <button className="chip" onClick={() => act('cancel', 'Cancel this invitation? Its link stops working.')}>Cancel</button>}
      {msg && <small>{msg}</small>}
    </span>
  );
}
