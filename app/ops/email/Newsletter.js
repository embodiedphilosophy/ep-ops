'use client';
import { useCallback, useEffect, useState } from 'react';
import { Layout, useSide } from './EmailKit';

const API = '/api/ops/email/newsletter';
const post = async body => { const res = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); const j = await res.json().catch(() => ({})); if (!res.ok) throw Object.assign(new Error(j.error || 'Couldn’t save that'), j); return j; };
const long = d => new Date(d + 'T12:00:00Z').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
const addD = (d, n) => { const x = new Date(d + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const nextSunday = t => { const x = new Date(t + 'T12:00:00Z'); return addD(t, (7 - x.getUTCDay()) % 7 || 7); };
const STATE_CLASS = { Skipped: 'bad' };

export function Newsletter() {
  const [date, setDate] = useState(null); const [ready, setReady] = useState(false);
  useEffect(() => { setDate(new URLSearchParams(window.location.search).get('date')); setReady(true); }, []);
  return ready ? (date ? <Editor date={date} /> : <List />) : null;
}

function List() {
  const [d, setD] = useState(null); const [err, setErr] = useState(''); const [panel, setPanel] = useState(false); const side = useSide(panel);
  const load = useCallback(async () => { const res = await fetch(`${API}?fresh=1`).catch(() => null), j = await res?.json().catch(() => ({})) || {}; if (!res?.ok) { setErr(j.error || 'Couldn’t read the newsletter'); return; } setD(j); }, []);
  useEffect(() => { load(); }, [load]);
  const make = async day => { try { await post({ action: 'create', date: day }); window.location.href = `/ops/email/newsletter?date=${day}`; } catch (e) { setErr(e.message); } };
  const [tab, setTab] = useState('upcoming');
  const upcoming = d && nextSunday(d.today), has = d && d.issues.some(i => i.send_date === upcoming);
  // Upcoming: everything still to go out, soonest first. Skipped and Sent collect on their own tabs, most recent first.
  const groups = { upcoming: [], skipped: [], sent: [] };
  (d?.issues || []).forEach(i => groups[i.state === 'Skipped' ? 'skipped' : i.state === 'Sent' ? 'sent' : 'upcoming'].push(i));
  groups.upcoming.sort((a, b) => a.send_date.localeCompare(b.send_date));
  groups.skipped.sort((a, b) => b.send_date.localeCompare(a.send_date)); groups.sent.sort((a, b) => b.send_date.localeCompare(a.send_date));
  const shown = groups[tab], EMPTY = { upcoming: 'Nothing coming up yet.', skipped: 'No weeks have been skipped.', sent: 'Nothing has gone out yet.' };
  return (
    <Layout title={<>The Weekly <em>Scaffolding</em></>} intro="One issue a week. Numbers count only the issues that went out, so a week that was skipped doesn’t take a number." panel={panel} setPanel={setPanel} d={side}>
      {err && <p className="hint err" role="alert">{err}</p>}
      {d?.error && <p className="em-banner bad" role="status">{d.error}</p>}
      {!d ? <p className="ops-empty">Reading the issues…</p> : (
        <section className="soc-panel" aria-label="Issues">
          <div className="ph"><div className="soc-seg" role="group" aria-label="Which issues">{[['upcoming', 'Coming up'], ['skipped', 'Skipped'], ['sent', 'Sent']].map(([k, l]) => <button key={k} type="button" aria-pressed={tab === k} onClick={() => setTab(k)}>{l} <span className="mono">{groups[k].length}</span></button>)}</div>
            {d.canEdit && !has && <button className="soc-btn small primary" onClick={() => make(upcoming)}>Start {long(upcoming)}</button>}</div>
          {!shown.length ? <p className="ops-empty">{EMPTY[tab]}</p> : <ul className="em-list">{shown.map(i => (
            <li key={i.send_date} className="em-row"><div className="b"><span className="mono meta">{long(i.send_date)}</span><br />
              <b>{i.number ? `No. ${i.number}` : 'No number'}</b>{i.subject ? ` · ${i.subject}` : ''}
              <span className="chips"><span className={`gchip ${STATE_CLASS[i.state] || ''}`}>{i.state}</span></span></div>
              <a className="soc-btn small" href={`/ops/email/newsletter?date=${i.send_date}`}>{['Sent', 'Skipped'].includes(i.state) ? 'View' : 'Write'}</a></li>))}</ul>}
        </section>)}
    </Layout>);
}

function Editor({ date }) {
  const [d, setD] = useState(null); const [f, setF] = useState({}); const [err, setErr] = useState(''); const [msg, setMsg] = useState(''); const [busy, setBusy] = useState('');
  const [html, setHtml] = useState(''); const [dlg, setDlg] = useState(null); const [note, setNote] = useState(''); const [panel, setPanel] = useState(false); const side = useSide(panel);
  const load = useCallback(async () => {
    const res = await fetch(`${API}?date=${date}&fresh=1`).catch(() => null), j = await res?.json().catch(() => ({})) || {};
    if (!res?.ok) { setErr(j.error || 'Couldn’t read this issue'); return; } setD(j); setF(j.issue.values);
    fetch(`${API}?date=${date}&preview=1`).then(r => r.text()).then(setHtml).catch(() => {});
  }, [date]);
  useEffect(() => { load(); }, [load]);
  const run = async (key, fn, ok) => { setBusy(key); setErr(''); setMsg(''); try { await fn(); if (ok) setMsg(ok); } catch (e) { setErr(e.message); if (e.checks) setDlg(x => x && { ...x, checks: e.checks, needNote: true }); } setBusy(''); };
  if (!d) return <Layout title="Issue" intro="" panel={false} setPanel={() => {}} d={null}>{err ? <p className="hint err" role="alert">{err}</p> : <p className="ops-empty">Opening…</p>}</Layout>;
  const i = d.issue, dis = !d.canEdit || !d.editable || !!busy;
  const keys = ['subject', 'preview_text', 'events_intro', 'reflection_headline', 'reflection_body', 'reflection_url', 'ps', 'featured_offer_title', 'featured_offer_text', 'featured_offer_url', 'featured_offer_button'];
  const changed = Object.fromEntries(keys.filter(k => (f[k] || '') !== (i.values[k] || '')).map(k => [k, f[k] || '']));
  const save = () => run('save', async () => { await post({ action: 'save', date, changes: changed }); await load(); }, 'Saved.');
  const field = (k, label, extra = {}) => <label className="em-f"><span className="cap">{label}</span>{extra.area ? <textarea rows={extra.rows || 5} value={f[k] || ''} disabled={dis} onChange={e => setF({ ...f, [k]: e.target.value })} /> : <input value={f[k] || ''} disabled={dis} onChange={e => setF({ ...f, [k]: e.target.value })} />}</label>;
  const hasVerse = !!(f.sanskrit_devanagari || f.sanskrit_iast);
  return (
    <Layout title={<>{i.number ? `No. ${i.number}` : 'Issue'} <em>{long(date)}</em></>} intro={`${i.state}${d.audience ? ` · goes to: ${d.audience}` : ''}`} panel={panel} setPanel={setPanel} d={side}>
      <p><a href="/ops/email/newsletter">← All issues</a></p>
      {err && <p className="hint err" role="alert">{err}</p>}{msg && <p className="hint" role="status">{msg}</p>}
      {!d.editable && <p className="em-banner" role="status">This issue is {i.state.toLowerCase()}, so it can’t be changed here.</p>}
      {d.gaps.length > 0 && d.editable && <p className="em-banner bad" role="status">Still blank: {d.gaps.join(', ')}.</p>}
      <div className="em-edit"><div>
        <section className="soc-panel" aria-label="Writing">
          <div className="ph"><h2>This week’s issue</h2></div>
          {field('subject', 'Subject')}{field('preview_text', 'Preview text')}{field('reflection_headline', 'Theme (the reflection’s headline)')}
          {field('reflection_body', 'Reflection', { area: true, rows: 7 })}{field('reflection_url', 'Reflection link')}
          {field('events_intro', 'Line above “This week at EP”')}{field('ps', 'P.S.', { area: true, rows: 3 })}
        </section>
        <section className="soc-panel" aria-label="Featured offer"><div className="ph"><h2>Featured offer</h2><span className="sub">Optional. One offer between the week’s events and “Study With Us”. Leave it blank for none.</span></div>
          {field('featured_offer_title', 'Offer title')}{field('featured_offer_text', 'A few lines about it', { area: true, rows: 3 })}
          <div className="em-two">{field('featured_offer_url', 'Link')}{field('featured_offer_button', 'Button text (default: Learn more →)')}</div></section>
        <section className="soc-panel" aria-label="Verse">
          <div className="ph"><h2>Sanskrit verse</h2><span className="sub">Chosen from the verified Quote Library. The diacritics are copied, never typed.</span></div>
          {hasVerse && <blockquote className="em-verse"><div lang="sa">{f.sanskrit_devanagari}</div><div><i>{f.sanskrit_iast}</i></div><div>{f.sanskrit_translation}</div><div className="sub">{f.sanskrit_source}</div></blockquote>}
          <select aria-label="Choose a verse" value="" disabled={dis} onChange={e => e.target.value && run('verse', async () => { await post({ action: 'save', date, changes: { quote_id: e.target.value } }); await load(); }, 'Verse added.')}>
            <option value="">{hasVerse ? 'Change the verse…' : 'Choose a verse…'}</option>{d.verses.map(v => <option key={v.quote_id} value={v.quote_id}>{v.iast.slice(0, 70)} · {v.source}</option>)}</select>
          {hasVerse && !dis && <button className="soc-btn small" onClick={() => run('clear', async () => { await post({ action: 'save', date, changes: { clear_verse: true } }); await load(); }, 'Verse removed.')}>Remove the verse</button>}
        </section>
        <section className="soc-panel" aria-label="This week at EP">
          <div className="ph"><h2>This week at EP</h2><span className="sub">Filled in from the Master Schedule. Fix a time or title in Programming, not here.</span></div>
          {!d.events.length ? <p className="ops-empty">Nothing public is scheduled for this week.</p> : <ul className="em-list">{d.events.map(e => <li key={e.id} className="em-row"><div className="b"><span className="mono meta">{e.date} {e.time}</span><br /><b>{e.title}</b>{e.enrolled_only && <span className="gchip">Enrolled students only</span>}</div></li>)}</ul>}
          {d.left_out.length > 0 && <p className="sub">Left out on the schedule: {d.left_out.map(e => e.title).join('; ')}.</p>}
        </section></div>
        <aside className="em-pre" aria-label="Preview"><iframe title="Newsletter preview" sandbox="" srcDoc={`<!doctype html><meta charset="utf-8"><body style="margin:0;background:#EFE9DA">${html}`} style={{ width: '100%', height: 640 }} />
          <p className="sub">The preview shows what is saved. Save, then it updates.</p></aside></div>
      <div className="soc-sumbar"><span>{Object.keys(changed).length ? 'You have changes that aren’t saved.' : ''}</span><span className="soc-act">
        <button className="soc-btn" disabled={dis || !Object.keys(changed).length} onClick={save}>{busy === 'save' ? 'Saving…' : 'Save'}</button>
        <button className="soc-btn" disabled={dis || !!Object.keys(changed).length} onClick={() => confirm('Make or update the Kit draft for this issue?\n\nIt replaces any edits made to the draft inside Kit. Nothing is scheduled or sent.') && run('build', async () => { const j = await post({ action: 'build', date, confirm: true }); setMsg(j.action === 'updated' ? 'Kit draft updated.' : 'Kit draft made.'); await load(); })}>{busy === 'build' ? 'Sending to Kit…' : 'Save draft to Kit'}</button>
        <button className="soc-btn primary" disabled={dis || !i.kit_id || !!Object.keys(changed).length} onClick={() => setDlg({ checks: d.gaps.map(g => `Still blank: ${g}`), needNote: d.gaps.length > 0 })}>Schedule for Sunday 9:00 ET…</button>
        {d.canEdit && d.editable && <button className="soc-btn" disabled={!!busy} onClick={() => confirm('Skip this issue?\n\nIt stays on the list as Skipped and takes no number. Nothing is deleted, and Kit is not changed.') && run('skip', async () => { await post({ action: 'skip', date, confirm: true }); window.location.href = '/ops/email/newsletter'; })}>Skip this week</button>}</span></div>
      {dlg && <div className="em-dlg" role="dialog" aria-modal="true" aria-label="Schedule in Kit"><div className="em-dbox">
        <h2>Schedule in Kit</h2><p><b>{f.subject || '(no subject)'}</b><br />Goes out on <b>{long(date)}</b> at <b>9:00 ET</b> to <b>{d.audience}</b>.</p>
        {dlg.checks.length ? <><p><b>These checks didn’t pass:</b></p><ul>{dlg.checks.map(c => <li key={c}>{c}</li>)}</ul></> : <p>All the checks passed.</p>}
        {dlg.needNote && <label className="em-f"><span className="cap">Schedule anyway: why? (kept on the issue)</span><input value={note} onChange={e => setNote(e.target.value)} /></label>}
        <div className="soc-act"><button className="soc-btn" onClick={() => setDlg(null)}>Cancel</button><button className="soc-btn primary" disabled={!!busy || (dlg.needNote && !note.trim())} onClick={() => run('sched', async () => { await post({ action: 'schedule', date, confirm: true, override_note: note }); setDlg(null); setNote(''); await load(); }, 'Scheduled in Kit.')}>{busy === 'sched' ? 'Scheduling…' : 'Schedule it'}</button></div></div></div>}
    </Layout>);
}
