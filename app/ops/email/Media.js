'use client';
import { useCallback, useEffect, useState } from 'react';
import { Layout, useSide } from './EmailKit';

const API = '/api/ops/email/media';
const day = d => d ? new Date(d + 'T12:00:00Z').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }) : '';

// only (on a program's Recordings tab): the session IDs of that program; the page then shows just its replays
export function Media({ only }) {
  const [d, setD] = useState(null); const [err, setErr] = useState(''); const [msg, setMsg] = useState(''); const [link, setLink] = useState({}); const [busy, setBusy] = useState(''); const [panel, setPanel] = useState(false); const side = useSide(panel);
  const load = useCallback(async () => { const res = await fetch(API).catch(() => null), j = await res?.json().catch(() => ({})) || {}; if (!res?.ok) { setErr(j.error || 'Couldn’t read the media'); return; } setD(j); }, []);
  useEffect(() => { load(); }, [load]);
  const mark = async (e, again) => {
    const value = (link[e.id] ?? '').trim(); if (!value) return;
    if (again && !confirm(`Change the replay link for ${e.title}?\n\nThe old link is replaced on its page.`)) return;
    setBusy(e.id); setErr(''); setMsg('');
    try { const res = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'posted', id: e.id, link: value }) }), j = await res.json().catch(() => ({})); if (!res.ok) throw new Error(j.error || 'Couldn’t save that');
      setMsg(`${e.title}: replay link saved.`); setLink(l => ({ ...l, [e.id]: '' })); await load(); } catch (x) { setErr(x.message); } setBusy('');
  };
  const only_ = e => !only || only.includes(String(e.id).toUpperCase()); // a program's Recordings tab: just its sessions
  const row = (e, again) => (
    <li key={e.id} className="em-row"><div className="b"><span className="mono meta">{day(e.date)}{e.teachers ? ` · ${e.teachers}` : ''}</span><br /><b>{e.title}</b>
      {again && <><br /><a href={e.link} target="_blank" rel="noreferrer">{e.link}</a></>}
      {d.canEdit && <div className="em-attach"><input aria-label={`Circle link for ${e.title}`} placeholder="Paste the Circle link (https://…)" value={link[e.id] ?? ''} onChange={x => setLink(l => ({ ...l, [e.id]: x.target.value }))} />
        <button className="soc-btn small" disabled={!(link[e.id] || '').trim() || busy === e.id} onClick={() => mark(e, again)}>{again ? 'Change link' : 'Mark posted'}</button></div>}</div></li>);
  return (
    <Layout embedded={!!only} title={<><em>Media</em></>} intro="Recordings to post, the latest episodes, and what is coming for Tarka." panel={panel} setPanel={setPanel} d={side}>
      {err && <p className="hint err" role="alert">{err}</p>}{msg && <p className="hint" role="status">{msg}</p>}
      {!d ? <p className="ops-empty">Reading the calendar…</p> : <>
        <section className="soc-panel" aria-label="Replays to post"><div className="ph"><h2>Replays to post</h2><span className="sub">Sessions from the last 30 days with no replay yet. Post the recording in Circle, paste its link, and mark it posted: the link goes on the event as “Replay in Circle”.</span></div>
          {d.error ? <p className="ops-empty">{d.error}</p> : !d.replays.filter(only_).length ? <p className="ops-empty">Every session from the last 30 days has its replay.</p> : <ul className="em-list">{d.replays.filter(only_).map(e => row(e, false))}</ul>}</section>
        <section className="soc-panel" aria-label="Posted"><div className="ph"><h2>Posted in the last 30 days</h2></div>
          {!d.posted.filter(only_).length ? <p className="ops-empty">Nothing posted yet.</p> : <ul className="em-list">{d.posted.filter(only_).map(e => row(e, true))}</ul>}</section>
        {!only && <section className="soc-panel" aria-label="CHITHEADS"><div className="ph"><h2>CHITHEADS: latest episodes</h2></div>
          {!d.episodes.length ? <p className="ops-empty">Couldn’t read the podcast feed.</p> : <ul className="em-list">{d.episodes.map(ep => <li key={ep.title} className="em-row"><div className="b"><span className="mono meta">{ep.num ? `Ep. ${ep.num}` : 'Episode'}{ep.duration ? ` · ${ep.duration}` : ''}</span><br /><a href={ep.url} target="_blank" rel="noreferrer">{ep.title}</a>{ep.guest ? <><br /><span className="sub">{ep.guest}</span></> : null}</div></li>)}</ul>}</section>}
        {!only && <section className="soc-panel" aria-label="Tarka"><div className="ph"><h2>Tarka milestones</h2></div>
          <p className="ops-empty">A place for the journal’s milestones (editions, deadlines, targets). They will come from the Tarka Operations sheet when the Tarka area is built. Nothing here yet.</p></section>}</>}
    </Layout>);
}
