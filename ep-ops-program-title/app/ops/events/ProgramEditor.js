'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { CADENCES, PARENTS, sessionDates, seriesSlug } from '@/lib/ops/programs';

const post = async body => {
  const res = await fetch('/api/ops/program', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).catch(() => null);
  const j = await res?.json().catch(() => ({}));
  return res?.ok ? j : { error: j?.error || 'Couldn’t save. Try again.', errors: j?.errors };
};
const short = d => d ? new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' }) : '';

// Programming → "+ Add program": a course, certificate or season of several sessions in one go.
// Every session becomes its own row on the Schedule (so reminders, tasks, Circle and the website work as
// they do today), tied together by one series name.
export function AddProgram({ tracks, past = [] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ name: '', parent: '', track: '', start: '', count: 8, every: 'weekly', time: '', teachers: '', emails: '', course_host: '', website: true, series: '', copyFrom: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const set = k => e => setF(s => ({ ...s, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  if (!open) return <button className="chip primary" onClick={() => setOpen(true)}>+ Add program</button>;
  const n = Math.max(0, Math.min(60, Number(f.count) || 0));
  const dates = f.start && n ? sessionDates(f.start, n, f.every) : [];
  const slug = seriesSlug(f.series || (f.name && f.start ? `${f.name}-${f.start.slice(0, 7)}` : ''));
  const save = async e => {
    e.preventDefault(); setBusy(true); setErr('');
    const j = await post({ action: 'create', ...f, count: n, series: slug });
    setBusy(false);
    if (j.error) return setErr(j.error);
    setOpen(false); router.push(`/ops/events?all=1&event=${encodeURIComponent(j.key)}`); router.refresh();
  };
  return (
    <form className="ops-edit ops-add ops-program-add" onSubmit={save}>
      <p className="ops-edit-title">New program</p>
      <p className="hint">A course, certificate or season with several sessions. You’ll name each module next.</p>
      {past.length > 0 && <div className="row"><label htmlFor="pg-from">Start from</label>
        <select id="pg-from" value={f.copyFrom} onChange={e => { const p = past.find(x => x.series === e.target.value); setF(s => ({ ...s, copyFrom: e.target.value, ...(p ? { name: s.name || p.name, track: s.track || p.track, count: p.count } : {}) })); }}>
          <option value="">A blank program</option>{past.map(p => <option key={p.series} value={p.series}>{p.label}</option>)}
        </select>
        <span className="hint">Copies its module titles and descriptions (and teachers, emails, host and time where you leave them blank). Give it new dates below.</span></div>}
      <div className="row"><label htmlFor="pg-name">Title</label><input id="pg-name" value={f.name} onChange={set('name')} placeholder="e.g. Christian Mysticism: A Learning Pathway" required maxLength={100} /></div>
      <div className="row"><label htmlFor="pg-parent">Part of</label><input id="pg-parent" list="pg-parents" value={f.parent} onChange={set('parent')} placeholder="e.g. Wisdom School (or leave blank)" maxLength={60} />
        <span className="hint">The school or program it falls under.</span></div>
      <datalist id="pg-parents">{PARENTS.map(x => <option key={x} value={x} />)}</datalist>
      <div className="row"><label htmlFor="pg-track">Track</label>
        <select id="pg-track" value={f.track} onChange={set('track')} required><option value="">Choose…</option>{tracks.map(t => <option key={t}>{t}</option>)}</select>
        <span className="hint">Sets the task templates and track defaults each session uses.</span></div>
      <div className="row"><label htmlFor="pg-start">First session</label><input id="pg-start" type="date" value={f.start} onChange={set('start')} required /></div>
      <div className="row"><label htmlFor="pg-count">Sessions</label>
        <div className="inline">
          <input id="pg-count" type="number" min={1} max={60} value={f.count} onChange={set('count')} required style={{ width: 80 }} />
          <select aria-label="How often" value={f.every} onChange={set('every')}>{CADENCES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}</select>
        </div>
        {dates.length > 0 && <span className="hint">{short(dates[0])} to {short(dates.at(-1))}{dates.length > 1 ? ` · ${dates.length} sessions` : ''}. You can add, move or cancel single sessions later.</span>}
      </div>
      <div className="row"><label htmlFor="pg-time">Time</label><input id="pg-time" value={f.time} onChange={set('time')} placeholder="e.g. 9am ET (blank: track default)" /></div>
      <div className="row"><label htmlFor="pg-teachers">Teachers</label><input id="pg-teachers" value={f.teachers} onChange={set('teachers')} placeholder="Names, comma-separated (or leave for later)" /></div>
      <div className="row"><label htmlFor="pg-emails">Reminder emails</label><input id="pg-emails" value={f.emails} onChange={set('emails')} placeholder="Only these addresses get session reminders" /></div>
      <div className="row"><label htmlFor="pg-host">Course host</label><input id="pg-host" value={f.course_host} onChange={set('course_host')} /></div>
      <div className="row"><label htmlFor="pg-web">Website</label><label className="check"><input id="pg-web" type="checkbox" checked={f.website} onChange={set('website')} /> Show on the website’s events list</label></div>
      <div className="row"><label htmlFor="pg-series">Series name</label><input id="pg-series" value={f.series} onChange={set('series')} placeholder={slug || 'made from the name and month'} />
        <span className="hint">Ties the sessions together (and to the program’s Circle space and course page). Usually leave it.</span></div>
      <div className="bar">
        <button className="chip primary" disabled={busy || !n}>{busy ? 'Adding…' : `Add ${n || ''} session${n === 1 ? '' : 's'}`}</button>
        <button type="button" className="chip" onClick={() => setOpen(false)}>Cancel</button>
        {err && <span className="hint">{err}</span>}
      </div>
    </form>
  );
}

const SHARED_FIELDS = [
  ['Parent Program', 'Part of', 'The school or program it falls under, e.g. Wisdom School. To rename the program, click its title at the top.'],
  ['Teachers & Hosts', 'Teachers', 'For every session. Change one session’s teacher in its row below.'],
  ['Teacher/Host Emails', 'Reminder emails', 'Only these addresses get session reminders.'],
  ['Course Host', 'Course host', ''],
  ['Time', 'Time', 'e.g. 9am ET. Blank uses the track default.'],
  ['Registration URL', 'Registration link', ''],
  ['Price Label', 'Price label', ''],
  ['Enrolled Tag', 'Kit tag for enrolled students', ''],
];

// Event drawer for a program: its modules (title + description per session, which the website shows),
// the settings every session shares, and adding a session.
export function ProgramEditor({ series }) {
  const router = useRouter();
  const [data, setData] = useState(null);
  const [mods, setMods] = useState({});
  const [shared, setShared] = useState({});
  const [msg, setMsg] = useState('');
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState('modules');

  const load = async () => {
    setBusy(true);
    const res = await fetch(`/api/ops/program?series=${encodeURIComponent(series)}`).catch(() => null);
    const j = await res?.json().catch(() => ({}));
    setBusy(false);
    if (!res?.ok) return setMsg(j?.error || 'Couldn’t load the program');
    setData(j);
    setMods(Object.fromEntries(j.sessions.map(s => [s.id, { module: s.values['Module Title'], summary: s.values.Summary, teachers: s.values['Teachers & Hosts'] }])));
    setShared({ ...j.shared, 'Program Name': j.shared['Program Name'] || j.name });
  };
  useEffect(() => { load(); }, [series]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!data) return <div className="ops-program"><h3>Modules</h3><p className="hint">{busy ? 'Loading…' : msg}</p></div>;
  const orig = id => { const s = data.sessions.find(x => x.id === id); return { module: s.values['Module Title'], summary: s.values.Summary, teachers: s.values['Teachers & Hosts'] }; };
  const teacher = !!data.teacher, mine = id => !teacher || (data.mine || []).includes(id);
  const changedMods = Object.keys(mods).filter(id => mine(id) && ['module', 'summary', ...(teacher ? [] : ['teachers'])].some(k => String(mods[id][k] ?? '') !== String(orig(id)[k] ?? '')));
  const sharedOrig = { ...data.shared, 'Program Name': data.shared['Program Name'] || data.name };
  const changedShared = [...SHARED_FIELDS.map(([k]) => k), 'Website'].filter(k => String(shared[k] ?? '') !== String(sharedOrig[k] ?? ''));
  const setMod = (id, k) => e => setMods(m => ({ ...m, [id]: { ...m[id], [k]: e.target.value } }));

  const saveMods = async () => {
    setBusy(true); setMsg(''); setErrors({});
    const j = await post({ action: 'modules', series, name: shared['Program Name'], modules: changedMods.map(id => ({ id, ...mods[id] })),
      before: Object.fromEntries(changedMods.map(id => [id, orig(id)])) });
    setBusy(false);
    if (j.error) { setErrors(j.errors || {}); return setMsg(j.error); }
    setMsg(j.message); await load(); router.refresh();
  };
  const saveShared = async () => {
    setBusy(true); setMsg(''); setErrors({});
    const j = await post({ action: 'shared', series, changes: Object.fromEntries(changedShared.map(k => [k, shared[k]])), before: Object.fromEntries(changedShared.map(k => [k, sharedOrig[k]])) });
    setBusy(false);
    if (j.error) { setErrors(j.errors || {}); return setMsg(j.error); }
    setMsg(j.message); await load(); router.refresh();
  };
  const addSession = async () => {
    if (!confirm('Add one more session after the last one, at the same rhythm? You can move it afterwards.')) return;
    setBusy(true); setMsg('');
    const j = await post({ action: 'add-session', series });
    setBusy(false);
    setMsg(j.error || j.message);
    if (!j.error) { await load(); router.refresh(); }
  };

  return (
    <div className="ops-program">
      <h3>Program <span>{data.sessions.length} session{data.sessions.length === 1 ? '' : 's'} · {series}</span></h3>
      {!teacher && <nav className="ops-filters" aria-label="Program">
        <a href="#modules" aria-current={tab === 'modules' ? 'page' : undefined} onClick={e => { e.preventDefault(); setTab('modules'); }}>Modules</a>
        <a href="#settings" aria-current={tab === 'settings' ? 'page' : undefined} onClick={e => { e.preventDefault(); setTab('settings'); }}>For every session</a>
      </nav>}
      {tab === 'modules' ? (<>
        <p className="hint">Each module’s title and description go on the website’s events list as “{shared['Program Name'] || 'Title'}{String(shared['Program Name'] || '').includes(':') ? ' —' : ':'} module title”.</p>
        <ol className="ops-modules">
          {data.sessions.map((s, i) => (
            <li key={s.id} className={`${errors[s.id] ? 'bad' : ''}${changedMods.includes(s.id) ? ' changed' : ''}`}>
              <div className="when"><b>{i + 1}</b><span>{short(s.date)}</span></div>
              <div className="fields">
                <input aria-label={`Session ${i + 1} module title`} placeholder={mine(s.id) ? 'Module title' : 'Taught by another teacher'} value={mods[s.id]?.module ?? ''} onChange={setMod(s.id, 'module')} disabled={busy || !mine(s.id)} maxLength={120} />
                <textarea aria-label={`Session ${i + 1} description`} placeholder="Two or three sentences for the website" rows={2} value={mods[s.id]?.summary ?? ''} onChange={setMod(s.id, 'summary')} disabled={busy || !mine(s.id)} />
                {teacher ? <small className="hint">{s.values['Teachers & Hosts'] || 'Teacher to be named'}</small> : <input aria-label={`Session ${i + 1} teachers`} placeholder="Teachers (if different)" value={mods[s.id]?.teachers ?? ''} onChange={setMod(s.id, 'teachers')} disabled={busy} className="small" />}
                {errors[s.id] && <span className="hint">{errors[s.id]}</span>}
              </div>
            </li>
          ))}
        </ol>
        <div className="bar">
          <button type="button" className="chip primary" disabled={busy || !changedMods.length} onClick={saveMods}>{busy ? 'Saving…' : changedMods.length ? `Save ${changedMods.length} module${changedMods.length === 1 ? '' : 's'}` : 'No changes'}</button>
          {!teacher && <button type="button" className="chip" disabled={busy} onClick={addSession}>+ Add a session</button>}
          {msg && <span className="hint">{msg}</span>}
        </div>
        <p className="hint">{teacher ? 'Write the title and description of the sessions you teach. They show on the website’s events list within a minute of saving.' : 'To move or cancel one session, use “Edit one session” below.'}</p>
      </>) : (<>
        <p className="hint">Saved to every session of the program. Blank where sessions differ.</p>
        <div className="ops-edit">
          {SHARED_FIELDS.map(([k, label, help]) => (
            <div key={k} className={`row${errors[k] ? ' bad' : ''}${changedShared.includes(k) ? ' changed' : ''}`}>
              <label htmlFor={`ps-${k}`}>{label}</label>
              <input id={`ps-${k}`} list={k === 'Parent Program' ? 'ps-parents' : undefined} value={shared[k] ?? ''} disabled={busy} onChange={e => setShared(v => ({ ...v, [k]: e.target.value }))} />
              {(errors[k] || help) && <span className="hint">{errors[k] || help}</span>}
            </div>
          ))}
          <datalist id="ps-parents">{PARENTS.map(x => <option key={x} value={x} />)}</datalist>
          <div className="row"><label htmlFor="ps-web">Website</label>
            <select id="ps-web" value={String(shared.Website || '').toUpperCase()} disabled={busy} onChange={e => setShared(v => ({ ...v, Website: e.target.value }))}>
              <option value="">Mixed / track default</option><option value="TRUE">Show every session</option><option value="FALSE">Hide every session</option>
            </select></div>
        </div>
        <div className="bar">
          <button type="button" className="chip primary" disabled={busy || !changedShared.length} onClick={saveShared}>
            {busy ? 'Saving…' : changedShared.length ? `Save for every session (${changedShared.length})` : 'No changes'}</button>
          {msg && <span className="hint">{msg}</span>}
        </div>
      </>)}
    </div>
  );
}

// The drawer's heading for a program: its title, which staff can click to rename. Saves to every session
// (and renames their website titles), the same as the old "Program name" field did.
export function ProgramTitle({ series, title, saved = '', parent = '', editable = false }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [v, setV] = useState(title);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  useEffect(() => { setV(title); }, [title]);
  const eyebrow = parent ? <p className="ops-parent">{parent}</p> : null;
  if (!editable) return <>{eyebrow}<h2>{title}</h2></>;
  if (!editing) return (<>{eyebrow}
    <h2 className="ops-title-edit"><button type="button" onClick={() => { setMsg(''); setEditing(true); }} title="Rename this program">{title}<span aria-hidden="true">✎</span><span className="sr">Rename</span></button></h2>
    {msg && <p className="hint">{msg}</p>}
  </>);
  const save = async e => {
    e.preventDefault();
    const name = v.trim();
    if (!name || name === title) { setEditing(false); return; }
    setBusy(true); setMsg('');
    const j = await post({ action: 'shared', series, changes: { 'Program Name': name }, ...(saved ? { before: { 'Program Name': saved } } : {}) });
    setBusy(false);
    if (j.error) return setMsg(j.errors?.['Program Name'] || j.error);
    setEditing(false); setMsg('Renamed. The website’s events list updates within a minute.'); router.refresh();
  };
  return (<>{eyebrow}
    <form className="ops-title-form" onSubmit={save}>
      <input aria-label="Program title" value={v} onChange={e => setV(e.target.value)} maxLength={100} autoFocus disabled={busy}
        onKeyDown={e => { if (e.key === 'Escape') { setV(title); setEditing(false); } }} />
      <div className="bar">
        <button className="chip primary" disabled={busy || !v.trim()}>{busy ? 'Saving…' : 'Save title'}</button>
        <button type="button" className="chip" disabled={busy} onClick={() => { setV(title); setEditing(false); setMsg(''); }}>Cancel</button>
        {msg && <span className="hint">{msg}</span>}
      </div>
      <p className="hint">Renames every session, and their titles on the website.</p>
    </form>
  </>);
}
