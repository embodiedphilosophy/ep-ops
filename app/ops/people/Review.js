'use client';
import { useEffect, useState } from 'react';
import { SITE } from '@/lib/siteurl';

const lower = s => String(s || '').trim().toLowerCase();

// Team → Waiting for review: bios and course pages teachers sent through /teach. Approve / Publish set the
// status the website reads; Take down puts it back to submitted. Same safe writer as every other editor.
export default function Review() {
  const [profiles, setProfiles] = useState(null);
  const [pages, setPages] = useState(null);
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');
  const load = async () => {
    const get = async tab => { const r = await fetch(`/api/ops/site?tab=${tab}`).catch(() => null); const j = await r?.json().catch(() => ({})); return r?.ok ? j.rows : []; };
    const [a, b] = await Promise.all([get('profiles'), get('coursepages')]);
    setProfiles(a); setPages(b);
  };
  useEffect(() => { load(); }, []);
  const set = async (tab, r, status, what) => {
    setBusy(`${tab}${r.row}`); setMsg('');
    const res = await fetch('/api/ops/site', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tab, row: r.row, changes: { status }, before: r.values }) }).catch(() => null);
    const j = await res?.json().catch(() => ({}));
    setBusy(''); setMsg(res?.ok ? `${what}.` : j?.error || 'Couldn’t save. Try again.'); load();
  };
  if (!profiles || !pages) return <p className="ops-empty">Loading…</p>;
  const waitingBios = profiles.filter(r => lower(r.values.status) === 'submitted');
  const waitingPages = pages.filter(r => lower(r.values.status) === 'submitted');
  const livePages = pages.filter(r => lower(r.values.status) === 'published');
  return (
    <div className="ops-review">
      {msg && <p className="ops-note">{msg}</p>}
      {!waitingBios.length && !waitingPages.length && <p className="ops-empty">Nothing waiting. New bios and course pages from teacher onboarding show up here.</p>}
      {waitingBios.map(r => (
        <div key={`p${r.row}`} className="ops-review-item">
          {r.values.photo_url && <img src={r.values.photo_url} alt="" width={72} height={72} />}
          <div>
            <p className="t">{r.values.name} <span>bio and headshot</span></p>
            <p className="b">{r.values.bio}</p>
            <button className="chip primary" disabled={!!busy} onClick={() => set('profiles', r, 'approved', `${r.values.name}’s bio is on the website now`)}>Approve for the website</button>
          </div>
        </div>
      ))}
      {waitingPages.map(r => (
        <div key={`c${r.row}`} className="ops-review-item">
          <div>
            <p className="t">{r.values.title || r.values.offering} <span>course page</span></p>
            {r.values.subtitle && <p className="b"><i>{r.values.subtitle}</i></p>}
            <p className="b">{String(r.values.summary || '').slice(0, 280)}</p>
            <p className="b small">Teachers: {r.values.teacher_emails || '—'}</p>
            <div className="acts">
              {r.values.slug && <a className="chip" href={`/teach/preview/${r.values.slug}`} target="_blank" rel="noopener">Preview ↗</a>}
              <button className="chip primary" disabled={!!busy || !r.values.slug} onClick={() => set('coursepages', r, 'published', `${r.values.title} is live on the website now. Its teachers get a note tomorrow morning`)}>Publish</button>
              {!r.values.slug && <span className="hint">No web address (slug) yet</span>}
            </div>
          </div>
        </div>
      ))}
      {livePages.length > 0 && (
        <details className="ops-review-live"><summary>Live course pages ({livePages.length})</summary>
          {livePages.map(r => (
            <p key={r.row}>{r.values.title} · <a href={`${SITE}/courses/${r.values.slug}`} target="_blank" rel="noopener">view ↗</a>{' '}
              <button className="chip" disabled={!!busy} onClick={() => { if (confirm(`Take ${r.values.title} off the website?`)) set('coursepages', r, 'submitted', `${r.values.title} is off the website`); }}>Take down</button></p>
          ))}
        </details>
      )}
    </div>
  );
}
