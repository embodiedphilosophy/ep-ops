import Shell, { opsUser } from '../Shell';
import { loadFunnel, PERIODS } from '@/lib/ops/funnel';

// Business › Audience: the quiz funnel that used to sit at the bottom of Insights. Directors only, as Insights was.
// Today it shows the steps in Settings › Connections and jobs › Funnel (a name and the Kit tag people get when they reach it);
// nothing new is read. The fuller funnel (archetypes, doorways) is a later piece.
export default async function AudienceView({ searchParams }) {
  const user = await opsUser(u => !!u.director);
  const sp = await searchParams;
  const period = PERIODS.some(([k]) => k === sp?.f) ? sp.f : '30';
  const funnel = await loadFunnel(Number(period)).catch(() => ({ steps: [], hidden: [], error: 'Couldn’t load the funnel.' }));
  const label = PERIODS.find(([k]) => k === period)[1].toLowerCase();
  return (
    <Shell user={user} current="business" eyebrow="Business · directors" title="Audience"
      desc="How many people reached each step on the way from a first practice to a membership. Counted from the Kit tag each step gives people."
      head={<nav className="ops-filters" aria-label="Funnel period">{PERIODS.map(([k, l]) => <a key={k} href={`/ops/business?view=audience&f=${k}`} aria-current={k === period ? 'page' : undefined}>{l}</a>)}</nav>}>
      <section className="bz-panel" aria-label="Funnel">
        <h2 className="ops-sub">From first practice to a membership <span>{funnel.steps.length || ''}</span></h2>
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
    </Shell>
  );
}
