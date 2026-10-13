'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

// Publish → Email: each upcoming event's promo emails. Click one to write or change it; preview it; build its
// Kit draft (never scheduled or sent from here). Planned emails (from Task Templates) can be marked
// "not needed" and brought back; added emails can be deleted. Saves go through /api/ops/promo.
const FIELDS = [
  ['Email', 'Name', 'text', 'e.g. Promo email #3. Shown here and in Kit’s internal description.'],
  ['Send Date', 'Send date', 'date', ''],
  ['Status', 'Status', 'status', 'Ready = the words are final.'],
  ['Subject', 'Subject', 'text', ''],
  ['Preview Text', 'Preview text', 'text', 'The line inboxes show after the subject.'],
  ['Heading', 'Heading', 'text', 'Blank = the event’s title.'],
  ['Body', 'Body', 'long', 'A blank line starts a new paragraph.'],
  ['Button Text', 'Button text', 'text', 'Blank = “Join us →”.'],
  ['Button URL', 'Button link', 'text', 'Blank = the event’s registration link.'],
  ['Notes', 'Notes', 'long', 'For the team; not in the email.'],
];
const STATUSES = ['', 'Draft', 'Ready'];
const short = iso => iso ? new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/New_York' }) : '';
const kitWord = b => !b ? '' : b.sent ? `Sent ${short(b.at)}` : b.at ? `Scheduled ${short(b.at)}` : 'Draft in Kit';

async function post(body) {
  const res = await fetch('/api/ops/promo', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).catch(() => null);
  const j = await res?.json().catch(() => ({}));
  return { ok: !!res?.ok, status: res?.status, ...(j || {}), error: res?.ok ? null : j?.error || 'Couldn’t reach the server. Try again.' };
}

export default function PromoEmails({ events, canEdit, today }) {
  const router = useRouter();
  const [open, setOpen] = useState(null);   // `${eventId}|${key}` or `${eventId}|new`
  const [busy, setBusy] = useState(null);
  const [msg, setMsg] = useState({});       // eventId → message
  const done = () => { setOpen(null); router.refresh(); };

  const act = async (ev, em, action) => {
    if (action === 'remove' && !confirm(`Delete “${em.label}”?${em.values['Kit Draft'] ? ' Its draft stays in Kit; delete it there too if you don’t need it.' : ''}`)) return;
    setBusy(`${ev.id}|${em.key}`); setMsg(m => ({ ...m, [ev.id]: '' }));
    const r = await post({ action, event: ev.id, email: em.label, row: em.row, before: em.row ? em.values : {} });
    setBusy(null);
    if (!r.ok) return setMsg(m => ({ ...m, [ev.id]: r.error }));
    router.refresh();
  };

  return (
    <ul className="ops-promo">
      {events.map(ev => {
        const live = ev.emails.filter(x => !x.skipped);
        const late = ev.ready < live.length && live[ev.ready]?.due < today;
        return (
          <li key={ev.id} className={live.length && ev.ready >= live.length ? 'ok' : late ? 'late' : ''}>
            <div className="h"><b>{ev.title}</b> <span className="id">[{ev.id}]</span> <span className="d">{ev.when}</span>
              <span className="n">{ev.kit ? `${ev.ready} of ${live.length} scheduled` : `${live.length} planned`}</span></div>
            <ol>
              {ev.emails.map(em => {
                const k = `${ev.id}|${em.key}`, isOpen = open === k, b = em.kit;
                const locked = b && b.at; // scheduled or sent in Kit: can't be skipped or deleted here
                return (
                  <li key={em.key} className={`${em.skipped ? 'skip' : b?.at ? (b.sent ? 'sent' : 'sched') : 'miss'}${isOpen ? ' open' : ''}`}>
                    <div className="line">
                      <button type="button" className="w" onClick={() => setOpen(isOpen ? null : k)} aria-expanded={isOpen}>
                        {em.label}{!em.planned && <span className="tag">added</span>}
                      </button>
                      <span className="due">{em.skipped ? 'not needed' : `${em.planned ? 'due' : 'send'} ${short(em.due)}`}</span>
                      <span className="what">
                        {em.skipped ? <span className="none">Not needed for this event</span>
                          : b ? <a href={b.url} target="_blank" rel="noopener">{b.subject || 'Untitled'}</a>
                          : em.values.Subject ? <span className="subj">{em.values.Subject}</span>
                          : <span className="none">{ev.kit ? 'Not in Kit yet' : 'Not written yet'}</span>}
                      </span>
                      <span className="st">{em.skipped ? '' : b ? kitWord(b) : em.values.Status || (em.row ? 'Draft' : '')}</span>
                      {canEdit && (
                        <span className="acts">
                          {em.skipped ? <button type="button" className="chip" disabled={!!busy} onClick={() => act(ev, em, 'restore')}>Bring back</button> : <>
                            <button type="button" className="chip" onClick={() => setOpen(isOpen ? null : k)}>{isOpen ? 'Close' : 'Edit'}</button>
                            {!locked && (em.planned
                              ? <button type="button" className="chip" disabled={!!busy} title="This event doesn’t need this email" onClick={() => act(ev, em, 'skip')}>Not needed</button>
                              : <button type="button" className="chip danger" disabled={!!busy} onClick={() => act(ev, em, 'remove')}>Delete</button>)}
                          </>}
                        </span>
                      )}
                    </div>
                    {isOpen && <PromoForm ev={ev} em={em} canEdit={canEdit} onDone={done} onClose={() => setOpen(null)} />}
                  </li>
                );
              })}
              {ev.unmatched.map(b => (
                <li key={b.id} className="extra"><div className="line"><span className="w">In Kit, not on the plan</span><span className="due" />
                  <span className="what"><a href={b.url} target="_blank" rel="noopener">{b.subject || 'Untitled'}</a></span><span className="st">{kitWord(b)}</span></div></li>
              ))}
            </ol>
            {canEdit && (open === `${ev.id}|new`
              ? <PromoForm ev={ev} em={null} canEdit onDone={done} onClose={() => setOpen(null)} />
              : <p className="add"><button type="button" className="chip" onClick={() => setOpen(`${ev.id}|new`)}>+ Add another email</button></p>)}
            {msg[ev.id] && <p className="ops-promo-msg">{msg[ev.id]}</p>}
          </li>
        );
      })}
    </ul>
  );
}

function PromoForm({ ev, em, canEdit, onDone, onClose }) {
  const isNew = !em;
  // A new row starts from the plan: its name and date, the event's link, and the teacher's blurb if there is one
  const start = em?.row ? em.values : {
    Email: em?.label || `Extra email #${ev.emails.filter(x => !x.planned).length + 1}`,
    'Send Date': em?.due || ev.date,
    Body: em?.blurb || '',
  };
  const [vals, setVals] = useState(start);
  const [errors, setErrors] = useState({});
  const [msg, setMsg] = useState(em?.blurb && !em?.row ? 'The body starts from the teacher’s promo blurb.' : '');
  const [out, setOut] = useState(null);
  const [busy, setBusy] = useState(false);
  const base = em?.row ? em.values : {};
  const changed = FIELDS.map(f => f[0]).filter(h => String(vals[h] ?? '') !== String(base[h] ?? ''));
  const dirty = changed.length > 0;
  const lockName = em?.planned; // a planned email keeps its Task Templates name, so it stays matched to the plan

  const save = async () => {
    setBusy(true); setErrors({}); setMsg('');
    const r = await post({ action: 'save', event: ev.id, row: em?.row ?? null, changes: Object.fromEntries(changed.map(h => [h, vals[h] ?? ''])), before: em?.row ? em.values : {} });
    setBusy(false);
    if (r.ok) return onDone();
    setErrors(r.errors || {}); setMsg(r.error);
  };
  const build = async () => {
    if (!confirm(em.values['Kit Draft'] ? 'Rebuild the Kit draft? This replaces edits made inside Kit.' : 'Make a draft of this email in Kit? Nothing is scheduled or sent.')) return;
    setBusy(true); setOut(null);
    const r = await post({ action: 'build', row: em.row });
    setBusy(false); setOut(r);
  };

  return (
    <form className="ops-edit ops-promo-form" onSubmit={e => { e.preventDefault(); save(); }}>
      <p className="ops-edit-title">{isNew ? `New email for ${ev.title}` : em.label}</p>
      {em?.planned && <p className="hint">Planned in Task Templates for {short(em.planDue)}. Change the send date here if this event needs it sooner or later.</p>}
      {FIELDS.map(([h, label, type, hint]) => {
        const id = `pe-${ev.id}-${h.replace(/\W+/g, '-')}`, val = vals[h] ?? '', set = x => setVals(s => ({ ...s, [h]: x }));
        const ro = !canEdit || busy || (h === 'Email' && lockName);
        return (
          <div key={h} className={`row${errors[h] ? ' bad' : ''}${changed.includes(h) ? ' changed' : ''}`}>
            <label htmlFor={id}>{label}</label>
            {type === 'long' ? <textarea id={id} rows={h === 'Body' ? Math.min(14, Math.max(5, Math.ceil(String(val).length / 60))) : 2} value={val} disabled={ro} onChange={e => set(e.target.value)} />
              : type === 'status' ? <select id={id} value={val} disabled={ro} onChange={e => set(e.target.value)}>{[...new Set([...STATUSES, val])].map(o => <option key={o} value={o}>{o || '—'}</option>)}</select>
              : <input id={id} type={type} value={val} disabled={ro} placeholder={h === 'Heading' ? ev.title : h === 'Button URL' ? ev.registration || 'https://' : ''} onChange={e => set(e.target.value)} />}
            {(errors[h] || hint) && <span className="hint">{errors[h] || hint}</span>}
          </div>
        );
      })}
      {em?.row && (
        <div className="ops-news">
          <p className="hint">{dirty ? 'Save your changes first, then preview or build.' : 'Building makes or updates the Kit draft; choosing who it goes to, scheduling and sending stay in Kit.'}</p>
          <div className="bar">
            <a className="chip" href={`/api/ops/promo?row=${em.row}`} target="_blank" rel="noopener" aria-disabled={dirty}>Preview the email ↗</a>
            {canEdit && <button type="button" className="chip primary" disabled={busy || dirty} onClick={build}>{busy ? 'Working…' : em.values['Kit Draft'] ? 'Rebuild Kit draft' : 'Build Kit draft'}</button>}
            {em.values['Kit Draft'] && <a className="chip" href={em.values['Kit Draft']} target="_blank" rel="noopener">Open in Kit ↗</a>}
          </div>
          {out && <div className="ops-news-out">
            {(out.error || out.skipped) && <p>{out.error || out.skipped}</p>}
            {out.draft && <p>Draft {out.action || 'ready'}: <a href={out.draft} target="_blank" rel="noopener">open it in Kit ↗</a></p>}
          </div>}
        </div>
      )}
      <div className="bar">
        {canEdit && <button type="submit" className="chip primary" disabled={busy || !dirty}>{busy ? 'Saving…' : isNew || !em.row ? 'Save' : dirty ? `Save ${changed.length} change${changed.length === 1 ? '' : 's'}` : 'No changes'}</button>}
        <button type="button" className="chip" disabled={busy} onClick={() => (out?.draft ? onDone() : onClose())}>{canEdit ? 'Cancel' : 'Close'}</button>
        {msg && <span className="hint">{msg}</span>}
      </div>
    </form>
  );
}
