'use client';
import { useEffect, useMemo, useState } from 'react';

const API = '/api/ops/ads-library';
const STANDINGS = ['Proven', 'Promising', 'Not tested', 'Retired'];
const TONE = { Proven: 'good', Promising: 'warn', 'Not tested': 'calm', Retired: 'bad' };
const MEANS = { Proven: 'at or above target in 2 or more campaigns', Promising: 'at or above target once', 'Not tested': 'no campaign has judged it yet', Retired: 'below the floor 3 times' };
const OUTCOME = { 'above target': ['At or above target', 'good'], 'below target': ['Below target', 'warn'], 'below floor': ['Below the floor', 'bad'], 'too early': ['Too early to judge', 'calm'], 'not judged': ['Not judged', 'calm'] };
const day = iso => iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'America/New_York' }) : '';
const usd = c => '$' + ((c || 0) / 100).toLocaleString('en-US', { maximumFractionDigits: 2 });
const call = async (body) => { const res = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }), j = await res.json().catch(() => ({})); if (!res.ok) throw new Error(j.error || 'That didn’t work. Try again in a moment.'); return j; };

const Standing = ({ s }) => <span className={`ads-pill ${TONE[s] || 'calm'}`} title={MEANS[s]}>{s}</span>;
const Tags = ({ tags }) => tags?.length ? <span className="ads-tags">{tags.map(t => <span key={t} className="ads-tag">{t}</span>)}</span> : <span className="sub">no tags yet</span>;

// The quiz's anonymous counts, always with where they came from
function ReportNote({ report }) {
  if (report?.connected) return null;
  return <p className="ads-mode" role="status"><b>{report?.reason || 'The Practice Report isn’t connected yet.'}</b> {report?.todo} Everything else here still works.</p>;
}

export default function Library() {
  const [d, setD] = useState(null), [err, setErr] = useState(''), [msg, setMsg] = useState(''), [f, setF] = useState('all'), [tag, setTag] = useState(''), [q, setQ] = useState(''), [open, setOpen] = useState(''), [use, setUse] = useState('');
  const load = () => fetch(API).then(r => r.json().then(j => r.ok ? (setD(j), setErr('')) : setErr(j.error || 'Couldn’t read the Audience library'))).catch(() => setErr('Couldn’t read the Audience library'));
  useEffect(() => { load(); const a = new URLSearchParams(window.location.search).get('audience'); if (a) setOpen(a); }, []);
  const pick = id => { setOpen(id); setMsg(''); try { const u = new URL(window.location.href); id ? u.searchParams.set('audience', id) : u.searchParams.delete('audience'); history.replaceState(null, '', u); } catch {} };
  const rows = d?.rows || [];
  const shown = useMemo(() => rows.filter(r => (f === 'all' || r.standing === f) && (!tag || r.tags.includes(tag)) && (!q.trim() || (r.name + ' ' + r.description + ' ' + r.tags.join(' ')).toLowerCase().includes(q.trim().toLowerCase()))), [rows, f, tag, q]);
  if (err && !d) return <p className="hint err" role="alert">{err}</p>;
  if (!d) return <p className="ops-empty">Reading the Audience library…</p>;
  if (open) return <Detail id={open} back={() => { pick(''); load(); }} onUse={() => setUse(open)} use={use === open} closeUse={() => setUse('')} reload={load} />;
  return (
    <div className="ads">
      <ReportNote report={d.report} />
      <ul className="ads-kpis ads-live-kpis" aria-label="The library at a glance">
        {STANDINGS.map(s => <li key={s}><span className="l">{s}</span><span className="v">{d.counts[s] || 0}</span><span className="d">{MEANS[s]}</span></li>)}
      </ul>
      {msg && <p className="hint" role="status">{msg}</p>}
      <section className="ads-panel" aria-label="Audiences">
        <div className="ph"><h2>Audiences</h2>
          <div className="ads-seg" role="group" aria-label="Show">{[['all', 'All', rows.length], ...STANDINGS.map(s => [s, s, d.counts[s] || 0])].map(([k, l, n]) => <button key={k} type="button" aria-pressed={f === k} onClick={() => setF(k)}>{l} <span className="n">{n}</span></button>)}</div></div>
        <div className="ads-inline">
          <label className="wide">Search<input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="A name, a topic or a tag" /></label>
          <label>Tag<select value={tag} onChange={e => setTag(e.target.value)}><option value="">Any tag</option>{d.tags.map(t => <option key={t} value={t}>{t}</option>)}</select></label>
        </div>
        {!shown.length ? (
          <p className="ops-empty">{rows.length ? 'No audience matches that. Clear the search or the filters to see them all.' : d.exists ? 'No audiences yet. The library fills itself each morning with every audience a campaign has used, along with how it did.' : 'No audiences yet. Once a campaign has run in Meta, every audience it used appears here, with how it did.'}</p>
        ) : (
          <div className="ads-scroll"><table className="ads-table">
            <thead><tr><th>Audience</th><th>Standing</th><th>Campaigns</th><th>Best result</th><th>Tags (what it buys)</th><th><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>{shown.map(r => (
              <tr key={r.id}>
                <td><button type="button" className="ads-name ads-linkbtn" onClick={() => pick(r.id)}>{r.name}</button>{r.description && <div className="sub">{r.description}</div>}</td>
                <td><Standing s={r.standing} />{r.brought_back && <div className="sub">Brought back by {r.brought_back.by}, {day(r.brought_back.at)}</div>}</td>
                <td className="num">{r.campaigns_count || 0}</td><td className="num">{r.best || '—'}</td><td><Tags tags={r.tags} /></td>
                <td><div className="acts"><button className="soc-btn small" type="button" onClick={() => { pick(r.id); setUse(r.id); }}>Use in a campaign</button></div></td>
              </tr>))}</tbody></table></div>)}
      </section>
      <Ideas d={d} />
      <aside className="ads-note" aria-label="How standing works"><b>How standing works</b>
        <p>Each campaign is judged by its own target and floor, after at least {usd(d.thresholds.min_spend_cents)} over {d.thresholds.min_days} days. Proven: at or above target in {d.thresholds.proven_after} or more campaigns. Promising: {d.thresholds.promising_after}. Retired: below the floor {d.thresholds.retire_after} times. These numbers are set in Settings by the directors. Standing is worked out each morning, not typed.</p></aside>
    </div>);
}

// New audience ideas from the Practice Report: sentences only, nothing is sent anywhere
function Ideas({ d }) {
  return (
    <section className="ads-panel" aria-label="New audience ideas">
      <div className="ph"><h2>New audience ideas</h2><span className="sub">From the Practice Report (the quiz): anonymous counts</span></div>
      {!d.report?.connected ? <p className="ops-empty">The Practice Report isn’t connected yet, so there are no ideas from the quiz. Add REPORT_DATABASE_URL in Vercel to turn them on.</p>
        : d.ideas?.items?.length ? <>
          <ul className="ads-ideas">{d.ideas.items.map(i => <li key={i.archetype}>{i.text}</li>)}</ul>
          <p className="sub">Counted from {d.ideas.total.toLocaleString('en-US')} quiz results since {day(d.ideas.since)}. These are ideas only: no names, emails or quiz answers go to Meta from here. Building a lookalike from quiz takers needs a separate decision first.</p></>
        : <p className="ops-empty">{d.ideas_error || 'The quiz has no results in the last 90 days to suggest from yet.'}</p>}
    </section>);
}

function Detail({ id, back, onUse, use, closeUse, reload }) {
  const [a, setA] = useState(null), [err, setErr] = useState(''), [msg, setMsg] = useState(''), [tags, setTags] = useState(''), [busy, setBusy] = useState(false);
  const read = () => fetch(`${API}?id=${encodeURIComponent(id)}`).then(r => r.json().then(j => r.ok ? (setA(j), setTags(j.tags.join(', '))) : setErr(j.error || 'Couldn’t read this audience'))).catch(() => setErr('Couldn’t read this audience'));
  useEffect(() => { read(); }, [id]);
  if (err && !a) return <div className="ads"><p className="crumb"><button className="ads-linkbtn" onClick={back}>Audience library</button></p><p className="hint err" role="alert">{err}</p></div>;
  if (!a) return <p className="ops-empty">Opening the audience…</p>;
  const run = async (body, ok) => { setErr(''); setMsg(''); setBusy(true); try { const j = await call(body); setMsg(ok || j.message || 'Saved.'); await read(); reload(); } catch (e) { setErr(e.message); } finally { setBusy(false); } };
  const bring = () => { if (confirm('Bring this audience back?\n\nIt returns to the library and is suggested for new campaigns again. Its earlier strikes are forgiven; new ones count from here. Your name and today’s date are kept.')) run({ action: 'bringBack', id, confirm: true }); };
  return (
    <div className="ads ads-detail">
      <p className="crumb"><button type="button" className="ads-linkbtn" onClick={back}>Audience library</button> / {a.name}</p>
      <div className="ads-head">
        <div><h2>{a.name}</h2><p className="sub"><Standing s={a.standing} /> {a.campaigns_count || 0} campaign{a.campaigns_count === 1 ? '' : 's'}{a.best ? ` · best result ${a.best}` : ''}{a.description ? ` · ${a.description}` : ''}</p>
          {a.brought_back && <p className="sub">Brought back by {a.brought_back.by} on {day(a.brought_back.at)}.</p>}</div>
        <div className="soc-act">{a.standing === 'Retired' && <button className="soc-btn small" disabled={busy} onClick={bring}>Bring back</button>}<button className="soc-btn small primary" onClick={onUse}>Use in a campaign</button></div>
      </div>
      {err && <p className="hint err" role="alert">{err}</p>}{msg && <p className="hint" role="status">{msg}</p>}
      {use && <UseIn audience={a} close={closeUse} done={m => { closeUse(); setMsg(m); }} />}
      <div className="ads-cols">
        <div className="stack">
          <section className="ads-panel" aria-label="Its result in every campaign">
            <div className="ph"><h2>Its result in every campaign</h2></div>
            {!a.results.length ? <p className="ops-empty">It hasn’t run in a campaign yet.</p> : (
              <div className="ads-scroll"><table className="ads-table">
                <thead><tr><th>Campaign</th><th>Goal</th><th>Spent</th><th>Result</th><th>Against its rules</th><th>How it did</th></tr></thead>
                <tbody>{a.results.map(r => (
                  <tr key={r.campaign_id}><td><a className="ads-name" href={`/ops/ads/${r.campaign_id}`}>{r.campaign}</a></td><td>{r.goal}</td><td className="num">{usd(r.spend_cents)}</td><td className="num">{r.value}</td><td className="sub">{r.target || '—'}</td>
                    <td><span className={`ads-pill ${(OUTCOME[r.outcome] || [])[1] || 'calm'}`}>{(OUTCOME[r.outcome] || [r.outcome || '—'])[0]}</span></td></tr>))}</tbody></table></div>)}
          </section>
          <section className="ads-panel" aria-label="What it does and doesn’t buy">
            <div className="ph"><h2>What it does and doesn’t buy</h2></div>
            <ul className="ads-says">{a.says.map((l, i) => <li key={i}>{l}</li>)}</ul>
            <form className="ads-inline" onSubmit={e => { e.preventDefault(); run({ action: 'setTags', id, tags: tags.split(',').map(t => t.trim()).filter(Boolean) }, 'Tags saved.'); }}>
              <label className="wide">Tags: the course types and topics it buys (separated by commas)<input value={tags} onChange={e => setTags(e.target.value)} placeholder="for example: kali, tantra, enrollment" /></label>
              <button className="soc-btn small" disabled={busy} type="submit">Save tags</button>
            </form>
          </section>
        </div>
        <div className="stack">
          <Overlap a={a} />
          <section className="ads-panel" aria-label="Its exact Meta settings">
            <div className="ph"><h2>Its Meta settings</h2></div>
            <p className="sub">Saved exactly as Meta takes them, so it can be reused.</p>
            <details className="ads-more"><summary>Show the settings</summary><pre className="ads-json" tabIndex={0}>{JSON.stringify(a.settings, null, 2)}</pre></details>
          </section>
        </div>
      </div>
    </div>);
}

// Which quiz archetypes it overlaps with (anonymous counts of the people who came from the campaigns it ran in)
function Overlap({ a }) {
  const o = a.overlap || {};
  return (
    <section className="ads-panel" aria-label="Quiz archetypes it overlaps with">
      <div className="ph"><h2>Quiz archetypes it overlaps with</h2></div>
      {o.state === 'not_connected' ? <p className="ops-empty">The Practice Report isn’t connected yet, so this can’t be shown. Add REPORT_DATABASE_URL in Vercel to turn it on.</p>
        : o.state === 'error' ? <p className="ops-empty">{o.note}</p>
        : o.state === 'none' || !o.rows ? <p className="ops-empty">No quiz taker has been matched to this audience’s campaigns yet (the links on the ads carry tags, and none of the quiz results carry these). Nothing is guessed.</p>
        : <>
          <ul className="ads-facts-list">{o.rows.map(r => <li key={r.archetype}><b>{r.archetype}</b><span>{r.count.toLocaleString('en-US')} · {r.share}%</span></li>)}</ul>
          <p className="sub">From the Practice Report: anonymous counts of the {o.total.toLocaleString('en-US')} quiz takers who arrived from {o.level === 'ad set' ? 'this audience’s ad sets' : 'the campaigns this audience ran in'}, last 90 days.{o.level === 'campaign' ? ' The tags on the links name the campaign, not the ad set, so this is the whole campaign’s mix.' : ''}</p></>}
    </section>);
}

// "Use in a campaign": one of the current drafts, one of its five ad sets
function UseIn({ audience, close, done }) {
  const [drafts, setDrafts] = useState(null), [cid, setCid] = useState(''), [slot, setSlot] = useState(''), [ok, setOk] = useState(false), [err, setErr] = useState(''), [busy, setBusy] = useState(false);
  useEffect(() => { fetch(`${API}?drafts=1`).then(r => r.json()).then(j => setDrafts(j.drafts || [])).catch(() => setDrafts([])); }, []);
  const c = drafts?.find(x => x.id === cid), retired = audience.standing === 'Retired';
  const go = async () => {
    setErr(''); setBusy(true);
    try { const j = await call({ action: 'useInCampaign', id: audience.id, campaign_id: cid, adset_id: slot, confirm_retired: ok }); done(`${j.message}`); } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  return (
    <section className="ads-panel ads-pick" aria-label="Use in a campaign">
      <div className="ph"><h2>Use in a campaign</h2><button className="soc-btn small" type="button" onClick={close}>Cancel</button></div>
      {!drafts ? <p className="ops-empty">Looking for your drafts…</p> : !drafts.length ? (
        <p className="ops-empty">There is no draft campaign to put it in. Start one from a program’s <a href="/ops/programs">Launch</a> tab by switching on “Run Meta ads for this launch”, then come back.</p>
      ) : <>
        <label>Draft campaign<select value={cid} onChange={e => { setCid(e.target.value); setSlot(''); }}><option value="">Choose a draft</option>{drafts.map(x => <option key={x.id} value={x.id}>{x.name}{x.mine ? ' (yours)' : ''}</option>)}</select></label>
        {c && !c.slots.length && <p className="ads-mode" role="status">That draft is Advantage+ (one ad set where Meta finds the audience), so there is no slot to swap into. Switch it to a targeting test on its page first.</p>}
        {c?.slots.length > 0 && <label>Which ad set does it replace?<select value={slot} onChange={e => setSlot(e.target.value)}><option value="">Choose an ad set</option>{c.slots.map(s => <option key={s.id} value={s.id}>Ad set {s.position}: {s.audience}</option>)}</select></label>}
        {retired && <label className="ads-toggle"><input type="checkbox" checked={ok} onChange={e => setOk(e.target.checked)} /> <span>This audience was retired: it fell below the floor {audience.strikes} times. I want to use it anyway.</span></label>}
        {err && <p className="hint err" role="alert">{err}</p>}
        <div className="soc-act"><button className="soc-btn primary" disabled={busy || !cid || !slot || (retired && !ok)} onClick={go}>{busy ? 'Swapping…' : 'Swap it in'}</button>
          {c && <a className="soc-btn" href={`/ops/ads/${c.id}`}>Open that draft</a>}</div>
        <p className="sub">Nothing is sent to Meta. The draft’s ad set takes this audience’s settings; you review the draft as usual. For a brand-new campaign, switch on the ads question on a program’s <a href="/ops/programs">Launch</a> tab.</p></>}
    </section>);
}
