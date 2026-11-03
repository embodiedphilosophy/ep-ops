'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

const post = async body => {
  const res = await fetch('/api/ops/youtube', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).catch(() => null);
  const j = await res?.json().catch(() => ({}));
  if (!res?.ok) throw new Error(j?.error || 'Couldn’t save that');
  return j;
};
const hms = s => { s = Math.max(0, Math.round(Number(s) || 0)); return `${Math.floor(s / 3600)}:${String(Math.floor(s % 3600 / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; };
const secs = t => String(t || '').split(':').map(Number).reduce((a, v) => a * 60 + (v || 0), 0);
const embedOf = c => {
  const m = String(c?.cut_link || '').match(/vimeo\.com\/(\d+)\/([a-z0-9]+)/i);
  const id = m?.[1] || c?.cut_vimeo_id;
  return id ? `https://player.vimeo.com/video/${id}${m?.[2] ? `?h=${m[2]}` : ''}` : '';
};
const localInput = iso => {
  if (!iso) return '';
  const d = new Date(iso); const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

function useAct() {
  const router = useRouter();
  const [busy, setBusy] = useState(''), [err, setErr] = useState('');
  const act = async (label, body, confirmText) => {
    if (confirmText && !confirm(confirmText)) return;
    setBusy(label); setErr('');
    try { await post(body); router.refresh(); } catch (e) { setErr(e.message); }
    setBusy('');
  };
  return { busy, err, act };
}

export function Proposal({ item, series }) {
  const { busy, err, act } = useAct();
  const [teacher, setTeacher] = useState(item.teacher || ''), [ser, setSer] = useState(item.series || '');
  return (
    <div className="yt-proposal">
      {item.angle && <span className="yt-angle">{item.angle}</span>}
      {item.reason && <span className="hint">{item.reason}</span>}
      <span className="acts" style={{ flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
        <input aria-label="Teacher" placeholder="Teacher" value={teacher} onChange={e => setTeacher(e.target.value)} style={{ minWidth: 180 }} />
        <select aria-label="Series badge" value={ser} onChange={e => setSer(e.target.value)}>
          <option value="">Series badge: let it choose</option>
          {series.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <button className="chip primary" disabled={!!busy} onClick={() => act('approve', { action: 'approve', id: item.id, teacher, series: ser })}>{busy === 'approve' ? 'Sending…' : 'Approve'}</button>
        <button className="chip" disabled={!!busy} onClick={() => act('skip', { action: 'skip', id: item.id })}>Skip</button>
        {err && <span className="hint err">{err}</span>}
      </span>
    </div>
  );
}

export function Retry({ item }) {
  const { busy, err, act } = useAct();
  return (
    <span className="acts" style={{ flexWrap: 'wrap', gap: 8, marginTop: 6 }}>
      <span className="hint err">{item.error || 'The pipeline stopped.'}</span>
      <button className="chip primary" disabled={!!busy} onClick={() => act('retry', { action: 'retry', id: item.id })}>{busy ? 'Sending…' : 'Try again'}</button>
      <button className="chip" disabled={!!busy} onClick={() => act('skip', { action: 'skip', id: item.id })}>Skip it</button>
      {err && <span className="hint err">{err}</span>}
    </span>
  );
}

export function Review({ item }) {
  const { busy, err, act } = useAct();
  const c = item.cut || {};
  const [f, setF] = useState({
    ytTitle: item.ytTitle, ytDescription: item.ytDescription, ytTags: item.ytTags.join(', '), hashtags: item.hashtags.join(' '),
    privacy: item.privacy || 'private', publishAt: localInput(item.publishAt), playlistId: item.playlistId,
  });
  const [t, setT] = useState({ headline: item.thumbHeadline, accent: item.thumbAccent });
  const [cut, setCut] = useState({ start: hms(c.start_sec), end: hms(c.end_sec) });
  const set = k => e => setF(s => ({ ...s, [k]: e.target.value }));
  const fields = () => ({
    ytTitle: f.ytTitle, ytDescription: f.ytDescription, ytTags: f.ytTags, playlistId: f.playlistId, privacy: f.privacy,
    hashtags: f.hashtags.split(/[\s,]+/).filter(Boolean).map(h => (h.startsWith('#') ? h : `#${h}`)),
    publishAt: f.publishAt ? new Date(f.publishAt).toISOString() : '',
  });
  const embed = embedOf(c);
  const box = { display: 'grid', gap: 6, marginTop: 10 };
  return (
    <div className="yt-review" style={{ marginTop: 10 }}>
      <span style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
        {embed
          ? <iframe title="Cut preview" src={embed} style={{ width: '100%', aspectRatio: '16 / 9', border: 0, borderRadius: 6 }} allow="fullscreen; picture-in-picture" />
          : <span className="hint">The cut isn’t on Vimeo yet.</span>}
        {item.thumbnailUrl
          ? <img src={item.thumbnailUrl} alt="YouTube thumbnail" style={{ width: '100%', aspectRatio: '16 / 9', objectFit: 'cover', borderRadius: 6 }} />
          : <span className="hint">No thumbnail yet.</span>}
      </span>
      {c.why && <span className="hint" style={{ display: 'block', marginTop: 8 }}><b>Why this stretch:</b> {c.why}</span>}
      {c.opening_lines && <span className="hint" style={{ display: 'block', marginTop: 4 }}><b>Opens with:</b> “{c.opening_lines}”</span>}

      <div style={box}>
        <label className="hint">YouTube title ({(f.ytTitle || '').length}/100)</label>
        <input value={f.ytTitle} maxLength={100} onChange={set('ytTitle')} />
        <label className="hint">Description</label>
        <textarea rows={8} value={f.ytDescription} onChange={set('ytDescription')} />
        <label className="hint">Tags (comma separated)</label>
        <input value={f.ytTags} onChange={set('ytTags')} />
        <label className="hint">Hashtags</label>
        <input value={f.hashtags} onChange={set('hashtags')} />
        <span className="acts" style={{ flexWrap: 'wrap', gap: 8 }}>
          <select aria-label="Privacy" value={f.privacy} onChange={set('privacy')}>
            <option value="private">Private (check in YouTube Studio first)</option>
            <option value="unlisted">Unlisted</option>
            <option value="public">Public</option>
          </select>
          <label className="hint">Release at <input type="datetime-local" value={f.publishAt} onChange={set('publishAt')} /></label>
          <input aria-label="Playlist ID" placeholder="Playlist ID (optional)" value={f.playlistId} onChange={set('playlistId')} />
        </span>
      </div>

      <span className="acts" style={{ flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
        <button className="chip primary" disabled={!!busy} onClick={() => act('publish', { action: 'publish', id: item.id, ...fields() },
          f.publishAt ? `Upload to YouTube now, set to go public at ${new Date(f.publishAt).toLocaleString()}?` : `Upload to YouTube as ${f.privacy}?`)}>
          {busy === 'publish' ? 'Sending…' : 'Push to YouTube'}</button>
        <button className="chip" disabled={!!busy} onClick={() => act('save', { action: 'save', id: item.id, ...fields() })}>{busy === 'save' ? 'Saving…' : 'Save changes'}</button>
        <button className="chip" disabled={!!busy} onClick={() => act('skip', { action: 'skip', id: item.id }, 'Skip this one? It won’t be proposed again.')}>Skip</button>
        {err && <span className="hint err">{err}</span>}
      </span>

      <details style={{ marginTop: 12 }}>
        <summary className="hint">Change the thumbnail or the in/out points</summary>
        <div style={box}>
          <span className="acts" style={{ flexWrap: 'wrap', gap: 8 }}>
            <input aria-label="Thumbnail headline" placeholder="Headline (2–5 words)" value={t.headline} onChange={e => setT(s => ({ ...s, headline: e.target.value }))} />
            <input aria-label="Orange accent line" placeholder="Accent (optional, max 20)" maxLength={20} value={t.accent} onChange={e => setT(s => ({ ...s, accent: e.target.value }))} />
            <button className="chip" disabled={!!busy} onClick={() => act('thumb', { action: 'thumb', id: item.id, ...t })}>{busy === 'thumb' ? 'Sending…' : 'Re-make thumbnail'}</button>
          </span>
          <span className="acts" style={{ flexWrap: 'wrap', gap: 8 }}>
            <label className="hint">Start <input className="mono" value={cut.start} onChange={e => setCut(s => ({ ...s, start: e.target.value }))} style={{ width: 90 }} /></label>
            <label className="hint">End <input className="mono" value={cut.end} onChange={e => setCut(s => ({ ...s, end: e.target.value }))} style={{ width: 90 }} /></label>
            <button className="chip" disabled={!!busy} onClick={() => act('recut', { action: 'recut', id: item.id, start: secs(cut.start), end: secs(cut.end), ...t },
              'Re-cut with these times? It takes 15–40 minutes and replaces this preview.')}>{busy === 'recut' ? 'Sending…' : 'Re-cut'}</button>
            <span className="hint">Times are in the source video (h:mm:ss).</span>
          </span>
        </div>
      </details>
    </div>
  );
}
