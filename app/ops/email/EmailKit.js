'use client';
import { useCallback, useEffect, useState } from 'react';
import { colourOf } from '@/lib/ops/emailprograms';

const day = d => d ? new Date(d + 'T12:00:00Z').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }) : 'No date yet';
const synced = at => at ? new Date(at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'America/New_York' }) + ' ET' : '';
export const Chip = ({ program }) => { const [bg, fg] = colourOf(program); return program ? <span className="em-chip" style={{ background: bg, color: fg }}>{program}</span> : null; };

function useData(what) {
  const [d, setD] = useState(null); const [err, setErr] = useState('');
  const load = useCallback(async (fresh = false) => {
    const res = await fetch(`/api/ops/email?what=${what}${fresh ? '&fresh=1' : ''}`).catch(() => null), j = await res?.json().catch(() => ({})) || {};
    if (!res?.ok) { setErr(j.error || 'Couldn’t read the emails'); return; } setErr(''); setD(j);
  }, [what]);
  useEffect(() => { load(); }, [load]);
  return [d, load, err];
}
const post = async body => {
  const res = await fetch('/api/ops/email', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const j = await res.json().catch(() => ({})); if (!res.ok) throw new Error(j.error || 'Couldn’t save that'); return j;
};

// Says whether Kit is connected, when we last read it, and lets anyone read it again
function Banner({ d, reload, busy }) {
  if (!d) return null;
  if (!d.configured) return <p className="em-banner bad" role="status">Kit isn’t connected yet, so no emails are shown. Ask Jake to add the Kit key (Kit › Settings › Developer).</p>;
  return <p className={`em-banner${d.error ? ' bad' : ''}`} role="status">
    <span>{d.error || `Kit is connected. Read at ${synced(d.at)}.`}</span>
    <button className="soc-btn small" disabled={busy} onClick={() => reload(true)}>{busy ? 'Reading Kit…' : 'Read Kit again'}</button></p>;
}

// The Programming side panel: what is coming up, and what each event still needs, from any screen
function Panel({ d }) {
  return (
    <aside className="em-side soc-panel" aria-label="Programming">
      <div className="ph"><h2>Programming</h2><span className="sub">Next two weeks</span></div>
      {!d ? <p className="ops-empty">Reading…</p> : !d.events.length ? <p className="ops-empty">Nothing is scheduled.</p> : (
        <ul>{d.events.map(e => <li key={e.id}><span className="mono">{day(e.date)}{e.time ? ` · ${e.time}` : ''}</span><br /><Chip program={e.program} /> <b>{e.title}</b>
          <br /><small>{e.planned ? `${e.inKit} of ${e.planned} emails in Kit` : 'No emails planned'}{e.missing.length ? ` · missing ${e.missing.join(', ')}` : ''}</small></li>)}</ul>)}
      <p><a href="/ops/events">Open Programming</a></p>
    </aside>);
}

// The Programming panel's data, read only when the panel is opened
export function useSide(panel) {
  const [side, setSide] = useState(null);
  useEffect(() => { fetch('/api/ops/email/plan?what=plan').then(r => r.json()).then(j => setPlanned((j.plan || []).filter(x => !x.kit_id && x.status !== 'Not needed'))).catch(() => {}); }, []);
  const adopt = async x => { if (!confirm(`Take “${x.subject}” into the Ops plan?\n\nThen you can edit it here and drag it on the calendar. Kit is not changed.`)) return; setFail(''); try { const r = await fetch('/api/ops/email/plan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'adopt', kit_id: x.kit_id }) }), j = await r.json(); if (!r.ok) throw new Error(j.error); window.location.href = `/ops/email/edit?id=${j.id}`; } catch (e) { setFail(e.message || 'Couldn’t do that'); } };
  return side;
}
export function Layout({ children, panel, setPanel, d, title, intro }) {
  return (
    <div className="soc">
      <header className="soc-head">
        <div><span className="eyebrow">Teachers · Email · Launches</span><h1>{title}</h1><p>{intro}</p></div>
        <div className="soc-act"><button className="soc-btn" aria-pressed={panel} onClick={() => setPanel(!panel)}>{panel ? 'Hide' : 'Show'} Programming</button></div>
      </header>
      <div className={`em-layout${panel ? ' panel' : ''}`}><div>{children}</div>{panel && <Panel d={d} />}</div>
    </div>);
}

export function ThisWeek() {
  const [d, load, err] = useData('week'); const [panel, setPanel] = useState(false); const [busy, setBusy] = useState(false);
  const reload = async f => { setBusy(true); await load(f); setBusy(false); };
  const here = d?.events.filter(e => e.thisWeek) || [], next = d?.events.filter(e => !e.thisWeek) || [];
  const row = e => (
    <li className="em-row" key={e.id}>
      <div className="b"><span className="mono meta">{day(e.date)}{e.time ? ` · ${e.time}` : ''} · {e.id}</span><br /><Chip program={e.program} /> <b>{e.title}</b>
        {e.missing.length > 0 && <span className="chips"><span className="gchip bad">Missing in Programming: {e.missing.join(', ')}</span></span>}</div>
      <div className="em-evmails">
        {e.planned > 0 && <span className="gchip">{e.inKit} of {e.planned} promo emails in Kit · <a href="/ops/content?tab=email">Promo emails</a></span>}
        {e.emails?.length ? <ul aria-label={`Emails for ${e.title}`}>{e.emails.map(m => (
          <li key={m.key}><span className="mono meta">{m.date ? day(m.date) : ''}{m.state ? ` · ${m.state}` : ''}</span> <span className="t">{m.label}</span>{' '}
            <a href={m.href} {...(m.external ? { target: '_blank', rel: 'noreferrer' } : {})}>{m.where}{m.external ? ' ↗' : ''}</a></li>))}</ul>
          : !e.planned && <span className="sub">No emails yet.</span>}
        <a className="soc-btn small" href={e.add}>+ Plan an email</a>
      </div>
    </li>);
  return (
    <Layout title={<>This <em>week</em></>} intro="What is on this week, which emails are in Kit for it, and what needs tidying first." panel={panel} setPanel={setPanel} d={d}>
      {err && <p className="hint err" role="alert">{err}</p>}
      <Banner d={d} reload={reload} busy={busy} />
      {!d ? <p className="ops-empty">Reading Kit and the Master Schedule…</p> : (<>
        <section className="soc-panel" aria-label="Needs attention">
          <div className="ph"><h2>Needs attention</h2></div>
          {!d.attention.length ? <p className="ops-empty">Nothing is waiting. Every email matches an event.</p> : <ul className="em-list">{d.attention.map(a => <li className="em-row" key={a.key}><div className="b">{a.text}</div><a className="soc-btn small" href={a.href}>Open</a></li>)}</ul>}
        </section>
        <section className="soc-panel" aria-label="This week">
          <div className="ph"><h2>On this week</h2><span className="sub">Week of {day(d.monday)}</span></div>
          {!here.length ? <p className="ops-empty">Nothing public is scheduled this week.</p> : <ul className="em-list">{here.map(row)}</ul>}
        </section>
        <section className="soc-panel" aria-label="Next week">
          <div className="ph"><h2>Next week</h2></div>
          {!next.length ? <p className="ops-empty">Nothing is scheduled yet.</p> : <ul className="em-list">{next.map(row)}</ul>}
        </section></>)}
    </Layout>);
}

const SHOWS = [['all', 'All'], ['unlinked', 'Not matched'], ['tidy', 'To tidy'], ['draft', 'Drafts'], ['scheduled', 'Scheduled'], ['sent', 'Sent'], ['archived', 'Put away']];
export function Emails() {
  const [d, load, err] = useData('emails'); const [panel, setPanel] = useState(false); const side = useSide(panel); const [planned, setPlanned] = useState([]);
  const [show, setShow] = useState('all'); const [q, setQ] = useState(''); const [pick, setPick] = useState({}); const [sel, setSel] = useState(new Set());
  const [msg, setMsg] = useState(''); const [fail, setFail] = useState(''); const [busy, setBusy] = useState('');
  useEffect(() => { const s = new URLSearchParams(window.location.search).get('show'); if (SHOWS.some(x => x[0] === s)) setShow(s); }, []);
  useEffect(() => { if (panel && !side) fetch('/api/ops/email?what=week').then(r => r.json()).then(setSide).catch(() => {}); }, [panel, side]);
  const run = (key, body, ok) => async () => { setBusy(key); setFail(''); setMsg(''); try { const j = await post(body); setMsg(typeof ok === 'function' ? ok(j) : ok); setSel(new Set()); await load(true); } catch (e) { setFail(e.message); } setBusy(''); };
  const rows = (d?.emails || []).filter(x => {
    if (show === 'archived') return x.archived; if (x.archived) return false;
    if (show === 'unlinked' && x.linked) return false; if (show === 'tidy' && !x.flags.length) return false;
    if (['draft', 'scheduled', 'sent'].includes(show) && x.state !== show) return false;
    return !q || `${x.subject} ${x.event_title} ${x.event_id}`.toLowerCase().includes(q.toLowerCase());
  });
  const canEdit = d?.canEdit;
  const attach = x => { const ev = d.events.find(e => e.id === pick[x.kit_id]); if (!ev) return; 
    if (!confirm(`Put “${x.subject}” under ${ev.title} (${ev.id})?\n\n${x.state === 'sent' ? 'It’s already been sent, so the match is kept in Ops only. Kit isn’t changed' : `This adds [${ev.id}] to the email’s internal description in Kit. Nothing else in Kit changes`}, and nothing is sent.`)) return;
    run('a' + x.kit_id, { action: 'attach', kit_id: x.kit_id, event_id: ev.id, confirm: true }, `Matched to ${ev.title}`)(); };
  const away = () => { const n = sel.size; if (!n || !confirm(`Put away ${n} email${n === 1 ? '' : 's'}?\n\nThey are hidden here. Nothing is deleted, and nothing in Kit changes: you can bring them back, or archive them in Kit yourself.`)) return;
    run('away', { action: 'archive', kit_ids: [...sel], confirm: true }, j => `${j.changed} put away`)(); };
  return (
    <Layout title={<>Email<em>s</em></>} intro="Every Kit email from the last 60 days and the next 90, matched to its event. Anything Kit has that Ops can’t place waits in “Not matched”." panel={panel} setPanel={setPanel} d={side}>
      {err && <p className="hint err" role="alert">{err}</p>}{fail && <p className="hint err" role="alert">{fail}</p>}{msg && <p className="hint" role="status">{msg}</p>}
      <Banner d={d} reload={load} busy={!!busy} />
      {d && <>
        <div className="em-filters" role="group" aria-label="Show">{SHOWS.map(([k, l]) => <button key={k} className={`soc-btn small${show === k ? ' primary' : ''}`} aria-pressed={show === k} onClick={() => setShow(k)}>
          {l}{k === 'unlinked' ? ` ${d.counts.unlinked}` : k === 'tidy' ? ` ${d.counts.stale + d.counts.duplicate}` : k === 'archived' ? ` ${d.counts.archived}` : ''}</button>)}
          <input aria-label="Search emails" placeholder="Search" value={q} onChange={e => setQ(e.target.value)} />{canEdit && <a className="soc-btn small primary" href="/ops/email/edit">New email</a>}</div>
        {planned.length > 0 && <section className="soc-panel" aria-label="Planned in Ops"><div className="ph"><h2>Planned in Ops</h2><span className="sub">Not in Kit yet</span></div>
          <ul className="em-list">{planned.map(x => <li className="em-row" key={x.id}><div className="b"><span className="mono meta">{day(x.planned_date)} · {x.status}</span><br /><b>{x.subject || `${x.type || 'Email'} (no subject yet)`}</b></div><a className="soc-btn small" href={`/ops/email/edit?id=${x.id}`}>Open</a></li>)}</ul></section>}
        <section className="soc-panel" aria-label="Emails">
          {canEdit && show === 'tidy' && <div className="soc-act"><button className="soc-btn primary" disabled={!sel.size || !!busy} onClick={away}>Put away {sel.size || ''} selected</button></div>}
          {!rows.length ? <p className="ops-empty">{show === 'unlinked' ? 'Every email is matched to an event.' : 'No emails here.'}</p> : (
            <ul className="em-list">{rows.map(x => (
              <li className={`em-row${x.archived ? ' gone' : ''}`} key={x.kit_id}>
                {canEdit && show === 'tidy' && <input type="checkbox" aria-label={`Select ${x.subject}`} checked={sel.has(x.kit_id)} onChange={e => setSel(s => { const n = new Set(s); e.target.checked ? n.add(x.kit_id) : n.delete(x.kit_id); return n; })} />}
                <div className="b">
                  <span className="mono meta">{day(x.date)} · {x.state}{x.audience ? ` · ${x.audience}` : ''}</span><br />
                  <Chip program={x.program} /> <b>{x.subject}</b>
                  <span className="chips">
                    {x.event_id ? <span className="gchip">{x.event_id} · {x.event_title}</span> : x.mm ? <span className="gchip">Automatic reminder</span> : x.kind === 'newsletter' ? <span className="gchip">Newsletter</span> : <span className="gchip bad">Not matched to an event</span>}
                    {x.flags.includes('stale') && <span className="gchip bad">Old draft</span>}
                    {x.flags.includes('duplicate') && <span className="gchip bad">Duplicate of the automatic reminder</span>}
                  </span>
                  {canEdit && !x.linked && !x.archived && (
                    <div className="em-attach"><select aria-label={`Event for ${x.subject}`} value={pick[x.kit_id] || ''} onChange={e => setPick(p => ({ ...p, [x.kit_id]: e.target.value }))}>
                      <option value="">Choose the event…</option>{d.events.map(e => <option key={e.id} value={e.id}>{day(e.date)} · {e.title} ({e.id})</option>)}</select>
                      <button className="soc-btn small" disabled={!pick[x.kit_id] || !!busy} onClick={() => attach(x)}>Attach</button></div>)}
                </div>
                <span className="soc-act">{canEdit && !x.archived && (x.plan_id ? <a className="soc-btn small" href={`/ops/email/edit?id=${x.plan_id}`}>Edit in Ops</a> : x.state !== 'sent' && <button className="soc-btn small" onClick={() => adopt(x)}>Edit in Ops</button>)}<a className="soc-btn small" href={x.url} target="_blank" rel="noreferrer">Open in Kit</a>
                  {canEdit && x.archived && <button className="soc-btn small" disabled={!!busy} onClick={run('r' + x.kit_id, { action: 'restore', kit_ids: [x.kit_id], confirm: true }, 'Brought back')}>Bring back</button>}</span>
              </li>))}</ul>)}
        </section></>}
    </Layout>);
}
