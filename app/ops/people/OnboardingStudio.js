'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import Onboarding from '../../teach/Onboarding';
import { COPY, DEFAULTS, STEPS, fillCopy } from '@/lib/teachcopy-defaults';

// Faculty → Onboarding: a teacher's onboarding exactly as they will see it (tried as them: the preview saves and sends
// nothing), with an edit panel for the words on each step (the same for every teacher), this teacher's course page
// draft, and the button that sends the onboarding invitation.
const API = '/api/ops/onboarding';
const post = async body => {
  const res = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).catch(() => null);
  const j = await res?.json().catch(() => ({})) || {};
  if (!res?.ok) throw new Error(j.error || 'Couldn’t save that'); return j;
};
const day = d => d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }) : '';
const stepName = k => STEPS.find(s => s[0] === k)?.[1] || k;
const PREFILL = [['title', 'Public title', 1], ['subtitle', 'One-line subtitle', 1], ['summary', 'Description (2–3 sentences)', 4], ['explore', 'What we’ll explore (one per line)', 4], ['audience', 'Who it’s for', 3]];

export default function OnboardingStudio({ initial = '' }) {
  const [people, setPeople] = useState(null);
  const [email, setEmail] = useState(initial);
  const [typed, setTyped] = useState('');
  const [d, setD] = useState(null);
  const [copy, setCopy] = useState(null);     // the words as edited here, shown live in the preview
  const [saved, setSaved] = useState(null);   // the words as saved
  const [stepKey, setStepKey] = useState('welcome');
  const [nonce, setNonce] = useState(0);
  const [err, setErr] = useState(''); const [msg, setMsg] = useState('');

  useEffect(() => { fetch(API).then(r => r.json()).then(j => setPeople(j.people || [])).catch(() => setPeople([])); }, []);
  const load = useCallback(async (e = email) => {
    if (!e) return; setErr(''); setD(null);
    const res = await fetch(`${API}?email=${encodeURIComponent(e)}`).catch(() => null), j = await res?.json().catch(() => ({})) || {};
    if (!res?.ok) { setErr(j.error || 'Couldn’t open this teacher’s onboarding'); return; }
    setD(j); setSaved(j.data.copy); setCopy(c => c || j.data.copy); setNonce(n => n + 1);
  }, [email]);
  useEffect(() => { if (email) { load(email); const u = new URL(window.location.href); u.searchParams.set('email', email); window.history.replaceState(null, '', u); } }, [email]); // eslint-disable-line react-hooks/exhaustive-deps

  const pick = e => { setMsg(''); setEmail(String(e).trim().toLowerCase()); };
  const sorted = useMemo(() => [...(people || [])].sort((a, b) => (a.next?.date || '9').localeCompare(b.next?.date || '9')), [people]);

  return (
    <div className="ob-studio">
      <div className="ob-pick">
        <label htmlFor="ob-who" className="cap">Teacher</label>
        <select id="ob-who" value={sorted.some(p => p.email === email) ? email : ''} onChange={e => e.target.value && pick(e.target.value)}>
          <option value="">{people ? 'Choose a teacher…' : 'Reading the schedule…'}</option>
          {sorted.map(p => <option key={p.email} value={p.email}>{p.name || p.email}{p.next ? ` · next ${day(p.next.date + 'T12:00:00Z')}` : ' · not on a session'} · {p.sent ? `invited ${day(p.sent)}` : p.status || 'not invited'}</option>)}
        </select>
        <form className="ob-other" onSubmit={e => { e.preventDefault(); if (typed.trim()) pick(typed); }}>
          <input aria-label="Someone else’s email" type="email" placeholder="Or someone else’s email" value={typed} onChange={e => setTyped(e.target.value)} />
          <button className="chip">Open</button>
        </form>
      </div>
      {err && <p className="hint err" role="alert">{err}</p>}
      {msg && <p className="hint" role="status">{msg}</p>}
      {!email ? <p className="ops-empty">Choose a teacher to see their onboarding exactly as they will. Their sessions, deliverables and course page come from Programming; the words come from here and are the same for every teacher.</p>
        : !d || !copy ? <p className="ops-empty">Opening their onboarding…</p> : (
        <div className="ob-grid">
          <section className="ob-preview" aria-label="Preview">
            <div className="ob-bar"><span><b>As {d.name || d.data.email}</b> sees it · {stepName(stepKey)}</span><span className="sub">A preview: nothing here is saved or sent.</span></div>
            <div className="ob-frame"><Onboarding key={`${email}-${nonce}`} data={{ ...d.data, copy }} embedded onStep={setStepKey} /></div>
          </section>
          <aside className="ob-edit" aria-label="Edit">
            <Send d={d} copy={copy} email={email} onSent={async m => { setMsg(m); await load(); fetch(API).then(r => r.json()).then(j => setPeople(j.people || [])).catch(() => {}); }} setErr={setErr} />
            <ThisTeacher d={d} stepKey={stepKey} email={email} reload={() => load()} setMsg={setMsg} setErr={setErr} />
            <Words stepKey={stepKey} copy={copy} saved={saved} setCopy={setCopy} setSaved={setSaved} setErr={setErr} />
          </aside>
        </div>)}
    </div>
  );
}

// The invitation: what it says (editable under "The invitation email") and the button
function Send({ d, copy, email, onSent, setErr }) {
  const [name, setName] = useState(d.name || ''); const [busy, setBusy] = useState(false);
  useEffect(() => setName(d.name || ''), [d.name]);
  const first = name.split(' ')[0] || 'there';
  const offerings = d.data.offerings;
  const send = async () => {
    if (!confirm(`Send the onboarding invitation to ${name} (${email})?\n\nThey get an email with a link that opens this onboarding, good for 7 days.${d.onTeam ? '' : ' They are added to the Team tab as a teacher so they can sign in.'}`)) return;
    setBusy(true); setErr('');
    try { const j = await post({ action: 'send', email, name }); await onSent(j.message); } catch (e) { setErr(e.message); }
    setBusy(false);
  };
  return (
    <section className="ob-card ob-send">
      <h3>Send the onboarding invitation</h3>
      <p className="sub">{d.sent ? `Last sent ${day(d.sent)}.` : 'Not sent from here yet.'} {offerings.length ? `On ${offerings.length} offering${offerings.length === 1 ? '' : 's'}.` : 'Not on any session yet: they’ll see only the profile step until they’re added in Programming.'}</p>
      <label className="cap" htmlFor="ob-name">Their name</label>
      <input id="ob-name" value={name} onChange={e => setName(e.target.value)} />
      <div className="ob-mail"><b>{fillCopy(copy, 'invite_subject', { first })}</b><p>Welcome, {first}</p>{fillCopy(copy, 'invite_body', { first }).split(/\n\s*\n/).map((p, i) => <p key={i}>{p}</p>)}<span className="ob-btn">Start onboarding</span><p className="sub">The link works for 7 days.</p></div>
      <button className="chip primary" disabled={busy || !name.trim()} onClick={send}>{busy ? 'Sending…' : d.sent ? 'Send it again' : 'Send onboarding invitation'}</button>
    </section>
  );
}

// What is particular to this teacher on the current step, and where it is changed
function ThisTeacher({ d, stepKey, email, reload, setMsg, setErr }) {
  const offs = d.data.offerings;
  const [which, setWhich] = useState(offs[0]?.key || '');
  useEffect(() => { if (!offs.some(o => o.key === which)) setWhich(offs[0]?.key || ''); }, [offs]); // eslint-disable-line react-hooks/exhaustive-deps
  const o = offs.find(x => x.key === which);
  if (stepKey === 'welcome') return (
    <section className="ob-card"><h3>For this teacher</h3>
      {!offs.length ? <p className="sub">Not on any upcoming session. Add them to one in <a href="/ops/programs">Programming</a> or with an <a href="/ops/people?view=invitations">invitation</a>.</p>
        : offs.map(x => <div key={x.key}><b>{x.title}</b><ul className="ob-list">{x.deliverables.map(t => <li key={t.task}>{t.task}</li>)}{!x.deliverables.length && <li>No deliverables for this track</li>}</ul></div>)}
      <p className="sub">Sessions and dates: <a href="/ops/programs">Programming</a>. What teachers owe, by track: <a href="/ops/settings?t=templates">Settings → Task templates</a> (rows assigned to Teacher).</p>
    </section>);
  if (stepKey === 'profile') return (
    <section className="ob-card"><h3>For this teacher</h3>
      <p className="sub">{d.data.onFile ? 'We have a bio on file, so they’re asked to confirm it.' : 'No bio on file, so they’re asked to write one.'}</p>
      <p><a href={`/ops/people/${encodeURIComponent(email)}?tab=profile`}>Open their profile</a> to write or fix their bio and headshot before they start.</p>
    </section>);
  if ((stepKey === 'course' || stepKey === 'preview') && o) return <Prefill key={o.key} o={o} offs={offs} which={which} setWhich={setWhich} email={email} reload={reload} setMsg={setMsg} setErr={setErr} />;
  if (stepKey === 'agreement') return (
    <section className="ob-card"><h3>For this teacher</h3>
      <p className="sub">They haven’t signed an agreement yet, so they read and sign the General Teaching Agreement here, before their bio. It lists their current offerings; the fee reads “as agreed with EP in writing for each offering”. Jacob countersigns automatically and the signed copy is archived in <a href="/ops/people?view=invitations">People → Invitations</a>.</p>
      <p className="sub">Teachers who signed an agreement with their invitation skip this step, and so do staff and contractors on the Team tab. To change the wording, add a row named “General Teaching Agreement” in <a href="/ops/settings?t=contracts">Settings → Contracts</a>.</p>
    </section>);
  if (stepKey === 'circle') return <section className="ob-card"><h3>For this teacher</h3><p className="sub">This step gives them access to their course in Circle. It shows only for Circle tracks (Sādhana School, SSWW, seasonal).</p></section>;
  return null;
}

// Fill in their course page draft before they start; they can change it
function Prefill({ o, offs, which, setWhich, email, reload, setMsg, setErr }) {
  const sent = ['submitted', 'published'].includes(String(o.page?.status || '').toLowerCase());
  const from = Object.fromEntries(PREFILL.map(([k]) => [k, o.page?.[k] || '']));
  const [f, setF] = useState(from); const [busy, setBusy] = useState(false);
  const dirty = PREFILL.some(([k]) => (f[k] || '') !== (from[k] || ''));
  const save = async () => {
    setBusy(true); setErr('');
    try { const j = await post({ action: 'prefill', email, offering: o.key, fields: f, before: from }); setMsg(j.message); await reload(); } catch (e) { setErr(e.message); }
    setBusy(false);
  };
  return (
    <section className="ob-card"><h3>Their course page draft</h3>
      {offs.length > 1 && <select aria-label="Which offering" value={which} onChange={e => setWhich(e.target.value)}>{offs.map(x => <option key={x.key} value={x.key}>{x.title}</option>)}</select>}
      {sent ? <p className="sub">They’ve already sent this course page. Change it in <a href="/ops/people?view=review">People → Bios to review</a>.</p> : <>
        <p className="sub">Fill in what you know; they’ll find it in place and can change it. The preview shows it once saved.</p>
        {PREFILL.map(([k, l, rows]) => <label key={k} className="ob-f"><span className="cap">{l}</span>{rows > 1 ? <textarea rows={rows} value={f[k]} onChange={e => setF({ ...f, [k]: e.target.value })} /> : <input value={f[k]} placeholder={k === 'title' ? o.title : ''} onChange={e => setF({ ...f, [k]: e.target.value })} />}</label>)}
        <button className="chip primary" disabled={busy || !dirty} onClick={save}>{busy ? 'Saving…' : 'Save their draft'}</button>
      </>}
    </section>
  );
}

// The words on this step: the same for every teacher. Typing changes the preview at once; Save keeps it.
function Words({ stepKey, copy, saved, setCopy, setSaved, setErr }) {
  const keys = COPY.filter(c => c[1] === stepKey || (stepKey === 'preview' && c[1] === 'preview'));
  const [busy, setBusy] = useState('');
  const save = async k => {
    setBusy(k); setErr('');
    try { const j = await post({ action: 'copy', key: k, text: copy[k] }); setSaved(s => ({ ...s, [k]: j.text })); setCopy(c => ({ ...c, [k]: j.text })); } catch (e) { setErr(e.message); }
    setBusy('');
  };
  const invite = COPY.filter(c => c[1] === 'invite');
  const field = ([k, , label, , hint]) => {
    const dirty = copy[k] !== saved[k], custom = saved[k] !== DEFAULTS[k];
    return (
      <div key={k} className="ob-f">
        <span className="cap">{label}</span>
        <textarea rows={Math.min(6, Math.max(1, Math.ceil(String(copy[k]).length / 42)))} value={copy[k]} onChange={e => setCopy(c => ({ ...c, [k]: e.target.value }))} />
        {hint && <span className="sub">{hint}</span>}
        <span className="ob-acts">
          {dirty && <button className="chip primary" disabled={busy === k} onClick={() => save(k)}>{busy === k ? 'Saving…' : 'Save'}</button>}
          {dirty && <button className="chip" onClick={() => setCopy(c => ({ ...c, [k]: saved[k] }))}>Undo</button>}
          {!dirty && custom && <button className="chip" onClick={() => { setCopy(c => ({ ...c, [k]: DEFAULTS[k] })); }}>Back to the original wording</button>}
        </span>
      </div>);
  };
  return (<>
    <section className="ob-card">
      <h3>Words on “{stepName(stepKey)}”</h3>
      <p className="sub">The same for every teacher. Typing changes the preview; Save puts it live. {'{first}'} is their first name.</p>
      {keys.length ? keys.map(field) : <p className="sub">Nothing to edit on this step.</p>}
    </section>
    <details className="ob-card"><summary><b>The invitation email’s words</b></summary>{invite.map(field)}</details>
  </>);
}
