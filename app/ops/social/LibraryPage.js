'use client';
import { useEffect, useRef, useState } from 'react';
import { useView, api, day, Row, driveUpload } from '../content/SocialEngine';

const TABS = [['art', 'Art'], ['promo', 'Promo graphics'], ['videos', 'Video'], ['designs', 'Designs'], ['canva', 'Canva archive']];
const T = v => String(v ?? '').toUpperCase() === 'TRUE';
const ago = d => { if (!d) return 'never'; const n = Math.round((Date.now() - Date.parse(String(d).slice(0, 10) + 'T12:00:00Z')) / 864e5); return n <= 0 ? 'today' : n === 1 ? 'yesterday' : n < 14 ? `${n} days ago` : n < 60 ? `${Math.round(n / 7)} weeks ago` : `${Math.round(n / 30)} months ago`; };
const licenceOf = v => String(v.license || v.licence || '').trim();
const creditOf = v => String(v.credit_line || '').trim() || (licenceOf(v) ? [v.artist, v.source_institution].filter(Boolean).join(', ') : '');

// The Library (design: "Media library"): filters on the left, the pictures in the middle, provenance on the right
export default function LibraryPage({ canEdit, director = false }) {
  const [tab, setTab] = useState('art');
  const [q, setQ] = useState('');
  const [category, setCategory] = useState(''); const [deity, setDeity] = useState(''); const [program, setProgram] = useState('');
  const [use, setUse] = useState({ reuse: true, nowords: true, gap: false, licence: false });
  const [offset, setOffset] = useState(0);
  const [sel, setSel] = useState(null);           // the row whose provenance is open
  const [picking, setPicking] = useState(false);  // bulk-select mode
  const [picked, setPicked] = useState({});
  const [bulk, setBulk] = useState({ category: '', program: '', deity: '', hidden: '', reuse_ok: '' });
  const [editing, setEditing] = useState(false);
  const [msg, setMsg] = useState('');
  const [counts, setCounts] = useState(null);
  const [pct, setPct] = useState(null);
  const view = tab === 'canva' ? 'art' : tab;
  const flags = [use.reuse && 'reuse', use.nowords && tab === 'art' && 'nowords', use.gap && 'gap', use.licence && 'licence'].filter(Boolean).join(',');
  const extra = `&f=${flags}&category=${encodeURIComponent(category)}&deity=${encodeURIComponent(deity)}&program=${encodeURIComponent(program)}`;
  const [data, reload] = useView(view, q, offset, tab === 'videos' ? '' : extra);
  const [plan] = useView('plan');
  const [rows, setRows] = useState([]);
  const sig = `${tab}|${q}|${category}|${deity}|${program}|${flags}`;
  const lastSig = useRef('');
  useEffect(() => { if (lastSig.current !== sig) { lastSig.current = sig; setOffset(0); setRows([]); setSel(null); } }, [sig]);
  useEffect(() => { if (data?.rows) setRows(r => offset === 0 ? data.rows : [...r, ...data.rows.filter(x => !r.some(y => y.row === x.row))]); }, [data]);
  useEffect(() => { fetch('/api/ops/social?view=art&counts=1').then(r => r.json()).then(j => setCounts(j.counts)).catch(() => {}); }, []);

  const facets = data?.facets || {};
  const usedIn = id => (plan?.rows || []).filter(r => r.values.image_id === id).map(r => r.values);
  const selected = rows.find(r => r.row === sel);
  const tileFlag = r => { const v = r.values; return tab === 'videos' ? ((+v.height && +v.width && Math.abs(+v.width / +v.height - 9 / 16) > .03) ? 'Wrong shape for Reels' : '') : !r.thumb ? 'Missing preview · fix' : !licenceOf(v) ? 'Licence missing' : !T(v.reuse_ok) ? 'Not for reuse' : T(v.hidden) ? 'Hidden from the planner' : ''; };
  const useInPost = () => { try { sessionStorage.setItem('ep-social-seed', JSON.stringify({ image_id: selected.values.image_id, thumb: selected.thumb, drive: selected.values.drive_file_id })); } catch {} window.location.href = '/ops/publish?view=compose&seed=1'; };
  const openTemplate = () => { try { sessionStorage.setItem('ep-social-seed', JSON.stringify({ image_id: selected.values.image_id, thumb: selected.thumb, drive: selected.values.drive_file_id, openCard: true })); } catch {} window.location.href = '/ops/publish?view=compose&seed=1'; };
  const hide = async () => { const j = await api({ view, row: selected.row, changes: { hidden: T(selected.values.hidden) ? 'FALSE' : 'TRUE' }, before: selected.values }); setMsg(j.ok ? (T(selected.values.hidden) ? 'Back in the planner.' : 'Hidden from the planner.') : j.error); reload(); };
  const applyBulk = async () => {
    const changes = Object.fromEntries(Object.entries(bulk).filter(([, v]) => v !== ''));
    const list = rows.filter(r => picked[r.row]).map(r => ({ row: r.row, before: r.values }));
    const j = await api({ view, bulk: { rows: list, changes } });
    setMsg(j.ok ? `Changed ${j.changed} picture${j.changed === 1 ? '' : 's'}${j.skipped?.length ? `; ${j.skipped.length} were changed by someone else and left alone` : ''}.` : (j.errors ? Object.values(j.errors).join(' ') : j.error));
    if (j.ok) { setPicked({}); setBulk({ category: '', program: '', deity: '', hidden: '', reuse_ok: '' }); setOffset(0); reload(); }
  };
  const drop = async files => {
    for (const f of files) {
      try { setPct(0); const r = await driveUpload(f, 'single', setPct); setMsg(`Uploaded ${f.name} to Drive.${r.warn.length ? ' ' + r.warn.join(' ') : ''}`); } catch (e) { setMsg(e.message); } finally { setPct(null); }
    }
    setOffset(0); reload();
  };
  const pickedN = Object.values(picked).filter(Boolean).length;

  return (
    <div className="soc lib">
      <header className="soc-head">
        <div><span className="eyebrow">Content · Social</span><h1>Library</h1><p>One place for art, promo graphics, video and finished designs.</p></div>
        <div className="soc-act">
          {canEdit && <label className="soc-btn primary upl">{pct != null ? `Uploading… ${pct}%` : 'Upload images or video'}<input type="file" multiple accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime" disabled={pct != null} onChange={e => { drop([...e.target.files]); e.target.value = ''; }} /></label>}
          <a className="soc-btn" href="/ops/publish?view=library&s=quotes">Quotes &amp; captions</a>
          {director && <a className="soc-btn" href="/ops/publish?view=library&s=categories">Categories &amp; folders</a>}
        </div>
      </header>
      <nav className="ops-soc-tabs" aria-label="Library">{TABS.map(([k, l]) => (
        <a key={k} href={`#${k}`} aria-current={k === tab ? 'page' : undefined} onClick={e => { e.preventDefault(); setTab(k); }}>{l}{counts && counts[k] != null && <span className="mono n"> {counts[k]}</span>}</a>))}</nav>
      <div className="lib-cols">
        <aside className="lib-filters" aria-label="Filters">
          <label className="cap" htmlFor="lib-q">Search</label>
          <input id="lib-q" placeholder="Gaṇeśa, Kalighat, Navarātri…" value={q} onChange={e => setQ(e.target.value)} />
          {tab !== 'videos' && tab !== 'canva' && <>
            <label className="cap" htmlFor="lib-cat">Category</label>
            <select id="lib-cat" value={category} onChange={e => setCategory(e.target.value)}><option value="">Any</option>{(facets.category || []).map(f => <option key={f.name} value={f.name}>{f.name} ({f.n})</option>)}</select>
            <label className="cap" htmlFor="lib-deity">Deity</label>
            <select id="lib-deity" value={deity} onChange={e => setDeity(e.target.value)}><option value="">Any</option>{(facets.deity || []).map(f => <option key={f.name} value={f.name}>{f.name} ({f.n})</option>)}</select>
            <label className="cap" htmlFor="lib-prog">Program</label>
            <select id="lib-prog" value={program} onChange={e => setProgram(e.target.value)}><option value="">Any</option>{(facets.program || []).map(f => <option key={f.name} value={f.name}>{f.name} ({f.n})</option>)}</select>
            <span className="cap">Use</span>
            {[['reuse', 'Reuse OK only'], ['nowords', 'No words on image'], ['gap', 'Clear of 90-day reuse gap'], ['licence', 'Has a licence on file']].map(([k, l]) => (
              <label key={k} className="chk"><input type="checkbox" checked={use[k]} disabled={k === 'nowords' && tab !== 'art'} onChange={e => setUse(u => ({ ...u, [k]: e.target.checked }))} /> {l}</label>))}
          </>}
          {canEdit && <div className="dropz" onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); drop([...e.dataTransfer.files]); }}>
            <b>Drop files here</b><span>JPG, PNG, MP4, MOV · video is checked against Instagram specs</span></div>}
        </aside>
        <section className="lib-main">
          {tab === 'canva' ? <p className="ops-empty">The Canva archive (about 220 finished pages) isn’t imported yet. Once it is, each page will appear here as a Designed asset you can reuse.</p> : (<>
            <div className="lib-bar">
              <span className="sub">{data ? `${data.total} ${tab === 'videos' ? 'videos' : 'pictures'}${flags.includes('reuse') ? ' · reuse OK' : ''}` : 'Loading…'}</span>
              {canEdit && tab !== 'videos' && <span className="soc-act"><button className="soc-btn small" aria-pressed={picking} onClick={() => { setPicking(x => !x); setPicked({}); }}>{picking ? 'Done selecting' : 'Select'}</button></span>}
            </div>
            {picking && pickedN > 0 && (
              <div className="lib-bulk" role="group" aria-label="Bulk edit">
                <b>{pickedN} selected</b>
                <input placeholder="Category" aria-label="Category" value={bulk.category} onChange={e => setBulk({ ...bulk, category: e.target.value })} />
                <input placeholder="Program" aria-label="Program" value={bulk.program} onChange={e => setBulk({ ...bulk, program: e.target.value })} />
                <input placeholder="Deity" aria-label="Deity" value={bulk.deity} onChange={e => setBulk({ ...bulk, deity: e.target.value })} />
                <select aria-label="Reuse" value={bulk.reuse_ok} onChange={e => setBulk({ ...bulk, reuse_ok: e.target.value })}><option value="">Reuse: no change</option><option value="TRUE">Reuse OK</option><option value="FALSE">Not for reuse</option></select>
                <select aria-label="Planner" value={bulk.hidden} onChange={e => setBulk({ ...bulk, hidden: e.target.value })}><option value="">Planner: no change</option><option value="TRUE">Hide from the planner</option><option value="FALSE">Show to the planner</option></select>
                <button className="soc-btn small" onClick={applyBulk} disabled={!Object.values(bulk).some(Boolean)}>Apply to {pickedN}</button>
              </div>)}
            {msg && <p className="hint" role="status">{msg}</p>}
            {data?.error ? <p className="ops-empty">{data.error}</p> : !data ? <p className="ops-empty">Loading…</p> : !rows.length ? <p className="ops-empty">Nothing matches these filters.</p> : (
              <ul className="lib-grid">{rows.map(r => { const fl = tileFlag(r); return (
                <li key={r.row} className={`${sel === r.row ? 'on' : ''}${T(r.values.hidden) ? ' off' : ''}`}>
                  <button type="button" onClick={() => picking ? setPicked(p => ({ ...p, [r.row]: !p[r.row] })) : (setSel(r.row), setEditing(false))} aria-pressed={picking ? !!picked[r.row] : sel === r.row}>
                    <span className="th">{r.thumb ? <img src={r.thumb} alt="" loading="lazy" referrerPolicy="no-referrer" /> : <i>{tab === 'videos' ? '▶' : 'no preview'}</i>}{picking && <span className={`tick${picked[r.row] ? ' on' : ''}`}>{picked[r.row] ? '✓' : ''}</span>}</span>
                    <b>{r.values.file_name}</b>
                    <small>{[r.values.category, r.values.program || r.values.deity].filter(Boolean).join(' · ') || (tab === 'videos' ? [r.values.uploaded_by, r.values.duration && `${Math.round(r.values.duration)}s`].filter(Boolean).join(' · ') : '')}</small>
                    {fl && <em>{fl}</em>}
                  </button>
                </li>); })}
                {data && rows.length < data.total && <li className="more"><button type="button" className="soc-btn small" onClick={() => setOffset(rows.length)}>Show more ({data.total - rows.length} left)</button></li>}
              </ul>)}
          </>)}
        </section>
        <aside className="lib-side" aria-label="Details">
          {!selected ? <p className="sub">Select a picture to see where it came from, its licence and where it has been used.</p> : (<>
            <div className="big">{selected.thumb ? <img src={selected.thumb} alt="" referrerPolicy="no-referrer" /> : <i>no preview</i>}</div>
            <h2>{selected.values.file_name}</h2>
            <span className="sub">{[selected.values.category, selected.values.program, selected.values.deity].filter(Boolean).join(' · ')}</span>
            {editing ? <Row view={{ key: view, tab: 'Image Library' }} head={data.head} locked={data.locked} row={selected.row} values={selected.values} thumb={selected.thumb} canEdit={canEdit} onDone={c => { setEditing(false); if (c) reload(); }} /> : (
              <dl className="prov">
                {[['Licence', licenceOf(selected.values) || 'Missing'], ['Artist', selected.values.artist], ['Date', selected.values.date], ['Source', selected.values.source_institution],
                  ['Last used', ago(selected.used || selected.values.last_used)], ['Used in', usedIn(selected.values.image_id).map(v => `${v.post_id} (${day(v.publish_date)})`).join(', ') || 'No post yet']].filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
                {selected.values.commons_page && <div><dt>Commons page</dt><dd><a href={selected.values.commons_page} target="_blank" rel="noopener">Open ↗</a></dd></div>}
                {selected.values.drive_link && <div><dt>Drive file</dt><dd><a href={selected.values.drive_link} target="_blank" rel="noopener">Open ↗</a></dd></div>}
              </dl>)}
            {creditOf(selected.values) && <div className="credit"><span className="cap">Credit line · added to captions automatically</span>{creditOf(selected.values)}</div>}
            <div className="acts">
              {canEdit && <button className="soc-btn" style={{ background: 'var(--pine)', color: 'var(--ground)' }} disabled={!T(selected.values.reuse_ok) || T(selected.values.hasText) || T(selected.values.has_text) || T(selected.values.hidden)} onClick={useInPost} title={T(selected.values.reuse_ok) && !T(selected.values.has_text) ? '' : 'Only Art that is OK to reuse can go in a post'}>Use in a post</button>}
              {canEdit && <button className="soc-btn" disabled={!T(selected.values.reuse_ok) || T(selected.values.has_text) || T(selected.values.hidden)} onClick={openTemplate}>Open in a template</button>}
              {canEdit && <button className="soc-btn small" onClick={() => setEditing(e => !e)}>{editing ? 'Cancel editing' : 'Edit details'}</button>}
              {canEdit && <button className="link" onClick={hide}>{T(selected.values.hidden) ? 'Show to the planner' : 'Hide from the planner'}</button>}
            </div>
          </>)}
        </aside>
      </div>
    </div>
  );
}
