'use client';
import { useCallback, useEffect, useState } from 'react';
import { Layout, useSide } from './EmailKit';

const API = '/api/ops/email/reminders';
const post = async body => { const res = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); const j = await res.json().catch(() => ({})); if (!res.ok) throw new Error(j.error || 'Couldn’t save that'); return j; };
const when = iso => new Date(iso).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'America/New_York' }) + ' ET';
const STATE = { new: 'Will be made', made: 'Made', exists: 'Already made', skip: 'Skipped' };

function Rule({ r, kit, canEdit, upcoming, onChange, setMsg, setErr }) {
  const [open, setOpen] = useState(false); const [f, setF] = useState(r); const [busy, setBusy] = useState(false);
  useEffect(() => setF(r), [r]);
  const mine = upcoming.filter(u => u.rule.id === r.id);
  const act = async (fn, ok) => { setBusy(true); setErr(''); setMsg(''); try { await fn(); if (ok) setMsg(ok); await onChange(); } catch (e) { setErr(e.message); } setBusy(false); };
  const save = ch => act(() => post({ action: 'save', id: r.id, changes: ch }), 'Saved.');
  const aud = f.audience?.include || [];
  const addAud = v => { if (!v) return; const [type, id] = v.split(':'), name = (type === 'tag' ? kit.tags : kit.segments).find(x => String(x.id) === id)?.name || ''; if (!aud.some(x => x.type === type && String(x.id) === id)) setF({ ...f, audience: { ...f.audience, include: [...aud, { type, id: Number(id), name }] } }); };
  return (
    <li className="em-row" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
      <div className="em-rule-h">
        <label className="em-sw"><input type="checkbox" role="switch" aria-label={`${r.name} is ${r.enabled ? 'on' : 'off'}`} checked={r.enabled} disabled={!canEdit || busy} onChange={e => save({ enabled: e.target.checked })} /><span className="mono">{r.enabled ? 'On' : 'Off'}</span></label>
        <div className="b"><b>{r.name}</b><br /><span className="sub">{r.sends_text} · {aud.length ? aud.map(x => x.name).join(', ') : 'No audience yet'}{r.auto_schedule ? ' · schedules itself' : ' · makes drafts'}</span>
          {r.last_run && <><br /><span className="mono meta">Last ran {when(r.last_run)}: {r.last_result}</span></>}</div>
        <button className="soc-btn small" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? 'Close' : 'Edit'}</button>
      </div>
      {open && <div className="em-rule-f">
        <label className="em-f"><span className="cap">Name</span><input value={f.name} disabled={!canEdit} onChange={e => setF({ ...f, name: e.target.value })} /></label>
        <div className="em-two"><label className="em-f"><span className="cap">Programme codes (e.g. SS, WSML)</span><input value={f.tracks} disabled={!canEdit} onChange={e => setF({ ...f, tracks: e.target.value })} /></label>
          <label className="em-f"><span className="cap">Or words in the title</span><input value={f.title_match} disabled={!canEdit} placeholder="open session|practicum" onChange={e => setF({ ...f, title_match: e.target.value })} /></label></div>
        <label className="em-f"><span className="cap">When it goes out: 60m = an hour before · d0@08:00 = the day of, 8:00 ET · d-1@09:00 = the day before</span><input value={f.sends} disabled={!canEdit} onChange={e => setF({ ...f, sends: e.target.value })} /></label>
        <div className="em-f"><span className="cap">Who gets it</span><div>{aud.map(x => <button key={x.type + x.id} className="gchip" disabled={!canEdit} onClick={() => setF({ ...f, audience: { ...f.audience, include: aud.filter(y => y !== x) } })}>{x.name} ×</button>)}
          <select aria-label="Add a group" value="" disabled={!canEdit} onChange={e => addAud(e.target.value)}><option value="">Add a group…</option>{kit.tags.map(t => <option key={'t' + t.id} value={`tag:${t.id}`}>Tag · {t.name}</option>)}{kit.segments.map(t => <option key={'s' + t.id} value={`segment:${t.id}`}>Segment · {t.name}</option>)}</select></div></div>
        <label className="em-f"><span className="cap">Subject ({'{title} {day} {time} {teacher}'} fill in)</span><input value={f.subject} disabled={!canEdit} onChange={e => setF({ ...f, subject: e.target.value })} /></label>
        <label className="em-f"><span className="cap">Message</span><textarea rows={5} value={f.body} disabled={!canEdit} onChange={e => setF({ ...f, body: e.target.value })} /></label>
        <label className="em-f"><span className="cap">Button text (the link is the event’s Zoom link)</span><input value={f.button_label} disabled={!canEdit} onChange={e => setF({ ...f, button_label: e.target.value })} /></label>
        <label className="em-sw"><input type="checkbox" checked={f.auto_schedule} disabled={!canEdit} onChange={e => setF({ ...f, auto_schedule: e.target.checked })} /> Schedule the emails in Kit on their own (off: they are made as drafts for someone to check)</label>
        {canEdit && <div className="soc-act"><button className="soc-btn primary" disabled={busy} onClick={() => save({ name: f.name, tracks: f.tracks, title_match: f.title_match, sends: f.sends, audience: f.audience, subject: f.subject, body: f.body, button_label: f.button_label, auto_schedule: f.auto_schedule })}>Save</button>
          <button className="soc-btn" disabled={busy || !r.enabled} title={r.enabled ? '' : 'Switch the rule on first'} onClick={() => confirm(`Make the emails for “${r.name}” now?\n\nIt makes ${r.auto_schedule ? 'AND SCHEDULES' : 'drafts of'} one Kit email for each session in the next two weeks that doesn’t have one yet. Nothing is sent right now.`) && act(async () => { const j = await post({ action: 'run', id: r.id, confirm: true }); setMsg(`${j.made} made, ${j.skipped} skipped.`); })}>Make them now</button></div>}
      </div>}
      {mine.length > 0 && <ul className="em-list" style={{ marginTop: 6 }} aria-label={`Coming up for ${r.name}`}>{mine.map(u => <li key={u.key || u.event.id} className="em-row" style={{ padding: '6px 0' }}><div className="b"><span className="mono meta">{u.send_at ? when(u.send_at) : ''}</span> · {u.event.title} <span className="gchip">{STATE[u.state]}</span>{u.why && <span className="sub"> {u.why}</span>}</div></li>)}</ul>}
    </li>);
}

export function Reminders() {
  const [d, setD] = useState(null); const [err, setErr] = useState(''); const [msg, setMsg] = useState(''); const [panel, setPanel] = useState(false); const side = useSide(panel);
  const load = useCallback(async () => { const res = await fetch(`${API}?fresh=1`).catch(() => null), j = await res?.json().catch(() => ({})) || {}; if (!res?.ok) { setErr(j.error || 'Couldn’t read the rules'); return; } setD(j); }, []);
  useEffect(() => { load(); }, [load]);
  const add = async () => { try { await post({ action: 'create' }); await load(); } catch (e) { setErr(e.message); } };
  return (
    <Layout title={<><em>Reminders</em></>} intro="Rules that make each session’s reminder email in Kit, ahead of time. Every rule starts off. Nothing is sent from here: emails are made as drafts unless a rule is set to schedule itself." panel={panel} setPanel={setPanel} d={side}>
      {err && <p className="hint err" role="alert">{err}</p>}{msg && <p className="hint" role="status">{msg}</p>}
      {d?.kitError && <p className="em-banner bad" role="status">{d.kitError}</p>}
      {!d ? <p className="ops-empty">Reading the rules…</p> : <>
        <section className="soc-panel" aria-label="Rules">
          <div className="ph"><h2>Rules</h2>{d.canEdit && <button className="soc-btn small" onClick={add}>New rule</button>}</div>
          <ul className="em-list">{d.rules.map(r => <Rule key={r.id} r={r} kit={d.kit} canEdit={d.canEdit} upcoming={d.upcoming} onChange={load} setMsg={setMsg} setErr={setErr} />)}</ul>
        </section>
        <section className="soc-panel" aria-label="Handled elsewhere">
          <div className="ph"><h2>Handled elsewhere</h2><span className="sub">Not rules here, on purpose.</span></div>
          <ul className="em-list">{d.builtIn.map(b => <li key={b.key} id={`builtin-${b.key}`} className="em-row"><div className="b"><b>{b.name}</b><br /><span className="sub">{b.how}</span></div></li>)}</ul>
        </section></>}
    </Layout>);
}
