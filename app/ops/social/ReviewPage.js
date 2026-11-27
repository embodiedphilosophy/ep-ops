'use client';
import { useState } from 'react';
import { useView, api, day, time, kindLabel } from '../content/SocialEngine';

const title = p => String(p.caption || '').split('\n').find(Boolean) || (p.media_kind === 'story' ? 'Story frame' : 'No caption yet');

// Review & approve (design: "Here is exactly what bulk approve will cover"): the list on the left, Health on the right.
export default function ReviewPage({ closes }) {
  const [data, reload] = useView('review');
  const [health] = useView('health');
  const [sel, setSel] = useState({});
  const [why, setWhy] = useState({});
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const rows = data?.rows || [];
  const picked = rows.filter(r => sel[r.row]);
  const blockedN = rows.filter(r => r.blocked.length).length;
  const needWhy = picked.filter(r => r.flags.length && !String(why[r.row] || '').trim());
  const ready = rows.filter(r => !r.blocked.length && !r.flags.length);
  const go = async () => {
    setBusy(true); setMsg('');
    const j = await api({ view: 'plan', approve: picked.map(r => ({ row: r.row, before: r.values, reason: why[r.row] })) });
    setBusy(false);
    setMsg(j.ok ? `${j.approved} approved.${j.skipped?.length ? ` ${j.skipped.length} left alone: ${j.skipped.map(x => x.why).join('; ')}` : ''}` : j.error);
    setSel({}); reload();
  };
  return (
    <div className="soc">
      <header className="soc-head">
        <div><span className="eyebrow">Content · Social</span><h1>Review <em>&amp; approve</em></h1><p>{closes}</p></div>
        <div className="soc-act"><a className="soc-btn" href="/ops/social/team">Who can approve</a><a className="soc-btn" href="/ops/social">← Calendar</a></div>
      </header>
      <div className="soc-review">
        <div className="main">
          <p className="sub" style={{ margin: 0, maxWidth: 720 }}>Here is exactly what bulk approve will cover. Blocked posts can’t be ticked until their facts are fixed at the source. Posts still waiting on teacher clearance are flagged. Approving them anyway asks for a one-line reason, which is logged.</p>
          {!data ? <p className="ops-empty">Loading…</p> : data.error ? <p className="ops-empty">{data.error}</p> : !rows.length ? <p className="ops-empty">Nothing is waiting for approval.</p> : (
            <ul className="soc-rev">{rows.map(r => { const v = r.values, blocked = r.blocked.length > 0; return (
              <li key={r.row} className={blocked ? 'blocked' : ''}>
                <label className="pick"><input type="checkbox" disabled={blocked || !data.canPublish} checked={!!sel[r.row]} onChange={e => setSel(s => ({ ...s, [r.row]: e.target.checked }))} aria-label={`Approve ${day(v.publish_date)} ${time(v.publish_time_ET)}`} /></label>
                <div className="b">
                  <span className="mono meta">{day(v.publish_date)} {time(v.publish_time_ET)} · {kindLabel(v) || (/story/i.test(v.platforms) && !/feed/i.test(v.platforms) ? 'Story' : 'Feed')}{v.pillar ? ` · ${v.pillar}` : ''}</span>
                  <b>{title(v).slice(0, 120)}</b>
                  {v.template_id && <span className="sub">{v.template_id}</span>}
                  <span className="chips">
                    {r.blocked.map(x => <span key={x} className="gchip bad">{x}</span>)}
                    {r.flags.map(x => <span key={x} className="gchip flag">{x}</span>)}
                    {!blocked && !r.flags.length && <span className="gchip ok">Ready</span>}
                    <a href={`/ops/social/compose?row=${r.row}`}>Open</a>
                  </span>
                  {sel[r.row] && r.flags.length > 0 && <input className="why" placeholder="Why is it OK to approve? One line, saved on the post." value={why[r.row] || ''} onChange={e => setWhy(s => ({ ...s, [r.row]: e.target.value }))} />}
                </div>
              </li>); })}</ul>)}
          <div className="soc-sumbar">
            <span><b className="mono">{picked.length}</b> selected · <b>{blockedN}</b> blocked and left out · DRAFT sentences in selected posts are approved as written{needWhy.length ? ` · ${needWhy.length} still need a reason` : ''}</span>
            <span className="soc-act">
              {data?.canPublish && ready.length > 0 && <button className="soc-btn small" type="button" onClick={() => setSel(Object.fromEntries(ready.map(r => [r.row, true])))}>Tick the {ready.length} that are ready</button>}
              <button className="soc-btn" style={{ background: '#20302A', color: '#FAF5EB' }} type="button" disabled={busy || !picked.length || needWhy.length > 0 || !data?.canPublish} onClick={go}>{picked.length ? `Approve ${picked.length} post${picked.length === 1 ? '' : 's'}` : 'Approve'}</button>
            </span>
          </div>
          {msg && <p className="hint" role="status" style={{ margin: 0 }}>{msg}</p>}
        </div>
        <aside className="health" aria-label="Health">
          <h2>Health</h2>
          <span className="sub">Checked when you open this page · the Instagram check runs hourly</span>
          {!health ? <p className="ops-empty">Checking…</p> : health.error ? <p className="ops-empty">{health.error}</p> : (
            <ul>{health.items.map((i, k) => (
              <li key={k} className={i.level}>
                <span className="lv">{i.level}</span>
                <span className="t"><b>{i.title}</b><span>{i.detail}</span></span>
                {i.action?.kind === 'deleteExpired' && <button type="button" className="soc-btn small danger" disabled={busy}
                  onClick={async () => { if (!confirm(`Delete all ${i.action.n} expired posts?\n\nThey were never approved or posted. They are hidden from the plan; nothing is wiped from the sheet.`)) return; setBusy(true); const j = await api({ view: 'plan', deleteExpired: true }); setBusy(false); setMsg(j.ok ? `${j.deleted} expired posts deleted.` : j.error); reload(); }}>Delete all {i.action.n}</button>}
                {i.link && <a className="soc-btn small" href={i.link}>Open</a>}
              </li>))}</ul>)}
        </aside>
      </div>
    </div>
  );
}
