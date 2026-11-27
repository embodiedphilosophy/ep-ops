'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';

// Payroll: the month's lines by kind, each editable (hours, rate, amount, what, note; remove / bring back), lines added
// by hand, people & their usual rates, then Finalize → Send to the payroll admin. Amount = hours × rate unless an
// amount is typed (then it's fixed; clearing it goes back to hours × rate).
const API = '/api/ops/payroll';
const VIA = [['gusto', 'Gusto (automatic)'], ['manual', 'Pay manually']];
const viaLabel = v => VIA.find(x => x[0] === v)?.[1] || 'Not set';
const KINDS = [['faculty', 'Faculty: sessions and modules'], ['salary', 'Salaried staff'], ['hourly', 'Hourly staff'], ['other', 'Other']];
const nyMonth = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' }).slice(0, 7);
const shift = (m, n) => { const [y, mo] = m.split('-').map(Number), d = new Date(Date.UTC(y, mo - 1 + n, 1)); return d.toISOString().slice(0, 7); };
const label = m => new Date(`${m}-15T12:00:00Z`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const usd = n => n == null || n === '' ? '' : `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const day = d => d ? new Date(`${d}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }) : '';
const when = iso => iso ? new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
const post = async body => {
  const res = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).catch(() => null);
  const j = await res?.json().catch(() => ({})) || {};
  if (!res?.ok) throw new Error(j.error || 'That didn’t save'); return j;
};

export default function Payroll({ initialMonth }) {
  const [month, setMonth] = useState(initialMonth || nyMonth());
  const [d, setD] = useState(null);
  const [err, setErr] = useState(''); const [msg, setMsg] = useState(''); const [busy, setBusy] = useState('');
  const load = useCallback(async () => {
    setErr('');
    const res = await fetch(`${API}?month=${month}`).catch(() => null), j = await res?.json().catch(() => ({})) || {};
    if (!res?.ok) { setErr(j.error || 'Couldn’t read payroll'); setD({ lines: [] }); return; }
    setD(j);
  }, [month]);
  useEffect(() => { setD(null); setMsg(''); load(); const u = new URL(window.location.href); u.searchParams.set('month', month); window.history.replaceState(null, '', u); }, [month]); // eslint-disable-line react-hooks/exhaustive-deps
  const act = async (action, confirmText) => {
    if (confirmText && !confirm(confirmText)) return;
    setBusy(action); setErr(''); setMsg('');
    try { const j = await post({ action, month }); setMsg(j.message || 'Done.'); await load(); } catch (e) { setErr(e.message); }
    setBusy('');
  };

  const live = useMemo(() => (d?.lines || []).filter(l => l.removed !== 'yes'), [d]);
  const byKind = k => (d?.lines || []).filter(l => (l.kind || 'other') === k);
  const sub = k => live.filter(l => (l.kind || 'other') === k).reduce((s, l) => s + (l.amount_due || 0), 0);
  const locked = d?.locked, status = d?.status || 'open';

  return (
    <div className="pr">
      <div className="pr-top">
        <div className="pr-month">
          <button className="chip" onClick={() => setMonth(shift(month, -1))} aria-label="Earlier month">←</button>
          <b>{label(month)}</b>
          <button className="chip" onClick={() => setMonth(shift(month, 1))} aria-label="Later month">→</button>
          {month !== nyMonth() && <button className="chip" onClick={() => setMonth(nyMonth())}>This month</button>}
        </div>
        {d && <span className={`pr-status ${status}`}>{status === 'open' ? 'Open: being prepared' : status === 'finalized' ? `Finalized ${when(d.monthRow?.finalized_at)} by ${d.monthRow?.finalized_by}` : `Sent ${when(d.monthRow?.sent_at)} to ${d.monthRow?.sent_to}`}</span>}
      </div>
      {err && <p className="hint err" role="alert">{err}</p>}
      {msg && <p className="hint" role="status">{msg}</p>}
      {!d ? <p className="ops-empty">Working out {label(month)}…</p> : <>
        <div className="pr-sum">
          {KINDS.map(([k, l]) => <div key={k}><span className="cap">{l.split(':')[0]}</span><b>{usd(sub(k))}</b></div>)}
          <div className="total"><span className="cap">Total</span><b>{usd(d.total)}</b></div>
        </div>
        <div className="pr-sum pr-via">
          <div><span className="cap">To pay manually</span><b>{usd(d.byPay?.manual)}</b></div>
          <div><span className="cap">Paid automatically through Gusto</span><b>{usd(d.byPay?.gusto)}</b></div>
          {d.byPay?.unset > 0 && <div className="warn"><span className="cap">Pay method not set</span><b>{usd(d.byPay.unset)}</b></div>}
        </div>
        {d.missing > 0 && !locked && <p className="hint">{d.missing} line{d.missing === 1 ? '' : 's'} still need{d.missing === 1 ? 's' : ''} hours and a rate (or an amount) before the month can be finalized.</p>}
        {KINDS.map(([k, l]) => <Section key={k} kind={k} title={l} lines={byKind(k)} month={month} locked={locked} reload={load} setErr={setErr} />)}
        {!locked && <AddLine month={month} reload={load} setErr={setErr} />}
        <section className="pr-actions" aria-label="Finalize and send">
          {status === 'open' && <button className="chip primary" disabled={!!busy || d.missing > 0 || !live.length} onClick={() => act('finalize', `Finalize ${label(month)}?\n\n${live.length} lines, ${usd(d.total)}. This saves every line as it stands and locks the month. You can reopen it if something needs changing.`)}>{busy === 'finalize' ? 'Finalizing…' : 'Finalize the month’s accounting'}</button>}
          {status !== 'open' && <button className="chip primary" disabled={!!busy || !d.settings?.admin_email} onClick={() => act('send', `Send ${label(month)} (${usd(d.total)}) to ${d.settings.admin_name || d.settings.admin_email} at ${d.settings.admin_email}?`)}>{busy === 'send' ? 'Sending…' : status === 'sent' ? 'Send to the payroll admin again' : 'Send to the payroll admin'}</button>}
          {status !== 'open' && <button className="chip" disabled={!!busy} onClick={() => act('reopen', 'Reopen this month to make changes? You’ll need to finalize it again.')}>Reopen</button>}
          <span className="sub">{d.settings?.admin_email ? <>Goes to <b>{d.settings.admin_name || d.settings.admin_email}</b> ({d.settings.admin_email}): a total per person with names and emails, every line, and a spreadsheet file.</> : <>No payroll admin yet. {d.director ? 'Add one under Settings below.' : 'Ask Jacob to add one.'}</>}</span>
        </section>
        <People people={d.people} month={month} reload={load} setErr={setErr} />
        {d.director && <Settings d={d} reload={load} setErr={setErr} setMsg={setMsg} />}
      </>}
    </div>
  );
}

function Section({ kind, title, lines, month, locked, reload, setErr }) {
  const [showRemoved, setShowRemoved] = useState(false);
  const live = lines.filter(l => l.removed !== 'yes'), gone = lines.filter(l => l.removed === 'yes');
  if (!lines.length) return null;
  // Faculty lines are grouped by teacher, with a subtotal each
  const groups = kind === 'faculty' ? [...new Set(live.map(l => l.email || l.name))].map(k => live.filter(l => (l.email || l.name) === k)) : [live];
  return (
    <section className="pr-sec" aria-label={title}>
      <h2>{title} <span>{live.length}</span></h2>
      <div className="pr-table" role="table">
        <div className="pr-row head" role="row"><span>{kind === 'faculty' ? 'Session' : 'Person'}</span><span>Hours</span><span>Rate $/h</span><span>Amount $</span><span /></div>
        {groups.map((g, i) => <div key={i} className="pr-group">
          {kind === 'faculty' && g[0] && <div className="pr-who"><b>{g[0].name}</b> <span className="sub">{g[0].email || 'no email'}</span><span className="pr-subtotal">{usd(g.reduce((s, l) => s + (l.amount_due || 0), 0))}</span></div>}
          {g.map(l => <Line key={l.key} l={l} kind={kind} month={month} locked={locked} reload={reload} setErr={setErr} />)}
        </div>)}
      </div>
      {gone.length > 0 && <details open={showRemoved} onToggle={e => setShowRemoved(e.target.open)} className="pr-gone"><summary>Removed ({gone.length})</summary>
        {gone.map(l => <Line key={l.key} l={l} kind={kind} month={month} locked={locked} reload={reload} setErr={setErr} />)}</details>}
    </section>
  );
}

function Line({ l, kind, month, locked, reload, setErr }) {
  const from = { what: l.what || '', hours: l.hours || '', rate: l.rate || '', amount: l.fixed === 'yes' ? (l.amount || '') : '', note: l.note || '', name: l.name || '', email: l.email || '', pay_via: l.pay_via || '' };
  const [f, setF] = useState(from); const [busy, setBusy] = useState(false); const [open, setOpen] = useState(false);
  useEffect(() => setF(from), [l.key, l.what, l.hours, l.rate, l.amount, l.fixed, l.note, l.name, l.email, l.pay_via]); // eslint-disable-line react-hooks/exhaustive-deps
  const dirty = Object.keys(from).some(k => String(f[k]) !== String(from[k]));
  const n = v => { const x = Number(String(v).replace(/[^0-9.]/g, '')); return String(v).trim() === '' || !Number.isFinite(x) ? null : x; };
  const preview = n(f.amount) ?? (n(f.hours) != null && n(f.rate) != null ? Math.round(n(f.hours) * n(f.rate) * 100) / 100 : null);
  const save = async extra => {
    setBusy(true); setErr('');
    try { await post({ action: 'line', month, key: l.key, fields: { ...f, kind: l.kind, ...extra } }); await reload(); setOpen(false); } catch (e) { setErr(e.message); }
    setBusy(false);
  };
  const removed = l.removed === 'yes';
  return (
    <div className={`pr-row${removed ? ' removed' : ''}${preview == null && !removed ? ' missing' : ''}`} role="row">
      <span className="pr-what">
        {kind === 'faculty' ? <><span className="mono">{day(l.date)}</span> {l.what}</> : <><b>{l.name}</b> <span className="sub">{l.email}</span><br />{l.what}</>}
        {!removed && <span className={`pr-via-tag ${l.pay_via || 'unset'}`}>{viaLabel(l.pay_via)}</span>}
        {l.note && <span className="sub pr-note">{l.note}</span>}
        {l.unsaved && <span className="sub pr-note">Worked out, not saved yet</span>}
        {!locked && !removed && <button className="pr-link" onClick={() => setOpen(!open)}>{open ? 'Close' : 'Edit details'}</button>}
        {open && <span className="pr-more">
          <label><span className="cap">What</span><input value={f.what} onChange={e => setF({ ...f, what: e.target.value })} /></label>
          <label><span className="cap">Name</span><input value={f.name} onChange={e => setF({ ...f, name: e.target.value })} /></label>
          <label><span className="cap">Email</span><input type="email" value={f.email} onChange={e => setF({ ...f, email: e.target.value })} /></label>
          <label><span className="cap">Note (goes to the payroll admin)</span><input value={f.note} onChange={e => setF({ ...f, note: e.target.value })} /></label>
          <label><span className="cap">Paid</span><select value={f.pay_via} onChange={e => setF({ ...f, pay_via: e.target.value })}><option value="">Not set</option>{VIA.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
        </span>}
      </span>
      <input aria-label={`Hours for ${l.what}`} inputMode="decimal" value={f.hours} disabled={locked || removed} onChange={e => setF({ ...f, hours: e.target.value })} />
      <input aria-label={`Rate for ${l.what}`} inputMode="decimal" value={f.rate} disabled={locked || removed} onChange={e => setF({ ...f, rate: e.target.value })} />
      <input aria-label={`Amount for ${l.what}`} inputMode="decimal" value={f.amount} disabled={locked || removed} placeholder={preview != null ? String(preview) : 'needed'} onChange={e => setF({ ...f, amount: e.target.value })} title="Leave blank for hours × rate; type an amount to fix it" />
      <span className="pr-acts">
        <b className="mono">{removed ? '' : usd(preview)}</b>
        {!locked && dirty && <button className="chip primary" disabled={busy} onClick={() => save()}>{busy ? '…' : 'Save'}</button>}
        {!locked && dirty && <button className="chip" onClick={() => setF(from)}>Undo</button>}
        {!locked && !dirty && (removed ? <button className="chip" disabled={busy} onClick={() => save({ removed: false })}>Bring back</button> : <button className="chip" disabled={busy} onClick={() => save({ removed: true })}>Remove</button>)}
      </span>
    </div>
  );
}

function AddLine({ month, reload, setErr }) {
  const empty = { kind: 'other', name: '', email: '', what: '', date: '', hours: '', rate: '', amount: '', note: '', pay_via: 'manual' };
  const [f, setF] = useState(empty); const [open, setOpen] = useState(false); const [busy, setBusy] = useState(false);
  const save = async e => {
    e.preventDefault(); setBusy(true); setErr('');
    try { await post({ action: 'line', month, key: 'new', fields: f }); setF(empty); setOpen(false); await reload(); } catch (x) { setErr(x.message); }
    setBusy(false);
  };
  if (!open) return <button className="chip" onClick={() => setOpen(true)}>+ Add a line by hand</button>;
  return (
    <form className="pr-add" onSubmit={save} aria-label="Add a line">
      <label><span className="cap">Kind</span><select value={f.kind} onChange={e => setF({ ...f, kind: e.target.value })}>{KINDS.map(([k, l]) => <option key={k} value={k}>{l.split(':')[0]}</option>)}</select></label>
      <label><span className="cap">Name</span><input required value={f.name} onChange={e => setF({ ...f, name: e.target.value })} /></label>
      <label><span className="cap">Email</span><input type="email" value={f.email} onChange={e => setF({ ...f, email: e.target.value })} /></label>
      <label><span className="cap">What for</span><input value={f.what} onChange={e => setF({ ...f, what: e.target.value })} placeholder="e.g. Guest lecture, design work" /></label>
      <label><span className="cap">Date</span><input type="date" value={f.date} onChange={e => setF({ ...f, date: e.target.value })} /></label>
      <label><span className="cap">Hours</span><input inputMode="decimal" value={f.hours} onChange={e => setF({ ...f, hours: e.target.value })} /></label>
      <label><span className="cap">Rate $/h</span><input inputMode="decimal" value={f.rate} onChange={e => setF({ ...f, rate: e.target.value })} /></label>
      <label><span className="cap">Or an amount $</span><input inputMode="decimal" value={f.amount} onChange={e => setF({ ...f, amount: e.target.value })} /></label>
      <label><span className="cap">Paid</span><select value={f.pay_via} onChange={e => setF({ ...f, pay_via: e.target.value })}>{VIA.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
      <label className="wide"><span className="cap">Note</span><input value={f.note} onChange={e => setF({ ...f, note: e.target.value })} /></label>
      <span className="pr-acts"><button className="chip primary" disabled={busy}>{busy ? 'Adding…' : 'Add'}</button><button type="button" className="chip" onClick={() => setOpen(false)}>Cancel</button></span>
    </form>
  );
}

// Usual rates and salaries: what new months fill in from
function People({ people, month, reload, setErr }) {
  const empty = { email: '', name: '', kind: 'faculty', rate: '', monthly: '', session_rate: '', sessions: false, recurring: true, pay_via: '', note: '' };
  const [f, setF] = useState(empty); const [busy, setBusy] = useState(false);
  const save = async (p, e) => {
    e?.preventDefault(); setBusy(true); setErr('');
    try { await post({ action: 'person', person: { ...p, recurring: p.recurring !== false && p.recurring !== 'no', only_month: p.only_month || month } }); setF(empty); await reload(); } catch (x) { setErr(x.message); }
    setBusy(false);
  };
  return (
    <details className="pr-sec pr-people">
      <summary><h2>People &amp; usual rates <span>{people.length}</span></h2></summary>
      <p className="sub">What each new month fills in from. Faculty: their usual hourly rate for sessions. Salaried: the same amount every month. Hourly: their rate for clocked hours (otherwise the Team tab’s hourly rate). Staff are paid for sessions only when ticked “Also paid for sessions”, at their session rate; their sessions then appear under Faculty, so leave session time out of their clocked hours. Changing a rate here changes months not yet finalized; lines you’ve already edited keep your numbers.</p>
      <div className="pr-table">
        {people.map(p => <PersonRow key={p.email} p={p} month={month} save={save} reload={reload} setErr={setErr} />)}
      </div>
      <form className="pr-add" onSubmit={e => save(f, e)} aria-label="Add a person">
        <label><span className="cap">Email</span><input type="email" required value={f.email} onChange={e => setF({ ...f, email: e.target.value })} /></label>
        <label><span className="cap">Name</span><input value={f.name} onChange={e => setF({ ...f, name: e.target.value })} /></label>
        <label><span className="cap">Paid as</span><select value={f.kind} onChange={e => setF({ ...f, kind: e.target.value })}><option value="faculty">Faculty (per session)</option><option value="salary">Salaried (same every month)</option><option value="hourly">Hourly (invoices hours)</option></select></label>
        {f.kind === 'salary' ? <label><span className="cap">Monthly $</span><input inputMode="decimal" required value={f.monthly} onChange={e => setF({ ...f, monthly: e.target.value })} /></label>
          : <label><span className="cap">Rate $/h</span><input inputMode="decimal" value={f.rate} onChange={e => setF({ ...f, rate: e.target.value })} /></label>}
        {f.kind !== 'faculty' && <label className="pr-check"><input type="checkbox" checked={f.sessions} onChange={e => setF({ ...f, sessions: e.target.checked })} /> Also paid for sessions they teach or host</label>}
        {f.kind !== 'faculty' && f.sessions && <label><span className="cap">Session rate $/h</span><input inputMode="decimal" value={f.session_rate} onChange={e => setF({ ...f, session_rate: e.target.value })} /></label>}
        <label><span className="cap">Paid</span><select required value={f.pay_via} onChange={e => setF({ ...f, pay_via: e.target.value })}><option value="">Choose…</option>{VIA.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
        <label className="pr-check wide"><input type="checkbox" checked={f.recurring} onChange={e => setF({ ...f, recurring: e.target.checked })} /> Show up in every month automatically{f.recurring ? '' : ` (unticked: only in ${label(month)})`}</label>
        <span className="pr-acts"><button className="chip primary" disabled={busy}>{busy ? 'Saving…' : 'Add or update'}</button></span>
      </form>
    </details>
  );
}
function PersonRow({ p, month, save, reload, setErr }) {
  const start = { ...p, sessions: p.sessions === 'yes', recurring: p.recurring !== 'no', pay_via: p.pay_via || '' };
  const [f, setF] = useState(start); const dirty = ['rate', 'monthly', 'name', 'kind', 'session_rate', 'sessions', 'recurring', 'pay_via'].some(k => String(f[k] ?? '') !== String(start[k] ?? ''));
  return (
    <div className="pr-row person">
      <span><b>{p.name || p.email}</b> <span className="sub">{p.email}</span>
        <span className="pr-pflags">
          <select aria-label={`How ${p.name || p.email} is paid`} value={f.pay_via} onChange={e => setF({ ...f, pay_via: e.target.value })}><option value="">Paid: not set</option>{VIA.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
          <label className="pr-check"><input type="checkbox" checked={f.recurring} onChange={e => setF({ ...f, recurring: e.target.checked, only_month: e.target.checked ? '' : month })} /> Every month{!f.recurring ? ` (only ${label(f.only_month || month)})` : ''}</label>
        </span></span>
      <select aria-label={`What ${p.name || p.email} is paid as`} value={f.kind} onChange={e => setF({ ...f, kind: e.target.value })}><option value="faculty">Faculty</option><option value="salary">Salaried</option><option value="hourly">Hourly</option></select>
      {f.kind === 'salary' ? <input aria-label="Monthly amount" inputMode="decimal" value={f.monthly} onChange={e => setF({ ...f, monthly: e.target.value })} placeholder="monthly $" />
        : <input aria-label="Rate per hour" inputMode="decimal" value={f.rate} onChange={e => setF({ ...f, rate: e.target.value })} placeholder="$/h" />}
      <span className="pr-acts">
        {f.kind !== 'faculty' && <label className="pr-check"><input type="checkbox" checked={f.sessions} onChange={e => setF({ ...f, sessions: e.target.checked })} /> Also paid for sessions</label>}
        {f.kind !== 'faculty' && f.sessions && <input className="pr-srate" aria-label="Session rate per hour" inputMode="decimal" value={f.session_rate || ''} onChange={e => setF({ ...f, session_rate: e.target.value })} placeholder="session $/h" />}
        {dirty && <button className="chip primary" onClick={() => save(f)}>Save</button>}
        <button className="chip" onClick={async () => { if (!confirm(`Take ${p.name || p.email} off the list? New months won’t fill them in.`)) return; try { await post({ action: 'unperson', email: p.email }); await reload(); } catch (e) { setErr(e.message); } }}>Remove</button>
      </span>
    </div>
  );
}

// Director only: who gets the month, and who can see payroll
function Settings({ d, reload, setErr, setMsg }) {
  const [f, setF] = useState(d.settings); const [busy, setBusy] = useState(false);
  const dirty = f.admin_name !== d.settings.admin_name || f.admin_email !== d.settings.admin_email;
  const saveAdmin = async e => { e.preventDefault(); setBusy(true); setErr(''); try { await post({ action: 'settings', ...f }); setMsg('Saved.'); await reload(); } catch (x) { setErr(x.message); } setBusy(false); };
  const toggle = async (email, on) => { setErr(''); try { await post({ action: 'access', email, on }); await reload(); } catch (x) { setErr(x.message); } };
  return (
    <details className="pr-sec pr-settings" open={!d.settings.admin_email}>
      <summary><h2>Settings</h2></summary>
      <form className="pr-add" onSubmit={saveAdmin} aria-label="Payroll admin">
        <span className="cap wide">Who the month is sent to</span>
        <label><span className="cap">Name</span><input value={f.admin_name} onChange={e => setF({ ...f, admin_name: e.target.value })} placeholder="e.g. the bookkeeper" /></label>
        <label><span className="cap">Email</span><input type="email" value={f.admin_email} onChange={e => setF({ ...f, admin_email: e.target.value })} /></label>
        <span className="pr-acts"><button className="chip primary" disabled={busy || !dirty}>{busy ? 'Saving…' : 'Save'}</button></span>
      </form>
      <span className="cap">Who can see payroll</span>
      <ul className="pr-access">{d.access.map(a => <li key={a.email}><label><input type="checkbox" checked={a.director || a.payroll} disabled={a.director} onChange={e => toggle(a.email, e.target.checked)} /> {a.name} <span className="sub">{a.director ? 'director: always' : a.email}</span></label></li>)}</ul>
      <p className="sub">Ticking someone gives them the Payroll role on the Team tab: they can see and edit payroll, finalize and send. Only a director changes who can see it and where it is sent.</p>
    </details>
  );
}
