'use client';
import { useEffect, useState } from 'react';
import { usd, fmt } from './Campaigns';

const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
const TOP = { best: 'Best so far', weakest: 'Weakest so far' };

// The result in plain words: a return on sales ads, a cost per lead on lead ads
const resultText = (g, r) => g.metric === 'cpl' ? (r.value == null ? 'no leads yet' : `${fmt('cpl', r.value)} a lead`) : r.value == null ? 'no sales yet' : `${fmt('roas', r.value)} back`;
const countText = (g, r) => g.metric === 'cpl' ? plural(r.leads, 'lead') : plural(r.purchases, 'sale');

const Verdict = ({ r }) => (
  <span className="ads-cr-says">
    <span className={`ads-pill ${r.verdict.tone}`} title={r.verdict.why}>{r.verdict.label}</span>
    {r.standing && <span className="ads-pill calm">{TOP[r.standing]}</span>}
    <span className="sub">{r.verdict.why}</span>
  </span>);

const Thumb = ({ r }) => r.thumb ? <img className="ads-cr-thumb" src={r.thumb} alt="" width="56" height="56" loading="lazy" /> : <span className="ads-cr-thumb blank">{r.video ? 'Video' : 'No picture'}</span>;

// Where it ran: the fairness part. Said first when it is one audience only; the audiences and campaigns, with links that only open things, are one tap away.
function Where({ r }) {
  return (
    <div className="ads-cr-where">
      {r.one_audience && <span className="ads-pill warn">Ran in only one audience</span>}
      <details className="ads-more">
        <summary>{plural(r.ads, 'ad')} · {plural(r.adsets, 'ad set')} · {plural(r.audiences.length, 'audience')} · {plural(r.campaigns.length, 'campaign')}</summary>
        <p className="sub">Audiences, by what each spent</p>
        <ul className="ads-cr-list">{r.audiences.map(a => <li key={a.name}>{a.name} <span className="sub">{usd(a.spend_cents)}</span></li>)}</ul>
        <p className="sub">Campaigns</p>
        <ul className="ads-cr-list">{r.campaigns.map(c => (
          <li key={c.id}><span>{c.name} <span className="sub">{usd(c.spend_cents)}</span></span>
            <span className="ads-cr-links">
              <a className="ads-cr-link" href={c.ops_url} aria-label={`Open ${c.name} in Ops`}>Open in Ops</a>
              {c.manager_url && <a className="ads-cr-link" href={c.manager_url} target="_blank" rel="noopener noreferrer" aria-label={`Open ${c.name} in Meta’s Ads Manager (opens a new tab)`}>Open in Ads Manager</a>}
            </span></li>))}</ul>
      </details>
    </div>);
}

const Numbers = ({ g, r }) => (
  <span className="ads-cr-nums">
    <span><b>{usd(r.spend_cents)}</b> spent</span><span><b>{resultText(g, r)}</b></span><span>{countText(g, r)}</span>
    <span>{r.ctr == null ? 'no clicks counted' : `${r.ctr}% clicked`}</span>
  </span>);

function Pictures({ g }) {
  return (
    <section className="ads-panel" aria-label="Pictures">
      <div className="ph"><h2>Pictures</h2><span className="sub">Each picture’s ads added together, best first</span></div>
      <div className="ads-scroll" tabIndex={0} role="region" aria-label="Pictures table, scrolls sideways on a small screen">
        <table className="ads-table">
          <thead><tr><th>Picture</th><th>How it did</th><th>Spent</th><th>{g.metric === 'cpl' ? 'Cost per lead' : 'Return'}</th><th>{g.metric === 'cpl' ? 'Leads' : 'Sales'}</th><th>Clicked</th><th>Where it ran</th></tr></thead>
          <tbody>{g.images.map(r => (
            <tr key={r.key}>
              <td><span className="ads-cr-pic"><Thumb r={r} /><b>{r.name}</b></span></td>
              <td><Verdict r={r} /></td>
              <td className="num">{usd(r.spend_cents)}</td>
              <td className="num">{r.value == null ? '—' : fmt(g.metric, r.value)}</td>
              <td className="num">{g.metric === 'cpl' ? r.leads : r.purchases}</td>
              <td className="num">{r.ctr == null ? '—' : `${r.ctr}%`}</td>
              <td><Where r={r} /></td>
            </tr>))}</tbody>
        </table>
      </div>
    </section>);
}

// The words, as saved on the ads. They ran together, so the result belongs to the whole line-up (see lib/ops/adscreative.js)
function Words({ texts, heads }) {
  return (
    <ol className="ads-cr-texts" aria-label={heads ? 'Headlines' : 'The words, as saved on the ad'}>
      {texts.map((t, i) => <li key={i}>{t.headline && <b>{t.headline}</b>}{!heads && t.body && <span>{t.body}</span>}</li>)}
    </ol>);
}

function WordsPanel({ g }) {
  return (
    <section className="ads-panel" aria-label="Words">
      <div className="ph"><h2>Words</h2><span className="sub">The texts that ran together, best first</span></div>
      <p className="ads-note-in">Every ad carries all its texts and Meta mixes them, so Ops cannot say which single text did better. Each result below belongs to the whole set of texts that ran together. To compare one text against another, run them in separate ads.</p>
      <ul className="ads-cr-cards">{g.copy.map(r => (
        <li key={r.key} className="ads-cr-card">
          <Verdict r={r} /><Numbers g={g} r={r} />
          <Words texts={r.texts} />
          {r.together && <span className="sub">{plural(r.texts.length, 'text')} that ran together in every one of these ads.</span>}
          <Where r={r} />
        </li>))}</ul>
    </section>);
}

function Pairs({ g }) {
  return (
    <section className="ads-panel" aria-label="Pictures with words">
      <div className="ph"><h2>Pictures with words</h2><span className="sub">Each picture together with the words it ran beside, once it has spent at least {usd(g.min_spend_cents)}</span></div>
      {!g.pairs.length ? <p className="ops-empty">No picture and words together have spent {usd(g.min_spend_cents)} yet.</p> : (
        <ul className="ads-cr-cards">{g.pairs.map(r => (
          <li key={r.key} className="ads-cr-card">
            <span className="ads-cr-pic"><Thumb r={r} /><b>{r.name}</b></span>
            <Words texts={r.texts} heads />
            <Verdict r={r} /><Numbers g={g} r={r} /><Where r={r} />
          </li>))}</ul>)}
      {g.pairs_hidden > 0 && <p className="sub">{plural(g.pairs_hidden, 'other pairing')} not shown: not enough spent yet.</p>}
    </section>);
}

export default function Creative() {
  const [d, setD] = useState(null), [err, setErr] = useState(''), [kind, setKind] = useState('');
  useEffect(() => { fetch('/api/ops/ads-creative').then(r => r.json().then(j => r.ok ? setD(j) : setErr(j.error || 'Couldn’t read the creative results'))).catch(() => setErr('Couldn’t read the creative results')); }, []);
  if (err && !d) return <p className="hint err" role="alert">{err}</p>;
  if (!d) return <p className="ops-empty">Reading the results…</p>;
  const t = d.thresholds, groups = d.groups.map(g => ({ ...g, min_spend_cents: t.min_spend_cents })), g = groups.find(x => x.key === kind) || groups[0];
  const count = k => g ? g.images.filter(r => r.verdict.key === k).length : 0;
  const empty = !d.exists ? 'No ads have been built here yet. Once a campaign has been sent to Meta and has run, how its pictures and words did appears here.'
    : !d.in_meta ? 'No campaign has been sent to Meta yet, so there is nothing to look at.'
    : !groups.length ? 'Nothing has run long enough yet. Once the ads have spent money and Meta’s numbers have been read (every hour), they appear here.' : '';
  return (
    <div className="ads">
      {!d.connected && <p className="ads-mode warn" role="status"><b>Meta isn’t connected here.</b> What is below was kept the last time Meta’s numbers were read, and will not be refreshed until it is connected.</p>}
      <aside className="ads-note" aria-label="How to read this"><b>How to read this</b>
        <p>These are Meta’s numbers for the ads built here: what Meta says each ad spent and brought back. Real sales from Kit and Circle are not counted. The line is ${t.sales_line.toFixed(2)} back for every $1 spent (or ${t.lead_line.toFixed(2)} a lead for lead ads). A result only counts after at least {usd(t.min_spend_cents)} spent and {t.min_purchases} sales ({t.min_leads} leads), and before that it says “Too early to say”. The same picture or words can run in different audiences and budgets, so each row says where it ran. This page only shows. It changes nothing and never chooses a picture or words for you.</p>
        {d.synced_at && <p>Meta’s numbers were last read {new Date(d.synced_at).toLocaleString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })} ET.</p>}</aside>
      {empty ? <p className="ops-empty" role="status">{empty}</p> : <>
        {groups.length > 1 && <div className="ads-seg" role="group" aria-label="Kind of ads">{groups.map(x => <button key={x.key} type="button" aria-pressed={x.key === g.key} onClick={() => setKind(x.key)}>{x.key === 'leads' ? 'Lead ads' : 'Sales ads'} <span className="n">{x.campaigns}</span></button>)}</div>}
        <p className="sub">{g.key === 'leads' ? 'Lead ads' : 'Sales ads'}: {plural(g.campaigns, 'campaign')} so far. {g.key === 'leads' ? 'Judged on cost per lead.' : 'Judged on the return on ad spend.'}</p>
        {g.images.every(r => r.verdict.key === 'early') && <p className="ads-mode" role="status"><b>Nothing has run long enough yet to judge.</b> The numbers are shown, but none is far enough along to say what to keep or retire.</p>}
        <ul className="ads-kpis" aria-label="Pictures at a glance">
          <li><span className="l">Ahead of the line</span><span className="v">{count('ahead')}</span><span className="d">{plural(count('ahead'), 'picture')}</span></li>
          <li><span className="l">Behind the line</span><span className="v">{count('behind')}</span><span className="d">{plural(count('behind'), 'picture')}</span></li>
          <li><span className="l">Too early to say</span><span className="v">{count('early')}</span><span className="d">{plural(count('early'), 'picture')}</span></li>
        </ul>
        <Pictures g={g} /><WordsPanel g={g} /><Pairs g={g} />
        {d.left_out.traffic > 0 && <p className="sub">{plural(d.left_out.traffic, 'traffic campaign')} left out: it has no sales or leads to judge.</p>}
      </>}
    </div>);
}
