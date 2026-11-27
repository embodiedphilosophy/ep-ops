'use client';
import { useCallback, useEffect, useState } from 'react';
import { Layout, useSide } from './EmailKit';

const API = '/api/ops/email/teachers';
const post = async body => { const res = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); const j = await res.json().catch(() => ({})); if (!res.ok) throw Object.assign(new Error(j.error || 'Couldn’t save that'), j); return j; };
const day = d => d ? new Date(d + 'T12:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '';
const STATE_BAD = { 'Submission waiting': 'bad', 'Missing headshot': 'bad', 'Needs update': 'bad', 'No profile yet': 'bad' };

export function Teachers() {
  const [q, setQ] = useState(null);
  useEffect(() => { const p = new URLSearchParams(window.location.search); setQ({ email: p.get('email'), tab: p.get('tab') || 'directory' }); }, []);
  if (!q) return null;
  return q.email ? <Profile email={q.email} /> : <Home tab={q.tab} />;
}

function Home({ tab }) {
  const [d, setD] = useState(null); const [rev, setRev] = useState(null); const [err, setErr] = useState(''); const [msg, setMsg] = useState(''); const [show, setShow] = useState('all'); const [panel, setPanel] = useState(false); const side = useSide(panel);
  const [nu, setNu] = useState({ name: '', email: '', onboard: true });
  const load = useCallback(async () => {
    const get = async u => { const res = await fetch(u).catch(() => null), j = await res?.json().catch(() => ({})) || {}; if (!res?.ok) { setErr(j.error || 'Couldn’t read the teachers'); return null; } return j; };
    setD(await get(API)); setRev(await get(`${API}?what=review`));
  }, []);
  useEffect(() => { load(); }, [load]);
  const run = async (fn, ok) => { setErr(''); setMsg(''); try { const j = await fn(); setMsg(typeof ok === 'function' ? ok(j) : ok || ''); await load(); } catch (e) { setErr(e.message); } };
  const waiting = rev ? rev.bios.length : 0;
  const rows = (d?.teachers || []).filter(t => show === 'all' ? !t.hidden : show === 'test' ? t.test : show === 'hidden' ? t.hidden : !t.hidden && t.flags.includes(show));
  return (
    <Layout title={<><em>Teachers</em></>} intro="Everyone who has taught or is scheduled, with their bio, headshot and where they appear. Teachers send their own through onboarding; you review it here." panel={panel} setPanel={setPanel} d={side}>
      {err && <p className="hint err" role="alert">{err}</p>}{msg && <p className="hint" role="status">{msg}</p>}
      <div className="em-filters" role="tablist" aria-label="Teachers views">
        <a role="tab" aria-selected={tab === 'directory'} className={`soc-btn small${tab === 'directory' ? ' primary' : ''}`} href="/ops/people?needs=profile">Directory</a>
        <a role="tab" aria-selected={tab === 'review'} className={`soc-btn small${tab === 'review' ? ' primary' : ''}`} href="/ops/people?needs=profile&tab=review">Review queue{waiting ? ` ${waiting}` : ''}</a>
      </div>
      {tab === 'review' ? <Review rev={rev} d={d} run={run} /> : !d ? <p className="ops-empty">Reading the teachers…</p> : <>
        <div className="em-filters" role="group" aria-label="Show">{[['all', 'All'], ['submission', 'Submission waiting'], ['photo', 'Missing headshot'], ['update', 'Needs update'], ['noprofile', 'No profile yet'], ['test', 'Test entries']].map(([k, l]) => <button key={k} className={`soc-btn small${show === k ? ' primary' : ''}`} aria-pressed={show === k} onClick={() => setShow(k)}>
          {l}{k === 'submission' ? ` ${d.counts.submissions}` : k === 'photo' ? ` ${d.counts.photo}` : k === 'update' ? ` ${d.counts.update}` : k === 'test' ? ` ${d.counts.test}` : ''}</button>)}
          {d.canEdit && show === 'test' && d.counts.test > 0 && <button className="soc-btn small danger" onClick={() => confirm(`Hide ${d.counts.test} test entr${d.counts.test === 1 ? 'y' : 'ies'}?\n\nThey are hidden, not deleted. You can bring them back from “Hidden”.`) && run(async () => { for (const t of d.teachers.filter(x => x.test)) await post({ action: 'archive', email: t.email, confirm: true }); }, 'Test entries hidden.')}>Clear out the test entries</button>}
          <button className={`soc-btn small${show === 'hidden' ? ' primary' : ''}`} onClick={() => setShow('hidden')}>Hidden</button></div>
        <section className="soc-panel" aria-label="Directory">
          {!rows.length ? <p className="ops-empty">No one here.</p> : <ul className="em-list">{rows.map(t => (
            <li key={t.key} className="em-row"><div className="b" style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              {t.photo_url ? <img src={t.photo_url} alt="" width={48} height={48} style={{ objectFit: 'cover', borderRadius: '50%' }} /> : <span className="em-av" aria-hidden="true">{(t.name || '?').slice(0, 1)}</span>}
              <span><b>{t.preferred_name || t.name}</b>{t.role ? <span className="sub"> · {t.role}</span> : null}<br /><span className="mono meta">{t.upcoming ? `${t.upcoming} coming up` : 'Nothing scheduled'}{t.taught ? ` · taught ${t.taught}` : ''}</span>
                <span className="chips"><span className={`gchip ${STATE_BAD[t.state] || ''}`}>{t.state}</span>{t.test && <span className="gchip bad">Looks like a test entry</span>}</span></span></div>
              {t.email && !t.flags.includes('noprofile') ? <a className="soc-btn small" href={`/ops/people?needs=profile&email=${encodeURIComponent(t.email)}`}>Open</a>
                : d.canEdit && t.email ? <button className="soc-btn small" onClick={() => run(() => post({ action: 'create', email: t.email, name: t.name }), `Profile started for ${t.name}.`)}>Start a profile</button> : <span className="sub">No email on the schedule</span>}</li>))}</ul>}
        </section>
        {d.canEdit && <section className="soc-panel" aria-label="Add a teacher"><div className="ph"><h2>Add a teacher</h2></div>
          <div className="em-two"><label className="em-f"><span className="cap">Name</span><input value={nu.name} onChange={e => setNu({ ...nu, name: e.target.value })} /></label><label className="em-f"><span className="cap">Email</span><input value={nu.email} onChange={e => setNu({ ...nu, email: e.target.value })} /></label></div>
          <label className="em-sw"><input type="checkbox" checked={nu.onboard} onChange={e => setNu({ ...nu, onboard: e.target.checked })} /> Email them their onboarding link now (this also lets them sign in as a teacher)</label>
          <p className="sub">Without it, this only starts a profile here: nothing is sent. To ask them to teach something, use <a href="/ops/people?tab=invitations">Faculty → Invitations</a>.</p>
          <button className="soc-btn small" disabled={!nu.name.trim() || !nu.email.trim()} onClick={() => run(async () => { const j = await post({ action: 'create', ...nu }); setNu({ name: '', email: '', onboard: true }); return j; }, j => j?.message || 'Added.')}>Add</button></section>}
      </>}
    </Layout>);
}

function Diff({ parts }) { return <p className="em-diff">{parts.map((x, i) => <span key={i} className={x.t}>{x.s} </span>)}</p>; }

function Review({ rev, d, run }) {
  const [pages, setPages] = useState(null);
  const loadPages = useCallback(async () => { const r = await fetch('/api/ops/site?tab=coursepages').catch(() => null); const j = await r?.json().catch(() => ({})); setPages(r?.ok ? j.rows : []); }, []);
  useEffect(() => { loadPages(); }, [loadPages]);
  if (!rev) return <p className="ops-empty">Reading the queue…</p>;
  const setPage = (r, status, ok) => run(async () => { const res = await fetch('/api/ops/site', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tab: 'coursepages', row: r.row, changes: { status }, before: r.values }) }); const j = await res.json().catch(() => ({})); if (!res.ok) throw new Error(j.error || 'Couldn’t save'); await loadPages(); }, ok);
  const waitingPages = (pages || []).filter(r => String(r.values.status).toLowerCase() === 'submitted'), live = (pages || []).filter(r => String(r.values.status).toLowerCase() === 'published');
  return (<>
    <section className="soc-panel" aria-label="Bios waiting"><div className="ph"><h2>Bios and headshots</h2><span className="sub">What a teacher sent, set against what is live.</span></div>
      {!rev.bios.length ? <p className="ops-empty">Nothing waiting. New bios from teacher onboarding show up here.</p> : <ul className="em-list">{rev.bios.map(x => (
        <li key={x.email} className="em-row" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
          <div className="b" style={{ display: 'flex', gap: 12 }}>{x.photo_url && <img src={x.photo_url} alt="" width={64} height={64} style={{ objectFit: 'cover', borderRadius: 6 }} />}
            <span><b>{x.name}</b> <span className="gchip">{x.first ? 'First submission' : 'A change'}</span>{x.new_photo && !x.first && <span className="gchip">New headshot</span>}<br /><span className="sub">{x.words} words</span></span></div>
          {x.diff ? <Diff parts={x.diff} /> : <p>{x.bio || <i>No bio yet.</i>}</p>}
          <div className="soc-act"><button className="soc-btn primary" disabled={!d?.canApprove || !x.bio || !x.photo_url} title={d?.canApprove ? '' : 'Only Jake, Irene and Floss can approve'} onClick={() => confirm(`Put ${x.name}’s bio${x.new_photo ? ' and headshot' : ''} on the website?`) && run(() => post({ action: 'approve', email: x.email }), `${x.name} is live on the website.`)}>Approve for the website</button>
            <a className="soc-btn" href={`/ops/people?needs=profile&email=${encodeURIComponent(x.email)}`}>Edit, then approve</a>
            <button className="soc-btn" onClick={() => { const note = prompt(`What should ${x.name} change?`); if (note && confirm(`This emails ${x.name} your note and puts the profile back to “on file”.`)) run(() => post({ action: 'sendBack', email: x.email, note, confirm: true }), j => j.mailed ? 'Sent back, and emailed.' : 'Sent back (the email couldn’t be sent).'); }}>Send back</button></div></li>))}</ul>}
    </section>
    <section className="soc-panel" aria-label="Course pages"><div className="ph"><h2>Course pages</h2><span className="sub">Moved here from Content → Review.</span></div>
      {!pages ? <p className="ops-empty">Reading…</p> : !waitingPages.length ? <p className="ops-empty">No course pages waiting.</p> : <ul className="em-list">{waitingPages.map(r => (
        <li key={r.row} className="em-row"><div className="b"><b>{r.values.title || r.values.offering}</b><br /><span className="sub">{String(r.values.summary || '').slice(0, 200)}</span><br /><span className="mono meta">Teachers: {r.values.teacher_emails || '—'}</span></div>
          <span className="soc-act">{r.values.slug && <a className="soc-btn small" href={`/teach/preview/${r.values.slug}`} target="_blank" rel="noreferrer">Preview</a>}
            <button className="soc-btn small primary" disabled={!d?.canApprove || !r.values.slug} onClick={() => confirm(`Put ${r.values.title} live on the website?`) && setPage(r, 'published', `${r.values.title} is live.`)}>Publish</button></span></li>))}</ul>}
      {live.length > 0 && <details><summary>Live course pages ({live.length})</summary><ul className="em-list">{live.map(r => <li key={r.row} className="em-row"><div className="b">{r.values.title}</div>{d?.canApprove && <button className="soc-btn small" onClick={() => confirm(`Take ${r.values.title} off the website?`) && setPage(r, 'submitted', `${r.values.title} is off the website.`)}>Take down</button>}</li>)}</ul></details>}
    </section></>);
}

function Profile({ email }) {
  const [d, setD] = useState(null); const [f, setF] = useState({}); const [err, setErr] = useState(''); const [msg, setMsg] = useState(''); const [busy, setBusy] = useState(false); const [bust, setBust] = useState(0); const [panel, setPanel] = useState(false); const side = useSide(panel);
  const load = useCallback(async () => { const res = await fetch(`${API}?email=${encodeURIComponent(email)}`).catch(() => null), j = await res?.json().catch(() => ({})) || {}; if (!res?.ok) { setErr(j.error || 'Couldn’t read this teacher'); return; } setD(j); setF({ ...j.profile, links: j.profile.links.length ? j.profile.links : [] }); setBust(Date.now()); }, [email]);
  useEffect(() => { load(); }, [load]);
  if (!d) return <Layout title="Teacher" intro="" panel={false} setPanel={() => {}} d={null}>{err ? <p className="hint err" role="alert">{err}</p> : <p className="ops-empty">Opening…</p>}</Layout>;
  const p = d.profile, live = p.status === 'approved', can = d.canEdit;
  const run = async (fn, ok) => { setBusy(true); setErr(''); setMsg(''); try { await fn(); if (ok) setMsg(ok); await load(); } catch (e) { setErr(e.message); } setBusy(false); };
  const field = (k, label, extra = {}) => <label className="em-f"><span className="cap">{label}</span>{extra.area ? <textarea rows={extra.rows || 4} value={f[k] || ''} disabled={!can} onChange={e => setF({ ...f, [k]: e.target.value })} /> : <input value={f[k] || ''} disabled={!can} onChange={e => setF({ ...f, [k]: e.target.value })} />}</label>;
  const save = () => { const changes = {}; for (const k of ['name', 'role', 'bio', 'short_bio', 'pronouns', 'credentials', 'preferred_name']) if ((f[k] || '') !== (p[k] || '')) changes[k] = f[k] || ''; if (JSON.stringify(f.links) !== JSON.stringify(p.links)) changes.links = f.links;
    const goes = live && ('bio' in changes || 'name' in changes); if (goes && !confirm('This profile is live on the website. Saving changes it there straight away.\n\nSave?')) return;
    run(() => post({ action: 'save', email, changes, confirm: goes }), 'Saved.'); };
  const meta = () => run(() => post({ action: 'photoMeta', email, changes: { photo_alt: f.photo_alt || '', photo_credit: f.photo_credit || '', focal_x: f.focal_x || 50, focal_y: f.focal_y || 40 } }), 'Headshot details saved.');
  const upload = e => { const file = e.target.files?.[0]; if (!file) return; const rd = new FileReader(); rd.onload = () => { const img = new Image(); img.onload = () => { const c = document.createElement('canvas'), s = Math.min(1, 1600 / Math.max(img.width, img.height)); c.width = img.width * s; c.height = img.height * s; c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    run(async () => { const res = await fetch('/api/ops/teachers/photo', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, name: file.name, data: c.toDataURL('image/jpeg', 0.9).split(',')[1] }) }); const j = await res.json().catch(() => ({})); if (!res.ok) throw new Error(j.error || 'Couldn’t save the headshot'); }, 'New headshot saved. The earlier one is kept.'); }; img.src = rd.result; }; rd.readAsDataURL(file); };
  const crop = shape => `/api/ops/teachers/photo?email=${encodeURIComponent(email)}&shape=${shape}&v=${bust}`;
  return (
    <Layout title={<>{p.preferred_name || p.name}</>} intro={`${p.status || 'no status'}${live ? ' · live on the website' : ''}${d.stale ? ' · bio is more than a year old' : ''}`} panel={panel} setPanel={setPanel} d={side}>
      <p><a href="/ops/people?needs=profile">← All teachers</a></p>
      {err && <p className="hint err" role="alert">{err}</p>}{msg && <p className="hint" role="status">{msg}</p>}
      {p.status === 'submitted' && <p className="em-banner bad" role="status"><span><b>Waiting for review.</b> They sent this through onboarding.</span>{d.canApprove && <button className="soc-btn small primary" disabled={busy} onClick={() => confirm('Put this profile on the website?') && run(() => post({ action: 'approve', email }), 'Approved: it is live on the website.')}>Approve for the website</button>}</p>}
      {p.review_note && p.status !== 'approved' && <p className="em-banner" role="status">Last note sent back: “{p.review_note}”</p>}
      <div className="em-edit"><div>
        <section className="soc-panel" aria-label="Profile"><div className="ph"><h2>Profile</h2></div>
          <div className="em-two">{field('name', 'Name (as on the website)')}{field('preferred_name', 'Preferred spelling, with diacritics')}</div>
          <div className="em-two">{field('role', 'Role')}{field('pronouns', 'Pronouns')}</div>
          {field('short_bio', `Short bio, about 40 words (${d.words.short} now)`, { area: true, rows: 3 })}
          {field('bio', `Long bio, the website bio (${d.words.bio} words)`, { area: true, rows: 7 })}
          {field('credentials', 'Credentials')}
          <div className="em-f"><span className="cap">Links</span>{(f.links || []).map((l, i) => <div key={i} className="em-two"><input aria-label="Link label" placeholder="Label" value={l.label} disabled={!can} onChange={e => setF({ ...f, links: f.links.map((x, j) => j === i ? { ...x, label: e.target.value } : x) })} /><input aria-label="Link address" placeholder="https://…" value={l.url} disabled={!can} onChange={e => setF({ ...f, links: f.links.map((x, j) => j === i ? { ...x, url: e.target.value } : x) })} /></div>)}
            {can && <button className="soc-btn small" onClick={() => setF({ ...f, links: [...(f.links || []), { label: '', url: '' }] })}>Add a link</button>}</div>
          {can && <div className="soc-act"><button className="soc-btn primary" disabled={busy} onClick={save}>Save</button></div>}
        </section>
        {d.diff && <section className="soc-panel" aria-label="What changed"><div className="ph"><h2>What changed</h2><span className="sub">Against the bio that is live.</span></div><Diff parts={d.diff} /></section>}
        <section className="soc-panel" aria-label="Headshot"><div className="ph"><h2>Headshot</h2></div>
          {!p.photo_url ? <p className="ops-empty">No headshot yet.</p> : <div className="em-crops">{[['square', 'Square'], ['portrait', '4:5'], ['circle', 'Circle']].map(([s, l]) => <figure key={s}><img src={crop(s)} alt={`${p.name}, ${l} crop`} width={s === 'portrait' ? 96 : 120} style={{ borderRadius: s === 'circle' ? '50%' : 6 }} /><figcaption className="sub">{l}</figcaption></figure>)}</div>}
          <div className="em-two"><label className="em-f"><span className="cap">Focal point, across ({f.focal_x || 50})</span><input type="range" min="0" max="100" value={f.focal_x || 50} disabled={!can} onChange={e => setF({ ...f, focal_x: e.target.value })} /></label>
            <label className="em-f"><span className="cap">Focal point, down ({f.focal_y || 40})</span><input type="range" min="0" max="100" value={f.focal_y || 40} disabled={!can} onChange={e => setF({ ...f, focal_y: e.target.value })} /></label></div>
          {field('photo_alt', 'Describe the picture (alt text)')}{field('photo_credit', 'Photo credit')}
          {can && <div className="soc-act"><button className="soc-btn" disabled={busy} onClick={meta}>Save headshot details</button><label className="soc-btn">Upload a new headshot<input type="file" accept="image/jpeg,image/png" hidden onChange={upload} /></label></div>}
          {p.versions.length > 0 && <><h3 className="ops-sub">Earlier headshots</h3><div className="em-crops">{p.versions.map((v, i) => <figure key={i}><img src={v.url} alt="" width={72} style={{ borderRadius: 6 }} /><figcaption className="sub">{day(v.at)}</figcaption>{can && <button className="soc-btn small" disabled={busy} onClick={() => confirm('Bring this headshot back? The current one is kept as a version.') && run(() => post({ action: 'restoreVersion', email, index: i }), 'Brought back.')}>Use this</button>}</figure>)}</div></>}
        </section></div>
        <aside className="em-pre" aria-label="Where this appears">
          <section className="soc-panel"><div className="ph"><h2>Publish targets</h2></div><ul className="em-list">{d.targets.map(t => <li key={t.key} className="em-row" style={{ padding: '8px 0' }}><div className="b"><b>{t.label}</b><br /><span className={`gchip ${/Not|Needs|missing/i.test(t.state) ? 'bad' : ''}`}>{t.state}</span><br /><span className="sub">{t.note}</span></div></li>)}</ul></section>
          <section className="soc-panel" aria-label="Usage"><div className="ph"><h2>Where the bio appears</h2></div>
            <p className="sub">{d.usage.sessions.length ? `${d.usage.sessions.length} upcoming session${d.usage.sessions.length === 1 ? '' : 's'}` : 'No upcoming sessions'} · taught {d.usage.taught}</p>
            {d.usage.sessions.length > 0 && <ul className="em-list">{d.usage.sessions.map(s => <li key={s.id + s.date} className="em-row" style={{ padding: '4px 0' }}><span className="mono meta">{day(s.date)}</span> {s.title}</li>)}</ul>}
            {d.usage.pages.length > 0 && <><h3 className="ops-sub">Course pages</h3><ul className="em-list">{d.usage.pages.map(g => <li key={g.offering} className="em-row" style={{ padding: '4px 0' }}>{g.title} <span className="gchip">{g.status}</span></li>)}</ul></>}
            {d.usage.emails.length > 0 && <><h3 className="ops-sub">Emails using their bio</h3><ul className="em-list">{d.usage.emails.map(e => <li key={e.id} className="em-row" style={{ padding: '4px 0' }}><a href={`/ops/publish?view=compose-email&id=${e.id}`}>{e.subject || e.id}</a> <span className="gchip">{e.status}</span></li>)}</ul></>}
            {d.stale && <p className="em-banner bad" role="status">{d.age_days == null ? 'We don’t know when this bio was last updated.' : `This bio is ${Math.floor(d.age_days / 30)} months old.`} Ask them to refresh it.</p>}</section>
          {can && p.status !== 'approved' && <button className="soc-btn small danger" disabled={busy} onClick={() => confirm('Hide this profile?\n\nIt is hidden from the lists, not deleted. You can bring it back.') && run(async () => { await post({ action: 'archive', email, confirm: true }); window.location.href = '/ops/people?needs=profile'; })}>Hide this profile</button>}
        </aside></div>
    </Layout>);
}
