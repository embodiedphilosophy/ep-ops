'use client';
import { useCallback, useEffect, useState } from 'react';
import { colourOf } from '@/lib/ops/emailprograms';
import { Layout, useSide } from './EmailKit';

const iso = d => d.toISOString().slice(0, 10);
const at = s => new Date(s + 'T12:00:00Z');
const add = (s, n) => { const d = at(s); d.setUTCDate(d.getUTCDate() + n); return iso(d); };
const mondayOf = s => add(s, -((at(s).getUTCDay() + 6) % 7));
const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
const long = s => at(s).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
const post = async body => { const res = await fetch('/api/ops/email/plan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); const j = await res.json().catch(() => ({})); if (!res.ok) throw new Error(j.error || 'Couldn’t save that'); return j; };

function range(view, cursor) {
  if (view === 'week') { const m = mondayOf(cursor); return [m, add(m, 6), 1]; }
  const first = cursor.slice(0, 8) + '01', last = iso(new Date(Date.UTC(+cursor.slice(0, 4), +cursor.slice(5, 7), 0, 12)));
  return view === 'list' ? [first, last, 1] : [mondayOf(first), add(mondayOf(last), 6), 0];
}

export function EmailCalendar() {
  const [view, setView] = useState('month'); const [cursor, setCursor] = useState(today());
  const [d, setD] = useState(null); const [err, setErr] = useState(''); const [msg, setMsg] = useState('');
  const [showEv, setShowEv] = useState(true); const [showSocial, setShowSocial] = useState(true); const [panel, setPanel] = useState(false); const side = useSide(panel);
  const [from, to] = range(view, cursor);
  const load = useCallback(async (fresh = false) => {
    const res = await fetch(`/api/ops/email/plan?what=calendar&from=${from}&to=${to}${fresh ? '&fresh=1' : ''}`).catch(() => null), j = await res?.json().catch(() => ({})) || {};
    if (!res?.ok) { setErr(j.error || 'Couldn’t read the calendar'); return; } setErr(''); setD(j);
  }, [from, to]);
  useEffect(() => { setD(null); load(); }, [load]);
  const step = n => setCursor(c => view === 'week' ? add(c, 7 * n) : iso(new Date(Date.UTC(+c.slice(0, 4), +c.slice(5, 7) - 1 + n, 1, 12))));
  const canEdit = d?.canEdit;

  const move = async (item, date) => {
    if (!item.id || item.date === date) return;
    const sched = item.status === 'Scheduled';
    if (sched && !confirm(`“${item.title}” is already scheduled in Kit for ${item.date}.\n\nMove it to ${long(date)}? Kit will send it on the new day instead. Nothing is sent now.`)) return;
    setErr(''); setMsg('');
    try { await post({ action: 'reschedule', id: item.id, date, confirm: sched }); setMsg(sched ? 'Rescheduled in Kit.' : `Moved to ${long(date)}.`); await load(true); } catch (e) { setErr(e.message); }
  };
  const open = async item => {
    if (item.kind === 'plan') { window.location.href = `/ops/publish?view=compose-email&id=${item.id}`; return; }
    if (item.kind === 'auto') { window.location.href = '/ops/publish?view=email'; return; }
    if (!canEdit || !confirm(`Take “${item.title}” into the Ops plan?\n\nThen you can edit it here and drag it to another day. Kit is not changed.`)) return;
    try { const j = await post({ action: 'adopt', kit_id: item.kit_id }); window.location.href = `/ops/publish?view=compose-email&id=${j.id}`; } catch (e) { setErr(e.message); }
  };
  const Chip = ({ i }) => {
    const [bg, fg] = colourOf(i.program || (i.kind === 'auto' ? 'MM' : ''));
    const draggable = canEdit && i.kind === 'plan' && i.status !== 'Sent';
    return <button className={`em-ci st-${String(i.status).toLowerCase().replace(/\W+/g, '')}${i.conflict ? ' conflict' : ''}`} style={{ background: bg, color: fg }} draggable={draggable} title={`${i.title} · ${i.status}${i.audience ? ' · ' + i.audience : ''}`}
      onDragStart={e => e.dataTransfer.setData('text/plain', JSON.stringify(i))} onClick={() => open(i)}>
      <span className="s">{i.status === 'Scheduled' ? '●' : i.status === 'Sent' ? '✓' : '○'}</span> {i.title}{i.conflict ? ' ⚠' : ''}</button>;
  };
  const Cell = ({ date, dim }) => {
    const its = (d?.items || []).filter(i => i.date === date), auto = its.filter(i => i.kind === 'auto'), mine = its.filter(i => i.kind !== 'auto');
    const warn = (d?.warnings || []).filter(w => w.date === date);
    return (
      <div className={`em-cell${dim ? ' dim' : ''}${date === today() ? ' today' : ''}`} onDragOver={e => canEdit && e.preventDefault()} onDrop={e => { e.preventDefault(); try { move(JSON.parse(e.dataTransfer.getData('text/plain')), date); } catch {} }} aria-label={long(date)}>
        <div className="dn"><span className="mono">{at(date).getUTCDate()}</span>{warn.length > 0 && <span className="em-warn" title={warn.map(w => w.text).join('\n')} aria-label={warn.map(w => w.text).join('. ')}>⚠</span>}
          {canEdit && <a className="plus" href={`/ops/publish?view=compose-email&date=${date}`} aria-label={`New email on ${long(date)}`}>+</a>}</div>
        {auto.length > 0 && <div className="em-auto" title="Automatic reminders (Kit sends these on its own)">{auto.length} automatic</div>}
        {mine.map(i => <Chip key={i.key} i={i} />)}
        {showEv && (d?.events || []).filter(e => e.date === date).map(e => <span key={e.id} className="em-ev" style={{ borderLeftColor: colourOf(e.program)[0] }}>{e.title}</span>)}
        {showSocial && (d?.social || []).filter(p => p.date === date).map(p => <span key={p.id} className="em-so" title={p.caption}>IG {p.time || ''}</span>)}
      </div>);
  };
  const days = []; for (let x = from; x <= to; x = add(x, 1)) days.push(x);
  const month = cursor.slice(0, 7);
  const title = view === 'week' ? `${long(from)} – ${long(to)}` : at(cursor).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  return (
    <Layout view="calendar" title={<>Email <em>calendar</em></>} intro="Every email by the day it goes out, coloured by programme. Drag one to move it. Scheduled emails ask first." panel={panel} setPanel={setPanel} d={side}>
      {err && <p className="hint err" role="alert">{err}</p>}{msg && <p className="hint" role="status">{msg}</p>}
      <div className="soc-act em-bar">
        <button className="soc-btn small" onClick={() => step(-1)} aria-label="Earlier">←</button><b className="mono">{title}</b><button className="soc-btn small" onClick={() => step(1)} aria-label="Later">→</button>
        <button className="soc-btn small" onClick={() => setCursor(today())}>Today</button>
        <span className="em-views" role="group" aria-label="View">{['month', 'week', 'list'].map(v => <button key={v} className={`soc-btn small${view === v ? ' primary' : ''}`} aria-pressed={view === v} onClick={() => setView(v)}>{v[0].toUpperCase() + v.slice(1)}</button>)}</span>
        <label><input type="checkbox" checked={showEv} onChange={e => setShowEv(e.target.checked)} /> Programming</label>
        <label><input type="checkbox" checked={showSocial} onChange={e => setShowSocial(e.target.checked)} /> Social posts</label>
      </div>
      {d?.error && <p className="em-banner bad" role="status">{d.error}</p>}
      {!d ? <p className="ops-empty">Reading Kit and the plan…</p> : (<>
        {view === 'list' ? (
          <section className="soc-panel" aria-label="List"><ul className="em-list">{!d.items.length ? <li className="ops-empty">Nothing is planned this month.</li> : [...d.items].sort((a, b) => a.date.localeCompare(b.date)).map(i => <li className="em-row" key={i.key}><div className="b"><span className="mono meta">{long(i.date)} · {i.status}</span><br /><Chip i={i} /></div></li>)}</ul></section>
        ) : (
          <div className={`em-grid ${view}`} role="grid"><div className="em-dow" aria-hidden="true">{['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(x => <span key={x}>{x}</span>)}</div>
            <div className="em-days">{days.map(x => <Cell key={x} date={x} dim={view === 'month' && x.slice(0, 7) !== month} />)}</div></div>)}
        <section className="soc-panel" aria-label="No date yet">
          <div className="ph"><h2>No date yet</h2><span className="sub">Drag one onto a day to give it a date.</span></div>
          {!d.tray.length ? <p className="ops-empty">Every draft has a date.</p> : <div className="em-tray">{d.tray.map(i => <Chip key={i.key} i={i} />)}</div>}
        </section>
        {d.warnings.length > 0 && <section className="soc-panel" aria-label="Warnings"><div className="ph"><h2>Worth a look</h2></div><ul className="em-list">{d.warnings.map((w, k) => <li className="em-row" key={k}><div className="b"><span className="mono meta">{long(w.date)}</span><br />{w.text}</div></li>)}</ul></section>}
      </>)}
    </Layout>);
}
