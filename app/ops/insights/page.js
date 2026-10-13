import Shell, { opsUser } from '../Shell';
import { loadMetrics, METRICS_URL } from '@/lib/ops/metrics';
import { readTab } from '@/lib/sheet';
import { todayET } from '@/lib/events';
import Trend from './Trend';
import { loadFunnel, PERIODS } from '@/lib/ops/funnel';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Insights — Embodied Philosophy', robots: { index: false, follow: false } };

const usd = n => `${n < 0 ? '−' : ''}$${Math.round(Math.abs(n)).toLocaleString('en-US')}`;
const monthName = m => new Date(`${m}-15T12:00:00Z`).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const short = m => new Date(`${m}-15T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' });
// Budget lines that are enrollments, and the price (Links & Prices key) one enrollment brings in
const ENROLL = [['Sādhana School – Full Year', 'sadhana_year_price'], ['Sādhana School – Semester', 'sadhana_semester_price'], ['Wisdom School – Annual', 'wisdom_price']];
const TIER = { GOLDEN: 'good', WINNER: 'good', HOLD: 'warning', LOSING: 'critical' };

// Is the business healthy? Director only. Everything comes from the EP Revenue & Metrics System sheet,
// which Make fills from Stripe, PayPal and Meta.
export default async function Insights({ searchParams }) {
  const user = await opsUser(u => u.director);
  const sp = await searchParams;
  let m, error = '';
  try { m = await loadMetrics(); } catch (e) { error = /403/.test(e.message) ? 'The Revenue & Metrics sheet isn’t shared with the website.' : 'Couldn’t read the Revenue & Metrics sheet right now.'; }
  if (error) return <Shell user={user} current="insights" title="Business"><p className="ops-note">{error}</p></Shell>;

  const period = PERIODS.some(([k]) => k === sp?.f) ? sp.f : '30';
  const funnel = await loadFunnel(Number(period)).catch(() => ({ steps: [], hidden: [], error: 'Couldn’t load the funnel.' }));
  const now = todayET().slice(0, 7);
  // Every month of this year so far (none in the future)
  const year = now.slice(0, 4);
  const choices = m.months.filter(x => x.startsWith(year) && x <= now);
  if (!choices.length) choices.push(now);
  const month = choices.includes(sp?.m) ? sp.m : choices[choices.length - 1];
  const cur = m.monthly.find(x => x.month === month) || {};
  const live = month === now, missing = !cur.imported;

  // Year to date, through the month being viewed, against the year's Budget
  const ytdRows = m.monthly.filter(x => x.month.startsWith(year) && x.month <= month);
  const yearRows = m.monthly.filter(x => x.month.startsWith(year));
  const sum = (rows, k) => rows.reduce((s, x) => s + (x[k] || 0), 0);
  const ytd = {
    gross: sum(ytdRows, 'gross'), plan: sum(ytdRows, 'plan'), ads: sum(ytdRows, 'ads'), planAds: sum(ytdRows, 'planAds'),
    afterAds: sum(ytdRows, 'afterAds'), annual: sum(yearRows, 'plan'), annualAds: sum(yearRows, 'planAds'),
  };
  ytd.roas = ytd.ads ? ytd.gross / ytd.ads : 0;
  ytd.planAfterAds = ytd.plan - ytd.planAds;
  const gap = ytd.gross - ytd.plan;
  const notImported = ytdRows.filter(x => !x.imported).map(x => short(x.month));
  const span = list => list.length > 2 ? `${list[0]}–${list[list.length - 1]}` : list.join(' and ');
  const prices = Object.fromEntries(((await readTab('links').catch(() => null)) || []).map(r => [r.key, Number(String(r.value).replace(/[^0-9.]/g, '')) || 0]));
  const vsPlan = (a, p) => p ? `${Math.round((a / p) * 100)}% of the ${usd(p)} plan` : 'No plan this month';
  const adShare = cur.gross ? (cur.ads / cur.gross) * 100 : 0;
  const roasOk = cur.roas >= m.roasTarget;
  const progress = Math.min(1, m.afterAdsTotal / m.goal);
  const programs = m.programs.filter(p => (p.actual[month] || 0) || (p.plan[month] || 0));
  const scale = Math.max(1, ...programs.map(p => Math.max(p.actual[month] || 0, p.plan[month] || 0)));
  const trend = m.monthly.filter(x => x.month.startsWith(year) && x.month <= now);

  return (
    <Shell user={user} current="insights" title="Business"
      head={<nav className="ops-filters" aria-label="Month">{choices.map(c => <a key={c} href={`/ops/insights?m=${c}`} aria-current={c === month ? 'page' : undefined}>{short(c)}{c === now ? ' (now)' : ''}</a>)}</nav>}>
      <p className="ops-empty">{monthName(month)}{live ? ', so far this month' : ''}. From the Revenue & Metrics sheet: Stripe and PayPal sales, Meta ad spend and your Budget.</p>
      {missing && <p className="ops-note">No sales or ad spend have been imported for {monthName(month)} yet, so its figures read $0. The plan for the month was {usd(cur.plan || 0)}.</p>}

      <ul className="ops-kpis">
        <li><span className="l">Revenue</span><span className="v">{usd(cur.gross || 0)}</span><span className="d">{vsPlan(cur.gross || 0, cur.plan || 0)}</span></li>
        <li><span className="l">Meta ad spend</span><span className="v">{usd(cur.ads || 0)}</span>
          <span className={`d${adShare > m.adCeiling ? ' bad' : ''}`}>{cur.gross ? `${adShare.toFixed(0)}% of revenue (ceiling ${m.adCeiling}%)` : vsPlan(cur.ads || 0, cur.planAds || 0)}</span></li>
        <li><span className="l">Return on ad spend</span><span className="v">{cur.ads ? `${cur.roas.toFixed(2)}×` : '—'}</span>
          {cur.ads > 0 && <span className={`d status ${roasOk ? 'good' : 'critical'}`}><b aria-hidden="true">{roasOk ? '▲' : '▼'}</b> {roasOk ? 'At or above' : 'Below'} the {m.roasTarget}× target</span>}</li>
        <li><span className="l">Revenue after ads</span><span className="v">{usd(cur.afterAds || 0)}</span><span className="d">Net revenue minus Meta</span></li>
        <li><span className="l">Operating profit</span><span className="v">{cur.opex ? usd(cur.profit) : '—'}</span><span className="d">{cur.opex ? `After ${usd(cur.opex)} of expenses` : 'Bank expenses are imported monthly'}</span></li>
        <li><span className="l">Cash</span><span className="v">{usd(m.cash)}</span><span className={`d${m.runway < 2 ? ' bad' : ''}`}>{m.runway ? `${m.runway} months of runway` : ''}{m.cashAsOf ? ` · as of ${m.cashAsOf}` : ''}</span></li>
      </ul>

      <section className="ops-ytd">
        <h2 className="ops-sub">Year to date <span>Jan–{short(month)} {year}</span></h2>
        <div className="meter" role="meter" aria-valuemin={0} aria-valuemax={ytd.annual || 1} aria-valuenow={ytd.gross} aria-label={`Revenue so far against the ${year} budget`}>
          <span className="fill" style={{ width: `${Math.min(100, Math.max((ytd.gross / (ytd.annual || 1)) * 100, 0.6))}%` }} />
          {ytd.annual > 0 && <span className="tick" title={`Plan through ${short(month)}: ${usd(ytd.plan)}`} style={{ left: `${Math.min(100, (ytd.plan / ytd.annual) * 100)}%` }} />}
        </div>
        <p className="ops-empty">
          {usd(ytd.gross)} of the {usd(ytd.annual)} {year} revenue budget ({ytd.annual ? ((ytd.gross / ytd.annual) * 100).toFixed(1) : 0}%).
          {' '}The plan through {short(month)} was {usd(ytd.plan)}: <b className={gap < 0 ? 'behind' : 'ahead'}>{usd(Math.abs(gap))} {gap < 0 ? 'behind' : 'ahead'}</b>.
        </p>
        <ul className="ops-kpis">
          <li><span className="l">Revenue, year to date</span><span className="v">{usd(ytd.gross)}</span><span className="d">{vsPlan(ytd.gross, ytd.plan).replace('plan', 'plan to date')}</span></li>
          <li><span className="l">Meta ad spend, year to date</span><span className="v">{usd(ytd.ads)}</span>
            <span className={`d${ytd.ads > ytd.planAds ? ' bad' : ''}`}>{ytd.planAds ? `${Math.round((ytd.ads / ytd.planAds) * 100)}% of the ${usd(ytd.planAds)} budgeted` : 'No ad budget'}</span></li>
          <li><span className="l">Return on ad spend, year to date</span><span className="v">{ytd.ads ? `${ytd.roas.toFixed(2)}×` : '—'}</span>
            {ytd.ads > 0 && <span className={`d status ${ytd.roas >= m.roasTarget ? 'good' : 'critical'}`}><b aria-hidden="true">{ytd.roas >= m.roasTarget ? '▲' : '▼'}</b> Target {m.roasTarget}×</span>}</li>
          <li><span className="l">Revenue after ads, year to date</span><span className="v">{usd(ytd.afterAds)}</span><span className="d">Plan to date {usd(ytd.planAfterAds)} (revenue minus ad budget)</span></li>
        </ul>
        {notImported.length > 0 && <p className="ops-empty">{span(notImported)} {notImported.length === 1 ? 'has' : 'have'} no sales imported yet and count as $0 here. Add their Stripe and PayPal transactions to the sheet to make the year-to-date figures complete.</p>}
      </section>

      <section className="ops-goal">
        <h2 className="ops-sub">$1M after ads</h2>
        <div className="meter" role="meter" aria-valuemin={0} aria-valuemax={m.goal} aria-valuenow={m.afterAdsTotal} aria-label="Revenue after ads toward the goal">
          <span style={{ width: `${Math.max(progress * 100, 0.6)}%` }} />
        </div>
        <p className="ops-empty">{usd(m.afterAdsTotal)} of {usd(m.goal)} ({(progress * 100).toFixed(1)}%){m.monthsToGoal ? ` · about ${m.monthsToGoal} months to go at the current pace` : ''}</p>
      </section>

      <section>
        <h2 className="ops-sub">Revenue by program vs plan</h2>
        {programs.length === 0 ? <p className="ops-empty">No revenue or plan for this month.</p> : (
          <ul className="ops-bullets">
            {programs.map(p => {
              const a = p.actual[month] || 0, pl = p.plan[month] || 0;
              const enroll = ENROLL.map(([line, key]) => {
                const b = m.budgetLines.find(x => x.line === line && x.mapsTo === p.name), price = prices[key];
                return b && b.byMonth[month] && price ? `${line.split('–')[1].trim()}: about ${Math.round(b.byMonth[month] / price)} enrollments at ${usd(price)}` : '';
              }).filter(Boolean);
              return (
                <li key={p.name}>
                  <span className="n">{p.name}</span>
                  <span className="bar" title={`${p.name}: ${usd(a)} of ${usd(pl)} plan`}>
                    <span className="fill" style={{ width: `${(a / scale) * 100}%` }} />
                    {pl > 0 && <span className="tick" style={{ left: `${(pl / scale) * 100}%` }} />}
                  </span>
                  <span className="v">{usd(a)}<span className="sub"> {pl ? `of ${usd(pl)}` : 'no plan'}</span></span>
                  {enroll.length > 0 && <span className="enr">Plan: {enroll.join(' · ')}</span>}
                </li>
              );
            })}
          </ul>
        )}
        <p className="ops-legend"><span className="sw fill" /> Revenue <span className="sw tick" /> Plan</p>
      </section>

      <section>
        <h2 className="ops-sub">Month by month</h2>
        <Trend data={trend.map(x => ({ month: x.month, label: short(x.month), gross: x.gross, ads: x.ads, plan: x.plan, roas: x.roas }))} now={now} />
      </section>

      <section>
        <h2 className="ops-sub">Funnel <span>{funnel.steps.length || ''}</span></h2>
        <nav className="ops-filters" aria-label="Funnel period">{PERIODS.map(([k, l]) => <a key={k} href={`/ops/insights?m=${month}&f=${k}`} aria-current={k === period ? 'page' : undefined}>{l}</a>)}</nav>
        {funnel.error ? <p className="ops-empty">{funnel.error}</p>
          : funnel.steps.length === 0 ? <p className="ops-empty">No funnel steps yet. Add them in <a href="/ops/settings?t=funnel">Settings → Funnel</a>: a step name and the Kit tag people get when they reach it.</p> : (
          <ol className="ops-funnel">{funnel.steps.map(s => (
            <li key={s.step}><span className="n">{s.step}</span><span className="bar" aria-hidden="true"><span style={{ width: `${Math.max(2, s.ofFirst * 100)}%` }} /></span><span className="v">{s.n.toLocaleString('en-US')}{s.ofPrev != null && <span className="sub"> {Math.round(s.ofPrev * 100)}% of the step before</span>}</span></li>))}</ol>
        )}
        {funnel.hidden.length > 0 && <p className="ops-empty">Left out for now: {funnel.hidden.map(h => `${h.step} (${h.why})`).join(', ')}.</p>}
      </section>

      <section>
        <h2 className="ops-sub">Meta ad sets <span>{m.adSets.length}</span></h2>
        <p className="ops-empty">The Ad Agent’s latest read (last 3 days){m.mode ? `, in ${m.mode === 'AUTO' ? 'auto mode: it pauses and scales these itself' : 'recommend-only mode'}` : ''}. Pauses below {m.pauseBelow}×.</p>
        <div className="ops-table-wrap">
          <table className="ops-table ops-adsets">
            <thead><tr><th>Ad set</th><th>Product</th><th className="r">Spend</th><th className="r">Sales</th><th className="r">ROAS</th><th>Tier</th><th>Action</th><th>Meta</th></tr></thead>
            <tbody>{m.adSets.map(a => (
              <tr key={a.id} title={a.why}>
                <td><b>{a.name}</b><span className="sub">{a.campaign}</span></td><td>{a.product}</td>
                <td className="r">{usd(a.spend)}</td><td className="r">{a.purchases || (a.leads ? `${a.leads} leads` : 0)}</td><td className="r">{a.roas ? `${a.roas.toFixed(2)}×` : '—'}</td>
                <td><span className={`status ${TIER[a.tier] || 'neutral'}`}>{a.tier || '—'}</span></td><td>{a.action}</td><td>{a.status}</td>
              </tr>))}</tbody>
          </table>
        </div>
      </section>
      <p className="ops-empty" style={{ marginTop: 18 }}><a href={METRICS_URL()} target="_blank" rel="noopener">Open the Revenue & Metrics sheet ↗</a> for transactions, expenses and the full P&L.</p>
    </Shell>
  );
}
