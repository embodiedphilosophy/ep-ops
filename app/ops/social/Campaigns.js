'use client';
import { useEffect, useState } from 'react';

const short = d => new Date(d + 'T12:00:00Z').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
const CLIP = ['Not requested', 'Requested', 'In edit', 'Ready'];
const post = async body => {
  const res = await fetch('/api/ops/social/campaigns', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const j = await res.json().catch(() => ({})); if (!res.ok) throw new Error(j.error || 'Couldn’t save that'); return j;
};

// On Launches (embedded): the same sections without the page header, so a launch is planned in one place
export default function Campaigns({ embedded = false }) {
  const [d, setD] = useState(null);
  const [err, setErr] = useState(''); const [msg, setMsg] = useState(''); const [busy, setBusy] = useState('');
  const load = async () => {
    const res = await fetch('/api/ops/social/campaigns'), j = await res.json().catch(() => ({}));
    if (!res.ok) { setErr(j.error || 'Couldn’t read the campaigns'); return; } setD(j);
  };
  useEffect(() => { load(); }, []);
  // Arriving at Launches#coming-up or #countdown-…: scroll there once these sections have drawn (a countdown that doesn't exist yet → Coming up)
  useEffect(() => { if (embedded && d && /^#(coming-up|countdown-)/.test(window.location.hash)) requestAnimationFrame(() => (document.getElementById(window.location.hash.slice(1)) || document.getElementById('coming-up'))?.scrollIntoView()); }, [d]);
  const run = (key, body, ok) => async () => {
    setBusy(key); setErr(''); setMsg('');
    try { const j = await post(body); setMsg(typeof ok === 'function' ? ok(j) : ok || ''); await load(); } catch (e) { setErr(e.message); } setBusy('');
  };
  if (!d) return <div className={embedded ? '' : 'soc'}><p className={err ? 'hint err' : 'ops-empty'} role={err ? 'alert' : undefined}>{err || 'Reading the Master Schedule…'}</p></div>;
  const edit = d.canEdit;
  const clipFor = id => d.clips.find(c => c.id === id);
  return (
    <div className={embedded ? 'em-camps' : 'soc'}>
      {!embedded && <header className="soc-head">
        <div><span className="eyebrow">Content · Social</span><h1>Coming up &amp; <em>campaigns</em></h1>
          <p>For each public event in the next twelve weeks, choose whether to promote it, run a campaign, or leave it alone. Campaigns lay out their posts as proposals on the calendar. Nothing is approved or posted from here.</p></div>
      </header>}
      {err && <p className="hint err" role="alert">{err}</p>}
      {msg && <p className="hint" role="status">{msg}</p>}

      <section className="soc-panel" aria-label="Coming up" id="coming-up">
        <div className="ph"><h2>Coming up: what to promote</h2><span className="sub">{d.events.length} public events in the next twelve weeks. Promote it, run a social countdown, or skip it. Countdowns put their posts on the Social calendar as proposals; nothing is approved or posted from here.</span></div>
        {!d.events.length ? <p className="ops-empty">Nothing public is scheduled in the next twelve weeks.</p> : (
          <ul className="soc-rev camp">{d.events.map(e => (
            <li key={e.id} className={e.missing.length && e.state !== 'Skip' ? 'blocked' : ''}>
              <div className="b">
                <span className="mono meta">{short(e.date)}{e.time ? ` · ${e.time}` : ''} · {e.id}</span>
                <b>{e.title}</b>
                <span className="chips">
                  {e.state !== 'Skip' && e.missing.length > 0 && <span className="gchip bad">Missing in Programming: {e.missing.join(', ')}</span>}
                  {e.posts > 0 && <span className="gchip">{e.posts} post{e.posts === 1 ? '' : 's'} on the calendar</span>}
                  {e.campaign && <span className="gchip">Campaign {e.campaign}</span>}
                </span>
              </div>
              <div className="soc-act" role="group" aria-label={`What to do with ${e.title}`}>
                {d.states.map(s => <button key={s} className={`soc-btn small${e.state === s ? ' primary' : ''}`} aria-pressed={e.state === s} disabled={!edit || !!busy || (s === 'Campaign' && !!e.campaign)}
                  onClick={s === 'Campaign' ? run('c' + e.id, { action: 'campaign', event_id: e.id }, 'Campaign started. Add the teachers below.') : run('s' + e.id, { action: 'state', event_id: e.id, state: s }, `${e.title}: ${s}`)}>{s}</button>)}
              </div>
            </li>))}</ul>)}
      </section>

      {d.campaigns.map(c => {
        const ev = d.events.find(e => e.id === c.event_id);
        const unplaced = c.steps.filter(s => !s.plan_post_id).length;
        const askable = c.steps.filter(s => s.teacher && !s.clip_request_id && String(s.step) !== '0').length;
        return (
          <section className="soc-panel" key={c.id} aria-label={c.name} id={`countdown-${c.event_id}`}>
            <div className="ph"><h2>Social countdown · {c.name}</h2><span className="sub">{ev ? `${ev.title} · ${short(ev.date)}` : c.event_id}</span></div>
            <ul className="soc-rev camp">{c.steps.map(s => {
              const launch = String(s.step) === '0', clip = clipFor(s.clip_request_id);
              const set = (k, v) => run('t' + c.id + s.step, { action: 'step', campaign_id: c.id, step: s.step, changes: { [k]: v } }, 'Saved');
              return (
                <li key={s.step}>
                  <div className="b">
                    <span className="mono meta">{launch ? 'Launch' : `Day ${s.step} of the countdown`} · {short(s.date)} · {s.time_et} ET</span>
                    <b>{s.theme}</b>
                    <span className="chips">
                      {s.plan_post_id ? <a className="gchip" href={`/ops/social?post=${s.plan_post_id}`}>On the calendar · {s.plan_post_id}</a> : <span className="gchip">Not on the calendar yet</span>}
                      {!launch && (clip ? <span className="gchip">Clip: {clip.status}</span> : <span className="gchip">Clip: {s.teacher ? 'Not requested' : 'No takeover'}</span>)}
                    </span>
                    {!launch && <input aria-label={`Takeover teacher for day ${s.step}`} placeholder="Takeover teacher (optional)" defaultValue={s.teacher} disabled={!edit} maxLength={80}
                      onBlur={x => x.target.value !== s.teacher && set('teacher', x.target.value)()} />}
                  </div>
                  {clip && edit && <select aria-label={`Clip status for day ${s.step}`} value={clip.status} onChange={x => run('k' + clip.id, { action: 'clip', id: clip.id, status: x.target.value }, 'Saved')()}>{CLIP.map(o => <option key={o}>{o}</option>)}</select>}
                </li>);
            })}</ul>
            <div className="soc-act">
              {edit && <button className="soc-btn primary" disabled={!unplaced || !!busy} onClick={run('a' + c.id, { action: 'apply', campaign_id: c.id }, j => `${j.added} proposed post${j.added === 1 ? '' : 's'} added to the calendar`)}>{unplaced ? `Add ${unplaced} to the calendar as proposals` : 'All on the calendar'}</button>}
              {edit && <button className="soc-btn" disabled={!askable || !!busy} onClick={run('r' + c.id, { action: 'request', campaign_id: c.id, owner: d.owner }, j => `${j.sent} clip request${j.sent === 1 ? '' : 's'} made${d.owner ? ` for ${d.owner}` : ''}`)}>{askable ? `Request ${askable} clip${askable === 1 ? '' : 's'}${d.owner ? ` from ${d.owner.split(' ')[0]}` : ''}` : 'No clips to request'}</button>}
            </div>
          </section>);
      })}

      <section className="soc-panel" aria-label="Clip requests">
        <div className="ph"><h2>Clip requests</h2><span className="sub">Due a week before the post goes up.</span></div>
        {!d.clips.length ? <p className="ops-empty">No clips have been requested yet.</p> : (
          <ul className="soc-rev">{d.clips.map(c => (
            <li key={c.id}><div className="b"><span className="mono meta">{c.id} · {c.for_post_id || 'no post yet'} · due {c.due ? short(c.due) : 'no date'}</span>
              <b>{c.teacher}</b><span>{c.ask}</span><span className="chips"><span className="gchip">{c.status}</span>{c.owner && <span className="gchip">{c.owner}</span>}</span></div></li>))}</ul>)}
      </section>
    </div>
  );
}
