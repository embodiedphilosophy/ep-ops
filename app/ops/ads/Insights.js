'use client';
import { useEffect, useState } from 'react';

const API = '/api/ops/ads-reads';
const call = async body => { const res = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }), j = await res.json().catch(() => ({})); if (!res.ok) throw new Error(j.error || 'That didn’t work. Try again in a moment.'); return j; };
const usd = c => c == null ? '—' : '$' + (c / 100).toLocaleString('en-US', { maximumFractionDigits: c >= 10000 ? 0 : 2 });
const at = iso => iso ? new Date(iso).toLocaleString('en-US', { timeZone: 'America/New_York', weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) + ' ET' : '';
const SOURCE_NAME = { report: 'Practice Report', meta: 'Meta', circle: 'Circle', kit_purchases: 'Kit purchases', kit_email: 'Kit email' };

const READ_NOTE = {
  no_key: 'The written read needs the Anthropic key, which isn’t set up yet. The numbers it would be built from are below.',
  failed: 'The written read couldn’t be made just now. The numbers are below, and the next run will try again.',
  all_dropped: 'The written read was left out: none of its statements checked out against the numbers. The numbers are below.',
  no_data: 'No source has anything to read yet, so there is no written read. Each source below says what it is waiting for.',
};

function Sources({ sources }) {
  return (
    <ul className="ai-sources" aria-label="Where the numbers come from">
      {sources.map(s => (
        <li key={s.key} data-source={s.key}>
          <span className={`ads-pill ${s.connected === null ? 'calm' : s.connected && s.ok ? 'good' : s.connected ? 'warn' : 'calm'}`}>{s.connected === null ? 'Not read yet' : s.connected && s.ok ? 'Connected' : s.connected ? 'Couldn’t be read' : 'Not connected'}</span>
          <b>{s.label}</b>
          {s.note && <span className="sub">{s.note}</span>}
          {s.todo && !s.connected && <span className="sub">{s.todo}</span>}
        </li>))}
    </ul>);
}

function Numbers({ metrics }) {
  const groups = Object.keys(SOURCE_NAME).map(k => [k, metrics.filter(m => m.source === k)]).filter(([, l]) => l.length);
  if (!groups.length) return null;
  return (
    <details className="ai-all"><summary>All the numbers behind this week’s read ({metrics.length})</summary>
      {groups.map(([k, list]) => (
        <div key={k}><h4>{SOURCE_NAME[k]}</h4>
          <div className="ads-scroll"><table className="ads-table"><thead><tr><th>Number</th><th>Value</th><th>Period</th><th><span className="sr-only">Reference</span></th></tr></thead>
            <tbody>{list.map(m => <tr key={m.id}><td>{m.label}{m.low && <span className="ads-pill calm ai-low" title="Too few to read a trend into">Too few to trust</span>}</td><td className="num">{m.text}</td><td className="sub">{m.period.text}</td><td className="sub">{m.id}</td></tr>)}</tbody></table></div>
        </div>))}
    </details>);
}

function Read({ w, ai }) {
  if (!w) return <p className="ops-empty">Nothing here yet. The first read is made on Monday morning, from last week’s numbers. To try it now, press “Read the week now”.</p>;
  return (
    <>
      <p className="sub">{w.period}{w.prev ? `, compared with ${w.prev}` : ''}</p>
      {w.claims.length > 0 ? (
        <ol className="ai-claims">{w.claims.map((c, i) => (
          <li key={i}><p>{c.text}</p>
            <details><summary>See the numbers</summary>
              <ul>{c.metrics.map(m => <li key={m.id}><b>{m.text}</b> {m.label}<span className="sub"> · {m.source} · {m.period} · {m.id}{m.low ? ' · too few to read a trend into' : ''}</span></li>)}</ul>
            </details></li>))}</ol>
      ) : <p className="ops-empty ai-nonote" role="status">{READ_NOTE[w.state] || READ_NOTE.no_data}</p>}
      {w.verification.dropped > 0 && <p className="sub">{w.verification.dropped} statement{w.verification.dropped === 1 ? ' was' : 's were'} left out because {w.verification.dropped === 1 ? 'its' : 'their'} numbers didn’t check against the sources.</p>}
      {!ai && w.claims.length > 0 && <p className="sub">The key for the written read isn’t set on this site now; this read was made earlier.</p>}
      <Numbers metrics={w.metrics} />
    </>);
}

function Breakdowns({ rows, source }) {
  if (source && !source.connected) return <p className="ads-mode" role="status"><b>The Practice Report isn’t connected yet.</b> {source.todo || 'Ask whoever manages the quiz’s database for a read-only login, then add its address in Vercel as REPORT_DATABASE_URL.'} Everything else here still works.</p>;
  if (source && !source.ok) return <p className="ops-empty">{source.note}</p>;
  if (!rows.length) return <p className="ops-empty">No quiz answers have been read yet. They appear after the first weekly read.</p>;
  return (
    <div className="ai-break">{rows.map(b => (
      <div key={b.key} className="ai-bk"><h3>{b.label}</h3><p className="sub">{b.total.toLocaleString('en-US')} answers · {b.period}</p>
        {b.answers.map(a => <div key={a.answer} className="ai-row"><span className="n">{a.answer}</span><span className="ads-bar" aria-hidden="true"><span style={{ width: `${Math.max(2, a.pct || 0)}%` }} /></span><span className="v">{a.count.toLocaleString('en-US')} · {Math.round(a.pct || 0)}%</span></div>)}
      </div>))}</div>);
}

function Topics({ rows, w, sources }) {
  const on = k => sources.find(s => s.key === k)?.connected && sources.find(s => s.key === k)?.ok;
  const th = w?.thresholds || {};
  if (!rows.length) return <p className="ops-empty">{on('meta') || on('circle') || on('kit_purchases') ? 'No topic had any results in the week.' : 'No ad results or purchases are connected yet. Once a campaign has run in Meta, its topic appears here.'}</p>;
  return (
    <>
      <div className="ads-scroll"><table className="ads-table ai-topics"><thead><tr><th>Topic</th><th>Ad spend</th><th>Bought from ads</th><th>Return or cost per sign-up</th><th>Circle purchases</th><th>Kit purchases</th><th>Emails opened</th><th><span className="sr-only">Notes</span></th></tr></thead>
        <tbody>{rows.map(r => (
          <tr key={r.key} className={r.meta?.low ? 'low' : ''}>
            <td className="ads-name">{r.topic}</td>
            <td className="num">{r.meta ? usd(r.meta.spend_cents) : '—'}</td>
            <td className="num">{r.meta ? (r.meta.goals.includes('Purchase') ? r.meta.purchases : `${r.meta.leads} sign-ups`) : '—'}</td>
            <td className="num">{r.meta ? (r.meta.goals.includes('Purchase') && r.meta.roas != null ? `${r.meta.roas.toFixed(1)}× return` : r.meta.cpl_cents != null ? `${usd(r.meta.cpl_cents)} a sign-up` : '—') : '—'}</td>
            <td className="num">{r.circle ? `${r.circle.count} · ${usd(r.circle.cents)}` : '—'}</td>
            <td className="num">{r.kit ? `${r.kit.count} · ${usd(r.kit.cents)}` : '—'}</td>
            <td className="num">{r.mail ? `${Math.round((r.mail.opens / r.mail.recipients) * 100)}%` : '—'}</td>
            <td>{r.meta?.low && <span className="ads-pill calm" title="Too few to read a trend into">Too few to trust</span>}</td>
          </tr>))}</tbody></table></div>
      <p className="sub">Too few to trust means fewer than {th.MIN_PURCHASES || 5} purchases (or {th.MIN_LEADS || 10} sign-ups) or under ${(th.MIN_SPEND_CENTS || 5000) / 100} spent: the numbers are shown, but don’t read a trend into them.</p>
      {w?.overlap_note && <p className="sub" role="note">{w.overlap_note}</p>}
      {!w?.overlap_note && on('circle') !== on('kit_purchases') && <p className="sub" role="note">Only one of Circle and Kit purchases is connected, so each topic shows that one.</p>}
    </>);
}

function Idea({ i, busy, act }) {
  return (
    <li className="ai-idea" data-status={i.status}>
      <div className="ph"><b>{i.title}</b><span className={`ads-pill ${i.status === 'sent' ? 'good' : i.status === 'dismissed' ? 'calm' : 'warn'}`}>{i.status === 'sent' ? 'Draft on Programs' : i.status === 'dismissed' ? 'Dismissed' : 'New'}</span></div>
      <p>{i.summary}</p>
      <p className="sub"><b>Fits:</b> {i.format} · <b>Aim it at:</b> {i.audience}</p>
      <details><summary>The evidence</summary>
        <ul>{i.evidence.map(e => <li key={e.id}><b>{e.text}</b> {e.label}<span className="sub"> · {e.source} · {e.period} · {e.id}{e.low ? ' · too few to read a trend into' : ''}</span></li>)}</ul>
      </details>
      <div className="soc-act">
        {i.status === 'new' && <><button className="soc-btn primary" disabled={busy} onClick={() => act('send', i.id)}>Send to Programs</button><button className="soc-btn" disabled={busy} onClick={() => act('dismiss', i.id)}>Dismiss</button></>}
        {i.status === 'sent' && <a className="soc-btn" href={`/ops/programs#ideas-from-ads`}>See it on Programs</a>}
        {i.status === 'dismissed' && <button className="soc-btn" disabled={busy} onClick={() => act('undismiss', i.id)}>Bring back</button>}
      </div>
      {i.status === 'sent' && <p className="sub">Sent by {i.sent_by} on {at(i.sent_at)}.</p>}
      {i.status === 'dismissed' && <p className="sub">Dismissed by {i.dismissed_by} on {at(i.dismissed_at)}. It won’t be suggested again unless brought back.</p>}
    </li>);
}

export default function Insights() {
  const [d, setD] = useState(null), [err, setErr] = useState(''), [msg, setMsg] = useState(''), [busy, setBusy] = useState(false), [week, setWeek] = useState('');
  const load = w => fetch(`${API}${w ? `?week=${w}` : ''}`).then(r => r.json().then(j => r.ok ? (setD(j), setErr('')) : setErr(j.error || 'Couldn’t read the Audience insights'))).catch(() => setErr('Couldn’t read the Audience insights'));
  useEffect(() => { load(''); }, []);
  const act = async (action, id) => { setBusy(true); setErr(''); setMsg(''); try { const j = await call({ action, id }); setMsg(j.message || ''); await load(week); } catch (e) { setErr(e.message); } setBusy(false); };
  const run = async () => { setBusy(true); setErr(''); setMsg('Reading the week…'); try { const j = await call({ action: 'run' }); setMsg(j.message); setWeek(''); await load(''); } catch (e) { setMsg(''); setErr(e.message); } setBusy(false); };
  if (err && !d) return <p className="hint err" role="alert">{err}</p>;
  if (!d) return <p className="ops-empty">Reading the Audience insights…</p>;
  const w = d.week, rep = d.sources.find(s => s.key === 'report'), breakdowns = d.breakdowns || [], topics = d.topics || [], weeks = d.weeks || [];
  return (
    <div className="ads ai">
      <section className="ads-panel" aria-label="The weekly read">
        <div className="ph"><div><h2>The weekly read</h2><p className="sub">Made every Monday from five sources. Every statement is linked to the numbers it rests on; one whose numbers don’t check is left out.{d.generated_at ? ` Last read ${at(d.generated_at)}.` : ''}</p></div>
          <button className="soc-btn" disabled={busy} onClick={run}>Read the week now</button></div>
        {err && <p className="hint err" role="alert">{err}</p>}{msg && <p className="hint" role="status">{msg}</p>}
        <Sources sources={d.sources} />
        <Read w={w} ai={d.ai} />
        {weeks.length > 1 && <nav className="ai-weeks" aria-label="Past weeks"><span className="sub">Past weeks</span>{weeks.map(x => <button key={x.week_start} type="button" className="ai-wk" aria-pressed={w?.week_start === x.week_start} onClick={() => { setWeek(x.week_start); load(x.week_start); }}>{x.period || x.week_start}</button>)}</nav>}
      </section>

      <section className="ads-panel" aria-label="What the quiz tells us">
        <div className="ph"><div><h2>What the quiz tells us</h2><p className="sub">The quiz’s own questions, counted over the 90 days to the end of the read’s week. Counts only: nobody’s answers are shown, only how many gave each.</p></div></div>
        <Breakdowns rows={breakdowns} source={rep} />
      </section>

      <section className="ads-panel" aria-label="Which topics convert in ads">
        <div className="ph"><div><h2>Which topics convert in ads</h2><p className="sub">Each topic’s ad spend and results from Meta, next to what Circle and Kit recorded for it.</p></div></div>
        <Topics rows={topics} w={w} sources={d.sources} />
      </section>

      <section className="ads-panel" aria-label="Suggested course topics">
        <div className="ph"><div><h2>Suggested course topics</h2><p className="sub">Ideas kept inside EP’s own world: its words, its formats and its audiences, each with the numbers behind it. For reading and deciding; nothing is created, sent or posted.</p></div></div>
        {!d.ai && !d.ideas.new.length && <p className="ops-empty">Suggestions need the Anthropic key, which isn’t set up yet.</p>}
        {d.ai && !d.ideas.new.length && <p className="ops-empty">{w ? 'No new ideas this week: either the numbers don’t point to one yet, or every idea was one you have already seen.' : 'No ideas yet. They come with the first weekly read.'}</p>}
        {d.ideas.new.length > 0 && <ul className="ai-ideas">{d.ideas.new.map(i => <Idea key={i.id} i={i} busy={busy} act={act} />)}</ul>}
        {d.ideas.sent.length > 0 && <><h3>Sent to Programs</h3><ul className="ai-ideas">{d.ideas.sent.map(i => <Idea key={i.id} i={i} busy={busy} act={act} />)}</ul></>}
        {d.ideas.dismissed.length > 0 && <details className="ai-all"><summary>Dismissed ideas ({d.ideas.dismissed.length})</summary><ul className="ai-ideas">{d.ideas.dismissed.map(i => <Idea key={i.id} i={i} busy={busy} act={act} />)}</ul></details>}
      </section>
    </div>);
}
