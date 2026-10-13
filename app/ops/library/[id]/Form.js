'use client';
import { useMemo, useRef, useState } from 'react';
import { upload } from '@vercel/blob/client';
import { PROGRAMMES, PROGRAMME_COLOURS, ACCESS_BADGE, ACCESS, KINDS, FORMATS, DEPTHS, TOPICS, checklist, canPublish, filtersLine, coverOf, label, progress } from '@/lib/ops/library';

async function call(body) {
  const r = await fetch('/api/ops/library', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || 'Something went wrong');
  return j;
}
const SAVE_KEYS = ['programme', 'access', 'requires', 'unlock_note', 'card_label', 'kind', 'format', 'depth', 'topics', 'length', 'next_date', 'next_session', 'ce_hours', 'description', 'included', 'sessions', 'teachers', 'cover_override', 'director_email', 'promise', 'live_label', 'when_label', 'sort_order', 'pwyc_amounts'];
const long = d => d ? new Date(d + 'T12:00:00Z').toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' }) : '';

const Lock = () => <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><rect x="2" y="5.5" width="8" height="5.5" fill="currentColor" /><path d="M3.8 5.5V4a2.2 2.2 0 0 1 4.4 0v1.5" fill="none" stroke="currentColor" strokeWidth="1.3" /></svg>;
const Source = ({ of }) => of ? <span className="chip-pine">From onboarding · {of}</span> : null;
function Chips({ options, value, onChange, multi, name, dots }) {
  const on = o => multi ? value.includes(o) : value === o;
  return (
    <div className="ops-chips" role={multi ? 'group' : 'radiogroup'} aria-label={name}>
      {options.map(o => { const [k, l] = Array.isArray(o) ? o : [o, o]; return (
        <button type="button" key={k} className={`ops-chip${on(k) ? ' on' : ''}`} aria-pressed={on(k)} onClick={() => onChange(multi ? (on(k) ? value.filter(x => x !== k) : [...value, k]) : (on(k) ? '' : k))}>{dots && <i className="dot" style={{ background: dots[k] }} aria-hidden="true" />}{l}</button>
      ); })}
    </div>
  );
}
// A button that uploads a JPG/PNG/WebP straight to Blob and hands back its link
function PhotoUpload({ folder, name, onDone, label = 'Upload a photo' }) {
  const ref = useRef(null);
  const [say, setSay] = useState('');
  const pick = async file => {
    if (!file) return;
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) { setSay('Please choose a JPG, PNG or WebP image.'); return; }
    setSay('Uploading…');
    try {
      const ext = file.type.split('/')[1].replace('jpeg', 'jpg');
      const slug = (name || 'photo').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'photo';
      const blob = await upload(`${folder}/${slug}.${ext}`, file, { access: 'public', handleUploadUrl: '/api/teach/upload' });
      onDone(blob.url); setSay('Uploaded. Press Save draft to keep it.');
    } catch (e) { setSay(`Upload didn’t work: ${e.message}`); }
    if (ref.current) ref.current.value = '';
  };
  return (
    <span className="ops-upload">
      <input ref={ref} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={e => pick(e.target.files?.[0])} />
      <button type="button" className="btn ghost" disabled={say === 'Uploading…'} onClick={() => ref.current?.click()}>{say === 'Uploading…' ? 'Uploading…' : label}</button>
      {say && say !== 'Uploading…' && <span className="ops-help" role="status">{say}</span>}
    </span>
  );
}
const Req = () => <span className="req" aria-hidden="true">*</span>;

export default function Form({ initial, choices, changed, kalighat }) {
  const [o, setO] = useState(initial);
  const [busy, setBusy] = useState(''), [msg, setMsg] = useState(null), [view, setView] = useState('card');
  const set = (k, v) => setO(s => ({ ...s, [k]: v, sources: { ...s.sources, [k]: undefined } }));
  const live = o.status === 'published';
  const list = useMemo(() => checklist(o), [o]);
  const ready = canPublish(o);
  const incl = o.included.join('\n');
  const manualPrice = !initial.price_label || !initial.checkout_url;

  async function run(label, fn) {
    setBusy(label); setMsg(null);
    try { const r = await fn(); if (r?.offering) setO(r.offering); setMsg({ ok: true, text: r?.note || (label === 'save' ? 'Saved.' : 'Done.') }); }
    catch (e) { setMsg({ ok: false, text: e.message }); }
    setBusy('');
  }
  const payload = () => ({ ...Object.fromEntries(SAVE_KEYS.map(k => [k, o[k]])), ...(manualPrice ? { price_label: o.price_label, checkout_url: o.checkout_url, manual_price: true } : {}) });
  const save = () => run('save', () => call({ action: 'save', id: o.offering_id, changes: payload() }));
  const publish = update => run(update ? 'update' : 'publish', async () => { await call({ action: 'save', id: o.offering_id, changes: payload() }); return call({ action: update ? 'update' : 'publish', id: o.offering_id }); });
  const unpublish = () => run('unpublish', () => call({ action: 'unpublish', id: o.offering_id }));
  const link = id => run('link', async () => { const r = await call({ action: 'link', id: o.offering_id, onboarding_id: id }); return r; });
  const teacherSet = (i, k, v) => set('teachers', o.teachers.map((t, j) => j === i ? { ...t, [k]: v } : t));
  const sessSet = (i, k, v) => set('sessions', o.sessions.map((t, j) => j === i ? { ...t, [k]: v } : t));
  const cover = coverOf(o);

  const band = PROGRAMME_COLOURS[o.programme] || '#D8C9AE';
  const badge = ACCESS_BADGE[o.access] || '';
  const actions = (
    <div className="ops-pub-actions">
      <button className="btn ghost" onClick={save} disabled={!!busy}>{busy === 'save' ? 'Saving…' : 'Save draft'}</button>
      {live ? <>
        <button className="btn primary" onClick={() => publish(true)} disabled={!ready || !!busy}>{busy === 'update' ? 'Updating…' : 'Update listing'}</button>
        <button className="btn ghost" onClick={unpublish} disabled={!!busy}>Unpublish</button>
      </> : <button className="btn primary" onClick={() => publish(false)} disabled={!ready || !!busy}>{busy === 'publish' ? 'Publishing…' : 'Publish to Course Library'}</button>}
    </div>
  );
  return (
    <>
    {actions}
    {live && <div className="ops-live" role="status"><span><b>Live on the Course Library.</b> Edits here go live when you press Update listing.</span></div>}
    <div className="ops-pub">
      <div className="ops-pub-main">
        {(changed.circle.length > 0 || changed.onboarding.length > 0) && (
          <div className="ops-note" role="status">
            {changed.circle.length > 0 && <p><b>Changed in Circle:</b> {changed.circle.join(', ')}. The site follows Circle for these. Press “Update listing” to refresh the catalog row.</p>}
            {changed.onboarding.length > 0 && <p><b>Changed in onboarding:</b> {changed.onboarding.join(', ')}. Not live until you press “Update listing”.</p>}
          </div>
        )}

        <section className="ops-panel" aria-labelledby="from-circle">
          <h2 id="from-circle">From Circle</h2>
          <p><span className="chip-sand"><Lock /> Change these in Circle</span></p>
          <dl className="ops-ro">
            <div><dt>Title</dt><dd>{o.title || '—'}</dd></div>
            <div><dt>Status in Circle</dt><dd><span className="st"><i className={`sq ${o.circle_status === 'published' ? 'green' : 'amber'}`} />{o.circle_status === 'published' ? 'Published' : o.circle_status === 'removed' ? 'Removed' : 'Draft'}</span></dd></div>
            <div><dt>Price</dt><dd className="mono">{o.price_label || '—'}</dd></div>
            <div><dt>Checkout link</dt><dd className="mono break">{o.checkout_url || '—'}</dd></div>
          </dl>
          {manualPrice && (
            <div className="ops-note"><p>Circle didn’t give the {!initial.price_label ? 'price' : ''}{!initial.price_label && !initial.checkout_url ? ' or ' : ''}{!initial.checkout_url ? 'checkout link' : ''}. Enter {(!initial.price_label && !initial.checkout_url) ? 'them' : 'it'} here; changes in Circle then won’t be noticed.</p>
              <div className="ops-grid2">
                {!initial.price_label && <label>Price label<input value={o.price_label} onChange={e => set('price_label', e.target.value)} placeholder="$495" /></label>}
                {!initial.checkout_url && <label>Checkout link<input value={o.checkout_url} onChange={e => set('checkout_url', e.target.value)} placeholder="https://…" /></label>}
              </div>
            </div>)}
          <div className="ops-cover">
            <span className="thumb big" aria-hidden="true">{cover ? <img src={cover} alt="" width="120" height="120" /> : 'No cover'}</span>
            <div>
              <label>Cover picture<input value={o.cover_override} onChange={e => set('cover_override', e.target.value)} placeholder={o.cover_url ? 'Using the picture from Circle' : 'Paste a picture link'} /></label>
              <p className="ops-help">{o.cover_url ? 'This is the picture from Circle.' : 'Circle has no cover for this course.'} You can upload your own, paste a link, or use a Kalighat image.</p>
              <PhotoUpload folder="covers" name={o.title} label="Upload a cover picture" onDone={url => set('cover_override', url)} />
              <button type="button" className="btn ghost" disabled={!kalighat} onClick={() => set('cover_override', kalighat)}>Use the Kalighat image</button>
              {o.cover_override && <button type="button" className="btn ghost" onClick={() => set('cover_override', '')}>Back to the Circle picture</button>}
              {!kalighat && <p className="ops-help">The Kalighat image isn’t set up yet (KALIGHAT_COVER_URL).</p>}
            </div>
          </div>
        </section>

        <section className="ops-panel" aria-labelledby="onb">
          <h2 id="onb">Teacher onboarding</h2>
          {o.onboarding_id ? <p>Linked to <b>{choices.find(c => c.id === o.onboarding_id)?.title || o.onboarding_id}</b> <span className="chip-pine">{o.onboarding_source || 'linked'}</span></p>
            : <p>Not linked yet. Link the teacher’s submission to pre-fill the description, teachers, sessions and dates.</p>}
          <label>Link to onboarding submission
            <select value={o.onboarding_id || ''} onChange={e => link(e.target.value)} disabled={busy === 'link'}>
              <option value="">No link</option>
              {choices.map(c => <option key={c.id} value={c.id}>{c.title} · {c.status}</option>)}
            </select>
          </label>
          {(o.faculty || []).length > 0 && (
            <ul className="ops-faculty">
              {o.faculty.map(f => <li key={f.email}><span className="st"><i className={`sq ${f.done ? 'green' : 'amber'}`} />{f.done ? 'Submitted' : 'Waiting'}</span> {f.name}</li>)}
            </ul>)}
          <label>Programme director (optional, waited for before publishing)<input type="email" value={o.director_email || ''} onChange={e => set('director_email', e.target.value)} placeholder="name@embodiedphilosophy.com" /></label>
        </section>

        <section className="ops-panel" aria-labelledby="details">
          <h2 id="details">Catalog details</h2>
          <fieldset><legend>Programme <Req /> <span className="ops-help">Sets the colour band</span></legend><Chips name="Programme" dots={PROGRAMME_COLOURS} options={PROGRAMMES} value={o.programme} onChange={v => set('programme', v)} /></fieldset>
          <label>Card label <Req /><input value={o.card_label} onChange={e => set('card_label', e.target.value)} placeholder="FALL 2026" maxLength={60} /></label>
          <fieldset><legend>Kind <Req /></legend><Chips name="Kind" options={KINDS} value={o.kind} onChange={v => set('kind', v)} /></fieldset>
          <fieldset><legend>Format</legend><Chips name="Format" options={FORMATS} value={o.format} onChange={v => set('format', v)} /></fieldset>
          <fieldset><legend>Depth</legend><Chips name="Depth" options={DEPTHS} value={o.depth} onChange={v => set('depth', v)} /></fieldset>
          <fieldset><legend>Topics</legend><Chips name="Topics" multi options={TOPICS} value={o.topics} onChange={v => set('topics', v)} /></fieldset>
          <div className="ops-grid2">
            <label>Access level
              <select value={o.access} onChange={e => set('access', e.target.value)}><option value="">Not set</option>{ACCESS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
            </label>
            <label>CE hours (blank if not for CE)<input className="mono" inputMode="decimal" value={o.ce_hours} onChange={e => set('ce_hours', e.target.value)} /></label>
            <label>Length <Source of={o.sources.length} /><input value={o.length} onChange={e => set('length', e.target.value)} placeholder="8 weeks" /></label>
            <label>Next date <Source of={o.sources.next_date} /><input type="date" className="mono" value={o.next_date} onChange={e => set('next_date', e.target.value)} /></label>
          </div>
          {o.requires === 'year_long' && <p className="ops-help">For year-long students only{o.unlock_note ? `: ${o.unlock_note}` : ''}. Set in the access map.</p>}
          {o.next_session && <p className="ops-help">Card’s next-session line: <span className="mono">{o.next_session}</span></p>}
          <label>Description <Req /> <Source of={o.sources.description} /><textarea rows={6} value={o.description} onChange={e => set('description', e.target.value)} /></label>
          <label>What’s included <Req /> <Source of={o.sources.included} /><span className="ops-help"> One line each. At least one.</span>
            <textarea rows={5} value={incl} onChange={e => set('included', e.target.value.split('\n'))} /></label>
        </section>

        <section className="ops-panel" aria-labelledby="extras">
          <h2 id="extras">Card extras <span className="ops-help">Optional; the site uses them when present</span></h2>
          <label>Promise line<input value={o.promise || ''} onChange={e => set('promise', e.target.value)} maxLength={300} /></label>
          <div className="ops-grid2">
            <label>Live label<input value={o.live_label || ''} onChange={e => set('live_label', e.target.value)} placeholder="Live on Zoom" /></label>
            <label>When label<input value={o.when_label || ''} onChange={e => set('when_label', e.target.value)} placeholder="Mondays, 12pm ET" /></label>
            <label>Sort order<input className="mono" inputMode="numeric" value={o.sort_order || ''} onChange={e => set('sort_order', e.target.value)} /></label>
            <label>Pay-what-you-can amounts<input value={o.pwyc_amounts || ''} onChange={e => set('pwyc_amounts', e.target.value)} placeholder="10, 25, 50" /></label>
          </div>
        </section>

        <section className="ops-panel" aria-labelledby="teach">
          <h2 id="teach">Teachers <Source of={o.sources.teachers} /></h2>
          {o.teachers.length === 0 && <p className="ops-help">No teachers yet. Link onboarding, or add one.</p>}
          <ul className="ops-teachers">
            {o.teachers.map((t, i) => (
              <li key={i}>
                <span className="thumb" aria-hidden="true">{t.photo ? <img src={t.photo} alt="" width="48" height="48" /> : (t.name || '?')[0]}</span>
                <input aria-label="Teacher name" value={t.name} onChange={e => teacherSet(i, 'name', e.target.value)} />
                <input aria-label="Headshot link" value={t.photo} onChange={e => teacherSet(i, 'photo', e.target.value)} placeholder="Headshot link" />
                <PhotoUpload folder="teachers" name={t.name || 'teacher'} label="Upload headshot" onDone={url => teacherSet(i, 'photo', url)} />
                <button type="button" className="btn ghost" onClick={() => set('teachers', o.teachers.filter((_, j) => j !== i))}>Remove</button>
              </li>))}
          </ul>
          <button type="button" className="btn ghost" onClick={() => set('teachers', [...o.teachers, { name: '', role: '', bio: '', photo: '', email: '' }])}>Add a teacher</button>
        </section>

        <section className="ops-panel" aria-labelledby="sess">
          <h2 id="sess">Sessions <Source of={o.sources.sessions} /></h2>
          {o.sessions.length === 0 && <p className="ops-help">No sessions yet. They come from onboarding and the programming calendar.</p>}
          <ul className="ops-sessions">
            {o.sessions.map((s, i) => (
              <li key={i}>
                <input aria-label="Session date" type="date" className="mono" value={s.date} onChange={e => sessSet(i, 'date', e.target.value)} />
                <input aria-label="Session title" value={s.title} onChange={e => sessSet(i, 'title', e.target.value)} />
                <button type="button" className="btn ghost" onClick={() => set('sessions', o.sessions.filter((_, j) => j !== i))}>Remove</button>
              </li>))}
          </ul>
          <button type="button" className="btn ghost" onClick={() => set('sessions', [...o.sessions, { id: '', date: '', time: '', title: '', teacher: '' }])}>Add a session</button>
        </section>
      </div>

      <aside className="ops-pub-side" aria-label="Preview and publishing">
        <section className="ops-panel" aria-labelledby="prev">
          <div className="ops-prev-head"><h2 id="prev">Live preview</h2>
            <div className="ops-seg" role="group" aria-label="Preview as">
              <button type="button" className={view === 'card' ? 'on' : ''} aria-pressed={view === 'card'} onClick={() => setView('card')}>Card</button>
              <button type="button" className={view === 'row' ? 'on' : ''} aria-pressed={view === 'row'} onClick={() => setView('row')}>List row</button>
            </div></div>
          {view === 'card' ? (
            <article className="site-card">
              <div className="band" style={{ background: band }} aria-hidden="true" />
              <div className="in">
                <div className="top"><span className="lab">{o.card_label || 'CARD LABEL'}</span>{badge && <span className="badge">{badge}</span>}</div>
                <h3>{o.title}</h3>
                <p className="by">{o.teachers.map(t => t.name).filter(Boolean).join(' & ') || 'Teacher'}</p>
                <p className="meta"><span>{o.length || 'Length'}</span><span>·</span><span>{o.format || 'Format'}</span><span>·</span><span className="mono">{o.price_label || 'Price'}</span>{o.next_date ? <><span>·</span><span>Next <span className="mono">{long(o.next_date)}</span></span></> : null}</p>
                {o.next_session && <p className="next">Next: <span className="mono">{o.next_session}</span></p>}
              </div>
            </article>
          ) : (
            <div className="site-row"><span className="bandv" style={{ background: band }} aria-hidden="true" /><span className="t">{o.title}<small>{o.teachers.map(t => t.name).filter(Boolean).join(' & ') || 'Teacher'} · {o.length || 'Length'} · {o.format || 'Format'}</small></span>{badge && <span className="badge">{badge}</span>}</div>
          )}
          <p className="ops-k">Filters this listing will appear under</p>
          <p className="ops-help" data-testid="filters">{filtersLine(o)}</p>
        </section>

        <section className="ops-panel" aria-labelledby="chk">
          <h2 id="chk">Ready to publish?</h2>
          <ul className="ops-checklist">
            {list.map(c => <li key={c.key} className={c.ok ? 'ok' : ''}><span className="mk" aria-hidden="true">{c.ok ? '✓' : '○'}</span><span>{c.label}{!c.required && !c.ok ? ' (suggested)' : ''}<span className="sr">{c.ok ? ', done' : c.required ? ', still needed' : ', optional'}</span></span></li>)}
          </ul>
        </section>

        <div className="ops-pine-bar" role="group" aria-label="Publish">
          <span className="state">{live ? 'Published · live on the site' : ready ? 'Ready to publish' : `${list.filter(c => c.required && !c.ok).length} required field${list.filter(c => c.required && !c.ok).length === 1 ? '' : 's'} left`}</span><b className="mono">{progress(o)} of 9 fields</b>
        </div>
        {!ready && !live && <p className="ops-help">Publish turns on once the starred items are done.</p>}
        {msg && <p role={msg.ok ? 'status' : 'alert'} className={msg.ok ? 'ops-say' : 'ops-err'}>{msg.text}</p>}
      </aside>
    </div>
    </>
  );
}
