import { loadFunnel, PERIODS } from '@/lib/ops/funnel';

// The quiz funnel (it used to be Business › Audience; Ads PR 5 moved it here, the code is the same): how many people reached each step on the way from a first practice to a membership,
// counted from the Kit tag each step gives people. The steps are set in Settings › Connections and jobs › Funnel steps. Period chips: ?f=30|90|365.
export default async function Funnel({ f }) {
  const period = PERIODS.some(([k]) => k === f) ? f : '30';
  const funnel = await loadFunnel(Number(period)).catch(() => ({ steps: [], hidden: [], error: 'Couldn’t load the funnel.' }));
  const label = PERIODS.find(([k]) => k === period)[1].toLowerCase();
  return (
    <section className="bz-panel" id="funnel" aria-label="The quiz funnel">
      <div className="ads-head">
        <h2 className="ops-sub">The quiz funnel: from first practice to a membership <span>{funnel.steps.length || ''}</span></h2>
        <nav className="ops-filters" aria-label="Funnel period">{PERIODS.map(([k, l]) => <a key={k} href={`/ops/ads?view=insights&f=${k}#funnel`} aria-current={k === period ? 'page' : undefined}>{l}</a>)}</nav>
      </div>
      {funnel.error ? <p className="ops-empty">{funnel.error}</p>
        : funnel.steps.length === 0 ? <p className="ops-empty">No funnel steps yet. Add them in <a href="/ops/settings?view=connections&s=funnel">Settings → Connections and jobs → Funnel</a>: a step name and the Kit tag people get when they reach it.</p> : (<>
        <p className="ops-empty">People who reached each step in the {label}.</p>
        <ol className="bz-funnel">{funnel.steps.map(s => (
          <li key={s.step}>
            <span className="n">{s.step}</span>
            <span className="v">{s.n.toLocaleString('en-US')}</span>
            <span className="bar" aria-hidden="true"><span style={{ width: `${Math.max(2, s.ofFirst * 100)}%` }} /></span>
            <span className="sub">{s.ofPrev != null ? `${Math.round(s.ofPrev * 100)}% of the step before` : 'The first step'}</span>
          </li>))}</ol>
      </>)}
      {funnel.hidden.length > 0 && <p className="ops-empty">Left out for now: {funnel.hidden.map(h => `${h.step} (${h.why})`).join(', ')}.</p>}
    </section>
  );
}
