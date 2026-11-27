'use client';
import { useCallback, useEffect, useState } from 'react';
import { Layout, useSide } from './EmailKit';
import Campaigns from '../social/Campaigns';

const API = '/api/ops/email/launches';
const post = async body => { const res = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); const j = await res.json().catch(() => ({})); if (!res.ok) throw new Error(j.error || 'Couldn’t save that'); return j; };
const day = d => d ? new Date(d + 'T12:00:00Z').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }) : 'No date';
const add = (s, n) => { const d = new Date(s + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const span = (a, b) => Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / 864e5);
const LANE_COLOUR = { email: '#A5432A', social: '#3E6B5A', page: '#2E3F7F', task: '#B98A3E' };

// scope (on a program's Launch tab): { eventIds, name, base } narrows the list to that program's launches, starts a new one on it and keeps the links inside the program
export function Launches({ scope }) {
  const [id, setId] = useState(null); const [wizard, setWizard] = useState(null); const [ready, setReady] = useState(false);
  useEffect(() => { setId(new URLSearchParams(window.location.search).get('id')); setReady(true); }, []);
  if (!ready) return null;
  return id ? <Board id={id} scope={scope} /> : <List wizard={wizard} setWizard={setWizard} scope={scope} />;
}

const linkTo = (scope, id) => scope?.base ? `${scope.base}&id=${id}` : `/ops/programs?view=launches&id=${id}`;
const mine = (scope, x) => !scope || (x.event_id && scope.eventIds.includes(String(x.event_id).toUpperCase()));

function List({ wizard, setWizard, scope }) {
  const [d, setD] = useState(null); const [err, setErr] = useState(''); const [panel, setPanel] = useState(false); const side = useSide(panel);
  const load = useCallback(async () => { const res = await fetch(API).catch(() => null), j = await res?.json().catch(() => ({})) || {}; if (!res?.ok) { setErr(j.error || 'Couldn’t read the launches'); return; } setD(j); }, []);
  useEffect(() => { load(); }, [load]);
  return (
    <Layout embedded={!!scope} title={<><em>Launches</em></>} intro="Everything around one moment, together: its emails, social posts and countdowns, landing page and tasks, counted from key dates. Below: which upcoming events to promote." panel={panel} setPanel={setPanel} d={side}>
      {err && <p className="hint err" role="alert">{err}</p>}
      {!d ? <p className="ops-empty">Reading the launches…</p> : wizard ? <Wizard d={d} start={wizard} close={() => setWizard(null)} done={id => { window.location.href = linkTo(scope, id); }} /> : <>
        <section className="soc-panel" aria-label="Launches">
          <div className="ph"><h2>Launches</h2>{d.canEdit && <button className="soc-btn small primary" onClick={() => setWizard(scope ? { event_id: scope.eventIds[0], name: scope.name } : {})}>New launch</button>}</div>
          {!d.launches.filter(l => mine(scope, l)).length ? <p className="ops-empty">{scope ? 'No launch for this program yet. Use “New launch” to start one.' : 'No launches yet. Start one from the suggestions below.'}</p> : <ul className="em-list">{d.launches.filter(l => mine(scope, l)).map(l => (
            <li key={l.id} className="em-row"><div className="b"><span className="mono meta">{l.first ? `${day(l.first)} – ${day(l.last)}` : 'No dates yet'} · {l.kind || 'Launch'}</span><br /><b>{l.name}</b>
              <span className="chips"><span className="gchip">{l.status}</span><span className="gchip">{l.emails ? `${l.scheduled} of ${l.emails} emails scheduled` : 'No emails'}</span></span></div>
              <a className="soc-btn small" href={linkTo(scope, l.id)}>Open</a></li>))}</ul>}
        </section>
        {d.canEdit && d.suggestions.filter(s => mine(scope, s)).length > 0 && <section className="soc-panel" aria-label="Suggested launches">
          <div className="ph"><h2>Suggested</h2><span className="sub">Launches on the list that don’t exist here yet.</span></div>
          <ul className="em-list">{d.suggestions.filter(s => mine(scope, s)).map(s => <li key={s.name} className="em-row"><div className="b"><b>{s.name}</b><br /><span className="sub">{Object.entries(s.dates).map(([k, v]) => `${k} ${day(v)}`).join(' · ')}{s.note ? ` · ${s.note}` : ''}</span></div>
            <button className="soc-btn small" onClick={() => setWizard(s)}>Set up</button></li>)}</ul></section>}
        {/* What used to be Social → Coming up & campaigns: which events to promote, social countdowns, clip requests */}
        {!scope && <Campaigns embedded />}
      </>}
    </Layout>);
}

function Wizard({ d, start, close, done }) {
  const [step, setStep] = useState(1); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const [f, setF] = useState({ name: start.name || '', kind: start.kind || '', event_id: start.event_id || '', playbook_id: start.playbook_id || d.playbooks[0]?.id || '', dates: start.dates || {}, landing_url: '', tag_name: '', audience: { include: [], exclude: [] }, make_drafts: true });
  const [gen, setGen] = useState({ steps: [], missing: [] });
  const pb = d.playbooks.find(p => p.id === f.playbook_id);
  const set = (k, v) => setF(x => ({ ...x, [k]: v }));
  const pickEvent = id => { const ev = d.events.find(e => e.id === id); setF(x => ({ ...x, event_id: id, name: x.name || ev?.title || '', dates: ev && pb?.anchors.some(a => a[0] === 'event') ? { ...x.dates, event: ev.date } : x.dates })); };
  const preview = async () => { setErr(''); try { const j = await post({ action: 'preview', playbook_id: f.playbook_id, dates: f.dates }); setGen(j); setStep(4); } catch (e) { setErr(e.message); } };
  const edit = (i, k, v) => setGen(g => ({ ...g, steps: g.steps.map((s, j) => j === i ? { ...s, [k]: v } : s) }));
  const create = async () => {
    const n = gen.steps.filter(s => s.type === 'email').length;
    if (!confirm(`Create “${f.name}”?\n\n${n} email${n === 1 ? '' : 's'} will be planned${f.make_drafts ? ` and made as drafts in Kit${f.tag_name ? `, and the tag “${f.tag_name}” made in Kit if it isn’t there` : ''}` : ''}. Nothing is scheduled or sent.`)) return;
    setBusy(true); setErr(''); try { const j = await post({ action: 'create', confirm: true, ...f, steps: gen.steps }); done(j.id); } catch (e) { setErr(e.message); setBusy(false); }
  };
  const aud = f.audience.include;
  const addAud = v => { if (!v) return; const [type, id] = v.split(':'), name = (type === 'tag' ? d.kit.tags : d.kit.segments).find(x => String(x.id) === id)?.name || ''; if (!aud.some(x => x.type === type && String(x.id) === id)) set('audience', { ...f.audience, include: [...aud, { type, id: Number(id), name }] }); };
  return (
    <section className="soc-panel" aria-label="New launch">
      <div className="ph"><h2>New launch · step {step} of 4</h2><button className="soc-btn small" onClick={close}>Cancel</button></div>
      {err && <p className="hint err" role="alert">{err}</p>}
      {step === 1 && <><label className="em-f"><span className="cap">Event on the Master Schedule (optional)</span><select value={f.event_id} onChange={e => pickEvent(e.target.value)}><option value="">No event</option>{d.events.map(e => <option key={e.id} value={e.id}>{e.date} · {e.title} ({e.id})</option>)}</select></label>
        <label className="em-f"><span className="cap">Name</span><input value={f.name} onChange={e => set('name', e.target.value)} /></label>
        <label className="em-f"><span className="cap">Playbook</span><select value={f.playbook_id} onChange={e => set('playbook_id', e.target.value)}>{d.playbooks.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
        {pb && <p className="sub">{pb.about} {pb.steps} steps.</p>}
        <div className="soc-act"><button className="soc-btn primary" disabled={!f.name.trim()} onClick={() => setStep(2)}>Next: key dates</button></div></>}
      {step === 2 && <><p className="sub">The playbook counts from these dates.</p>{pb?.anchors.map(([k, label]) => <label key={k} className="em-f"><span className="cap">{label}</span><input type="date" value={f.dates[k] || ''} onChange={e => set('dates', { ...f.dates, [k]: e.target.value })} /></label>)}
        <label className="em-f"><span className="cap">Landing page link (optional)</span><input value={f.landing_url} onChange={e => set('landing_url', e.target.value)} placeholder="https://…" /></label>
        <div className="soc-act"><button className="soc-btn" onClick={() => setStep(1)}>Back</button><button className="soc-btn primary" onClick={() => setStep(3)}>Next: audience</button></div></>}
      {step === 3 && <><div className="em-f"><span className="cap">Who gets the emails</span><div>{aud.length ? aud.map(x => <button key={x.type + x.id} className="gchip" onClick={() => set('audience', { ...f.audience, include: aud.filter(y => y !== x) })}>{x.name} ×</button>) : <span className="sub">Everyone on the list</span>}
        <select aria-label="Add a group" value="" onChange={e => addAud(e.target.value)}><option value="">Add a group…</option>{d.kit.tags.map(t => <option key={'t' + t.id} value={`tag:${t.id}`}>Tag · {t.name}</option>)}{d.kit.segments.map(t => <option key={'s' + t.id} value={`segment:${t.id}`}>Segment · {t.name}</option>)}</select></div></div>
        <label className="em-f"><span className="cap">A tag for the people who enrol (optional, e.g. “Enrolled · Winter 2027”). It is made in Kit if it isn’t there.</span><input value={f.tag_name} onChange={e => set('tag_name', e.target.value)} /></label>
        <div className="soc-act"><button className="soc-btn" onClick={() => setStep(2)}>Back</button><button className="soc-btn primary" onClick={preview}>Next: review</button></div></>}
      {step === 4 && <><p className="sub">Check each step. Nothing exists yet.</p>
        {gen.missing.length > 0 && <p className="em-banner bad" role="status">Left out: steps counted from {gen.missing.join(', ')}, which has no date. Go back and add it.</p>}
        <ul className="em-list">{gen.steps.map((s, i) => <li key={i} className="em-row"><div className="b"><span className="gchip" style={{ background: LANE_COLOUR[s.type], color: '#fff' }}>{s.type}</span> <b>{s.step}</b>
          <div className="em-two"><input type="date" aria-label={`Date for ${s.step}`} value={s.date} onChange={e => edit(i, 'date', e.target.value)} />{s.type === 'email' && <input aria-label={`Subject for ${s.step}`} placeholder={`${s.step}: ${f.name}`} value={s.subject || ''} onChange={e => edit(i, 'subject', e.target.value)} />}</div></div></li>)}</ul>
        <label className="em-sw"><input type="checkbox" checked={f.make_drafts} onChange={e => set('make_drafts', e.target.checked)} /> Also make the emails as drafts in Kit{f.tag_name ? ' and the tag' : ''}</label>
        <div className="soc-act"><button className="soc-btn" onClick={() => setStep(3)}>Back</button><button className="soc-btn primary" disabled={busy || !gen.steps.length} onClick={create}>{busy ? 'Creating…' : 'Create the launch'}</button></div></>}
    </section>);
}

function Board({ id, scope }) {
  const [d, setD] = useState(null); const [err, setErr] = useState(''); const [msg, setMsg] = useState(''); const [panel, setPanel] = useState(false); const side = useSide(panel);
  const load = useCallback(async () => { const res = await fetch(`${API}?id=${id}`).catch(() => null), j = await res?.json().catch(() => ({})) || {}; if (!res?.ok) { setErr(j.error || 'Couldn’t read this launch'); return; } setD(j); }, [id]);
  useEffect(() => { load(); }, [load]);
  if (!d) return <Layout embedded={!!scope} title="Launch" intro="" panel={false} setPanel={() => {}} d={null}>{err ? <p className="hint err" role="alert">{err}</p> : <p className="ops-empty">Opening…</p>}</Layout>;
  const L = d.launch;
  const set = async (changes, ok) => { setErr(''); setMsg(''); try { await post({ action: 'update', id, changes }); setMsg(ok); await load(); } catch (e) { setErr(e.message); } };
  const keep = async () => { const name = prompt('Name this playbook'); if (!name) return; try { await post({ action: 'savePlaybook', id, name }); setMsg('Saved as a playbook.'); } catch (e) { setErr(e.message); } };
  return (
    <Layout embedded={!!scope} title={<>{L.name}</>} intro={`${L.kind || 'Launch'} · ${L.status}${d.event ? ` · ${d.event.title}` : ''}`} panel={panel} setPanel={setPanel} d={side}>
      <p><a href={scope?.base || '/ops/programs?view=launches'}>← All launches</a>{d.event && <> · <a href={`/ops/programs?view=launches#${d.event.key ? `countdown-${d.event.key}` : 'coming-up'}`}>Social countdown and promotion for this event</a></>}</p>
      {err && <p className="hint err" role="alert">{err}</p>}{msg && <p className="hint" role="status">{msg}</p>}
      <section className="soc-panel" aria-label="Timeline">
        <div className="ph"><h2>Timeline</h2><span className="soc-act">{d.canEdit && ['Planning', 'Live', 'Done'].filter(s => s !== L.status).map(s => <button key={s} className="soc-btn small" onClick={() => set({ status: s }, `Marked ${s.toLowerCase()}.`)}>Mark {s.toLowerCase()}</button>)}
          {d.canEdit && <button className="soc-btn small" onClick={keep}>Save as a playbook</button>}</span></div>
        <Timeline d={d} />
      </section>
      <section className="soc-panel" aria-label="Everything in this launch"><div className="ph"><h2>Everything in it</h2></div>
        {d.lanes.map(([k, label]) => { const its = d.items.filter(i => i.lane === k).sort((a, b) => (a.date || '9').localeCompare(b.date || '9')); return (
          <div key={k}><h3 className="ops-sub">{label} <span>{its.length || ''}</span></h3>{!its.length ? <p className="ops-empty">Nothing yet.</p> : <ul className="em-list">{its.map(i => <li key={i.key} className="em-row"><div className="b"><span className="mono meta">{day(i.date)} · {i.status}</span><br />{i.href ? <a href={i.href}>{i.title}</a> : i.title}</div></li>)}</ul>}</div>); })}
      </section>
    </Layout>);
}

// The launch timeline (the Board's, and the program Overview's): one lane per kind of thing, dated items along the days
export function Timeline({ d }) {
  const from = add(d.from, -2), n = Math.max(14, span(from, add(d.to, 3))), days = Array.from({ length: n + 1 }, (_, i) => add(from, i));
  return (
    <div className="em-tl" role="group" aria-label="Launch timeline"><div className="em-tl-in" style={{ width: days.length * 34 + 110 }}>
          <div className="em-tl-head" style={{ marginLeft: 110 }}>{days.map((x, i) => <span key={x} style={{ width: 34 }} className={x === d.today ? 'now' : ''}>{i % 7 === 0 || x === d.today ? day(x).slice(4) : ''}</span>)}</div>
          {d.lanes.map(([k, label]) => { const ends = []; const placed = d.items.filter(i => i.lane === k && i.date).sort((x, y) => x.date.localeCompare(y.date)).map(i => { const left = span(from, i.date) * 34; let row = ends.findIndex(e => e + 4 <= left); if (row < 0) row = ends.length; ends[row] = left + 130; return { ...i, left, row }; });
            return <div key={k} className="em-tl-lane" style={{ minHeight: Math.max(46, ends.length * 24 + 16) }}><b className="em-tl-l">{label}</b><div className="em-tl-t" style={{ width: days.length * 34 }}>
              {placed.map(i => { const st = { left: i.left, top: 6 + i.row * 24, width: 130, background: LANE_COLOUR[k] }; return i.href ? <a key={i.key} href={i.href} className="em-tl-i" style={st} title={`${i.title} · ${day(i.date)} · ${i.status}`}>{i.title}</a>
                : <span key={i.key} className="em-tl-i" style={st} title={`${i.title} · ${day(i.date)} · ${i.status}`}>{i.title}</span>; })}</div></div>; })}
        </div></div>
  );
}

// The same timeline for one launch, read from the same API as the Board (a program's Overview)
export function LaunchTimeline({ id }) {
  const [d, setD] = useState(null); const [err, setErr] = useState('');
  useEffect(() => { fetch(`${API}?id=${encodeURIComponent(id)}`).then(r => r.json().then(j => r.ok ? setD(j) : setErr(j.error || 'Couldn’t read this launch'))).catch(() => setErr('Couldn’t read this launch')); }, [id]);
  return err ? <p className="hint err" role="alert">{err}</p> : d ? <div className="soc"><Timeline d={d} /></div> : <p className="ops-empty">Reading the launch…</p>;
}
