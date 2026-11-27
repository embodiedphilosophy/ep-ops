'use client';
import { useEffect, useState } from 'react';
import { useView, Composer, blankPost, KINDS } from '../content/SocialEngine';

// The Composer as a page: /ops/publish?view=compose&row=N edits a post; without row it starts a new one
// (optionally from a picture or words carried over from the Library or Sources, or a type or date from the Calendar).
export default function ComposePage({ row, type, date, seeded }) {
  const [data, reload] = useView('plan');
  const [seed, setSeed] = useState(null);
  useEffect(() => { if (seeded) { try { setSeed(JSON.parse(sessionStorage.getItem('ep-social-seed') || 'null')); sessionStorage.removeItem('ep-social-seed'); } catch {} } }, [seeded]);
  if (!data) return <p className="ops-empty">Loading…</p>;
  if (data.error) return <p className="ops-empty">{data.error}</p>;
  const posts = data.rows.map(r => ({ ...r.values, status: r.display_status || r.values.status, _row: r.row, _thumb: r.thumb, _src: r.src, _raw: r.values }));
  const recentColourways = posts.filter(x => x.colourway).sort((a, b) => (b.publish_date || '').localeCompare(a.publish_date || '')).map(x => x.colourway);
  const back = () => { window.location.href = '/ops/publish'; };
  const i = row ? posts.findIndex(p => p._row === Number(row)) : -1;
  if (row && i < 0) return <p className="ops-empty">That post isn’t in the plan any more. <a href="/ops/publish">Back to the calendar</a></p>;
  const nav = to => () => { window.location.href = `/ops/publish?view=compose&row=${to._row}`; };
  if (!row) {
    const p = blankPost(seed);
    if (type) { p.pillar = type; p._raw = { ...p._raw, pillar: type }; }
    if (/^\d{4}-\d{2}-\d{2}$/.test(date || '')) { p.publish_date = date; p._raw = { ...p._raw, publish_date: date }; }
    return <Composer page recentColourways={recentColourways} team={data.team || []} key={`new-${seed ? 's' : 'n'}`} p={p} events={data.events || []} canEdit={data.canEdit} canPublish={data.canPublish} onSaved={reload} close={back} onAdded={back} />;
  }
  return <Composer page recentColourways={recentColourways} team={data.team || []} key={posts[i]._row} p={posts[i]} events={data.events || []} canEdit={data.canEdit} canPublish={data.canPublish} onSaved={reload}
    prev={i > 0 ? nav(posts[i - 1]) : null} next={i < posts.length - 1 ? nav(posts[i + 1]) : null} close={back} />;
}
