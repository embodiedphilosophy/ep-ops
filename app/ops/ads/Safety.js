'use client';
import { useEffect, useState } from 'react';
import SafetySettings from './SafetySettings';

const API = '/api/ops/ads-safety';
const TONE = { green: 'good', amber: 'warn', red: 'bad', grey: 'calm' };
const WORD = { green: 'All clear', amber: 'Worth a look', red: 'Needs you now', grey: 'Not checked' };
const LEVEL = { urgent: ['Urgent', 'bad'], important: ['Important', 'warn'], routine: ['For your information', 'calm'], test: ['Test', 'calm'] };
const usd = c => '$' + ((c || 0) / 100).toLocaleString('en-US', { maximumFractionDigits: 2 });
const at = iso => iso ? new Date(iso).toLocaleString('en-US', { timeZone: 'America/New_York', weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) + ' ET' : '';
const CH = { sms: 'text', whatsapp: 'WhatsApp', email: 'email', all: 'everything' };
const call = async body => { const res = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }), j = await res.json().catch(() => ({})); if (!res.ok) throw new Error(j.error || 'That didn’t work. Try again in a moment.'); return j; };

// "Jacob: email sent, text sent; Rebecka: email sent" for the lines of one send (no numbers are ever in a log line)
const told = lines => {
  const by = {};
  for (const l of lines || []) (by[l.who] ||= []).push(`${CH[l.channel] || l.channel} ${l.status === 'skipped' ? `skipped (${l.detail})` : l.status === 'failed' ? `FAILED (${l.detail})` : l.status === 'queued' ? 'held until morning' : l.status}`);
  return Object.entries(by).map(([w, c]) => `${w}: ${c.join(', ')}`).join('; ');
};

const Pill = ({ s }) => <span className={`ads-pill ${TONE[s] || 'calm'}`}>{WORD[s] || s}</span>;
const Level = ({ l }) => <span className={`ads-pill ${(LEVEL[l] || [])[1] || 'calm'}`}>{(LEVEL[l] || [l])[0]}</span>;

function OpenAlert({ a, reload, setMsg, setErr, canAct }) {
  const [h, setH] = useState('24'), [busy, setBusy] = useState(false);
  const snoozed = a.snooze_until && new Date(a.snooze_until) > new Date();
  const ack = async () => { setBusy(true); setErr(''); try { const j = await call({ action: 'ack', id: a.id, hours: Number(h) }); setMsg(j.message); await reload(); } catch (e) { setErr(e.message); } finally { setBusy(false); } };
  return (
    <tr>
      <td><Level l={a.level} /></td>
      <td><b>{a.title}</b>
        <details><summary>What it says</summary>{a.body.split('\n').map((p, i) => <p key={i} className="sub">{p}</p>)}{a.link && <p><a href={a.link}>Open the page for this</a></p>}</details>
        {a.events.some(e => e.type === 'nobody_reached') && <p className="hint err">No message could be sent to anyone about this one.</p>}
        {a.queued > 0 && <p className="sub">{a.queued} message{a.queued === 1 ? ' is' : 's are'} waiting for quiet hours to end.</p>}</td>
      <td className="sub">{at(a.created_at)}<br />{a.last_sent_at ? `Last told ${at(a.last_sent_at)}` : 'Not sent yet'}</td>
      <td>{snoozed ? <span className="sub">Acknowledged by {a.acked_by}, {at(a.acked_at)}. Quiet until {at(a.snooze_until)} unless it gets worse.</span> : (
        <div className="ads-inline"><label>Quiet for<select value={h} onChange={e => setH(e.target.value)} aria-label={`Snooze ${a.title}`}>{[['4', '4 hours'], ['12', '12 hours'], ['24', '1 day'], ['72', '3 days'], ['168', '7 days']].map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
          <button className="soc-btn small" type="button" disabled={busy || !canAct} onClick={ack}>Acknowledge</button></div>)}</td>
    </tr>);
}

export default function Safety() {
  const [d, setD] = useState(null), [err, setErr] = useState(''), [msg, setMsg] = useState(''), [busy, setBusy] = useState(false);
  const load = () => fetch(API).then(r => r.json().then(j => r.ok ? (setD(j), setErr('')) : setErr(j.error || 'Couldn’t read the safety net'))).catch(() => setErr('Couldn’t read the safety net'));
  useEffect(() => { load(); }, []);
  if (err && !d) return <p className="hint err" role="alert">{err}</p>;
  if (!d) return <p className="ops-empty">Reading the safety net…</p>;
  const n = d.numbers || {}, checkNow = async () => { setBusy(true); setErr(''); setMsg(''); try { const j = await call({ action: 'checkNow' }); setMsg(j.message); await load(); } catch (e) { setErr(e.message); } finally { setBusy(false); } };
  const cardById = id => d.board.find(c => c.id === id);
  return (
    <div className="ads ads-safety">
      {!d.token && <p className="ads-mode bad" role="alert"><b>No Meta token set.</b> The safety net can’t see your ad account at all, so nothing is being watched. Add the ads access key in Vercel (Settings › Connections and jobs shows what is missing).</p>}
      {d.token && !d.account_set && <p className="ads-mode bad" role="alert"><b>No ad account set.</b> The safety net can’t see your ad account until META_AD_ACCOUNT_ID is set in Vercel.</p>}
      {!d.ceilings_set && <p className="ads-mode warn" role="status"><b>Set your ceilings.</b> The safety net can’t warn you about overspending until it knows how much is too much: {d.can_edit ? <a href="#safety-settings">set the daily and monthly ceilings below</a> : 'ask a director to set the daily and monthly ceilings'}.{d.ceilings.daily_cents || d.ceilings.monthly_cents ? ' One is set; the other check is still off.' : ''}</p>}
      {d.problems.length > 0 && <p className="ads-mode bad" role="alert"><b>{d.problems.length} message{d.problems.length === 1 ? '' : 's'} could not be delivered in the last day.</b> {d.problems.slice(0, 3).map(p => `${p.who} (${CH[p.channel] || p.channel}): ${p.detail}`).join('; ')}. The other ways of reaching people were still tried.</p>}
      {msg && <p className="hint" role="status">{msg}</p>}{err && <p className="hint err" role="alert">{err}</p>}
      <section className="ads-panel" aria-label="The seven checks">
        <div className="ph"><h2>The seven checks</h2>
          <div className="soc-act"><span className="sub">{d.last_ok_at ? `Last read of Meta: ${at(d.last_ok_at)}` : 'Meta hasn’t been read yet'}</span><button className="soc-btn small" type="button" disabled={busy || !d.token} onClick={checkNow}>{busy ? 'Checking…' : 'Check now'}</button></div></div>
        <ul className="ads-board" aria-label="Checks">{d.board.map(c => (
          <li key={c.id} className={`ads-check ${c.status}`}><div className="top"><b>{c.title}</b><Pill s={c.status} /></div><p>{c.headline}</p>{c.detail && <p className="sub">{c.detail}</p>}</li>))}
          {['spend', 'forgotten', 'spike', 'tracking', 'account', 'sales'].filter(id => !cardById(id)).map(id => <li key={id} className="ads-check grey"><div className="top"><b>{{ spend: 'Spending against your ceilings', forgotten: 'Ads that should be off', spike: 'A sudden jump in spending', tracking: 'Tracking: is Meta counting results?', account: 'Payment and account', sales: 'Real sales against Meta’s numbers' }[id]}</b><Pill s="grey" /></div><p>Not checked yet. The first hourly check fills this in.</p></li>)}
        </ul>
      </section>
      <ul className="ads-kpis ads-live-kpis" aria-label="The numbers">
        <li><span className="l">Spent today</span><span className="v">{n.spent_today_cents != null ? usd(n.spent_today_cents) : '—'}</span><span className="d">{d.ceilings.daily_cents ? `of your ${usd(d.ceilings.daily_cents)} daily ceiling` : 'no daily ceiling set'}</span></li>
        <li><span className="l">This month so far</span><span className="v">{n.mtd_cents != null ? usd(n.mtd_cents) : '—'}</span><span className="d">{d.ceilings.monthly_cents ? `of ${usd(d.ceilings.monthly_cents)}${n.projected_cents ? `, on course for ${usd(n.projected_cents)}` : ''}` : 'no monthly ceiling set'}</span></li>
        <li><span className="l">Pixel last fired</span><span className="v">{n.pixel_hours != null ? `${n.pixel_hours < 1 ? '<1' : Math.round(n.pixel_hours)}h ago` : '—'}</span><span className="d">{n.pixel_last_fired ? at(n.pixel_last_fired) : 'unknown'}</span></li>
        <li><span className="l">Account</span><span className="v">{n.account_status || '—'}</span><span className="d">{n.ads_with_issues ? `${n.ads_with_issues} ad${n.ads_with_issues === 1 ? '' : 's'} with issues` : 'no rejected ads'}</span></li>
        <li><span className="l">Running with no end or cap</span><span className="v">{n.open_ended ?? '—'}</span><span className="d">{n.active_campaigns != null ? `${n.active_campaigns} campaign${n.active_campaigns === 1 ? '' : 's'} running in all` : ''}</span></li>
      </ul>
      <section className="ads-panel" aria-label="Open alerts">
        <div className="ph"><h2>Open alerts <span className="sub">{d.alerts.open.length}</span></h2></div>
        {!d.alerts.open.length ? <p className="ops-empty">Nothing is wrong that the safety net can see. It looks again every hour.</p> : (
          <div className="ads-scroll"><table className="ads-table"><thead><tr><th>How serious</th><th>What</th><th>When</th><th>Acknowledge</th></tr></thead>
            <tbody>{d.alerts.open.map(a => <OpenAlert key={a.id} a={a} reload={load} setMsg={setMsg} setErr={setErr} canAct />)}</tbody></table></div>)}
      </section>
      {d.flagged.length > 0 && <section className="ads-panel" aria-label="Campaigns that need a look">
        <div className="ph"><h2>Campaigns that need a look <span className="sub">{d.flagged.length}</span></h2></div>
        <div className="ads-scroll"><table className="ads-table"><thead><tr><th>Campaign</th><th>What is wrong</th><th><span className="sr-only">Open</span></th></tr></thead>
          <tbody>{d.flagged.map(f => <tr key={f.id}><td><b>{f.name}</b><div className="sub">{f.ops_id ? 'Built in Ops' : 'Not built in Ops'}</div></td><td>{f.problems.join('; ')}</td>
            <td><div className="acts">{f.ops_id && <a className="soc-btn small primary" href={`/ops/ads/${f.ops_id}`}>Open it here to pause</a>}<a className="soc-btn small" href={f.manager_url} target="_blank" rel="noreferrer">Open in Meta Ads Manager</a></div></td></tr>)}</tbody></table></div>
        <p className="sub">Pausing is always a person’s decision. Campaigns built in Ops have Pause and Reverse on their own page; for the others, Meta’s own tool opens.</p>
      </section>}
      <section className="ads-panel" aria-label="Recent alerts">
        <div className="ph"><h2>Recent alerts and who was told</h2></div>
        {!d.alerts.recent.length ? <p className="ops-empty">No alerts yet.</p> : (
          <div className="ads-scroll"><table className="ads-table"><thead><tr><th>When</th><th>How serious</th><th>What</th><th>Who was told</th></tr></thead>
            <tbody>{d.alerts.recent.map(a => <tr key={a.id}><td className="sub">{at(a.created_at)}</td><td><Level l={a.level} /> {a.state === 'resolved' && a.level !== 'test' && <span className="sub">cleared {at(a.resolved_at)}</span>}</td><td>{a.title}{a.acked_by && <div className="sub">Acknowledged by {a.acked_by}, {at(a.acked_at)}</div>}</td>
              <td className="sub">{told(a.deliveries.filter(l => l.kind !== 'resolved')) || 'No one yet'}{a.deliveries.some(l => l.kind === 'resolved') && <div>Cleared note: {told(a.deliveries.filter(l => l.kind === 'resolved'))}</div>}</td></tr>)}</tbody></table></div>)}
      </section>
      <aside className="ads-note" aria-label="How the safety net works"><b>How this works</b>
        <p>Every hour it reads your whole Meta ad account, including campaigns that weren’t built here, and checks the seven things above. It never changes anything in Meta. Urgent problems reach you by email, text and WhatsApp at any hour and repeat until you acknowledge them; important ones wait for the morning. If it can’t read Meta, that is itself an alert. Channels: {d.channels.label}.</p></aside>
      {d.can_edit && <section id="safety-settings" aria-label="Safety net settings"><SafetySettings /></section>}
    </div>);
}
