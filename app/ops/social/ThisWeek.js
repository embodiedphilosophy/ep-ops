'use client';
import { useEffect, useRef, useState } from 'react';
import { TEMPLATES, nextColourway } from '@/lib/ops/templates/registry';
import { api, useView } from '../content/SocialEngine';

const addD = (d, n) => { const x = new Date(d + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const nyToday = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
// The Monday after today: the Sunday post (09:00 ET, the day before) opens that week
const nextMonday = () => { const t = nyToday(), dow = new Date(t + 'T12:00:00Z').getUTCDay(); return addD(t, ((8 - dow) % 7) || 7); };
const short = d => new Date(d + 'T12:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const long = d => new Date(d + 'T12:00:00Z').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
const t = TEMPLATES.thisweek;

export default function ThisWeek({ canEdit, canPublish }) {
  const [monday, setMonday] = useState(nextMonday());
  const [events, setEvents] = useState(null);   // [{ id, title, day, time, missing, line, on }]
  const [intro, setIntro] = useState('Here’s what’s on at Embodied Philosophy this week.');
  const [cta, setCta] = useState('');
  const [plan] = useView('plan');
  const [cw, setCw] = useState('');
  const [previews, setPreviews] = useState([]);
  const [state, setState] = useState('idle');
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const kept = useRef({});                       // edits survive "Rebuild from schedule"
  const seq = useRef(0);
  const recent = (plan?.rows || []).map(r => r.values).filter(v => v.template_id === 'thisweek').sort((a, b) => (b.publish_date || '').localeCompare(a.publish_date || '')).map(v => v.colourway);
  useEffect(() => { if (plan && !cw) setCw(nextColourway(t, recent)); }, [plan]);

  const load = async () => {
    setEvents(null); setErr('');
    const res = await fetch(`/api/ops/social/render?what=week&monday=${monday}`), j = await res.json().catch(() => ({}));
    if (!res.ok) { setErr(j.error || 'Couldn’t read the Master Schedule'); setEvents([]); return; }
    setEvents(j.events.map(e => ({ ...e, line: kept.current[e.id]?.line ?? e.line, on: kept.current[e.id]?.on ?? !e.missing.length })));
  };
  useEffect(() => { load(); }, [monday]);
  const edit = (id, patch) => { kept.current[id] = { ...(kept.current[id] || {}), ...patch }; setEvents(es => es.map(e => e.id === id ? { ...e, ...patch } : e)); };
  const chosen = (events || []).filter(e => e.on);
  const blocked = chosen.filter(e => e.missing.length);
  const week = { monday, intro, cta, events: chosen.map(e => ({ id: e.id, line: e.line })) };
  const body = extra => ({ template: 'thisweek', colourway: cw, size: '4:5', week, ...extra });
  const call = extra => fetch('/api/ops/social/render', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body(extra)) });
  const ready = !!cw && chosen.length > 0 && !blocked.length;
  const sig = JSON.stringify(body({}));

  useEffect(() => {
    if (!ready) { setPreviews([]); return undefined; }
    const my = ++seq.current; setState('loading'); setErr('');
    const timer = setTimeout(async () => {
      try {
        const urls = []; let total = 1;
        for (let i = 0; i < total; i++) {
          const res = await call({ slide: i }); if (my !== seq.current) return;
          if (!res.ok) { setErr((await res.json().catch(() => ({}))).error || 'Couldn’t draw the slides'); setState('idle'); return; }
          total = Number(res.headers.get('X-Slides')) || 1; urls.push(URL.createObjectURL(await res.blob()));
        }
        setPreviews(old => { old.forEach(u => URL.revokeObjectURL(u)); return urls; }); setState('idle');
      } catch { if (my === seq.current) { setErr('Couldn’t draw the slides'); setState('idle'); } }
    }, 500);
    return () => clearTimeout(timer);
  }, [sig, ready]);

  // Nothing posts until someone presses a button: this makes the post (Proposed), or approves it for people who schedule
  const create = async approve => {
    setState('busy'); setErr(''); setMsg('');
    const res = await call({ export: true }), j = await res.json().catch(() => ({}));
    if (!res.ok) { setErr(j.error || 'Couldn’t save the slides'); setState('idle'); return; }
    const sunday = addD(monday, -1);
    const lines = chosen.map(e => `${e.day} · ${e.time}${e.time ? ' ET' : ''} · ${e.title}`).join('\n');
    const values = { publish_date: sunday, publish_time_ET: '09:00', platforms: 'IG Feed, Facebook', pillar: 'This Week at EP', format: 'Carousel', media_kind: 'carousel', template_id: 'thisweek', colourway: cw, is_standing: 'TRUE',
      slides_json: JSON.stringify(j.exports.map(e => ({ kind: 'image', drive_file_id: e.drive_file_id, image_id: e.image_id }))), caption: `${intro}\n\n${lines}\n\nDetails and registration: link in our bio.`, template_fields: JSON.stringify({ week }),
      ...(approve && { status: 'Approved' }) };
    const r = await api({ view: 'plan', add: true, values });
    setState('idle');
    if (r.ok) setMsg(approve ? `Approved for ${long(sunday)} at 9:00 ET. Carousels are posted by hand until automatic posting is on.` : `Saved as a proposed post for ${long(sunday)} at 9:00 ET. Review it before it goes out.`);
    else setErr(r.error || 'Couldn’t add the post');
  };

  return (
    <div className="soc">
      <header className="soc-head">
        <div><span className="eyebrow">Content · Social</span><h1>This Week at <em>EP</em></h1>
          <p>A standing post every Sunday at 9:00 ET, built from the Master Schedule for {short(monday)} – {short(addD(monday, 6))}. Titles, dates, times and prices are locked to the schedule. Nothing posts until you press a button.</p></div>
        <div className="soc-act"><a className="soc-btn" href="/ops/social">← Calendar</a></div>
      </header>
      <div className="soc-act">
        <button className="soc-btn small" onClick={() => setMonday(addD(monday, -7))} aria-label="Earlier week">←</button>
        <b className="mono">{short(monday)} – {short(addD(monday, 6))}</b>
        <button className="soc-btn small" onClick={() => setMonday(addD(monday, 7))} aria-label="Later week">→</button>
        <button className="soc-btn small" onClick={load}>Rebuild from schedule</button>
      </div>
      <div className="soc-review">
        <div className="main">
          <section className="soc-panel">
            <div className="ph"><h2>Events this week</h2><span className="sub">Untick any you don’t want. Sādhana School weekly sessions are internal and never listed.</span></div>
            {!events ? <p className="ops-empty">Reading the Master Schedule…</p> : !events.length ? <p className="ops-empty">Nothing public is scheduled for this week.</p> : (
              <ul className="soc-rev">{events.map(e => (
                <li key={e.id} className={e.missing.length ? 'blocked' : ''}>
                  <label className="pick"><input type="checkbox" checked={e.on} disabled={!canEdit} onChange={x => edit(e.id, { on: x.target.checked })} aria-label={`Include ${e.title}`} /></label>
                  <div className="b">
                    <span className="mono meta">{e.day}{e.time ? ` · ${e.time} ET` : ''}{e.london ? ` · ${e.london}` : ''}</span>
                    <b>{e.title}</b>
                    {e.missing.length > 0 && <span className="chips"><span className="gchip bad">Missing in the Master Schedule: {e.missing.join(', ')}</span><a href="/ops/events">Fix in Programming</a></span>}
                    <input aria-label={`Line for ${e.title}`} placeholder="One line about it" value={e.line} disabled={!canEdit || !e.on} maxLength={160} onChange={x => edit(e.id, { line: x.target.value })} />
                  </div>
                </li>))}</ul>)}
          </section>
          <section className="soc-panel">
            <label className="cap" htmlFor="tw-intro">Intro line (goes in the caption)</label>
            <input id="tw-intro" value={intro} disabled={!canEdit} onChange={e => setIntro(e.target.value)} maxLength={300} />
            <label className="cap" htmlFor="tw-cta">Closing slide</label>
            <input id="tw-cta" value={cta} disabled={!canEdit} onChange={e => setCta(e.target.value)} maxLength={200} placeholder="Details and registration for every session are at the link in our bio." />
            <span className="cap">Colourway · {cw} · changes every Sunday</span>
            <div className="ops-tpl"><div className="row sw">{t.colourways.map(c => <button key={c[0]} type="button" className={c[0] === cw ? 'on' : ''} style={{ background: c[1] }} aria-label={c[0]} aria-pressed={c[0] === cw} onClick={() => setCw(c[0])} />)}</div></div>
          </section>
          {err && <p className="hint err" role="alert">{err}</p>}
          {msg && <p className="hint" role="status">{msg}</p>}
          <div className="soc-sumbar">
            <span>{chosen.length} event{chosen.length === 1 ? '' : 's'} · {chosen.length ? chosen.length + 2 : 0} slides{blocked.length ? ` · ${blocked.length} can’t be drawn until the schedule is fixed` : ''}</span>
            <span className="soc-act">
              {canEdit && <button className="soc-btn" disabled={!ready || state !== 'idle'} onClick={() => create(false)}>{state === 'busy' ? 'Saving…' : 'Save as a proposed post'}</button>}
              {canPublish && <button className="soc-btn primary" disabled={!ready || state !== 'idle'} onClick={() => create(true)}>Save and approve</button>}
            </span>
          </div>
        </div>
        <aside className="health" aria-label="Preview">
          <h2>The carousel</h2><span className="sub">Exactly what will be posted.</span>
          <div className="tw-strip">{!ready ? <p className="sub">{!chosen.length ? 'Tick at least one event.' : blocked.length ? 'Fix the missing facts to see the slides.' : 'Drawing…'}</p> : previews.map((u, i) => <img key={i} src={u} alt={`Slide ${i + 1}`} style={{ opacity: state === 'loading' ? .5 : 1 }} />)}</div>
        </aside>
      </div>
    </div>
  );
}
