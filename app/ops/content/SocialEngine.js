'use client';
import { useEffect, useRef, useState } from 'react';
import { VIEWS, colType, PLAN_EDITABLE } from '@/lib/ops/socialengine';
import Cropper, { shrink } from './Cropper';

const label = h => h === 'publish_time_ET' ? 'Time (ET)' : h === 'jake_notes' ? 'Notes for the planner' : h.replace(/_/g, ' ').replace(/^./, c => c.toUpperCase());
const day = s => /^\d{4}-\d{2}-\d{2}$/.test(s || '') ? new Date(`${s}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' }) : s || 'No date';
const time = t => { const m = String(t || '').match(/^(\d{1,2}):(\d{2})$/); if (!m) return t || ''; const h = +m[1]; return `${h % 12 || 12}${m[2] === '00' ? '' : ':' + m[2]}${h >= 12 ? 'pm' : 'am'}`; };
const isStory = p => /story/i.test(p.platforms) && !/feed/i.test(p.platforms);
const api = async (body) => {
  const res = await fetch('/api/ops/social', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).catch(() => null);
  const j = await res?.json().catch(() => ({}));
  return { ok: !!res?.ok, status: res?.status, ...j };
};

// Content → Social: the whole EP Social Engine. Make still publishes Approved posts at their date and time.
export default function SocialEngine({ director, initial = 'plan' }) {
  const [view, setView] = useState(initial);
  const views = VIEWS.filter(v => !v.director || director);
  const go = k => { setView(k); try { history.replaceState(null, '', k === 'plan' ? '/ops/content?tab=social' : `/ops/content?tab=social&s=${k}`); } catch {} };
  return (
    <section className="ops-se">
      <nav className="ops-filters ops-site-tabs" aria-label="Social">
        {views.map(v => <a key={v.key} href={`/ops/content?s=${v.key}`} aria-current={v.key === view ? 'page' : undefined} onClick={e => { e.preventDefault(); go(v.key); }}>{v.label}</a>)}
      </nav>
      {view === 'plan' ? <Plan /> : view === 'history' ? <History /> : <Library key={view} view={views.find(v => v.key === view)} />}
    </section>
  );
}

function useView(view, q = '', offset = 0, extra = '') {
  const [data, setData] = useState(null);
  const load = async () => {
    const res = await fetch(`/api/ops/social?view=${view}&q=${encodeURIComponent(q)}&offset=${offset}${extra}`).catch(() => null);
    const j = await res?.json().catch(() => ({}));
    setData(res?.ok ? j : { error: j?.error || 'Couldn’t load the Social Engine' });
  };
  useEffect(() => { setData(null); const t = setTimeout(load, q ? 300 : 0); return () => clearTimeout(t); }, [view, q, offset]);
  return [data, load];
}

// ---------- Plan: the feed, and each post edited where it shows ----------
const weekOf = p => p.week_of || p.publish_date?.slice(0, 7) || '';
function Plan() {
  const [data, reload] = useView('plan');
  const [open, setOpen] = useState(null); // a row number, or 'new'
  const [msg, setMsg] = useState('');
  if (!data) return <p className="ops-empty">Loading the plan…</p>;
  if (data.error) return <p className="ops-empty">{data.error}</p>;
  const posts = data.rows.map(r => ({ ...r.values, _row: r.row, _thumb: r.thumb, _src: r.src, _raw: r.values }));
  const proposed = posts.filter(p => p.status === 'Proposed');
  const weeks = [...new Set(posts.map(weekOf))];
  const approveAll = async () => {
    if (!confirm(`Approve all ${proposed.length} proposed posts? Make publishes each at its date and time.`)) return;
    const j = await api({ view: 'plan', approve: proposed.map(p => ({ row: p._row, before: p._raw })) });
    setMsg(j.ok ? `${j.approved} approved.` : j.error); reload();
  };
  const count = s => posts.filter(p => p.status === s).length;
  const i = posts.findIndex(p => p._row === open);
  return (
    <div className="ops-se-plan">
      <p className="ops-empty">Tap a post to read and edit it. Approved posts are published by Make at their date and time; rows still Proposed at the Sunday 6pm deadline aren’t posted.</p>
      <div className="ops-se-bar">
        <span className="pills">{['Proposed', 'Approved', 'Needs edit', 'Posted', 'Failed'].filter(count).map(s => <span key={s} className={`pill s-${s.replace(/\s/g, '')}`}>{count(s)} {s}</span>)}</span>
        {data.canEdit && <button className="chip" onClick={() => setOpen('new')}>New post</button>}
        {data.canEdit && proposed.length > 0 && <button className="chip primary" onClick={approveAll}>Approve all proposed ({proposed.length})</button>}
        {msg && <span className="hint">{msg}</span>}
      </div>
      {!posts.length && <p className="ops-empty">Nothing planned from last week on.</p>}
      {weeks.map(w => (
        <div key={w}>
          <h3 className="ops-se-h">{/^\d{4}-\d{2}-\d{2}$/.test(w) ? `Week of ${day(w)}` : w || 'Undated'}</h3>
          <ul className="ops-se-feed">
            {posts.filter(p => weekOf(p) === w).map(p => (
              <li key={p._row} className={['Skip', 'Failed'].includes(p.status) ? 'off' : ''}>
                <button onClick={() => setOpen(p._row)} aria-label={`${day(p.publish_date)} ${time(p.publish_time_ET)}: ${String(p.caption || 'no caption').slice(0, 80)}`}>
                  <span className="pic">
                    {p._thumb ? <img src={p._thumb} alt="" loading="lazy" referrerPolicy="no-referrer" /> : <span className="none">No image</span>}
                    <span className={`st s-${String(p.status || 'Proposed').replace(/\s/g, '')}`}>{p.status || 'Proposed'}</span>
                    {isStory(p) && <span className="kind">Story</span>}
                  </span>
                  <span className="meta">{day(p.publish_date)} · {time(p.publish_time_ET)}</span>
                  <span className="cap">{p.caption || <i>No caption yet</i>}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
      {open === 'new' && <Composer key="new" p={blankPost()} events={data.events || []} canEdit={data.canEdit} onSaved={reload} close={() => setOpen(null)}
        onAdded={id => { setOpen(null); setMsg(`Added ${id}.`); }} />}
      {i >= 0 && <Composer key={posts[i]._row} p={posts[i]} events={data.events || []} canEdit={data.canEdit} onSaved={reload}
        prev={i > 0 ? () => setOpen(posts[i - 1]._row) : null} next={i < posts.length - 1 ? () => setOpen(posts[i + 1]._row) : null} close={() => setOpen(null)} />}
    </div>
  );
}

const tomorrow = () => { const d = new Date(Date.now() + 864e5); return d.toLocaleDateString('en-CA', { timeZone: 'America/New_York' }); };
const blankPost = () => { const v = { publish_date: tomorrow(), publish_time_ET: '11:00', platforms: 'IG Feed, Facebook', format: 'Feed single', pillar: '', status: 'Proposed' }; return { ...v, _row: null, _raw: v, _new: true }; };

// One post, laid out like it will appear: the picture on one side, its words and settings on the other.
// Everything about the post is edited here; one Save writes all the changes.
function Composer({ p, events = [], canEdit, onSaved, onAdded, prev, next, close }) {
  const [vals, setVals] = useState(p._raw);
  const [errors, setErrors] = useState({});
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState(null); // null | 'library' | 'crop'
  const [pic, setPic] = useState(null); // { preview, src } once the picture changes here
  const [picMsg, setPicMsg] = useState('');
  const isNew = !!p._new;
  const changed = PLAN_EDITABLE.filter(k => k !== 'status' && String(vals[k] ?? '') !== String(p._raw[k] ?? ''));
  const [inserting, setInserting] = useState(null); // null | 'captions' | 'quotes'
  const capRef = useRef(null);
  const insert = text => {
    const el = capRef.current, cur = String(vals.caption || '');
    const at = el && document.activeElement === el ? el.selectionStart : (el?.dataset.at ? Number(el.dataset.at) : cur.length);
    const before = cur.slice(0, at), after = cur.slice(at);
    const glue = before && !/\n\n$/.test(before) ? (/\n$/.test(before) ? '\n' : '\n\n') : '';
    if (errors.caption) setErrors(x => ({ ...x, caption: undefined }));
    setVals(v => ({ ...v, caption: before + glue + text + (after && !/^\n/.test(after) ? '\n\n' : '') + after }));
    if (el) el.dataset.at = (before + glue + text).length; // the next insert goes after this one
  };
  const locked = ['Posted', 'Manual'].includes(p.status), dis = !canEdit || locked || busy;
  const leave = go => () => { if (!(isNew ? String(vals.caption || '').trim() || vals.image_id : changed.length) || confirm('Leave without saving your changes?')) go(); };
  useEffect(() => {
    const key = e => {
      if (e.key === 'Escape') leave(close)();
      if (/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName)) return;
      if (e.key === 'ArrowLeft' && prev) leave(prev)();
      if (e.key === 'ArrowRight' && next) leave(next)();
    };
    document.addEventListener('keydown', key);
    const o = document.body.style.overflow; document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', key); document.body.style.overflow = o; };
  });
  const save = async (extra = {}) => {
    setBusy(true); setErrors({}); setMsg('');
    if (isNew) {
      const values = Object.fromEntries(PLAN_EDITABLE.filter(k => String(vals[k] ?? '').trim()).map(k => [k, vals[k]]));
      const j = await api({ view: 'plan', add: true, values: { ...values, ...extra } });
      setBusy(false);
      if (j.ok) { onSaved(); onAdded?.(j.post_id); return true; }
      setErrors(j.errors || {}); setMsg(j.error || 'Couldn’t add the post'); return false;
    }
    const j = await api({ view: 'plan', row: p._row, changes: { ...Object.fromEntries(changed.map(k => [k, vals[k]])), ...extra }, before: p._raw });
    setBusy(false);
    if (j.ok) { setMsg('Saved.'); setPicMsg(''); onSaved(); return true; }
    if (j.status === 409) { setMsg(`${j.error}. Showing their version.`); onSaved(); return false; }
    setErrors(j.errors || {}); setMsg(j.error || 'Couldn’t save'); return false;
  };
  const set = k => e => { setVals(s => ({ ...s, [k]: e.target.value })); if (errors[k]) setErrors(x => ({ ...x, [k]: undefined })); };
  const field = (k, el, lab = label(k)) => (
    <div className={`row${errors[k] ? ' bad' : ''}${changed.includes(k) ? ' changed' : ''}`}>
      <label htmlFor={`c-${k}`}>{lab}</label>{el}{errors[k] && <span className="hint">{errors[k]}</span>}
    </div>
  );
  const thumb = pic?.preview || p._thumb;
  const cropSrc = pic?.src || (p._src ? `/api/ops/social/image?id=${p._src}` : '');
  const sendPic = async (kind, name, data) => {
    setPicMsg(kind === 'upload' ? 'Uploading to Drive…' : 'Saving the crop to Drive…');
    const res = await fetch('/api/ops/social/image', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind, name, data }) }).catch(() => null);
    const j = await res?.json().catch(() => ({})) || {};
    if (!res?.ok) { setPicMsg(j.error || 'Couldn’t save the picture. Try again.'); return null; }
    return j;
  };
  const upload = async file => {
    if (!file) return;
    try {
      const s = await shrink(file);
      const j = await sendPic('upload', file.name, s.data); if (!j) return;
      setVals(v => ({ ...v, image_id: j.image_id, image_url: j.image_url })); setErrors(x => ({ ...x, image_id: undefined, image_url: undefined }));
      setPic({ preview: s.preview, src: s.preview });
      setPicMsg(`Uploaded and added to the Image Library as ${j.image_id}. Crop it, or ${isNew ? 'use it as it is' : 'save to use it as it is'}.`);
      setMode('crop');
    } catch (e) { setPicMsg(e.message); }
  };
  const cropped = async c => {
    const j = await sendPic('crop', vals.image_id || 'post', c.data); if (!j) return;
    setVals(v => ({ ...v, image_url: j.image_url }));
    setPic(x => ({ preview: c.preview, src: x?.src || cropSrc }));
    setMode(null);
    setPicMsg(`Cropped to ${c.shape}.${c.small ? ' It’s a small part of a small picture, so it may look soft.' : ''}${isNew ? '' : ' Save to use it.'}`);
  };
  const shapeOf = isStory(p) ? '9:16' : '4:5';
  const status = p.status || 'Proposed';
  return (
    <div className="ops-se-modal" role="dialog" aria-modal="true" aria-label="Post" onClick={e => { if (e.target === e.currentTarget) leave(close)(); }}>
      <div className="ops-se-comp">
        <div className="top">
          <span className={`pill s-${status.replace(/\s/g, '')}`}>{isNew ? 'New post' : status}</span>
          <span className="when">{day(isNew ? vals.publish_date : p.publish_date)} · {time(p.publish_time_ET)} ET · {isStory(p) ? 'Story' : p.platforms || 'Feed'}</span>
          <span className="nav">
            {!isNew && <button className="chip" disabled={!prev} onClick={leave(prev)} aria-label="Previous post">←</button>}
            {!isNew && <button className="chip" disabled={!next} onClick={leave(next)} aria-label="Next post">→</button>}
            <button className="chip" onClick={leave(close)} aria-label="Close">✕</button>
          </span>
        </div>
        <div className="cols">
          <div className="media">
            {mode === 'crop' && cropSrc ? <Cropper src={cropSrc} initial={shapeOf} onDone={cropped} onCancel={() => setMode(null)} />
              : <div className="pic">{thumb ? <img src={thumb} alt="" referrerPolicy="no-referrer" /> : <span className="none">No image</span>}</div>}
            {!dis && mode !== 'crop' && (
              <div className="picacts">
                {cropSrc && <button type="button" className="chip" onClick={() => { setMode('crop'); setPicMsg(''); }}>Crop</button>}
                <button type="button" className="chip" onClick={() => setMode(m => m === 'library' ? null : 'library')}>{mode === 'library' ? 'Close the library' : 'Choose from library'}</button>
                <label className="chip upl">Upload a photo<input type="file" accept="image/*" onChange={e => { upload(e.target.files?.[0]); e.target.value = ''; }} /></label>
              </div>
            )}
            {picMsg ? <p className="hint">{picMsg}</p> : (vals.image_id !== p._raw.image_id || vals.image_url !== p._raw.image_url) && <p className="hint">New picture chosen. Save to use it.</p>}
            {(errors.image_id || errors.image_url) && <p className="hint">{errors.image_id || errors.image_url}</p>}
            {mode === 'library' && <ImagePicker onPick={(id, t, drive) => { setVals(s => ({ ...s, image_id: id, image_url: '' })); setErrors(x => ({ ...x, image_id: undefined, image_url: undefined })); setPic({ preview: t, src: drive ? `/api/ops/social/image?id=${drive}` : '' }); setPicMsg(''); setMode(null); }} />}
            {p.quote_text && <p className="quo">“{p.quote_text}”{p.quote_source ? ` — ${p.quote_source}` : ''} <span className={p.quote_check === 'Verbatim' ? 'ok' : 'warn'}>{p.quote_check || 'not checked'}</span></p>}
            {p.error && <p className="err">Make: {p.error}</p>}
            {p.post_links && <p className="ev"><a href={p.post_links.split(/\s|,/)[0]} target="_blank" rel="noopener">View the post ↗</a></p>}
          </div>
          <form className="words ops-edit" onSubmit={async e => { e.preventDefault(); await save(); }}>
            {locked && <p className="hint">Already {status.toLowerCase()}: shown as it went out.</p>}
            {field('caption', <textarea id="c-caption" ref={capRef} className="capbox" rows={10} value={vals.caption || ''} disabled={dis} onChange={set('caption')}
              onBlur={e => { e.target.dataset.at = e.target.selectionStart; }} placeholder="Write the caption…" />, 'Caption')}
            <div className="capbar">
              {!dis && <>
                <button type="button" className={`chip${inserting === 'captions' ? ' on' : ''}`} onClick={() => setInserting(x => x === 'captions' ? null : 'captions')}>Insert a snippet</button>
                <button type="button" className={`chip${inserting === 'quotes' ? ' on' : ''}`} onClick={() => setInserting(x => x === 'quotes' ? null : 'quotes')}>Insert a quote</button>
              </>}
              <span className="count">{String(vals.caption || '').length} / 2,200</span>
            </div>
            {inserting && <Inserter kind={inserting} onPick={t => { insert(t); setInserting(null); }} />}
            {field('hashtags', <textarea id="c-hashtags" rows={2} value={vals.hashtags || ''} disabled={dis} onChange={set('hashtags')} />)}
            <div className="two">
              {field('publish_date', <input id="c-publish_date" type="date" value={vals.publish_date || ''} disabled={dis} onChange={set('publish_date')} />, 'Date')}
              {field('publish_time_ET', <input id="c-publish_time_ET" value={vals.publish_time_ET || ''} disabled={dis} placeholder="11:00" onChange={set('publish_time_ET')} />)}
            </div>
            <div className="two">
              {field('platforms', <input id="c-platforms" value={vals.platforms || ''} disabled={dis} onChange={set('platforms')} />)}
              {field('format', <input id="c-format" value={vals.format || ''} disabled={dis} onChange={set('format')} />)}
            </div>
            <div className="two">
              {field('pillar', <input id="c-pillar" value={vals.pillar || ''} disabled={dis} onChange={set('pillar')} />)}
              {field('link', <input id="c-link" value={vals.link || ''} disabled={dis} placeholder="https://" onChange={set('link')} />)}
            </div>
            {field('linked_event', <><input id="c-linked_event" list="c-events" value={vals.linked_event || ''} disabled={dis} placeholder="None" onChange={set('linked_event')} />
              <datalist id="c-events">{events.map(e => <option key={e} value={e} />)}</datalist></>, 'For an event')}
            {field('jake_notes', <textarea id="c-jake_notes" rows={2} value={vals.jake_notes || ''} disabled={dis} onChange={set('jake_notes')} placeholder="What should the planner change?" />)}
            {canEdit && isNew && (
              <div className="bar">
                <button type="button" className="chip primary" disabled={busy} onClick={() => save({ status: 'Approved' })}>Add and approve</button>
                <button type="submit" className="chip" disabled={busy}>Add as proposed</button>
                <button type="button" className="chip" onClick={leave(close)}>Cancel</button>
              </div>
            )}
            {canEdit && !locked && !isNew && (
              <div className="bar">
                {status !== 'Approved'
                  ? <button type="button" className="chip primary" disabled={busy} onClick={async () => { if (await save({ status: 'Approved' })) next ? next() : close(); }}>{changed.length ? 'Save and approve' : 'Approve'}</button>
                  : <button type="button" className="chip" disabled={busy} onClick={() => save({ status: 'Proposed' })}>Unapprove</button>}
                <button type="submit" className={`chip${status === 'Approved' ? ' primary' : ''}`} disabled={busy || !changed.length}>{changed.length ? `Save ${changed.length} change${changed.length === 1 ? '' : 's'}` : 'No changes'}</button>
                <button type="button" className="chip" disabled={busy || !String(vals.jake_notes || '').trim()} onClick={() => save({ status: 'Needs edit' })}>Send back with my notes</button>
                {status !== 'Skip' ? <button type="button" className="chip" disabled={busy} onClick={() => save({ status: 'Skip' })}>Skip</button>
                  : <button type="button" className="chip" disabled={busy} onClick={() => save({ status: 'Proposed' })}>Back to proposed</button>}
              </div>
            )}
            {msg && <p className="hint">{msg}</p>}
          </form>
        </div>
      </div>
    </div>
  );
}

// Approved Caption Bank snippets and verified quotes (copied exactly), to drop into a caption
function Inserter({ kind, onPick }) {
  const [q, setQ] = useState('');
  const [data] = useView(kind, q);
  const ok = r => kind === 'captions' ? String(r.values.approved).toUpperCase() === 'TRUE' : String(r.values.verified).toUpperCase() === 'TRUE';
  const text = r => kind === 'captions' ? r.values.text : `“${r.values.quote}”\n— ${[r.values.author, r.values.work].filter(Boolean).join(', ')}`;
  const rows = data?.rows?.filter(ok) || [];
  return (
    <div className="ops-se-ins">
      <input placeholder={kind === 'captions' ? 'Search snippets…' : 'Search quotes by words, author, work…'} value={q} onChange={e => setQ(e.target.value)} autoFocus />
      {!data ? <p className="hint">Loading…</p> : data.error ? <p className="hint">{data.error}</p> : !rows.length ? <p className="hint">{kind === 'captions' ? 'No approved snippets match.' : 'No verified quotes match.'}</p> : (
        <ul>{rows.slice(0, 40).map(r => (
          <li key={r.row}><button type="button" onClick={() => onPick(text(r))}>
            <span className="t">{kind === 'captions' ? r.values.text : `“${r.values.quote}”`}</span>
            <span className="s">{kind === 'captions' ? [r.values.type, r.values.program].filter(Boolean).join(' · ') : [r.values.author, r.values.work].filter(Boolean).join(', ')}</span>
          </button></li>))}</ul>
      )}
    </div>
  );
}

// Every picture that may be reused, newest first, 60 at a time; the grid scrolls inside the editor
function ImagePicker({ onPick }) {
  const [q, setQ] = useState('');
  const [offset, setOffset] = useState(0);
  const [rows, setRows] = useState([]);
  const [data] = useView('images', q, offset, '&pick=1');
  useEffect(() => { setOffset(0); setRows([]); }, [q]);
  useEffect(() => { if (data?.rows) setRows(r => offset === 0 ? data.rows : [...r, ...data.rows.filter(x => !r.some(y => y.row === x.row))]); }, [data]);
  const more = data && !data.error && rows.length < data.total;
  return (
    <div className="ops-se-picker">
      <input placeholder="Search images by name, tag, category…" value={q} onChange={e => setQ(e.target.value)} autoFocus />
      {data?.error ? <p className="hint">{data.error}</p> : !rows.length && !data ? <p className="hint">Loading…</p> : !rows.length ? <p className="hint">No pictures match.</p> : (<>
        <ul className="grid">{rows.map(r => (
          <li key={r.row}><button type="button" onClick={() => onPick(r.values.image_id, r.thumb, r.values.drive_file_id)} title={r.values.file_name}>
            {r.thumb ? <img src={r.thumb} alt="" loading="lazy" referrerPolicy="no-referrer" /> : <span className="none">{r.values.file_name}</span>}
          </button></li>))}
          {more && <li className="morecell"><button type="button" disabled={!data} onClick={() => setOffset(rows.length)}>{data ? 'Show more' : 'Loading…'}</button></li>}
        </ul>
        <p className="hint">{data?.total != null ? `${rows.length} of ${data.total} pictures` : ''}</p>
      </>)}
    </div>
  );
}

// ---------- Published ----------
function History() {
  const [offset, setOffset] = useState(0);
  const [data] = useView('history', '', offset);
  if (!data) return <p className="ops-empty">Loading…</p>;
  if (data.error) return <p className="ops-empty">{data.error}</p>;
  return (
    <div>
      <p className="ops-empty">What went out on Instagram, newest first ({data.total} posts).</p>
      <ul className="ops-se-hist">{data.rows.map(r => { const v = r.values; return (
        <li key={r.row}><span className="d">{day(String(v.posted_at).slice(0, 10))}</span><span className="c">{String(v.caption || '').slice(0, 160)}</span>
          <span className="n">♥ {v.like_count || 0} · 💬 {v.comments_count || 0}</span>{v.permalink && <a href={v.permalink} target="_blank" rel="noopener">↗</a>}</li>); })}</ul>
      <Pager data={data} setOffset={setOffset} />
    </div>
  );
}

function Pager({ data, setOffset }) {
  if (data.total <= 60) return null;
  return (
    <p className="ops-se-pager">
      <button className="chip" disabled={data.offset === 0} onClick={() => setOffset(Math.max(0, data.offset - 60))}>← Newer</button>
      <span className="hint">{data.offset + 1}–{Math.min(data.total, data.offset + 60)} of {data.total}</span>
      <button className="chip" disabled={data.offset + 60 >= data.total} onClick={() => setOffset(data.offset + 60)}>Older →</button>
    </p>
  );
}

// ---------- Libraries: quotes, images, captions, rules, categories, archive folders ----------
function Library({ view }) {
  const [q, setQ] = useState('');
  const [offset, setOffset] = useState(0);
  const [data, reload] = useView(view.key, q, offset);
  const [sel, setSel] = useState(null);
  return (
    <div>
      {view.help && <p className="ops-empty">{view.help}</p>}
      <div className="ops-se-bar">
        {view.search && <input className="ops-se-search" placeholder="Search…" value={q} onChange={e => { setQ(e.target.value); setOffset(0); }} />}
        {data?.canEdit && view.add && sel !== 'new' && <button className="chip" onClick={() => setSel('new')}>Add</button>}
        {data && !data.error && <span className="hint">{data.total} {data.total === 1 ? 'row' : 'rows'}</span>}
      </div>
      {!data ? <p className="ops-empty">Loading…</p> : data.error ? <p className="ops-empty">{data.error}</p> : (<>
        {sel === 'new' && <Row view={view} head={data.head} locked={data.locked} row={null} values={{}} canEdit onDone={() => { setSel(null); reload(); }} />}
        {view.key === 'images' ? (
          <ul className="ops-se-imgs">{data.rows.map(r => (
            <li key={r.row} className={String(r.values.hidden).toUpperCase() === 'TRUE' ? 'off' : ''}>
              {sel === r.row ? <Row view={view} head={data.head} locked={data.locked} row={r.row} values={r.values} canEdit={data.canEdit} onDone={c => { setSel(null); if (c) reload(); }} /> : (
                <button onClick={() => setSel(r.row)} title={r.values.file_name}>
                  {r.thumb ? <img src={r.thumb} alt="" loading="lazy" referrerPolicy="no-referrer" /> : <span className="none">{r.values.file_name}</span>}
                  <span className="cap">{r.values.category || r.values.type}{String(r.values.reuse_ok).toUpperCase() !== 'TRUE' ? ' · not for reuse' : ''}</span>
                </button>)}
            </li>))}</ul>
        ) : (
          <ul className="ops-site-rows">{data.rows.map(r => (
            <li key={r.row}>{sel === r.row ? <Row view={view} head={data.head} locked={data.locked} row={r.row} values={r.values} canEdit={data.canEdit} onDone={c => { setSel(null); if (c) reload(); }} /> : (
              <button className="ops-site-row" onClick={() => setSel(r.row)}>
                <span className="n">{String(view.name(r.values) || `Row ${r.row}`).slice(0, 160)}</span>
                {view.sub?.(r.values) && <span className="s">{String(view.sub(r.values)).slice(0, 140)}</span>}
              </button>)}</li>))}</ul>
        )}
        <Pager data={data} setOffset={setOffset} />
      </>)}
    </div>
  );
}

function Row({ view, head, locked, row, values, canEdit, onDone }) {
  const [vals, setVals] = useState(values);
  const [orig, setOrig] = useState(values);
  const [errors, setErrors] = useState({});
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const changed = head.filter(h => h && String(vals[h] ?? '') !== String(orig[h] ?? ''));
  const save = async e => {
    e.preventDefault(); setBusy(true); setErrors({}); setMsg('');
    const j = await api(row == null ? { view: view.key, add: true, values: Object.fromEntries(changed.map(h => [h, vals[h]])) }
      : { view: view.key, row, changes: Object.fromEntries(changed.map(h => [h, vals[h]])), before: orig });
    setBusy(false);
    if (j.ok) return onDone(true);
    if (j.status === 409) { setMsg(`${j.error}. Their version is shown now.`); setOrig(j.conflict); setVals(j.conflict); return; }
    setErrors(j.errors || {}); setMsg(j.error || 'Couldn’t save');
  };
  return (
    <form className="ops-edit" onSubmit={save}>
      {head.filter(Boolean).filter(h => !(row == null && locked.includes(h))).map(h => {
        const type = colType(view.tab, h), dis = !canEdit || busy || locked.includes(h), set = x => setVals(s => ({ ...s, [h]: x }));
        return (
          <div key={h} className={`row${errors[h] ? ' bad' : ''}${changed.includes(h) ? ' changed' : ''}`}>
            <label>{label(h)}</label>
            {type === 'bool' ? <select value={String(vals[h] || '').toUpperCase()} disabled={dis} onChange={e => set(e.target.value)}><option value="">—</option><option value="TRUE">Yes</option><option value="FALSE">No</option></select>
              : type === 'long' ? <textarea rows={Math.min(8, Math.max(2, Math.ceil(String(vals[h] || '').length / 80)))} value={vals[h] || ''} disabled={dis} onChange={e => set(e.target.value)} />
              : <input value={vals[h] || ''} disabled={dis} onChange={e => set(e.target.value)} />}
            {errors[h] && <span className="hint">{errors[h]}</span>}
          </div>
        );
      })}
      <div className="bar">
        {canEdit && <button type="submit" className="chip primary" disabled={busy || !changed.length}>{row == null ? 'Add' : changed.length ? `Save ${changed.length} change${changed.length === 1 ? '' : 's'}` : 'No changes'}</button>}
        <button type="button" className="chip" onClick={() => onDone(false)}>{canEdit ? 'Cancel' : 'Close'}</button>
        {msg && <span className="hint">{msg}</span>}
      </div>
    </form>
  );
}
