'use client';
import { useEffect, useRef, useState } from 'react';
import { VIEWS, colType, PLAN_EDITABLE, readSlides, MAX_SLIDES, MIN_SLIDES, POST_TYPES, MAX_HASHTAGS, hashtagCount, timeKey, isFeed, daysBetween, mondayOf } from '@/lib/ops/socialengine';

import Cropper, { shrink } from './Cropper';
import TemplatePanel from '../social/TemplatePanel';
import { TEMPLATES } from '@/lib/ops/templates/registry';
import { guardrails } from '@/lib/ops/socialrules';

const label = h => h === 'publish_time_ET' ? 'Time (ET)' : h === 'pillar' ? 'Type of post' : h === 'jake_notes' ? 'Notes for the planner' : h.replace(/_/g, ' ').replace(/^./, c => c.toUpperCase());
export const day = s => /^\d{4}-\d{2}-\d{2}$/.test(s || '') ? new Date(`${s}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' }) : s || 'No date';
export const time = t => { const m = String(t || '').match(/^(\d{1,2}):(\d{2})$/); if (!m) return t || ''; const h = +m[1]; return `${h % 12 || 12}${m[2] === '00' ? '' : ':' + m[2]}${h >= 12 ? 'pm' : 'am'}`; };
export const isStory = p => p.media_kind === 'story' || !isFeed(p);
export const kindLabel = p => p.media_kind === 'carousel' ? `Carousel · ${readSlides(p).length}` : p.media_kind === 'reel' ? 'Reel' : isStory(p) ? 'Story' : '';
const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
const ago = d => { if (!d) return ''; const n = daysBetween(d, today()); return n <= 0 ? 'today' : n === 1 ? 'yesterday' : n < 14 ? `${n} days ago` : n < 60 ? `${Math.round(n / 7)} weeks ago` : `${Math.round(n / 30)} months ago`; };
export const api = async (body) => {
  const res = await fetch('/api/ops/social', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).catch(() => null);
  const j = await res?.json().catch(() => ({}));
  return { ok: !!res?.ok, status: res?.status, ...j };
};

// Content → Social: the whole EP Social Engine. Make still publishes Approved posts at their date and time.
export default function SocialEngine({ director, keys, initial, base = '/ops/social/library' }) {
  const views = (keys ? keys.map(k => VIEWS.find(v => v.key === k)) : VIEWS).filter(v => v && !v.virtual && v.key !== 'plan' && (!v.director || director));
  const [view, setView] = useState(views.some(v => v.key === initial) ? initial : views[0]?.key);
  const [seed, setSeed] = useState(null); // "Use in a post": carried to the Composer page
  const go = k => { setView(k); try { history.replaceState(null, '', `${base}?s=${k}`); } catch {} };
  // Starting a post from a picture or words: the Composer is its own page
  const useIn = s => { try { sessionStorage.setItem('ep-social-seed', JSON.stringify(s)); } catch {} window.location.href = '/ops/social/compose?seed=1'; };
  return (
    <section className="ops-se">
      {views.length > 1 && (
        <nav className="ops-soc-tabs" aria-label="Sections">
          {views.map(v => <a key={v.key} href={`${base}?s=${v.key}`} aria-current={v.key === view ? 'page' : undefined} onClick={e => { e.preventDefault(); go(v.key); }}>{v.label}</a>)}
        </nav>)}
      {view === 'history' ? <History /> : <Library key={view} view={views.find(v => v.key === view)} onUse={useIn} />}
    </section>
  );
}

export function useView(view, q = '', offset = 0, extra = '') {
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
const weekOf = p => /^\d{4}-\d{2}-\d{2}$/.test(p.publish_date || '') ? mondayOf(p.publish_date) : p.week_of || '';


// The Instagram profile grid: three across, newest top left. Upcoming posts first (the week as it will look once posted), then what's
// already out. Drag an upcoming post onto another to swap their times, or use its Earlier / Later buttons.
export function GridPreview({ posts, past, canEdit, open, reload, setMsg }) {
  const [drag, setDrag] = useState(null);
  const upcoming = posts.filter(p => isFeed(p) && !['Skip', 'Failed', 'Posted', 'Manual'].includes(p.status) && (p.publish_date || '') >= today())
    .sort((a, b) => `${b.publish_date} ${timeKey(b.publish_time_ET)}`.localeCompare(`${a.publish_date} ${timeKey(a.publish_time_ET)}`));
  const out = past.filter(p => !upcoming.some(u => u._row === p._row));
  const swap = async (a, b) => {
    if (!a || !b || a._row === b._row) return;
    setMsg('Moving…');
    const j = await api({ view: 'plan', swap: [{ row: a._row, before: a._raw }, { row: b._row, before: b._raw }] });
    setMsg(j.ok ? 'Swapped their times.' : j.status === 409 ? `${j.error}. Reload to see their version.` : j.error || 'Couldn’t move it');
    reload();
  };
  // later in time = earlier in this list (newest first)
  const tile = (p, i) => (
    <li key={p._row} draggable={canEdit} className={drag === p._row ? 'drag' : ''}
      onDragStart={e => { setDrag(p._row); e.dataTransfer.effectAllowed = 'move'; }} onDragEnd={() => setDrag(null)}
      onDragOver={e => { if (drag != null && drag !== p._row) e.preventDefault(); }}
      onDrop={e => { e.preventDefault(); const a = upcoming.find(x => x._row === drag); setDrag(null); swap(a, p); }}>
      <button onClick={() => open(p._row)} aria-label={`${day(p.publish_date)} ${time(p.publish_time_ET)}: ${String(p.caption || 'no caption').slice(0, 60)}`}>
        {p._thumb ? <img src={p._thumb} alt="" loading="lazy" referrerPolicy="no-referrer" /> : <span className="none">No image</span>}
        <span className={`st s-${String(p.status || 'Proposed').replace(/\s/g, '')}`}>{day(p.publish_date).replace(/^\w+, /, '')} · {time(p.publish_time_ET)}</span>
      </button>
      {canEdit && (
        <span className="mv">
          <button type="button" className="chip" disabled={i >= upcoming.length - 1} onClick={() => swap(p, upcoming[i + 1])} aria-label="Post earlier">← Earlier</button>
          <button type="button" className="chip" disabled={i === 0} onClick={() => swap(p, upcoming[i - 1])} aria-label="Post later">Later →</button>
        </span>
      )}
    </li>
  );
  return (
    <div className="ops-se-gridprev">
      <p className="ops-empty">This is how the profile will look: the newest post is top left. {canEdit ? 'Drag a post onto another to swap their times.' : ''}</p>
      {!upcoming.length && <p className="ops-empty">No upcoming feed posts.</p>}
      <ul className="g3">{upcoming.map(tile)}</ul>
      {out.length > 0 && <>
        <h3 className="ops-se-h">Already out</h3>
        <ul className="g3 done">{out.map(p => (
          <li key={p._row}><button onClick={() => open(p._row)} aria-label={`Posted ${day(p.publish_date)}`}>
            {p._thumb ? <img src={p._thumb} alt="" loading="lazy" referrerPolicy="no-referrer" /> : <span className="none">No image</span>}
            <span className="st s-Posted">{day(p.publish_date).replace(/^\w+, /, '')}</span></button></li>))}</ul>
      </>}
    </div>
  );
}

// Publish → Overview: the next posts as a strip. Each opens the same editor as the Social tab, right here.
const todayNY = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
const flag = p => !p._thumb ? 'No image yet' : p.image_review !== 'Kept' ? 'Image not reviewed' : '';
export function NextPosts({ n = 9 }) {
  const [data] = useView('plan');
  if (!data) return <p className="ops-empty">Loading the next posts…</p>;
  if (data.error) return <p className="ops-empty">{data.error}</p>;
  const today = todayNY();
  const posts = data.rows.map(r => ({ ...r.values, _row: r.row, _thumb: r.thumb }))
    .filter(p => /^\d{4}-\d{2}-\d{2}$/.test(p.publish_date || '') && p.publish_date >= today && !/^skip/i.test(p.status || '') && p.status !== 'Draft')
    .slice(0, n);
  if (!posts.length) return <p className="ops-empty">No posts scheduled.</p>;
  return (
    <ul className="ops-strip">{posts.map(p => (
      <li key={p._row}>
        <a href={`/ops/social/compose?row=${p._row}`} aria-label={`Open the ${day(p.publish_date)} post`}>
          {p._thumb ? <img src={p._thumb} alt="" loading="lazy" referrerPolicy="no-referrer" /> : <span className="none" aria-hidden="true" />}
          <span className="d">{day(p.publish_date)}{p.publish_time_ET ? ` · ${time(p.publish_time_ET)}` : ''}</span>
          <span className="p">{p.platforms}</span>
          <span className={`s${flag(p) ? ' warn' : ''}`}>{flag(p) || p.status || 'Proposed'}</span>
        </a>
      </li>))}</ul>
  );
}

const tomorrow = () => { const d = new Date(Date.now() + 864e5); return d.toLocaleDateString('en-CA', { timeZone: 'America/New_York' }); };
export const blankPost = seed => {
  const v = { publish_date: tomorrow(), publish_time_ET: '11:00', platforms: 'IG Feed, Facebook', format: 'Feed single', media_kind: 'single', pillar: '', status: 'Proposed',
    ...(seed?.caption && { caption: seed.caption }), ...(seed?.image_id && { image_id: seed.image_id, image_url: '' }) };
  return { ...v, _row: null, _raw: v, _new: true, _seedPic: seed?.thumb ? { preview: seed.thumb, src: seed.drive ? `/api/ops/social/image?id=${seed.drive}` : '' } : null };
};
export const KINDS = [['single', 'Single', 'IG Feed, Facebook', 'Feed single'], ['carousel', 'Carousel', 'IG Feed, Facebook', 'Carousel'], ['reel', 'Video / Reel', 'IG Reel, Facebook', 'Reel'], ['story', 'Story frame', 'IG Story', 'Story']];

// One post, laid out like it will appear: the picture on one side, its words and settings on the other.
// Everything about the post is edited here; one Save writes all the changes.
export function Composer({ p, page = false, recentColourways = [], events = [], team = [], types = POST_TYPES, canEdit, canPublish, onSaved, onAdded, prev, next, close }) {
  const [vals, setVals] = useState(p._raw);
  const [errors, setErrors] = useState({});
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState(null); // null | 'library' | 'crop'
  const [pic, setPic] = useState(p._seedPic || null); // { preview, src } once the picture changes here
  const [picMsg, setPicMsg] = useState('');
  const [pv, setPv] = useState('4:5'); // the phone preview's shape for a feed post
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
  const kind = vals.media_kind || 'single';
  const slides = readSlides(vals);
  const setSlides = list => { setVals(v => ({ ...v, slides_json: list.length ? JSON.stringify(list) : '' })); setErrors(x => ({ ...x, slides_json: undefined })); };
  const setKind = k => {
    const [, , platforms, format] = KINDS.find(x => x[0] === k);
    setVals(v => ({ ...v, media_kind: k, ...(isNew && { platforms, format }) }));
  };
  // Manual only locks a plain picture post: carousels, Reels and Stories wait there to be posted by hand
  const locked = p.status === 'Posted' || (p.status === 'Manual' && kind === 'single'), dis = !canEdit || locked || busy;
  const canDelete = canEdit && !isNew && ['Proposed', 'Needs edit', 'Skip', 'Expired', 'Draft'].includes(p.status);
  const remove = async () => {
    if (!confirm('Delete this post? It disappears from the plan. A post that has already gone out can’t be deleted here.')) return;
    setBusy(true);
    const j = await api({ view: 'plan', delete: [{ row: p._row }] });
    setBusy(false);
    if (j.ok && j.deleted) { onSaved(); close(); } else setMsg(j.error || 'That post can’t be deleted (it may be approved or published).');
  };
  const markPosted = async () => {
    setBusy(true); const j = await api({ view: 'plan', markPosted: { row: p._row } }); setBusy(false);
    if (j.ok) { onSaved(); setMsg('Marked posted.'); } else setMsg(j.error || 'Couldn’t mark it posted');
  };
  const leave = go => () => { if (!(isNew ? String(vals.caption || '').trim() || vals.image_id : changed.length) || confirm('Leave without saving your changes?')) go(); };
  useEffect(() => {
    if (page) return undefined; // a page, not a pop-up: no Escape-to-close, no scroll lock
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
  // A card made from a template: its picture becomes the post's picture, its quote the post's quote (the server re-checks it), its credit line joins the caption
  const useCard = r => {
    const slidesJson = r.carousel ? JSON.stringify(r.exports.map(e => ({ kind: 'image', drive_file_id: e.drive_file_id, image_id: e.image_id }))) : undefined;
    setVals(v => ({ ...v, image_id: r.image_id, image_url: r.image_url, template_id: r.template_id, colourway: r.colourway, template_fields: r.template_fields, quote_id: r.quote?.quote_id || '',
      ...(r.carousel && { media_kind: 'carousel', slides_json: slidesJson, keyword: r.keyword || '' }),
      caption: r.credit && !String(v.caption || '').includes(r.credit) ? `${String(v.caption || '').trimEnd()}${v.caption ? '\n\n' : ''}${r.credit}` : v.caption }));
    if (!r.carousel) setPic({ preview: r.preview, src: '' });
    setErrors(x => ({ ...x, image_id: undefined, image_url: undefined, slides_json: undefined }));
    setMode(null); setPicMsg(r.carousel ? `${r.exports.length} slides saved to the Library.${isNew ? '' : ' Save to use them.'}` : `Card saved to the Library as ${r.image_id}.${isNew ? '' : ' Save to use it.'}`);
  };
  const card = (() => { try { return JSON.parse(vals.template_fields || 'null'); } catch { return null; } })();
  const status = p.status || 'Proposed';
  const sizeShown = kind === 'reel' || kind === 'story' ? '9:16' : pv;
  const platforms = String(vals.platforms || '').split(',').map(x => x.trim()).filter(Boolean);
  const hasPlat = n => platforms.some(x => x.toLowerCase() === n.toLowerCase());
  const togglePlat = n => setVals(v => { const cur = String(v.platforms || '').split(',').map(x => x.trim()).filter(Boolean); const on = cur.some(x => x.toLowerCase() === n.toLowerCase()); return { ...v, platforms: (on ? cur.filter(x => x.toLowerCase() !== n.toLowerCase()) : [...cur, n]).join(', ') }; });
  const london = londonLabel(vals.publish_date, vals.publish_time_ET);
  const g = guardrails({ ...vals, quote_check: vals.quote_id ? 'Verbatim' : p._raw.quote_check }, { eventLabels: new Set(events) });
  const draftBits = String(vals.caption || '').match(/\[DRAFT[^\]]*\]/gi) || [];
  const checks = [
    ...g.blocked.map(x => ({ t: 'bad', x })), ...g.flags.map(x => ({ t: 'warn', x })),
    ...(vals.quote_id || p._raw.quote_check === 'Verbatim' ? [{ t: 'ok', x: 'Quote copied verbatim from the Quote Library' }] : []),
    ...(vals.quote_id || p._raw.quote_check === 'Verbatim' ? [{ t: 'ok', x: 'Sanskrit diacritics kept exactly as in the source' }] : []),
    ...(!draftBits.length ? [{ t: 'ok', x: 'No DRAFT sentences left in the caption' }] : []),
    ...(vals.image_id || vals.image_url || slides.length ? [{ t: 'ok', x: vals.template_id ? 'Picture made from a template, saved in the Library' : 'Picture chosen' }] : []),
    ...(String(vals.caption || '').length <= 2200 ? [{ t: 'ok', x: `Caption ${String(vals.caption || '').length} of 2,200 characters` }] : []),
  ];
  const thread = (<Thread post={p.post_id} canComment={!isNew} />);
  return (
    <div className={`ops-se-modal${page ? ' page' : ''}`} role={page ? undefined : 'dialog'} aria-modal={page ? undefined : 'true'} aria-label="Post" onClick={e => { if (!page && e.target === e.currentTarget) leave(close)(); }}>
      <div className="ops-se-comp cmp">
        <div className="top">
          <span className={`pill s-${status.replace(/\s/g, '')}`}>{isNew ? 'New post' : status}</span>
          <span className="when">{day(isNew ? vals.publish_date : p.publish_date)} · {time(isNew ? vals.publish_time_ET : p.publish_time_ET)} ET · {kindLabel(isNew ? vals : p) || p.platforms || 'Feed'}</span>
          <span className="nav">
            {!isNew && <button className="chip" disabled={!prev} onClick={leave(prev)} aria-label="Previous post">←</button>}
            {!isNew && <button className="chip" disabled={!next} onClick={leave(next)} aria-label="Next post">→</button>}
            {!page && <button className="chip" onClick={leave(close)} aria-label="Close">✕</button>}
          </span>
        </div>
        {(isNew || (!locked && canEdit)) && (
          <div className="cmp-bar">
            <div className="ops-kinds" role="radiogroup" aria-label="What kind of post">
              {KINDS.map(([k, l]) => <button key={k} type="button" role="radio" aria-checked={kind === k} className={`chip${kind === k ? ' on' : ''}`} disabled={dis} onClick={() => setKind(k)}>{l}</button>)}
            </div>
            {kind !== 'reel' && kind !== 'story' && <div className="ops-kinds" role="group" aria-label="Size">{['4:5', '1:1'].map(z => <button key={z} type="button" className={`chip mono${pv === z ? ' on' : ''}`} aria-pressed={pv === z} onClick={() => setPv(z)}>{z}</button>)}</div>}
          </div>)}
        <div className="cmp-cols">
          <div className="cmp-phone">
            <PhonePreview size={sizeShown} kind={kind} thumb={thumb} slides={slides} caption={vals.caption} />
          </div>
          <div className="cmp-media media">
            {mode === 'card' ? <TemplatePanel kind={kind === 'carousel' ? 'carousel' : 'single'} value={card && { ...card, template: vals.template_id, colourway: vals.colourway }} recent={recentColourways} useView={useView} ImagePicker={ImagePicker} onUse={useCard} onClose={() => setMode(null)} />
              : kind === 'single' ? (<>
                <span className="lbl">Template</span>
                <div className="cmp-card"><span><b>{vals.template_id ? (TEMPLATES[vals.template_id]?.name || vals.template_id) : 'No template'}</b><small>{vals.template_id ? `${vals.colourway || ''} · text locked to its source` : 'Make a card from a verified quote, an event or a teacher, or use a picture.'}</small></span>
                  {!dis && <button type="button" className="chip" onClick={() => { setMode('card'); setPicMsg(''); }}>{vals.template_id ? 'Edit the card' : 'Make a card'}</button>}</div>
                <span className="lbl">Art</span>
                {mode === 'crop' && cropSrc ? <Cropper src={cropSrc} initial={shapeOf} onDone={cropped} onCancel={() => setMode(null)} /> : (
                  <div className="cmp-card"><span className="th">{thumb ? <img src={thumb} alt="" referrerPolicy="no-referrer" /> : <i>none</i>}</span>
                    <span><b>{vals.image_id || (thumb ? 'Picture' : 'No picture yet')}</b><small>{vals.template_id ? 'Designed card' : 'From the Library · reuse OK'}</small></span></div>)}
                {!dis && mode !== 'crop' && (
                  <div className="picacts">
                    {cropSrc && <button type="button" className="chip" onClick={() => { setMode('crop'); setPicMsg(''); }}>Crop</button>}
                    <button type="button" className="chip" onClick={() => setMode(m => m === 'library' ? null : 'library')}>{mode === 'library' ? 'Close the library' : 'Swap from the library'}</button>
                    <label className="chip upl">Upload a photo<input type="file" accept="image/*" onChange={e => { upload(e.target.files?.[0]); e.target.value = ''; }} /></label>
                  </div>)}
                {picMsg ? <p className="hint">{picMsg}</p> : (vals.image_id !== p._raw.image_id || vals.image_url !== p._raw.image_url) && <p className="hint">New picture chosen. Save to use it.</p>}
                {(errors.image_id || errors.image_url) && <p className="hint err">{errors.image_id || errors.image_url}</p>}
                {mode === 'library' && <ImagePicker onPick={(id, t, drive) => { setVals(s => ({ ...s, image_id: id, image_url: '' })); setErrors(x => ({ ...x, image_id: undefined, image_url: undefined })); setPic({ preview: t, src: drive ? `/api/ops/social/image?id=${drive}` : '' }); setPicMsg(''); setMode(null); }} />}
                {p.quote_text && <p className="quo">“{p.quote_text}”{p.quote_source ? ` — ${p.quote_source}` : ''} <span className={p.quote_check === 'Verbatim' ? 'ok' : 'warn'}>{p.quote_check || 'not checked'}</span></p>}
                {p.error && <p className="err">Make: {p.error}</p>}
                {p.post_links && <p className="ev"><a href={p.post_links.split(/\s|,/)[0]} target="_blank" rel="noopener">View the post ↗</a></p>}
              </>)
              : (<>
                <SlidesEditor kind={kind} slides={slides} onChange={setSlides} disabled={dis} error={errors.slides_json} onTemplate={kind === 'carousel' ? () => { setMode('card'); setPicMsg(''); } : null} />
                {kind === 'carousel' && vals.keyword && <p className="hint">Keyword <b>{vals.keyword}</b> is logged on the post, so comments can be counted and an auto-reply can key off it.</p>}
                {kind === 'reel' && <ul className="cmp-spec"><li className="ok">Reels are vertical (9:16), up to 90 seconds, H.264 video with AAC sound.</li><li>Clip from Rebecka · edited in Descript to remove filler words.</li><li>Caption: 1–2 sentences on the clip (Floss confirms) plus the standard “extract from our recent course” footer.</li></ul>}
                {kind === 'story' && (
                  <div className="cmp-story">
                    <b>Stories are posted by hand</b>
                    <span>Meta doesn’t let the dashboard add a link sticker, so a person posts it. Whoever is assigned gets the frame and the link ready to paste.</span>
                    <div className="row">
                      {slides[0]?.drive_file_id && <a className="chip" href={`https://drive.google.com/uc?export=download&id=${slides[0].drive_file_id}`} target="_blank" rel="noopener">Download frame</a>}
                      <button type="button" className="chip" disabled={!vals.link} onClick={() => { navigator.clipboard?.writeText(vals.link); setMsg('Sticker link copied.'); }}>Copy sticker link</button>
                      {canPublish && !isNew && p.status === 'Manual' && <button type="button" className="chip" disabled={busy} onClick={markPosted}>Mark posted</button>}
                    </div>
                  </div>)}
              </>)}
            <div className="cmp-guard"><span className="lbl">Guardrail checks</span>
              {checks.map((c, i) => <span key={i} className={`g ${c.t}`}>{c.t === 'ok' ? '✓' : c.t === 'bad' ? '✗' : '!'} {c.x}</span>)}
              {!checks.length && <span className="g">Nothing to check yet.</span>}</div>
          </div>
          <form className="cmp-details words ops-edit" onSubmit={async e => { e.preventDefault(); await save(); }}>
            {locked && <p className="hint">Already {status.toLowerCase()}: shown as it went out.</p>}
            <div className="grp"><span className="lbl">Publish to</span>
              <div className="row">{[['IG Feed', kind === 'reel' ? 'IG Reel' : 'IG Feed'], ['Facebook Page', 'Facebook'], ['+ Story frame', 'IG Story']].map(([l, n]) => (
                <label key={n} className="tog"><input type="checkbox" checked={hasPlat(n)} disabled={dis} onChange={() => togglePlat(n)} /> {l}</label>))}</div></div>
            <div className="two">
              {field('pillar', <select id="c-pillar" value={vals.pillar || ''} disabled={dis} onChange={set('pillar')}><option value="">Choose…</option>{[...new Set([...types, vals.pillar].filter(Boolean))].map(t => <option key={t}>{t}</option>)}</select>, 'Post type')}
              {field('content_pillar', <select id="c-content_pillar" value={vals.content_pillar || ''} disabled={dis} onChange={set('content_pillar')}><option value="">Choose…</option>{['Content', 'Practice', 'Marketing'].map(t => <option key={t}>{t}</option>)}</select>, 'Pillar')}
              {field('publish_date', <input id="c-publish_date" type="date" value={vals.publish_date || ''} disabled={dis} onChange={set('publish_date')} />, 'Date')}
              {field('publish_time_ET', <><input id="c-publish_time_ET" value={vals.publish_time_ET || ''} disabled={dis} placeholder="11:00" onChange={set('publish_time_ET')} />{london && <small className="hint mono">{london}</small>}</>, 'Time · ET')}
            </div>
            {field('linked_event', <select id="c-linked_event" value={vals.linked_event || ''} disabled={dis} onChange={set('linked_event')}><option value="">None, evergreen post</option>{[...new Set([...events, vals.linked_event].filter(Boolean))].map(e => <option key={e}>{e}</option>)}</select>, 'Event (from Master Schedule)')}
            {kind !== 'story' && (<>
              <div className="capwrap">
                {field('caption', <textarea id="c-caption" ref={capRef} className="capbox" rows={9} value={vals.caption || ''} disabled={dis} onChange={set('caption')}
                  onBlur={e => { e.target.dataset.at = e.target.selectionStart; }} placeholder="Write the caption…" />, 'Caption')}
                <span className="count mono">{String(vals.caption || '').length} / 2,200</span>
              </div>
              <div className="cmp-parts">
                {(vals.quote_id || p.quote_text) && <div className="blk lock"><span>Locked · quote, verbatim</span>{p.quote_text || `From the Quote Library (${vals.quote_id})`}</div>}
                {draftBits.map((d, i) => <div key={i} className="blk draft"><span>Draft · needs review</span>{d}</div>)}
              </div>
              <div className="capbar">
                {!dis && <>
                  <button type="button" className={`chip${inserting === 'captions' ? ' on' : ''}`} onClick={() => setInserting(x => x === 'captions' ? null : 'captions')}>Insert a snippet</button>
                  <button type="button" className={`chip${inserting === 'quotes' ? ' on' : ''}`} onClick={() => setInserting(x => x === 'quotes' ? null : 'quotes')}>Insert a quote</button>
                  <button type="button" className={`chip${inserting === 'hashtags' ? ' on' : ''}`} onClick={() => setInserting(x => x === 'hashtags' ? null : 'hashtags')}>Hashtag set</button>
                </>}
              </div>
              {inserting && <Inserter kind={inserting === 'quotes' ? 'quotes' : 'captions'} onlyType={inserting === 'hashtags' ? /hashtag/i : null} onPick={t => { if (inserting === 'hashtags') setVals(v => ({ ...v, hashtags: [v.hashtags, t].filter(Boolean).join(' ') })); else insert(t); setInserting(null); }} />}
              {field('hashtags', <textarea id="c-hashtags" rows={2} value={vals.hashtags || ''} disabled={dis} onChange={set('hashtags')} />)}
              {hashtagCount(vals.hashtags) + hashtagCount(vals.caption) > MAX_HASHTAGS && <p className="hint warnline">That’s {hashtagCount(vals.hashtags) + hashtagCount(vals.caption)} hashtags. Instagram now allows {MAX_HASHTAGS} per post, so trim it down.</p>}
              {field('first_comment', <textarea id="c-first_comment" rows={2} value={vals.first_comment || ''} disabled={dis} onChange={set('first_comment')} placeholder="Optional: posted as the first comment" />, 'First comment')}
            </>)}
            {field('link', <input id="c-link" value={vals.link || ''} disabled={dis} placeholder="https://" onChange={set('link')} />, kind === 'story' ? 'Sticker link' : 'Link')}
            <div className="two">
              {field('assignee', <select id="c-assignee" value={vals.assignee || ''} disabled={dis} onChange={set('assignee')}><option value="">Nobody yet</option>{[...new Set([...team, vals.assignee].filter(Boolean))].map(n => <option key={n}>{n}</option>)}</select>, 'Assignee')}
              {field('jake_notes', <textarea id="c-jake_notes" rows={2} value={vals.jake_notes || ''} disabled={dis} onChange={set('jake_notes')} placeholder="What should change?" />, 'Notes for the planner')}
            </div>
            {!isNew && (p.created_by || p.approved_by || p.updated_by) && (
              <p className="hint by">{[p.created_by && `Added by ${p.created_by}`, p.approved_by && `approved by ${p.approved_by}`, p.updated_by && p.updated_by !== p.created_by && `last changed by ${p.updated_by}`, p.override_reason && `override: ${p.override_reason}`].filter(Boolean).join(' · ')}</p>)}
            {thread}
            {status === 'Unconfirmed' && <p className="hint">Approved, but Instagram hasn’t confirmed it went out. The hourly check marks it Posted once it finds it.</p>}
            {status === 'Expired' && <p className="hint">This wasn’t approved before its time, so it didn’t go out. Move it to a new date and approve it, or delete it.</p>}
            {kind !== 'single' && canPublish && <p className="hint">Approving a carousel, Reel or Story marks it “Manual”: it is ready to post by hand. Automatic posting for these starts with the next update.</p>}
            {canEdit && isNew && (
              <div className="bar">
                {canPublish && <button type="button" className="chip primary" disabled={busy} onClick={() => save({ status: 'Approved' })}>Add and approve</button>}
                <button type="submit" className="chip" disabled={busy}>Add as proposed</button>
                <button type="button" className="chip" onClick={leave(close)}>Cancel</button>
              </div>)}
            {canEdit && !locked && !isNew && (
              <div className="bar">
                {!canPublish ? <span className="hint">You can edit and save. Someone who schedules posts will approve it.</span> : status !== 'Approved'
                  ? <button type="button" className="chip primary" disabled={busy} onClick={async () => { if (await save({ status: 'Approved' })) next ? next() : close(); }}>{changed.length ? 'Save and approve' : 'Approve'}</button>
                  : <button type="button" className="chip" disabled={busy} onClick={() => save({ status: 'Proposed' })}>Unapprove</button>}
                <button type="submit" className={`chip${status === 'Approved' ? ' primary' : ''}`} disabled={busy || !changed.length}>{changed.length ? `Save ${changed.length} change${changed.length === 1 ? '' : 's'}` : 'No changes'}</button>
                {canPublish && <button type="button" className="chip" disabled={busy || !String(vals.jake_notes || '').trim()} onClick={() => save({ status: 'Needs edit' })}>Request changes</button>}
                {status !== 'Skip' ? <button type="button" className="chip" disabled={busy} onClick={() => save({ status: 'Skip' })}>Skip</button>
                  : <button type="button" className="chip" disabled={busy} onClick={() => save({ status: 'Proposed' })}>Back to proposed</button>}
                {canDelete && <button type="button" className="chip danger" disabled={busy} onClick={remove}>Delete</button>}
              </div>)}
            {msg && <p className="hint" role="status">{msg}</p>}
          </form>
        </div>
      </div>
    </div>
  );
}

// ET on a date → the same moment in London, for "Time · ET (16:00 London)"
function londonLabel(date, t) {
  const m = String(t || '').match(/^(\d{1,2}):(\d{2})/);
  if (!m || !/^\d{4}-\d{2}-\d{2}$/.test(date || '')) return '';
  const guess = new Date(`${date}T${m[1].padStart(2, '0')}:${m[2]}:00Z`);
  const ny = new Date(guess.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const instant = new Date(guess.getTime() + (guess - ny));
  return `${instant.toLocaleTimeString('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })} London`;
}

// The post as it will look on a phone: Instagram chrome, the picture in its real shape, the carousel dots, the caption
function PhonePreview({ size, kind, thumb, slides, caption }) {
  const first = kind === 'carousel' || kind === 'reel' || kind === 'story' ? (slides[0] && slideThumb(slides[0])) || thumb : thumb;
  const ratio = { '4:5': '4 / 5', '1:1': '1 / 1', '9:16': '9 / 16' }[size];
  return (
    <div className="phone">
      <div className="who"><i /><b>embodiedphilosophy</b><span className="mono">{kind === 'reel' ? 'Reel' : kind === 'story' ? 'Story' : size}</span></div>
      <div className="frame" style={{ aspectRatio: ratio }}>
        {first ? <img src={first} alt="" referrerPolicy="no-referrer" /> : <span className="empty">{kind === 'reel' ? 'Add the video' : kind === 'carousel' ? 'Add slides' : 'Add a picture'}</span>}
        {kind === 'reel' && <span className="badge">▶ Reel</span>}
        {kind === 'story' && <span className="bar" />}
      </div>
      {kind === 'carousel' && slides.length > 1 && <div className="dots">{slides.map((_, i) => <i key={i} className={i === 0 ? 'on' : ''} />)}</div>}
      {kind !== 'story' && <p className="pcap"><b>embodiedphilosophy</b> {String(caption || '').replace(/\s+/g, ' ').slice(0, 140) || <i>The caption shows here.</i>}</p>}
    </div>
  );
}

// Comments and who did what, per post (everyone on staff can comment; @name is kept as typed)
function Thread({ post, canComment }) {
  const [list, setList] = useState(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const load = async () => { const r = await fetch(`/api/ops/social?view=comments&post=${encodeURIComponent(post || '')}`).catch(() => null); const j = await r?.json().catch(() => ({})); setList(j?.comments || []); };
  useEffect(() => { if (post) load(); else setList([]); }, [post]);
  const send = async e => {
    e.preventDefault(); if (!text.trim()) return;
    setBusy(true); const j = await api({ view: 'plan', comment: { post_id: post, body: text } }); setBusy(false);
    if (j.ok) { setText(''); load(); }
  };
  return (
    <div className="cmp-thread">
      <span className="lbl">Thread &amp; history</span>
      {list === null ? <p className="hint">Loading…</p> : list.length ? <ul>{list.map((c, i) => <li key={i}><b>{c.author}</b> <small className="mono">{String(c.created_at).slice(0, 16).replace('T', ' ')}</small><p>{c.body}</p></li>)}</ul> : <p className="hint">No comments yet.</p>}
      {canComment && post && <div className="send"><textarea aria-label="Comment, or @mention someone" rows={2} value={text} placeholder="Comment, or @mention someone…" onChange={e => setText(e.target.value)} />
        <button type="button" className="chip" disabled={busy || !text.trim()} onClick={send}>Comment</button></div>}
    </div>
  );
}

// Approved Caption Bank snippets and verified quotes (copied exactly), to drop into a caption
function Inserter({ kind, onPick, onlyType = null }) {
  const [q, setQ] = useState('');
  const [data] = useView(kind, q);
  const ok = r => kind === 'captions' ? String(r.values.approved).toUpperCase() === 'TRUE' : String(r.values.verified).toUpperCase() === 'TRUE';
  const text = r => kind === 'captions' ? r.values.text : `“${r.values.quote}”\n— ${[r.values.author, r.values.work].filter(Boolean).join(', ')}`;
  const rows = (data?.rows?.filter(ok) || []).filter(r => !onlyType || onlyType.test(r.values.type || ''));
  return (
    <div className="ops-se-ins">
      <input placeholder={kind === 'captions' ? 'Search snippets…' : 'Search quotes by words, author, work…'} value={q} onChange={e => setQ(e.target.value)} autoFocus />
      {!data ? <p className="hint">Loading…</p> : data.error ? <p className="hint">{data.error}</p> : !rows.length ? <p className="hint">{kind === 'captions' ? 'No approved snippets match.' : 'No verified quotes match.'}</p> : (
        <ul>{rows.slice(0, 40).map(r => (
          <li key={r.row}><button type="button" onClick={() => onPick(text(r))}>
            <span className="t">{kind === 'captions' ? r.values.text : `“${r.values.quote}”`}</span>
            <span className="s">{kind === 'captions' ? [r.values.type, r.values.program].filter(Boolean).join(' · ') : [r.values.author, r.values.work].filter(Boolean).join(', ')}{r.used ? <b className="used"> · used {ago(r.used)}</b> : ''}</span>
          </button></li>))}</ul>
      )}
    </div>
  );
}

// Every picture that may be reused, newest first, 60 at a time; the grid scrolls inside the editor
export function ImagePicker({ onPick }) {
  const [q, setQ] = useState('');
  const [offset, setOffset] = useState(0);
  const [rows, setRows] = useState([]);
  const [fresh, setFresh] = useState(false); // hide pictures used in the last 60 days
  const [data] = useView('art', q, offset, '&pick=1');
  useEffect(() => { setOffset(0); setRows([]); }, [q]);
  useEffect(() => { if (data?.rows) setRows(r => offset === 0 ? data.rows : [...r, ...data.rows.filter(x => !r.some(y => y.row === x.row))]); }, [data]);
  const recent = r => r.used && daysBetween(r.used, today()) <= 60;
  const shown = fresh ? rows.filter(r => !recent(r)) : rows;
  const more = data && !data.error && rows.length < data.total;
  return (
    <div className="ops-se-picker">
      <input placeholder="Search images by name, tag, category…" value={q} onChange={e => setQ(e.target.value)} autoFocus />
      <label className="hint fresh"><input type="checkbox" checked={fresh} onChange={e => setFresh(e.target.checked)} /> Hide pictures used in the last 2 months</label>
      {data?.error ? <p className="hint">{data.error}</p> : !rows.length && !data ? <p className="hint">Loading…</p> : !rows.length ? <p className="hint">No pictures match.</p> : (<>
        <ul className="grid">{shown.map(r => (
          <li key={r.row}><button type="button" onClick={() => onPick(r.values.image_id, r.thumb, r.values.drive_file_id, r.values.public_url)} title={r.used ? `${r.values.file_name} · used ${ago(r.used)}` : r.values.file_name}>
            {r.thumb ? <img src={r.thumb} alt="" loading="lazy" referrerPolicy="no-referrer" /> : <span className="none">{r.values.file_name}</span>}
            {r.used && <span className={`usedtag${recent(r) ? ' recent' : ''}`}>Used {ago(r.used)}</span>}
          </button></li>))}
          {more && <li className="morecell"><button type="button" disabled={!data} onClick={() => setOffset(rows.length)}>{data ? 'Show more' : 'Loading…'}</button></li>}
        </ul>
        <p className="hint">{data?.total != null ? `${fresh ? `${shown.length} unused lately, from ` : ''}${rows.length} of ${data.total} pictures` : ''}</p>
      </>)}
    </div>
  );
}

// ---------- Published: a grid like Instagram's, with each post's type and numbers ----------
function History() {
  const [offset, setOffset] = useState(0);
  const [data] = useView('history', '', offset);
  const [type, setType] = useState('');
  if (!data) return <p className="ops-empty">Loading…</p>;
  if (data.error) return <p className="ops-empty">{data.error}</p>;
  const types = [...new Set(data.rows.map(r => r.type).filter(Boolean))];
  const rows = type ? data.rows.filter(r => r.type === type) : data.rows;
  return (
    <div>
      <p className="ops-empty">What went out on Instagram, newest first ({data.total} posts). Tap a post to open it on Instagram.</p>
      {types.length > 0 && <div className="ops-se-types" role="group" aria-label="Types of post">
        <button className={`chip${!type ? ' on' : ''}`} aria-pressed={!type} onClick={() => setType('')}>All types</button>
        {types.map(t => <button key={t} className={`chip${type === t ? ' on' : ''}`} aria-pressed={type === t} onClick={() => setType(type === t ? '' : t)}>{t}</button>)}
      </div>}
      <ul className="ops-se-pubgrid">{rows.map(r => { const v = r.values, inner = (<>
        <span className="pic">{r.thumb ? <img src={r.thumb} alt="" loading="lazy" referrerPolicy="no-referrer" /> : <span className="none txt">{String(v.caption || '').slice(0, 110)}</span>}
          {r.type && <span className="kind">{r.type}</span>}</span>
        <span className="meta">{day(String(v.posted_at).slice(0, 10))} · ♥ {v.like_count || 0} · 💬 {v.comments_count || 0}</span>
        <span className="cap">{String(v.caption || '').slice(0, 120)}</span></>);
        return <li key={r.row}>{v.permalink ? <a href={v.permalink} target="_blank" rel="noopener">{inner}</a> : <div>{inner}</div>}</li>; })}</ul>
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
function Library({ view, onUse }) {
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
        {view.images ? (
          <ul className="ops-se-imgs">{data.rows.map(r => (
            <li key={r.row} className={String(r.values.hidden).toUpperCase() === 'TRUE' ? 'off' : ''}>
              {sel === r.row ? <Row view={view} head={data.head} locked={data.locked} row={r.row} values={r.values} thumb={r.thumb} onUse={data.canEdit && onUse} canEdit={data.canEdit} onDone={c => { setSel(null); if (c) reload(); }} /> : (
                <button onClick={() => setSel(r.row)} title={r.values.file_name}>
                  {r.thumb ? <img src={r.thumb} alt="" loading="lazy" referrerPolicy="no-referrer" /> : <span className="none">{r.values.file_name}</span>}
                  <span className="cap">{r.values.category || r.values.type}{String(r.values.reuse_ok).toUpperCase() !== 'TRUE' ? ' · not for reuse' : ''}</span>
                </button>)}
            </li>))}</ul>
        ) : (
          <ul className="ops-site-rows">{data.rows.map(r => (
            <li key={r.row}>{sel === r.row ? <Row view={view} head={data.head} locked={data.locked} row={r.row} values={r.values} onUse={data.canEdit && onUse} canEdit={data.canEdit} onDone={c => { setSel(null); if (c) reload(); }} /> : (
              <button className="ops-site-row" onClick={() => setSel(r.row)}>
                <span className="n">{String(view.name(r.values) || `Row ${r.row}`).slice(0, view.key === 'rules' ? 600 : 160)}</span>
                {view.sub?.(r.values) && <span className="s">{String(view.sub(r.values)).slice(0, view.key === 'rules' ? 1200 : 140)}</span>}
              </button>)}</li>))}</ul>
        )}
        <Pager data={data} setOffset={setOffset} />
      </>)}
    </div>
  );
}

function Row({ view, head, locked, row, values, thumb, onUse, canEdit, onDone }) {
  const [vals, setVals] = useState(values);
  const [orig, setOrig] = useState(values);
  const [errors, setErrors] = useState({});
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const changed = head.filter(h => h && String(vals[h] ?? '') !== String(orig[h] ?? ''));
  const T = x => String(x ?? '').toUpperCase() === 'TRUE';
  // "Use in a post": a picture that may be reused, a verified quote (copied exactly), or an approved snippet
  const useSeed = !onUse ? null
    : view.key === 'art' ? { label: 'Use in a post', ok: T(values.reuse_ok) && !T(values.hidden) && !T(values.has_text), why: 'This picture isn’t marked OK to reuse', seed: { image_id: values.image_id, thumb, drive: values.drive_file_id } }
    : view.key === 'quotes' ? { label: 'Start a post from this quote', ok: T(values.verified), why: 'Only verified quotes can be used', seed: { caption: `“${values.quote}”\n— ${[values.author, values.work].filter(Boolean).join(', ')}` } }
    : view.key === 'captions' ? { label: 'Start a post with this', ok: T(values.approved), why: 'Only approved snippets can be used', seed: { caption: values.text } } : null;
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
        {useSeed && row != null && <button type="button" className="chip primary" disabled={!useSeed.ok} title={useSeed.ok ? '' : useSeed.why} onClick={() => onUse(useSeed.seed)}>{useSeed.label}</button>}
        {canEdit && <button type="submit" className="chip primary" disabled={busy || !changed.length}>{row == null ? 'Add' : changed.length ? `Save ${changed.length} change${changed.length === 1 ? '' : 's'}` : 'No changes'}</button>}
        <button type="button" className="chip" onClick={() => onDone(false)}>{canEdit ? 'Cancel' : 'Close'}</button>
        {msg && <span className="hint">{msg}</span>}
      </div>
    </form>
  );
}

// ---------- Carousel, Reel and Story media ----------
// The slides of one post, in order. Drag a slide (or use the arrows) to reorder; add pictures from the library
// or upload pictures and video straight to Drive.
const slideThumb = sl => sl.drive_file_id ? `https://lh3.googleusercontent.com/d/${sl.drive_file_id}=w240` : sl.url && sl.kind !== 'video' ? sl.url : '';
function SlidesEditor({ kind, slides, onChange, disabled, error, onTemplate }) {
  const [picking, setPicking] = useState(false);
  const [drag, setDrag] = useState(null);
  const [note, setNote] = useState(''); // what the last upload said (kept here: the upload button goes away once a Reel or Story has its one file)
  const max = kind === 'carousel' ? MAX_SLIDES : 1;
  const full = slides.length >= max;
  const move = (i, j) => { if (j < 0 || j >= slides.length || i === j) return; const a = slides.slice(); a.splice(j, 0, a.splice(i, 1)[0]); onChange(a); };
  const add = sl => onChange(kind === 'carousel' ? [...slides, sl] : [sl]);
  const noun = kind === 'reel' ? 'video' : kind === 'story' ? 'frame' : 'slide';
  return (
    <div className="ops-slides">
      <p className="hint">{kind === 'carousel' ? `Slides in the order people swipe: ${MIN_SLIDES} to ${MAX_SLIDES}. Pictures and video can be mixed.` : kind === 'reel' ? 'One vertical video (9:16), up to 90 seconds.' : 'One designed 9:16 frame. Stories can’t carry a link sticker through the website: post by hand when it needs one.'}</p>
      {slides.length === 0 && <p className="ops-empty">No {noun}s yet.</p>}
      <ol>
        {slides.map((sl, i) => (
          <li key={i} draggable={!disabled} onDragStart={() => setDrag(i)} onDragOver={e => e.preventDefault()} onDrop={() => { if (drag != null) move(drag, i); setDrag(null); }} className={drag === i ? 'drag' : ''}>
            <span className="n">{i + 1}</span>
            <span className="t">{slideThumb(sl) ? <img src={slideThumb(sl)} alt="" referrerPolicy="no-referrer" /> : <span className="none">{sl.kind === 'video' ? 'Video' : 'Picture'}</span>}</span>
            <span className="l">{sl.kind === 'video' ? 'Video' : sl.image_id || 'Picture'}</span>
            {!disabled && <span className="a">
              {kind === 'carousel' && <><button type="button" className="chip" disabled={i === 0} onClick={() => move(i, i - 1)} aria-label={`Move slide ${i + 1} earlier`}>↑</button>
                <button type="button" className="chip" disabled={i === slides.length - 1} onClick={() => move(i, i + 1)} aria-label={`Move slide ${i + 1} later`}>↓</button></>}
              <button type="button" className="chip" onClick={() => onChange(slides.filter((_, k) => k !== i))} aria-label={`Remove slide ${i + 1}`}>Remove</button>
            </span>}
          </li>))}
      </ol>
      {!disabled && !full && (
        <div className="picacts">
          {onTemplate && <button type="button" className="chip" onClick={onTemplate}>Make slides from a template</button>}
          {kind !== 'reel' && <button type="button" className={`chip${picking ? ' on' : ''}`} onClick={() => setPicking(x => !x)}>{picking ? 'Close the library' : kind === 'carousel' ? '+ Picture from the library' : 'Choose from the library'}</button>}
          <UploadBox kind={kind} onDone={(f, warn) => { add({ kind: f.kind, drive_file_id: f.id, ...(f.image_id && { image_id: f.image_id }) }); setNote(`Uploaded to Drive.${warn.length ? ' ' + warn.join(' ') : ''}`); }} />
        </div>)}
      {note && <p className="hint note" role="status">{note}</p>}
      {full && !disabled && kind === 'carousel' && <p className="hint">That’s the most Instagram allows ({MAX_SLIDES}).</p>}
      {picking && <ImagePicker onPick={(id, t, drive, url) => { add({ kind: 'image', ...(drive ? { drive_file_id: drive } : { url }), image_id: id }); setPicking(false); }} />}
      {error && <p className="hint err">{error}</p>}
    </div>
  );
}

// Reads a picture's or video's size (and a video's length) in the browser, to warn before anything uploads
function probe(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file), isVideo = file.type.startsWith('video/');
    const el = isVideo ? document.createElement('video') : new Image();
    const done = v => { URL.revokeObjectURL(url); resolve(v); };
    el.onerror = () => { URL.revokeObjectURL(url); isVideo ? done({ kind: 'video', width: 0, height: 0, duration: 0, unread: true }) : reject(new Error('That picture couldn’t be read')); };
    if (isVideo) { el.preload = 'metadata'; el.onloadedmetadata = () => done({ kind: 'video', width: el.videoWidth, height: el.videoHeight, duration: Math.round(el.duration * 10) / 10 }); }
    else el.onload = () => done({ kind: 'image', width: el.naturalWidth, height: el.naturalHeight, duration: 0 });
    el.src = url;
  });
}
// Plain-language checks against what Instagram accepts. Warnings only: the post can still be made.
export function specWarnings(m, file, postKind) {
  const w = [], r = m.width && m.height ? m.width / m.height : 0, vertical = postKind === 'reel' || postKind === 'story';
  if (vertical && r && Math.abs(r - 9 / 16) > 0.03) w.push(`This is ${m.width}×${m.height}. ${postKind === 'reel' ? 'Reels' : 'Stories'} are vertical, 9:16 (1080×1920).`);
  if (!vertical && r && (r < 0.79 || r > 1.92)) w.push(`This shape (${m.width}×${m.height}) will be cropped. Feed posts work best at 4:5 or 1:1.`);
  if (m.kind === 'video' && postKind === 'reel' && m.duration > 90) w.push(`This video runs ${Math.round(m.duration)} seconds. Reels can be up to 90.`);
  if (m.kind === 'video' && /quicktime/.test(file.type)) w.push('This is a .mov file. MP4 (H.264 video, AAC sound) is the safest format for Instagram.');
  return w;
}

function UploadBox({ kind, onDone }) {
  const [msg, setMsg] = useState('');
  const [pct, setPct] = useState(null);
  const accept = kind === 'reel' ? 'video/mp4,video/quicktime' : 'image/jpeg,image/png,image/webp,video/mp4,video/quicktime';
  const post = async body => {
    const res = await fetch('/api/ops/social/upload', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).catch(() => null);
    const j = await res?.json().catch(() => ({})) || {};
    if (!res?.ok) throw new Error(j.error || 'The upload didn’t work. Try again.');
    return j;
  };
  // One PUT straight to Google's upload address: the file never passes through our server
  const put = (url, file) => new Promise((resolve, reject) => {
    const x = new XMLHttpRequest();
    x.open('PUT', url); x.setRequestHeader('Content-Type', file.type);
    x.upload.onprogress = e => e.lengthComputable && setPct(Math.round(100 * e.loaded / e.total));
    x.onload = () => { try { const j = JSON.parse(x.responseText); x.status < 300 && j.id ? resolve(j.id) : reject(new Error('Drive didn’t accept the file')); } catch { reject(new Error('Drive didn’t accept the file')); } };
    x.onerror = () => reject(new Error('The connection dropped. Try again.'));
    x.send(file);
  });
  const pick = async file => {
    if (!file) return;
    setMsg(''); setPct(0);
    try {
      const m = await probe(file), warn = specWarnings(m, file, kind);
      const { url } = await post({ step: 'start', name: file.name, size: file.size, type: file.type });
      const id = await put(url, file);
      const d = await post({ step: 'done', id, name: file.name, kind: m.kind, width: m.width, height: m.height, duration: m.duration, codec_ok: !/quicktime/.test(file.type) });
      setMsg('');
      onDone({ id, kind: m.kind, image_id: d.image_id }, warn);
    } catch (e) { setMsg(e.message); } finally { setPct(null); }
  };
  return (
    <>
      <label className="chip upl">{pct != null ? `Uploading… ${pct}%` : kind === 'reel' ? 'Upload a video' : 'Upload a picture or video'}
        <input type="file" accept={accept} disabled={pct != null} onChange={e => { pick(e.target.files?.[0]); e.target.value = ''; }} /></label>
      {msg && <span className="hint" role="status">{msg}</span>}
    </>
  );
}




// ---------- Calendar: a week of seven days (or the month), each with its category, and drag to reschedule ----------
const addD = (d, n) => { const x = new Date(d + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const monOf = d => addD(d, -((new Date(d + 'T12:00:00Z').getUTCDay() + 6) % 7));
const out = p => ['Posted', 'Manual'].includes(p.status);
