'use client';
import { useCallback, useEffect, useState } from 'react';
import { usd, Pill, ModeNote, TYPES, fmt } from './Campaigns';
import Relaunch from './Relaunch';

const API = '/api/ops/ads';
const post = async body => { const res = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); const j = await res.json().catch(() => ({})); if (!res.ok) throw new Error(j.error || 'That didn’t work. Try again in a moment.'); return j; };
const day = d => d ? new Date(d + 'T12:00:00Z').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }) : 'no date';
const at = iso => new Date(iso).toLocaleString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) + ' ET';
const Trend = ({ trend, metric }) => {
  const vals = trend.map(t => (t.value == null || t.value === Infinity ? null : t.value)), max = Math.max(0.01, ...vals.filter(v => v != null));
  return <span className="ads-trend" role="img" aria-label={`Last three days: ${trend.map(t => `${day(t.date)} ${fmt(metric, t.value)}`).join(', ')}`}>
    {vals.map((v, i) => <i key={i} className={v == null ? 'none' : ''} style={{ height: `${v == null ? 8 : Math.max(8, Math.round((metric === 'cpl' ? (1 - v / (max * 1.2)) + 0.1 : v / max) * 100))}%` }} />)}</span>;
};

export default function Live({ id, first }) {
  const [d, setD] = useState(first || null), [err, setErr] = useState(''), [msg, setMsg] = useState(''), [busy, setBusy] = useState('');
  const load = useCallback(async () => {
    const res = await fetch(`${API}?id=${encodeURIComponent(id)}`).catch(() => null), j = await res?.json().catch(() => ({})) || {};
    if (!res?.ok) { setErr(j.error || 'Couldn’t read this campaign'); return; }
    setErr(''); setD(j);
  }, [id]);
  useEffect(() => { if (!first) load(); }, [first, load]);
  useEffect(() => { if (d && window.location.hash.startsWith('#change-')) document.getElementById(window.location.hash.slice(1))?.scrollIntoView({ block: 'center' }); }, [!!d]);   // eslint-disable-line react-hooks/exhaustive-deps
  if (!d) return err ? <p className="hint err" role="alert">{err}</p> : <p className="ops-empty">Opening the campaign…</p>;
  const c = d.campaign, v = d.live, lead = v.metric === 'cpl', unit = lead ? 'Cost per lead' : 'Return on ad spend', results = lead ? 'Leads' : 'Purchases';
  const traffic = c.goal === 'Traffic', cap = v.cap_cents, pct = cap ? Math.min(100, Math.round((v.spent_cents / cap) * 100)) : 0;
  const go = async (body, ask, ok) => { if (ask && !confirm(ask)) return; setErr(''); setMsg(''); setBusy(body.action); try { const j = await post({ ...body, id, ...(ask ? { confirm: true } : {}) }); setMsg(j.message || ok || ''); await load(); } catch (e) { setErr(e.message); } setBusy(''); };
  const dry = d.mode !== 'live';
  const sync = v.synced;
  const Act = ({ a }) => (
    <li id={`change-${a.id}`}>
      <div className="t"><div className="meta"><b>{a.label}</b>{a.dry_run && a.kind !== 'hold' && !a.failed && <span className="ads-pill dry">Dry run</span>}{a.failed && <span className="ads-pill bad">Didn’t go through</span>}{a.reversed && <span className="ads-pill calm">Reversed{a.reversed_by ? ` by ${a.reversed_by}` : ''}</span>}</div>
        <span>{a.detail}</span><span className="sub">{a.by} · {at(a.at)}{a.dry_run && a.kind !== 'hold' && !a.failed ? ' · would have, nothing was changed' : ''}</span></div>
      {a.can_reverse && <button className="soc-btn small" disabled={!!busy} aria-label={`Reverse: ${a.label}`} onClick={() => go({ action: 'reverse', action_id: a.id }, 'Reverse this change?\n\nThe earlier value is put back in Meta. If it has been changed again since, nothing is done.')}>Reverse</button>}
    </li>);
  return (
    <div className="ads ads-draft ads-live">
      <p className="crumb"><a href="/ops/ads">Ads</a> / {c.status === 'sent_paused' ? 'In Meta, paused' : 'Running'}</p>
      <div className="ads-head">
        <div><h2>{c.name}</h2>
          <p className="sub">{c.goal} · {TYPES[c.structure]}, {d.adsets.length} ad set{d.adsets.length === 1 ? '' : 's'}, {d.ads.length} ads · {c.start_date ? `${day(c.start_date)} to ${day(c.end_date)}` : 'no dates'}{d.launch ? <> · <a href={d.launch.event_id ? `/ops/programs/${d.launch.event_id}?tab=launch&id=${d.launch.id}` : `/ops/programs?view=launches&id=${d.launch.id}`}>{d.launch.name}</a></> : null} <Pill status={c.status} /></p></div>
        <div className="soc-act">
          {c.status === 'live' && <button className="soc-btn" disabled={!!busy} onClick={() => go({ action: 'pauseCampaign' }, dry ? 'Pause the campaign?\n\nThe safety switch is off, so this is a dry run: nothing is sent.' : 'Pause this campaign now?\n\nNothing more is spent until you start it again.')}>{busy === 'pauseCampaign' ? 'Pausing…' : 'Pause'}</button>}
          {c.status === 'paused' && <button className="soc-btn primary" disabled={!!busy} onClick={() => go({ action: 'resumeCampaign' }, dry ? 'Start the campaign again?\n\nThe safety switch is off, so this is a dry run: nothing is sent.' : 'Start this campaign again?\n\nIt will begin spending its daily budget.')}>{busy === 'resumeCampaign' ? 'Starting…' : 'Start again'}</button>}
          {c.status === 'sent_paused' && <button className="soc-btn primary" disabled={!!busy} onClick={() => go({ action: 'start' }, dry ? 'Start the campaign?\n\nThe safety switch is off, so this is a dry run: nothing is sent.' : 'Start this campaign now?\n\nIt will begin spending your daily budget.')}>{busy === 'start' ? 'Starting…' : 'Start'}</button>}
          <Relaunch campaign={{ id: c.id, name: c.name, daily_cents: c.daily_budget_cents }} />
          <a className="soc-btn" href="?step=1">See the draft steps</a></div>
      </div>
      <ModeNote d={d} />
      {d.relaunches?.length > 0 && <p className="ads-mode" role="status">New drafts made from this campaign: {d.relaunches.map((x, i) => <span key={x.id}>{i > 0 && ', '}<a href={`/ops/ads/${x.id}`}>{x.name}</a> ({x.status === 'draft' ? 'draft' : 'sent to Meta'})</span>)}.</p>}
      {err && <p className="hint err" role="alert">{err}</p>}{msg && <p className="hint" role="status">{msg}</p>}

      <ul className="ads-kpis ads-live-kpis" aria-label="This campaign at a glance">
        <li><span className="l">Spent so far</span><span className="v">{usd(v.spent_cents)}</span><span className="d">{cap ? `of a ${usd(cap)} spending cap` : 'no spending cap set'}</span>{cap > 0 && <span className="ads-bar" role="img" aria-label={`${pct}% of the cap`}><span style={{ width: `${pct}%` }} /></span>}</li>
        <li><span className="l">{unit}, last 3 days</span><span className="v">{fmt(v.metric, v.value72)}</span><span className="d">{usd(v.spend72_cents)} spent in that time</span></li>
        <li><span className="l">Daily budget</span><span className="v">{usd(d.total_cents)}</span><span className="d">{c.budget_mode === 'campaign' ? 'one budget for the campaign' : 'across the ad sets'}</span></li>
        <li><span className="l">Results last read</span><span className="v" style={{ fontSize: 20 }}>{sync ? (sync.ok ? at(sync.at) : 'Not working') : 'Not yet'}</span><span className="d">{sync ? (sync.ok ? 'from Meta, every hour' : sync.error) : 'the first hourly read comes soon after it starts'}</span></li>
      </ul>

      {v.real && <section className="ads-panel" aria-label="Real sales"><div className="ph"><h2>Real sales</h2><span className="sub">what Kit and Circle say actually sold</span></div>{v.real.map((t, i) => <p key={i} className="hint">{t}</p>)}</section>}

      <section className="ads-panel" aria-label="Results by ad set">
        <div className="ph"><h2>Results by ad set</h2><span className="sub">last 3 full days ({day(v.window.from)} to {day(v.window.to)}), the same numbers the rules judge on</span></div>
        <div className="ads-scroll"><table className="ads-table">
          <thead><tr><th>Ad set</th><th>Budget / day</th><th>Spent so far</th><th>Spent, 3 days</th><th>{unit}</th><th>{results}</th><th>Trend</th><th>Status</th></tr></thead>
          <tbody>{v.adsets.map(a => (
            <tr key={a.id}>
              <td><b>{a.position} · {String(a.name).replace(/^Interests · /, '')}</b><div className="sub">{a.label}</div>
                <details className="ads-more"><summary>The {a.ads.length} ads</summary><div className="ads-scroll"><table className="ads-table"><thead><tr><th>Ad</th><th>Spent, 3 days</th><th>{unit}</th><th>{results}</th><th>Status</th></tr></thead>
                  <tbody>{a.ads.map(x => <tr key={x.id}><td>{x.name}</td><td className="num">{usd(x.spend72_cents)}</td><td className="num">{fmt(v.metric, x.value72)}</td><td className="num">{lead ? x.leads72 : x.purchases72}</td><td>{x.status === 'off' ? 'Paused by the rules' : 'On'}</td></tr>)}</tbody></table></div></details></td>
              <td className="num">{usd(a.daily_budget_cents)}</td><td className="num">{usd(a.spent_cents)}</td><td className="num">{usd(a.spend72_cents)}</td>
              <td className="num">{fmt(v.metric, a.value72)}</td><td className="num">{lead ? a.leads72 : a.purchases72}</td>
              <td><Trend trend={a.trend} metric={v.metric} /></td><td>{a.status === 'off' ? <span className="ads-pill calm">Turned off</span> : c.status === 'live' ? <span className="ads-pill good">On</span> : <span className="ads-pill calm">Paused</span>}</td>
            </tr>))}</tbody></table></div>
        {!v.adsets.some(a => a.spent_cents) && <p className="ops-empty">No results yet. Meta’s numbers arrive an hour or so after a campaign starts spending.</p>}
      </section>

      <div className="ads-cols">
        <section className="ads-panel" aria-label="What the Ad Agent did today">
          <div className="ph"><h2>What the Ad Agent did today</h2><span className="sub">Ops’ automatic rules, with Reverse</span></div>
          {c.rules_on && !d.locks?.open && <p className="ads-mode" role="status"><b>{d.locks?.text || 'Dry run — nothing was changed'}.</b> Ops’ rules are only watching, beside Make’s.</p>}
          {!v.today.length ? <p className="ops-empty">{c.rules_on ? 'Nothing yet today. The rules run every morning.' : traffic ? 'Traffic campaigns have no automatic rules.' : 'The rules are switched off for this campaign, so nothing is done automatically.'}</p> : <ul className="ads-acts">{v.today.map(a => <Act key={a.id} a={a} />)}</ul>}
          {v.earlier.length > 0 && <details className="ads-more"><summary>Earlier changes ({v.earlier.length})</summary><ul className="ads-acts">{v.earlier.map(a => <Act key={a.id} a={a} />)}</ul></details>}
        </section>
        <aside className="ads-panel" aria-label="The rules in force">
          <div className="ph"><h2>The rules in force</h2></div>
          {traffic ? <p className="ops-empty">Traffic campaigns have no automatic rules.</p> : <>
            <label className="ads-toggle"><input type="checkbox" aria-label="Apply these rules each morning" checked={!!c.rules_on} disabled={!!busy} onChange={e => go({ action: 'setRules', rules_on: e.target.checked }, '', e.target.checked ? 'The rules are switched on for this campaign.' : 'The rules are switched off for this campaign.')} /> <b>Apply these rules each morning</b></label>
            <p className="sub">{c.rules_on ? (d.locks?.open ? 'On, and every lock is open: the rules change this campaign in Meta each morning.' : 'On, but as a dry run: the rules say what they would do and change nothing in Meta.') : 'Off. Nothing is changed automatically.'}</p>
            <ul className="ads-ruleslist">{v.rule_lines.map((l, i) => <li key={i}>{l}</li>)}</ul>
            <p className="sub">The rules were set when the campaign was drafted. They can’t be changed once it is in Meta.</p></>}
        </aside>
      </div>
    </div>);
}
