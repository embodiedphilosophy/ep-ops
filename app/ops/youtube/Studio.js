'use client';
import { useState } from 'react';

async function call(body) {
  const r = await fetch('/api/ops/youtube', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || 'Something went wrong');
  return j;
}

// 1:02:03 / 12:03 ↔ seconds
export const hms = s => {
  if (s === null || s === undefined || s === '') return '';
  s = Math.max(0, Math.round(Number(s)));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(x).padStart(2, '0')}` : `${m}:${String(x).padStart(2, '0')}`;
};
const toSec = t => {
  const parts = String(t || '').trim().split(':').map(Number);
  if (!parts.length || parts.some(n => Number.isNaN(n))) return null;
  return parts.reduce((a, n) => a * 60 + n, 0);
};
const mins = s => s ? `${Math.round(s / 60)} min` : '';
const when = iso => iso ? new Date(iso).toLocaleString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '';
const ago = iso => iso ? (Date.now() - Date.parse(iso)) / 60e3 : 0;

const PSTATUS = { proposed: ['', 'Proposed'], producing: ['amber', 'Producing…'], ready: ['green', 'Ready for review'], published: ['green', 'On YouTube'], skipped: ['', 'Skipped'] };
const Status = ({ k, map = PSTATUS }) => { const [c, w] = map[k] || ['', k]; return <span className="st"><i className={`sq ${c}`} />{w}</span>; };

// ---------- This week ----------
export function Proposals({ rows, series, hasWeek }) {
  if (!rows.length) return <p className="ops-empty-box">{hasWeek ? 'Nothing this week.' : 'No proposals yet. The first five arrive the Monday after the pipeline is connected.'}</p>;
  return <ul className="ops-yt-cards">{rows.map(p => <Proposal key={p.id} p={p} series={series} />)}</ul>;
}

function Proposal({ p: initial, series }) {
  const [p, setP] = useState(initial), [open, setOpen] = useState(false), [busy, setBusy] = useState(false), [err, setErr] = useState('');
  const [teacher, setTeacher] = useState(initial.teacher || ''), [ser, setSer] = useState(initial.series || guessSeries(initial, series));
  async function act(action, extra = {}) {
    setBusy(true); setErr('');
    try { const { proposal } = await call({ action, id: p.id, ...extra }); setP(proposal); setOpen(false); }
    catch (e) { setErr(e.message); }
    setBusy(false);
  }
  return (
    <li className="ops-yt-card">
      <span className="pic">{p.picture ? <img src={p.picture} alt="" loading="lazy" /> : <small>No preview</small>}{p.duration_sec ? <span className="len mono">{hms(p.duration_sec)}</span> : null}</span>
      <span className="body">
        <span className="top"><Status k={p.status} />{p.plays !== null && p.plays !== undefined && <span className="mono">{Number(p.plays).toLocaleString('en-US')} plays</span>}</span>
        <a className="ttl" href={p.link || `https://vimeo.com/${p.vimeo_id}`} target="_blank" rel="noreferrer">{p.title}</a>
        <span className="who">{p.teacher || 'Teacher not named'}{p.series ? ` · ${p.series}` : ''}</span>
        {p.angle && <span className="angle">{p.angle}</span>}
        {p.reason && <span className="reason">{p.reason}</span>}
        {p.status === 'producing' && <span className="ops-help">Approved by {p.approved_by} {when(p.approved_at)}. The cut usually takes 20–40 minutes.</span>}
        {err && <span className="ops-err" role="alert">{err}</span>}
        {open && (
          <span className="ops-yt-approve">
            <label>Teacher<input value={teacher} onChange={e => setTeacher(e.target.value)} placeholder="Name as it should appear on YouTube" /></label>
            <label>Series<select value={ser} onChange={e => setSer(e.target.value)}>{series.map(s => <option key={s}>{s}</option>)}</select></label>
            <span className="acts"><button className="btn primary" disabled={busy || !teacher.trim()} onClick={() => act('approve', { teacher, series: ser })}>{busy ? 'Starting…' : 'Make the cut'}</button><button className="btn ghost" onClick={() => setOpen(false)}>Cancel</button></span>
          </span>
        )}
        <span className="acts">
          {p.status === 'proposed' && !open && <><button className="btn primary" onClick={() => setOpen(true)}>Approve</button><button className="btn ghost" disabled={busy} onClick={() => act('skip')}>Skip</button></>}
          {p.status === 'producing' && ago(p.fired_at) > 45 && <button className="btn ghost" disabled={busy} onClick={() => act('retry')}>Still waiting? Start again</button>}
          {p.status === 'ready' && <a className="btn ghost" href={`/ops/youtube?tab=review#${p.cut_id}`}>Review the cut</a>}
          {p.status === 'skipped' && <button className="btn ghost" disabled={busy} onClick={() => act('unskip')}>Bring back</button>}
        </span>
      </span>
    </li>
  );
}
function guessSeries(p, series) {
  const t = `${p.title} ${p.reason} ${p.angle}`.toLowerCase();
  if (/chithead/.test(t)) return 'CHITHEADS';
  if (/s[aā]dhana school/.test(t)) return 'Sādhana School';
  if (/wisdom school/.test(t)) return 'Wisdom School';
  return series.at(-1);
}

// ---------- Review queue ----------
const CSTATUS = { review: ['green', 'Ready for review'], recutting: ['amber', 'Re-cutting…'], rethumbing: ['amber', 'New thumbnail coming…'], publishing: ['amber', 'Uploading to YouTube…'], published: ['green', 'On YouTube'] };

export function Review({ cuts, series, privacy }) {
  if (!cuts.length) return <p className="ops-empty-box">Nothing to review. Approve a proposal on This week and its cut appears here.</p>;
  return <div className="ops-yt-review">{cuts.map(c => <Cut key={c.id} c={c} series={series} privacy={privacy} />)}</div>;
}

const formOf = c => ({
  yt_title: c.yt_title || '', yt_description: c.yt_description || '', yt_tags: (c.yt_tags || []).join(', '), hashtags: (c.hashtags || []).join(' '),
  thumb_headline: c.thumb_headline || '', thumb_accent: c.thumb_accent || '', privacy: c.privacy || 'private', playlist_id: c.playlist_id || '',
  teacher: c.teacher || '', series: c.series || '', publish_date: c.publish_local?.date || '', publish_time: c.publish_local?.time || '',
});
const forSave = f => ({ ...f, hashtags: f.hashtags.split(/[\s,]+/).filter(Boolean) });

function Cut({ c: initial, series, privacy }) {
  const [c, setC] = useState(initial), [f, setF] = useState(() => formOf(initial));
  const [io, setIo] = useState({ start: hms(initial.start_sec), end: hms(initial.end_sec) }), [showIo, setShowIo] = useState(false);
  const [busy, setBusy] = useState(''), [err, setErr] = useState(''), [msg, setMsg] = useState('');
  const set = k => e => { setMsg(''); setF(x => ({ ...x, [k]: e.target.value })); };
  const dirty = JSON.stringify(f) !== JSON.stringify(formOf(c));
  const locked = c.status !== 'review';
  async function act(action, extra, done) {
    setBusy(action); setErr(''); setMsg('');
    try { const { cut } = await call({ action, id: c.id, ...extra }); setC(cut); setF(formOf(cut)); setMsg(done); }
    catch (e) { setErr(e.message); }
    setBusy('');
  }
  function recut() {
    const s = toSec(io.start), e = toSec(io.end);
    if (s === null || e === null) return setErr('Write the in and out times like 12:30 or 1:02:15.');
    act('recut', { start_sec: s, end_sec: e }, 'Re-cut started. The new cut replaces this one in 20–40 minutes; your edits stay.');
  }
  const len = c.end_sec - c.start_sec;
  return (
    <article className="ops-panel ops-yt-cut" id={c.id}>
      <header className="head">
        <span><span className="ops-eyebrow">{c.series || 'Embodied Philosophy'}{c.teacher ? ` · ${c.teacher}` : ''}</span><h2>{c.source_title || c.yt_title}</h2></span>
        <Status k={c.status} map={CSTATUS} />
      </header>
      {locked && <p className="ops-note">{c.status === 'publishing' ? `Sent to YouTube ${when(c.fired_at)}. The link appears on Published when the upload finishes.` : c.status === 'recutting' ? `Re-cutting ${hms(c.asked_start)}–${hms(c.asked_end)} (asked ${when(c.fired_at)}). You can keep editing the text below.` : `Making a new thumbnail (asked ${when(c.fired_at)}).`}</p>}
      {c.error && <p className="ops-err" role="alert">{c.error}</p>}
      <div className="ops-yt-media">
        <div className="vid">
          <div className="frame">{c.cut_vimeo_id ? <iframe src={`https://player.vimeo.com/video/${c.cut_vimeo_id}`} title={`Cut of ${c.source_title || c.yt_title}`} allow="fullscreen; picture-in-picture" allowFullScreen loading="lazy" /> : <span>The cut hasn’t arrived yet.</span>}</div>
          <p className="mono io">In {hms(c.start_sec)} · Out {hms(c.end_sec)} · {hms(len)} long{c.source_link && <> · <a href={c.source_link} target="_blank" rel="noreferrer">Full talk on Vimeo</a></>}</p>
          {c.why && <p><b>Why this stretch.</b> {c.why}</p>}
          {c.opening_lines && <p className="quote">“{c.opening_lines}”</p>}
          {!showIo ? <button className="btn ghost" disabled={c.status === 'publishing'} onClick={() => setShowIo(true)}>Adjust in/out</button> : (
            <div className="ops-yt-io">
              <label>In<input className="mono" value={io.start} onChange={e => setIo(x => ({ ...x, start: e.target.value }))} placeholder="12:30" /></label>
              <label>Out<input className="mono" value={io.end} onChange={e => setIo(x => ({ ...x, end: e.target.value }))} placeholder="31:05" /></label>
              <span className="mono ops-help">{toSec(io.end) > toSec(io.start) ? `${hms(toSec(io.end) - toSec(io.start))} long` : ''}</span>
              <button className="btn primary" disabled={!!busy || locked} onClick={recut}>{busy === 'recut' ? 'Starting…' : 'Re-cut'}</button>
              <button className="btn ghost" onClick={() => setShowIo(false)}>Cancel</button>
            </div>
          )}
        </div>
        <div className="thumbcol">
          <div className="yt-thumb">{c.thumbnail_url ? <img src={c.thumbnail_url} alt="YouTube thumbnail" /> : <span>{c.thumb_pending ? 'Thumbnail on its way' : 'No thumbnail yet'}</span>}</div>
          <label>Headline<input value={f.thumb_headline} onChange={set('thumb_headline')} maxLength={60} /></label>
          <label>Accent word<input value={f.thumb_accent} onChange={set('thumb_accent')} maxLength={30} placeholder="The word drawn in colour" /></label>
          <button className="btn ghost" disabled={!!busy || locked} onClick={() => act('thumb', { changes: forSave(f) }, 'New thumbnail on its way (a few minutes).')}>{busy === 'thumb' ? 'Starting…' : 'Re-render thumbnail'}</button>
        </div>
      </div>
      <div className="ops-yt-meta">
        <label>YouTube title <span className={`mono cnt${f.yt_title.length > 100 ? ' over' : ''}`}>{f.yt_title.length}/100</span><input value={f.yt_title} onChange={set('yt_title')} /></label>
        <label>Description <span className={`mono cnt${f.yt_description.length > 5000 ? ' over' : ''}`}>{f.yt_description.length}/5000</span><textarea rows={9} value={f.yt_description} onChange={set('yt_description')} /></label>
        <div className="ops-grid2">
          <label>Tags<input value={f.yt_tags} onChange={set('yt_tags')} placeholder="Separate with commas" /></label>
          <label>Hashtags<input value={f.hashtags} onChange={set('hashtags')} placeholder="#Tantra #Yoga" /></label>
          <label>Teacher<input value={f.teacher} onChange={set('teacher')} /></label>
          <label>Series<select value={f.series} onChange={set('series')}><option value="">Choose…</option>{series.map(s => <option key={s}>{s}</option>)}</select></label>
          <label>Privacy<select value={f.privacy} onChange={set('privacy')}>{privacy.map(p => <option key={p} value={p}>{p[0].toUpperCase() + p.slice(1)}</option>)}</select></label>
          <label>Playlist ID (optional)<input className="mono" value={f.playlist_id} onChange={set('playlist_id')} placeholder="PL…" /></label>
          <label>Release date (optional, New York)<input type="date" value={f.publish_date} onChange={set('publish_date')} /></label>
          <label>Release time<input type="time" value={f.publish_time} onChange={set('publish_time')} disabled={!f.publish_date} /></label>
        </div>
        {f.publish_date && <p className="ops-help">A scheduled release goes up as private and YouTube makes it public at that time.</p>}
      </div>
      {err && <p className="ops-err" role="alert">{err}</p>}
      <div className="ops-yt-acts">
        <button className="btn ghost" disabled={!dirty || !!busy || c.status === 'publishing'} onClick={() => act('save', { changes: forSave(f) }, 'Saved.')}>{busy === 'save' ? 'Saving…' : 'Save'}</button>
        <button className="btn primary" disabled={!!busy || locked} onClick={() => { if (confirm(`Push “${f.yt_title}” to YouTube as ${f.publish_date ? 'a scheduled release' : f.privacy}?`)) act('publish', { changes: forSave(f) }, 'Sent to YouTube. The link appears on Published when the upload finishes.'); }}>{busy === 'publish' ? 'Sending…' : 'Push to YouTube'}</button>
        {msg && <span role="status" className="ops-say">{msg}</span>}
      </div>
    </article>
  );
}

// ---------- Published / Skipped ----------
export function Published({ cuts }) {
  if (!cuts.length) return <p className="ops-empty-box">Nothing published yet.</p>;
  return (
    <ul className="ops-lib-rows">
      {cuts.map(c => (
        <li key={c.id} className="ops-lib-row ops-yt-row">
          <span className="thumb">{c.thumbnail_url ? <img src={c.thumbnail_url} alt="" loading="lazy" /> : null}</span>
          <span className="body">
            <a className="ttl" href={c.youtube_url} target="_blank" rel="noreferrer">{c.yt_title}</a>
            <span className="meta"><span>{c.teacher}</span>{c.series && <span>{c.series}</span>}<span className="mono">{hms(c.end_sec - c.start_sec)}</span><span className="mono">{c.publish_at ? `Goes public ${when(c.publish_at)}` : c.privacy}</span></span>
            <span className="mono">Published {when(c.published_at)}{c.pushed_by ? ` by ${c.pushed_by}` : ''}</span>
          </span>
          <span className="acts"><a className="btn ghost" href={c.youtube_url} target="_blank" rel="noreferrer">Open on YouTube</a></span>
        </li>
      ))}
    </ul>
  );
}

export function Skipped({ rows, series }) {
  if (!rows.length) return <p className="ops-empty-box">Nothing skipped.</p>;
  return <ul className="ops-yt-cards">{rows.map(p => <Proposal key={p.id} p={p} series={series} />)}</ul>;
}
