'use client';
import { useEffect, useRef, useState } from 'react';
import { TEMPLATES, nextColourway } from '@/lib/ops/templates/registry';
import { CADENCES, sessionDates } from '@/lib/ops/programs';
import { api, useView } from '../content/SocialEngine';

const addD = (d, n) => { const x = new Date(d + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const nyToday = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
// The Monday after today: the Sunday post (09:00 ET, the day before) opens that week
const nextMonday = () => { const t = nyToday(), dow = new Date(t + 'T12:00:00Z').getUTCDay(); return addD(t, ((8 - dow) % 7) || 7); };
const short = d => new Date(d + 'T12:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const long = d => new Date(d + 'T12:00:00Z').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
const t = TEMPLATES.thisweek;
const keyOf = e => e.sched_id || e.id;
const post = (url, body) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  .then(async r => ({ ok: r.ok, ...(await r.json().catch(() => ({}))) })).catch(() => ({ ok: false, error: 'Couldn’t reach the dashboard' }));

// What an event's editor shows, and what it was when loaded (to see what changed and to check for conflicts)
const draftOf = e => ({ title: e.title, program_name: e.program_name, module: e.module_title, date: e.date, time: String(e.time_raw || '').replace(/\s*ET$/i, ''), label: e.label, this_week: e.this_week });
const beforeOf = e => ({ title: e.title, program_name: e.program_name, module: e.module_title, time: e.time_raw, line: e.note || '', label: e.label, this_week: e.this_week });

export default function ThisWeek({ canEdit, canPublish, canSchedule }) {
  const [monday, setMonday] = useState(nextMonday());
  const [events, setEvents] = useState(null);   // every event on the schedule this week: [{ …, listed, on, line }]
  const [title, setTitle] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [intro, setIntro] = useState('Here’s what’s on at Embodied Philosophy this week.');
  const [cta, setCta] = useState('');
  const [caption, setCaption] = useState(null);  // null: written from the events; text once someone edits it
  const [plan] = useView('plan');
  const [cw, setCw] = useState('');
  const [previews, setPreviews] = useState([]);
  const [state, setState] = useState('idle');
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [adding, setAdding] = useState(false);
  const kept = useRef({});                       // ticks and lines survive "Rebuild from schedule"
  const seq = useRef(0);
  const recent = (plan?.rows || []).map(r => r.values).filter(v => v.template_id === 'thisweek').sort((a, b) => (b.publish_date || '').localeCompare(a.publish_date || '')).map(v => v.colourway);
  useEffect(() => { if (plan && !cw) setCw(nextColourway(t, recent)); }, [plan]);

  const load = async () => {
    setErr('');
    const res = await fetch(`/api/ops/social/render?what=week&monday=${monday}`), j = await res.json().catch(() => ({}));
    if (!res.ok) { setErr(j.error || 'Couldn’t read the Master Schedule'); setEvents([]); return; }
    const all = [...(j.events || []), ...(j.others || [])].sort((a, b) => a.date.localeCompare(b.date) || String(a.time).localeCompare(String(b.time)));
    setEvents(all.map(e => { const k = kept.current[keyOf(e)] || {}; return { ...e, base_line: e.line, line: k.line ?? e.line, on: k.on ?? (e.listed && !e.missing.length) }; }));
  };
  useEffect(() => { setEvents(null); load(); }, [monday]);
  const edit = (e, patch) => { kept.current[keyOf(e)] = { ...(kept.current[keyOf(e)] || {}), ...patch }; setEvents(es => es.map(x => keyOf(x) === keyOf(e) ? { ...x, ...patch } : x)); };
  // After a save the schedule is the truth again: forget this event's local line and read the week afresh
  const saved = async (e, text) => { if (kept.current[keyOf(e)]) delete kept.current[keyOf(e)].line; setMsg(text); await load(); };

  const shown = (events || []).filter(e => e.listed || e.on);
  const others = (events || []).filter(e => !e.listed && !e.on);
  const chosen = shown.filter(e => e.on);
  const blocked = chosen.filter(e => e.missing.length);
  const week = { monday, intro, cta, title, subtitle, events: chosen.map(e => ({ id: e.id, line: e.line })) };
  const body = extra => ({ template: 'thisweek', colourway: cw, size: '4:5', week, ...extra });
  const call = extra => fetch('/api/ops/social/render', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body(extra)) });
  const ready = !!cw && chosen.length > 0 && !blocked.length;
  const sig = JSON.stringify(body({}));
  const autoCaption = `${intro}\n\n${chosen.map(e => `${e.day}${e.time ? ` · ${e.time}` : ''} · ${e.title}`).join('\n')}\n\nDetails and registration: link in our bio.`;

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
    const values = { publish_date: sunday, publish_time_ET: '09:00', platforms: 'IG Feed, Facebook', pillar: 'This Week at EP', format: 'Carousel', media_kind: 'carousel', template_id: 'thisweek', colourway: cw, is_standing: 'TRUE',
      slides_json: JSON.stringify(j.exports.map(e => ({ kind: 'image', drive_file_id: e.drive_file_id, image_id: e.image_id }))), caption: caption ?? autoCaption, template_fields: JSON.stringify({ week }),
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
          <p>A standing post every Sunday at 9:00 ET, built from the Master Schedule for {short(monday)} – {short(addD(monday, 6))}. {canSchedule ? 'Fix anything here and it’s saved to the Master Schedule, so the website, the newsletter and next week’s post get the fix too.' : 'Titles, dates and times come from the Master Schedule; Jacob, Irene or Floss can fix them here.'} Nothing posts until you press a button.</p></div>
        <div className="soc-act"><a className="soc-btn" href="/ops/social">← Calendar</a></div>
      </header>
      <div className="soc-act">
        <button className="soc-btn small" onClick={() => setMonday(addD(monday, -7))} aria-label="Earlier week">←</button>
        <b className="mono">{short(monday)} – {short(addD(monday, 6))}</b>
        <button className="soc-btn small" onClick={() => setMonday(addD(monday, 7))} aria-label="Later week">→</button>
        <button className="soc-btn small" onClick={() => { setEvents(null); load(); }}>Rebuild from schedule</button>
      </div>
      <div className="soc-review">
        <div className="main">
          <section className="soc-panel">
            <div className="ph"><h2>Events this week</h2><span className="sub">Untick any you don’t want in this post. Open “Edit” to fix an event at the source.</span></div>
            {!events ? <p className="ops-empty">Reading the Master Schedule…</p> : !shown.length ? <p className="ops-empty">Nothing public is scheduled for this week.</p> : (
              <ul className="soc-rev">{shown.map(e => <EventRow key={keyOf(e)} e={e} canEdit={canEdit} canSchedule={canSchedule} onTick={on => edit(e, { on })} onLine={line => edit(e, { line })} onSaved={text => saved(e, text)} />)}</ul>)}
            {others.length > 0 && (
              <details className="tw-others">
                <summary>Also on the schedule this week, not listed ({others.length})</summary>
                <ul className="soc-rev">{others.map(e => (
                  <li key={keyOf(e)}>
                    <span className="pick" />
                    <div className="b">
                      <span className="mono meta">{e.day}{e.time ? ` · ${e.time}` : ''}</span>
                      <b>{e.title}</b>
                      <span className="sub">{e.why}</span>
                      {canEdit && <span className="soc-act"><button className="soc-btn small" onClick={() => edit(e, { on: true })}>Add to this post</button></span>}
                    </div>
                  </li>))}</ul>
              </details>)}
            {canSchedule && (adding
              ? <AddEvent monday={monday} onCancel={() => setAdding(false)} onAdded={async text => { setAdding(false); setMsg(text); await load(); }} />
              : <span className="soc-act"><button className="soc-btn small" onClick={() => setAdding(true)}>+ Add an event that’s missing</button></span>)}
          </section>
          <section className="soc-panel">
            <span className="cap">The words on this post</span>
            <div className="tw-grid">
              <label><span className="cap">Cover title</span><input value={title} disabled={!canEdit} onChange={e => setTitle(e.target.value)} maxLength={80} placeholder="This week at Embodied Philosophy" /></label>
              <label><span className="cap">Cover line</span><input value={subtitle} disabled={!canEdit} onChange={e => setSubtitle(e.target.value)} maxLength={80} placeholder={`${short(monday)} – ${short(addD(monday, 6))}`} /></label>
            </div>
            <label className="cap" htmlFor="tw-intro">Intro line (goes in the caption)</label>
            <input id="tw-intro" value={intro} disabled={!canEdit} onChange={e => setIntro(e.target.value)} maxLength={300} />
            <label className="cap" htmlFor="tw-cta">Closing slide</label>
            <input id="tw-cta" value={cta} disabled={!canEdit} onChange={e => setCta(e.target.value)} maxLength={200} placeholder="Details and registration for every session are at the link in our bio." />
            <span className="tw-capline"><label className="cap" htmlFor="tw-caption">Caption</label>{caption != null && canEdit && <button type="button" className="tw-link" onClick={() => setCaption(null)}>Write it from the events again</button>}</span>
            <textarea id="tw-caption" rows={6} value={caption ?? autoCaption} disabled={!canEdit} maxLength={2200} onChange={e => setCaption(e.target.value)} />
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

const KIND = { program: 'Part of a program', repeat: 'Repeats', 'one-off': 'One-off' };

// One event: tick it, write its line, or open the editor to fix it on the Master Schedule
function EventRow({ e, canEdit, canSchedule, onTick, onLine, onSaved }) {
  const [open, setOpen] = useState(false);
  const [d, setD] = useState(draftOf(e));
  const [scope, setScope] = useState(e.later ? 'later' : 'one');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  useEffect(() => { setD(draftOf(e)); setScope(e.later ? 'later' : 'one'); }, [e.sched_id, e.date, e.title, e.time_raw, e.note, e.label, e.this_week, e.module_title, e.program_name]);
  const orig = draftOf(e);
  // The line box edits this post at once; saving also writes it to the schedule (as the event's public note)
  const line = e.line;
  const dirty = [...Object.keys(orig).filter(k => String(d[k] ?? '').trim() !== String(orig[k] ?? '').trim()), ...(String(line).trim() !== String(e.base_line ?? '').trim() ? ['line'] : [])];
  const set = patch => setD(x => ({ ...x, ...patch }));
  const program = e.kind === 'program';

  const save = async () => {
    setBusy(true); setErr('');
    const changes = Object.fromEntries(dirty.filter(k => k !== 'date' && (program ? k !== 'title' : !['program_name', 'module'].includes(k))).map(k => [k, k === 'line' ? line : d[k]]));
    let note = '';
    if (dirty.includes('date')) {
      const r = await post('/api/ops/event', { action: 'move', id: e.sched_id, date: d.date });
      if (!r.ok) { setBusy(false); setErr(r.error || 'Couldn’t move it'); return; }
      note = r.message || '';
    }
    let text = note;
    if (Object.keys(changes).length) {
      const r = await post('/api/ops/social/this-week', { action: 'save', id: e.sched_id, scope, changes, before: beforeOf(e) });
      if (!r.ok) { setBusy(false); setErr(r.errors ? Object.values(r.errors).join(' · ') : r.error || 'Couldn’t save'); return; }
      text = [r.message, note].filter(Boolean).join(' ');
    }
    setBusy(false); setOpen(false);
    await onSaved(text || 'Saved to the schedule.');
  };

  return (
    <li className={e.missing.length ? 'blocked' : ''}>
      <label className="pick"><input type="checkbox" checked={e.on} disabled={!canEdit} onChange={x => onTick(x.target.checked)} aria-label={`Include ${e.title}`} /></label>
      <div className="b">
        <span className="mono meta">{e.day}{e.time ? ` · ${e.time}` : ''}{e.london ? ` · ${e.london}` : ''}{e.program ? ` · ${e.program}` : ''}</span>
        <b>{e.title}</b>
        <span className="chips">
          <span className="gchip">{KIND[e.kind]}{e.later ? ` · ${e.later} later session${e.later === 1 ? '' : 's'}` : ''}</span>
          {!e.listed && <span className="gchip flag">Added by hand for this post{canSchedule ? ' · open Edit to list it every week' : ''}</span>}
          {e.missing.length > 0 && <span className="gchip bad">Missing in the Master Schedule: {e.missing.join(', ')}</span>}
          {(canSchedule && e.sched_id) && <button type="button" className="tw-link" onClick={() => setOpen(!open)} aria-expanded={open}>{open ? 'Close' : dirty.length ? 'Edit · unsaved change' : 'Edit'}</button>}
          {!canSchedule && e.missing.length > 0 && <a href="/ops/events">Fix in Programming</a>}
        </span>
        <input aria-label={`Line for ${e.title}`} placeholder="One line about it" value={line} disabled={!canEdit || !e.on} maxLength={160} onChange={x => onLine(x.target.value)} />
        {open && (
          <div className="tw-edit">
            <div className="tw-grid">
              {program ? <>
                <label><span className="cap">Program title</span><input value={d.program_name} onChange={x => set({ program_name: x.target.value })} maxLength={100} /><span className="sub">Shared by every session of this program.</span></label>
                <label><span className="cap">This session’s module</span><input value={d.module} onChange={x => set({ module: x.target.value })} maxLength={120} placeholder="No module title yet" /><span className="sub">This session only.</span></label>
              </> : <label className="wide"><span className="cap">Title</span><input value={d.title} onChange={x => set({ title: x.target.value })} maxLength={120} /></label>}
              <label><span className="cap">Date</span><input type="date" value={d.date} onChange={x => set({ date: x.target.value })} /><span className="sub">Moves this session only; its tasks move with it.</span></label>
              <label><span className="cap">Time (ET)</span><input value={d.time} onChange={x => set({ time: x.target.value })} placeholder="e.g. 7pm or 9:30am" /><span className="sub">Blank uses the track’s usual time.</span></label>
              <label><span className="cap">{program ? 'Part of' : 'Label on the slide'}</span><input value={d.label} onChange={x => set({ label: x.target.value })} maxLength={60} placeholder={e.program || 'e.g. Wisdom School'} /></label>
              <label><span className="cap">In This Week at EP</span>
                <select value={d.this_week} onChange={x => set({ this_week: x.target.value })}>
                  <option value="">As usual for its track</option><option value="show">Always list it</option><option value="hide">Never list it</option>
                </select></label>
            </div>
            <span className="sub">The line above is saved as the event’s public note (the website shows it too).</span>
            {e.later > 0 && (
              <fieldset className="tw-scope"><legend className="cap">Save for</legend>
                <label><input type="radio" name={`scope-${e.sched_id}`} checked={scope === 'one'} onChange={() => setScope('one')} /> Just this session</label>
                <label><input type="radio" name={`scope-${e.sched_id}`} checked={scope === 'later'} onChange={() => setScope('later')} /> This and the {e.later} later session{e.later === 1 ? '' : 's'}</label>
              </fieldset>)}
            {err && <p className="hint err" role="alert">{err}</p>}
            <span className="soc-act">
              <button className="soc-btn primary small" disabled={busy || !dirty.length} onClick={save}>{busy ? 'Saving…' : 'Save to the Master Schedule'}</button>
              <button className="soc-btn small" disabled={busy} onClick={() => { setD(draftOf(e)); setOpen(false); }}>Cancel</button>
            </span>
          </div>)}
      </div>
    </li>
  );
}

// An event that isn't on the schedule yet. One-off, recurring or a course with modules: the last two become a
// program (sessions sharing a Series), so next time each session is already there and a fix can reach them all.
function AddEvent({ monday, onCancel, onAdded }) {
  const today = nyToday(), first = monday > today ? monday : today;
  const [f, setF] = useState({ kind: 'one-off', name: '', track: '', date: first, time: '', teachers: '', label: '', line: '', every: 'weekly', until: addD(first, 7 * 7), modules: '' });
  const [tracks, setTracks] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  useEffect(() => { fetch('/api/ops/social/this-week?what=tracks').then(r => r.json()).then(j => setTracks(j.tracks || [])).catch(() => setTracks([])); }, []);
  const set = patch => setF(x => ({ ...x, ...patch }));
  const mods = f.modules.split('\n').map(s => s.trim()).filter(Boolean);
  const dates = f.kind === 'recurring' ? sessionDates(f.date, 61, f.every).filter(d => d <= f.until)
    : f.kind === 'course' ? sessionDates(f.date, Math.max(mods.length, 1), f.every) : [f.date];
  const submit = async () => {
    setBusy(true); setErr('');
    const r = await post('/api/ops/social/this-week', { action: 'add', ...f, modules: mods });
    setBusy(false);
    if (!r.ok) { setErr(r.error || 'Couldn’t add it'); return; }
    await onAdded(r.message);
  };
  return (
    <div className="tw-edit tw-add">
      <span className="cap">Add an event to the Master Schedule</span>
      <fieldset className="tw-scope"><legend className="cap">What is it?</legend>
        {[['one-off', 'A one-off event'], ['recurring', 'A recurring event (same title each time)'], ['course', 'A course with several modules']].map(([v, l]) => (
          <label key={v}><input type="radio" name="tw-kind" checked={f.kind === v} onChange={() => set({ kind: v })} /> {l}</label>))}
      </fieldset>
      <div className="tw-grid">
        <label className="wide"><span className="cap">{f.kind === 'course' ? 'Course title' : 'Title'}</span><input value={f.name} onChange={x => set({ name: x.target.value })} maxLength={100} /></label>
        <label><span className="cap">Track</span>
          <select value={f.track} onChange={x => set({ track: x.target.value })}>
            <option value="">{tracks ? 'Pick a track' : 'Loading…'}</option>
            {(tracks || []).map(tr => <option key={tr.track} value={tr.track}>{tr.track}{tr.name ? ` · ${tr.name}` : ''}</option>)}
          </select></label>
        <label><span className="cap">{f.kind === 'one-off' ? 'Date' : 'First session'}</span><input type="date" min={today} value={f.date} onChange={x => set({ date: x.target.value })} /></label>
        <label><span className="cap">Time (ET)</span><input value={f.time} onChange={x => set({ time: x.target.value })} placeholder="e.g. 7pm or 9:30am" /></label>
        <label><span className="cap">Teachers</span><input value={f.teachers} onChange={x => set({ teachers: x.target.value })} placeholder="Names, comma-separated" /></label>
        <label><span className="cap">{f.kind === 'one-off' ? 'Label on the slide' : 'Part of'}</span><input value={f.label} onChange={x => set({ label: x.target.value })} maxLength={60} placeholder="e.g. Wisdom School" /></label>
        {f.kind !== 'one-off' && <label><span className="cap">How often</span>
          <select value={f.every} onChange={x => set({ every: x.target.value })}>{CADENCES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}</select></label>}
        {f.kind === 'recurring' && <label><span className="cap">Last session</span><input type="date" min={f.date} value={f.until} onChange={x => set({ until: x.target.value })} /></label>}
        <label className="wide"><span className="cap">One line about it</span><input value={f.line} onChange={x => set({ line: x.target.value })} maxLength={160} /></label>
        {f.kind === 'course' && <label className="wide"><span className="cap">Module titles, one per line (one session each)</span><textarea rows={5} value={f.modules} onChange={x => set({ modules: x.target.value })} /></label>}
      </div>
      <span className="sub">{f.kind === 'one-off' ? `One session on ${f.date ? long(f.date) : '…'}.` : `${dates.length} session${dates.length === 1 ? '' : 's'}${dates.length ? `, ${short(dates[0])} to ${short(dates.at(-1))}` : ''}. They’re added as one program, so a fix to one can be saved for the rest.`} It goes on the website if its track normally does; add the link and price in Programming.</span>
      {err && <p className="hint err" role="alert">{err}</p>}
      <span className="soc-act">
        <button className="soc-btn primary small" disabled={busy || !f.name.trim() || !f.track || (f.kind === 'course' && !mods.length)} onClick={submit}>{busy ? 'Adding…' : 'Add to the schedule'}</button>
        <button className="soc-btn small" disabled={busy} onClick={onCancel}>Cancel</button>
      </span>
    </div>
  );
}
