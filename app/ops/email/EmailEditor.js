'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Chip, Layout, useSide } from './EmailKit';

const API = '/api/ops/email/plan';
const post = async body => { const res = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); const j = await res.json().catch(() => ({})); if (!res.ok) throw Object.assign(new Error(j.error || 'Couldn’t save that'), j); return j; };
const NEW = { text: { type: 'text', text: '' }, facts: { type: 'facts' }, member: { type: 'member', member: '', nonmember: '' }, teacher: { type: 'teacher', teacher: '' }, button: { type: 'button', label: 'Join us →', url: '' }, image: { type: 'image', url: '', alt: '' }, html: { type: 'html', html: '' } };
const NAMES = { text: 'Text', facts: 'Event facts', member: 'Member / non-member', teacher: 'Teacher', button: 'Button', image: 'Image', html: 'Kit HTML' };
const londonOf = (date, time) => { try { const g = new Date(`${date}T${time}:00Z`), ny = new Date(g.toLocaleString('en-US', { timeZone: 'America/New_York' })); return new Date(g.getTime() + (g - ny)).toLocaleTimeString('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }); } catch { return ''; } };

function BlockEditor({ b, i, n, set, move, del, teachers, disabled }) {
  const ta = useRef(null);
  const wrap = (a, z = a) => { const el = ta.current; if (!el) return; const { selectionStart: s, selectionEnd: e, value } = el; set({ ...b, text: value.slice(0, s) + a + value.slice(s, e) + z + value.slice(e) }); };
  const link = () => { const u = prompt('Link address (https://…)'); if (u) wrap('[', `](${u})`); };
  const f = (k, label, extra = {}) => <label className="em-f"><span className="cap">{label}</span><input value={b[k] || ''} disabled={disabled} onChange={e => set({ ...b, [k]: e.target.value })} {...extra} /></label>;
  return (
    <div className="em-block">
      <div className="em-bh"><b>{NAMES[b.type]}</b><span className="soc-act">
        <button className="soc-btn small" disabled={disabled || i === 0} onClick={() => move(-1)} aria-label="Move up">↑</button>
        <button className="soc-btn small" disabled={disabled || i === n - 1} onClick={() => move(1)} aria-label="Move down">↓</button>
        <button className="soc-btn small" disabled={disabled} onClick={del} aria-label="Remove this block">Remove</button></span></div>
      {b.type === 'text' && <><div className="soc-act"><button className="soc-btn small" onClick={() => wrap('**')} disabled={disabled}><b>B</b></button><button className="soc-btn small" onClick={() => wrap('*')} disabled={disabled}><i>I</i></button><button className="soc-btn small" onClick={link} disabled={disabled}>Link</button></div>
        <textarea ref={ta} rows={5} value={b.text} disabled={disabled} aria-label="Text" onChange={e => set({ ...b, text: e.target.value })} /></>}
      {b.type === 'facts' && <p className="sub">Date, time (ET and London), teacher and price come from the Master Schedule, so they can’t be typed over here. Fix them in Programming.</p>}
      {b.type === 'member' && <><label className="em-f"><span className="cap">Members see</span><textarea rows={3} value={b.member} disabled={disabled} onChange={e => set({ ...b, member: e.target.value })} /></label>
        <label className="em-f"><span className="cap">Everyone else sees</span><textarea rows={3} value={b.nonmember} disabled={disabled} onChange={e => set({ ...b, nonmember: e.target.value })} /></label></>}
      {b.type === 'teacher' && <label className="em-f"><span className="cap">Teacher (their short bio is used)</span><select value={b.teacher} disabled={disabled} onChange={e => set({ ...b, teacher: e.target.value })}><option value="">Choose…</option>{teachers.map(t => <option key={t.email} value={t.email}>{t.name}{t.has_bio ? '' : ' (no bio yet)'}</option>)}</select></label>}
      {b.type === 'button' && <>{f('label', 'Button text')}{f('url', 'Link')}</>}
      {b.type === 'image' && <>{f('url', 'Picture link')}{f('alt', 'Describe the picture')}</>}
      {b.type === 'html' && <><p className="sub">This is Kit’s own HTML, kept exactly as it is. Edit it in Kit if you need to change it.</p><textarea rows={5} value={b.html} disabled={disabled} onChange={e => set({ ...b, html: e.target.value })} /></>}
    </div>);
}

function Audience({ aud, set, kit, disabled }) {
  const [count, setCount] = useState(null);
  const key = JSON.stringify(aud);
  useEffect(() => {
    const inc = aud.include.map(x => `${x.type}:${x.id}`).join(','); let live = true;
    fetch(`${API}?what=count&include=${inc}${aud.exclude.length ? '&exclude=1' : ''}`).then(r => r.json()).then(j => live && setCount(j)).catch(() => {}); return () => { live = false; };
  }, [key]);
  const add = (list, v) => { if (!v) return; const [type, id] = v.split(':'), src = type === 'tag' ? kit.tags : kit.segments, name = src.find(x => String(x.id) === id)?.name || ''; if (!aud[list].some(x => x.type === type && String(x.id) === id)) set({ ...aud, [list]: [...aud[list], { type, id: Number(id), name }] }); };
  const rm = (list, x) => set({ ...aud, [list]: aud[list].filter(y => y !== x) });
  const picker = list => <select aria-label={list === 'include' ? 'Add a group to send to' : 'Add a group to leave out'} value="" disabled={disabled} onChange={e => add(list, e.target.value)}>
    <option value="">{list === 'include' ? 'Send to a group…' : 'Leave out a group…'}</option>{kit.tags.map(t => <option key={'t' + t.id} value={`tag:${t.id}`}>Tag · {t.name}</option>)}{kit.segments.map(t => <option key={'s' + t.id} value={`segment:${t.id}`}>Segment · {t.name}</option>)}</select>;
  const chips = list => aud[list].map(x => <button key={x.type + x.id} className="gchip" disabled={disabled} onClick={() => rm(list, x)} aria-label={`Remove ${x.name}`}>{x.name} ×</button>);
  return (
    <section className="soc-panel" aria-label="Audience">
      <div className="ph"><h2>Who gets it</h2></div>
      <p>{aud.include.length ? chips('include') : <span className="sub">Everyone on the list</span>} {picker('include')}</p>
      <p><span className="sub">Not to:</span> {chips('exclude')} {picker('exclude')}</p>
      <p className="sub" role="status">{count?.n != null ? `${count.exact ? '' : 'Up to '}${count.n.toLocaleString()} people.` : count?.note || 'Counting…'} {count?.n != null && count.note}</p>
    </section>);
}

export function EmailEditor() {
  const [id, setId] = useState(null); const [d, setD] = useState(null);
  const [f, setF] = useState(null); const [blocks, setBlocks] = useState([]); const [aud, setAud] = useState({ include: [], exclude: [] });
  const [html, setHtml] = useState(''); const [mobile, setMobile] = useState(false); const [panel, setPanel] = useState(false); const side = useSide(panel);
  const [msg, setMsg] = useState(''); const [err, setErr] = useState(''); const [busy, setBusy] = useState(''); const [dirty, setDirty] = useState(false);
  const [dlg, setDlg] = useState(null); const [note, setNote] = useState(''); const [comment, setComment] = useState('');
  const [meta, setMeta] = useState({ events: [], kit: { tags: [], segments: [] }, teachers: [] }); const seq = useRef(0);

  const load = useCallback(async (which, fresh = false) => {
    const res = await fetch(`${API}?id=${which}${fresh ? '&fresh=1' : ''}`), j = await res.json().catch(() => ({}));
    if (!res.ok) { setErr(j.error || 'Couldn’t read this email'); return; }
    setD(j); setF({ ...j.plan }); setBlocks(j.blocks); setAud(j.audience.include ? j.audience : { include: [], exclude: [] }); setHtml(j.preview); setMeta({ events: j.events, kit: j.kit, teachers: j.teachers }); setDirty(false);
  }, []);
  useEffect(() => {
    const q = new URLSearchParams(window.location.search), want = q.get('id');
    if (want) { setId(want); load(want); return; }
    // a new email: nothing is saved until the first Save
    fetch(`${API}?what=meta`).then(r => r.json()).then(m => {
      setMeta({ events: m.events || [], kit: m.kit || { tags: [], segments: [] }, teachers: m.teachers || [] });
      setF({ event_id: q.get('event') || '', type: 'Promo', step: '', subject: '', preview_text: '', planned_date: q.get('date') || '', planned_time_et: '09:00', status: 'Draft', _new: true }); setBlocks([NEW.text, NEW.facts, NEW.button]);
    }).catch(() => setErr('Couldn’t open a new email'));
  }, [load]);
  // Redraw the preview as the copy changes
  useEffect(() => {
    if (!f) return undefined; const my = ++seq.current;
    const t = setTimeout(async () => { try { const j = await post({ action: 'preview', blocks, event_id: f.event_id }); if (my === seq.current) setHtml(j.html); } catch {} }, 450); return () => clearTimeout(t);
  }, [blocks, f?.event_id]);

  if (!f) return <Layout title="Email" intro="" panel={false} setPanel={() => {}} d={null}>{err ? <p className="hint err" role="alert">{err}</p> : <p className="ops-empty">Opening…</p>}</Layout>;
  const edit = (k, v) => { setF(x => ({ ...x, [k]: v })); setDirty(true); };
  const setBlock = (i, b) => { setBlocks(bs => bs.map((x, j) => j === i ? b : x)); setDirty(true); };
  const locked = f.status === 'Sent', canEdit = d ? d.canEdit : true;
  const dis = locked || !canEdit || !!busy;
  const run = async (key, fn, ok) => { setBusy(key); setErr(''); setMsg(''); try { await fn(); if (ok) setMsg(ok); } catch (e) { setErr(e.message); if (e.checks) setDlg(x => x && { ...x, checks: e.checks, needNote: true }); } setBusy(''); };
  const changes = () => ({ subject: f.subject, preview_text: f.preview_text, planned_date: f.planned_date, planned_time_et: f.planned_time_et, event_id: f.event_id, type: f.type, step: f.step, blocks, audience: aud });
  const save = (toKit) => run(toKit ? 'kit' : 'save', async () => {
    if (f._new) { const j = await post({ action: 'create', ...changes() }); window.location.href = `/ops/publish?view=compose&kind=email&id=${j.id}`; return; }
    await post({ action: 'save', id, changes: changes(), pushToKit: !!toKit }); await load(id, true);
  }, toKit ? 'Saved, and sent to Kit as a draft. Nothing was scheduled.' : 'Saved in Ops.');
  const openSchedule = () => setDlg({ checks: d.checks, needNote: d.checks.length > 0 || f.status !== 'Ready for Jake' });
  const schedule = () => run('sched', async () => { await post({ action: 'schedule', id, confirm: true, override_note: note }); setDlg(null); setNote(''); await load(id, true); }, 'Scheduled in Kit.');
  const rev = d?.revisions || [];
  return (
    <Layout title={<>{f._new ? 'New' : 'Edit'} <em>email</em></>} intro={f._new ? 'Write it here. It reaches Kit as a draft when you save it to Kit.' : `${f.id} · ${f.status}${f.kit_id ? ' · in Kit' : ' · not in Kit yet'}`} panel={panel} setPanel={setPanel} d={side}>
      <p><a href="/ops/publish?view=email">← All emails</a> · <a href="/ops/publish?show=email">Email calendar</a></p>
      {err && <p className="hint err" role="alert">{err}</p>}{msg && <p className="hint" role="status">{msg}</p>}
      {locked && <p className="em-banner" role="status">This email has been sent, so it can’t be changed.</p>}
      {d && (f.conflict === 'kit' || f.conflict === 'both') && <section className="em-banner bad" role="alert">
        <span><b>Edited in Kit.</b> {f.conflict === 'both' ? 'It was also changed here, so the two versions differ.' : 'Nobody has changed it here.'} Kit’s subject: “{d.kitContent?.subject}”.</span>
        <span className="soc-act"><button className="soc-btn small" disabled={!!busy || !canEdit} onClick={() => confirm('Use the version in Kit? It replaces the copy shown here (kept in the revision history).') && run('rk', async () => { await post({ action: 'resolve', id, choose: 'kit' }); await load(id, true); }, 'Using Kit’s version.')}>Use Kit’s version</button>
          <button className="soc-btn small" disabled={!!busy || !canEdit} onClick={() => confirm('Keep the Ops version? It replaces what is in Kit.') && run('ro', async () => { await post({ action: 'resolve', id, choose: 'ops' }); await load(id, true); }, 'Kit now matches Ops.')}>Keep the Ops version</button></span></section>}
      {f.conflict === 'gone' && <p className="em-banner bad" role="alert">Kit no longer has this email. It may have been deleted there.</p>}
      <div className="em-edit">
        <div>
          <section className="soc-panel" aria-label="Details">
            <div className="ph"><h2>Details</h2></div>
            <label className="em-f"><span className="cap">Event</span><select value={f.event_id || ''} disabled={dis} onChange={e => edit('event_id', e.target.value)}><option value="">No event</option>{meta.events.map(e => <option key={e.id} value={e.id}>{e.date} · {e.title} ({e.id})</option>)}</select></label>
            <div className="em-two"><label className="em-f"><span className="cap">Type</span><input value={f.type || ''} disabled={dis} onChange={e => edit('type', e.target.value)} /></label><label className="em-f"><span className="cap">Step</span><input value={f.step || ''} disabled={dis} placeholder="Promo #1" onChange={e => edit('step', e.target.value)} /></label></div>
            <label className="em-f"><span className="cap">Subject</span><input value={f.subject || ''} disabled={dis} maxLength={150} onChange={e => edit('subject', e.target.value)} /></label>
            <label className="em-f"><span className="cap">Preview text</span><input value={f.preview_text || ''} disabled={dis} maxLength={200} onChange={e => edit('preview_text', e.target.value)} /></label>
            <div className="em-two"><label className="em-f"><span className="cap">Send on</span><input type="date" value={f.planned_date || ''} disabled={dis} onChange={e => edit('planned_date', e.target.value)} /></label>
              <label className="em-f"><span className="cap">At (ET){f.planned_date && f.planned_time_et ? ` · ${londonOf(f.planned_date, f.planned_time_et)} London` : ''}</span><input type="time" value={f.planned_time_et || ''} disabled={dis} onChange={e => edit('planned_time_et', e.target.value)} /></label></div>
          </section>
          <section className="soc-panel" aria-label="Email">
            <div className="ph"><h2>The email</h2></div>
            {blocks.map((b, i) => <BlockEditor key={i} b={b} i={i} n={blocks.length} disabled={dis} teachers={meta.teachers} set={x => setBlock(i, x)} del={() => { setBlocks(bs => bs.filter((_, j) => j !== i)); setDirty(true); }} move={dx => { setBlocks(bs => { const a = [...bs]; [a[i], a[i + dx]] = [a[i + dx], a[i]]; return a; }); setDirty(true); }} />)}
            <div className="soc-act" role="group" aria-label="Add a block">{Object.keys(NEW).filter(k => k !== 'html').map(k => <button key={k} className="soc-btn small" disabled={dis} onClick={() => { setBlocks(bs => [...bs, NEW[k]]); setDirty(true); }}>+ {NAMES[k]}</button>)}</div>
          </section>
          <Audience aud={aud} set={a => { setAud(a); setDirty(true); }} kit={meta.kit} disabled={dis} />
        </div>
        <aside className="em-pre" aria-label="Preview">
          <div className="soc-act"><button className="soc-btn small" aria-pressed={!mobile} onClick={() => setMobile(false)}>Desktop</button><button className="soc-btn small" aria-pressed={mobile} onClick={() => setMobile(true)}>Mobile</button></div>
          <iframe title="Email preview" sandbox="" srcDoc={`<!doctype html><meta charset="utf-8"><body style="margin:0;background:#EFE9DA"><div style="max-width:${mobile ? 360 : 600}px;margin:0 auto">${html}</div>`} style={{ width: mobile ? 380 : '100%', height: 620 }} />
          <p className="sub">What you see is what goes to Kit. Members and everyone else get different text in Kit; both are shown here.</p>
          {d && <p>{d.event && <><Chip program={d.event.program} /> {d.event.title}</>}</p>}
        </aside>
        <aside className="em-checks soc-panel" aria-label="Checks">
          <div className="ph"><h2>Checks</h2></div>
          {!d ? <p className="sub">The checks appear once the email is saved.</p> : !d.checks.length ? <p className="g ok">✓ All the checks passed. Nothing is sent until you schedule it.</p>
            : <><p className="sub">These must pass, or be explained, before it is scheduled in Kit.</p><ul>{d.checks.map(c => <li key={c.key} className="g bad">✗ {c.text}</li>)}</ul></>}
          {d && <p className="sub">{f.status}{f.kit_id ? ' · in Kit' : ' · not in Kit yet'}{f.planned_date ? ` · goes out ${f.planned_date}` : ''}</p>}
        </aside>
      </div>
      <div className="soc-sumbar">
        <span>{dirty ? 'You have changes that aren’t saved.' : f._new ? '' : 'Everything is saved.'}</span>
        <span className="soc-act">
          <button className="soc-btn" disabled={dis || !f.subject} onClick={() => save(false)}>{busy === 'save' ? 'Saving…' : 'Save'}</button>
          <button className="soc-btn" disabled={dis || !f.subject} onClick={() => save(true)}>{busy === 'kit' ? 'Sending to Kit…' : 'Save draft to Kit'}</button>
          {!f._new && <button className="soc-btn" disabled={dis || dirty || f.status === 'Ready for Jake' || f.status === 'Scheduled'} onClick={() => run('ready', async () => { await post({ action: 'ready', id }); await load(id, true); }, 'Marked ready for Jake.')}>Mark ready for Jake</button>}
          {!f._new && canEdit && !['Scheduled', 'Sent'].includes(f.status) && <button className="soc-btn" disabled={!!busy} onClick={() => confirm('Mark this email as not needed?\n\nIt leaves the plan and the calendar. Nothing is deleted, and Kit is not changed.') && run('nn', async () => { await post({ action: 'notNeeded', id, confirm: true }); window.location.href = '/ops/publish?view=email'; })}>Not needed</button>}
          {!f._new && <button className="soc-btn primary" disabled={dis || dirty || f.status === 'Scheduled'} onClick={openSchedule}>Schedule in Kit…</button>}
        </span>
      </div>
      {!f._new && d && <section className="soc-panel" aria-label="Test and history">
        <div className="ph"><h2>Test, history and comments</h2></div>
        <p>{d.kitUrl ? <>To send yourself a test, <a href={d.kitUrl} target="_blank" rel="noreferrer">open the draft in Kit</a> and use “Send test”. Kit doesn’t let Ops send tests.</> : 'Save the draft to Kit first, then send yourself a test from there.'}</p>
        <h3 className="ops-sub">Versions</h3>
        <ul className="em-list">{rev.map(r => <li key={r.revision} className="em-row"><div className="b"><span className="mono meta">Version {r.revision} · {new Date(r.at).toLocaleString('en-GB', { timeZone: 'America/New_York', dateStyle: 'medium', timeStyle: 'short' })} ET · {r.by}</span><br />{r.subject}</div></li>)}</ul>
        <h3 className="ops-sub">Comments</h3>
        <ul className="em-list">{d.comments.map((c, i) => <li key={i} className="em-row"><div className="b"><span className="mono meta">{c.by} · {new Date(c.at).toLocaleString('en-GB', { timeZone: 'America/New_York', dateStyle: 'medium', timeStyle: 'short' })}</span><br />{c.text}</div></li>)}{!d.comments.length && <li className="ops-empty">No comments yet.</li>}</ul>
        {canEdit && <div className="em-attach"><input aria-label="Write a comment" placeholder="Write a comment" value={comment} onChange={e => setComment(e.target.value)} /><button className="soc-btn small" disabled={!comment.trim() || !!busy} onClick={() => run('c', async () => { await post({ action: 'comment', id, text: comment }); setComment(''); await load(id, true); })}>Add</button></div>}
      </section>}
      {dlg && d && <div className="em-dlg" role="dialog" aria-modal="true" aria-label="Schedule in Kit"><div className="em-dbox">
        <h2>Schedule in Kit</h2>
        <p><b>{f.subject}</b><br />Goes out on <b>{f.planned_date || '(no date)'}</b> at <b>{f.planned_time_et || '(no time)'} ET</b> to <b>{aud.include.length ? aud.include.map(x => x.name).join(', ') : 'everyone on the list'}</b>{aud.exclude.length ? `, not ${aud.exclude.map(x => x.name).join(', ')}` : ''}.</p>
        {dlg.checks.length > 0 ? <><p><b>These checks didn’t pass:</b></p><ul>{dlg.checks.map(c => <li key={c.key}>{c.text}</li>)}</ul></> : <p>All the checks passed.</p>}
        {f.status !== 'Ready for Jake' && <p className="sub">It hasn’t been marked ready for Jake. You can still schedule it, with a note.</p>}
        {dlg.needNote && <label className="em-f"><span className="cap">Schedule anyway: why? (kept in the comments)</span><input value={note} onChange={e => setNote(e.target.value)} /></label>}
        <div className="soc-act"><button className="soc-btn" onClick={() => setDlg(null)}>Cancel</button><button className="soc-btn primary" disabled={!!busy || (dlg.needNote && !note.trim())} onClick={schedule}>{busy === 'sched' ? 'Scheduling…' : 'Schedule it'}</button></div>
      </div></div>}
    </Layout>);
}
