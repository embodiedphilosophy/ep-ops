import { canEditSite } from '@/lib/ops/nav';
import { ceLedger, ceConfigured } from '@/lib/ops/ce';
import Shell, { opsUser } from '../Shell';
import { HeldActions, IssuedActions, MarkDone } from './CeActions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'CE credits — Embodied Philosophy', robots: { index: false, follow: false } };

const TABS = [['issued', 'Issued'], ['held', 'Held for a look'], ['withdrawn', 'Withdrawn'], ['setup', 'Set-up']];
const day = v => v ? new Date(v).toLocaleDateString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', year: 'numeric' }) : '';
const when = v => v ? new Date(v).toLocaleString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '';
const span = (a, b) => { if (!a || !b) return ''; const h = (new Date(b) - new Date(a)) / 36e5; return h < 48 ? `${Math.round(h * 10) / 10} h` : `${Math.round(h / 24)} days`; };

// Yoga Alliance CE certificates: what's been issued, anything held for a quick look (finished unusually fast),
// and the set-up checks (which pathways Circle is wired to). Directors and the two editors.
export default async function CeLedger({ searchParams }) {
  const user = await opsUser(canEditSite);
  const sp = await searchParams;
  const tab = TABS.some(t => t[0] === sp?.tab) ? sp.tab : 'issued';
  let data = null, error = '';
  if (!ceConfigured()) error = 'Add CE_ADMIN_KEY to this project (the same value as on the website) to see the CE ledger.';
  else { try { data = await ceLedger(); } catch (e) { error = `Couldn’t reach the website’s CE records: ${e.message}`; } }
  if (data?.off) { error = 'The website’s database isn’t connected, so there are no CE records yet.'; data = null; }

  const certs = data?.certs || [];
  const held = certs.filter(c => c.status === 'held');
  const issued = certs.filter(c => c.status === 'issued');
  const withdrawn = certs.filter(c => c.status === 'revoked');
  const counts = data?.counts || {};
  const pathways = data?.pathways || [];
  const notWired = pathways.filter(p => !p.spaceIds.length);
  const count = k => k === 'issued' ? issued.length : k === 'held' ? held.length : k === 'withdrawn' ? withdrawn.length : notWired.length + (data?.unmatched?.length || 0);
  const list = tab === 'held' ? held : tab === 'withdrawn' ? withdrawn : issued;

  return (
    <Shell user={user} current="ce" eyebrow="Wisdom School Plus" title="CE credits"
      desc="Yoga Alliance continuing-education certificates. Members finish a pathway in Circle, write a short reflection on the CE page, and the certificate is issued and emailed on its own."
      head={data ? <div className="ops-actions"><a className="btn ghost" href="/api/ops/ce/export">Download all records (CSV)</a></div> : null}>
      {error && <p className="ops-note" role="alert">{error}</p>}
      {data && (<>
        <div className="ops-tiles" role="list">
          {[[counts.issued_month ?? 0, 'Issued this month'], [Math.round((counts.hours_all || 0) * 10) / 10, 'Hours certified, all time'], [counts.tracking ?? 0, 'Members tracking'], [held.length, held.length ? 'Held for a look' : 'Nothing held']].map(([n, l]) =>
            <div className={`ops-tile${l === 'Held for a look' ? ' lp-risk' : ''}`} role="listitem" key={l}><span className="n">{n}</span><span className="l">{l}</span></div>)}
        </div>
        <nav className="ops-tabs" aria-label="CE ledger">
          {TABS.map(([k, name]) => <a key={k} href={`/ops/ce?tab=${k}`} aria-current={k === tab ? 'page' : undefined}>{name}<span className="chipn mono">{count(k)}</span></a>)}
        </nav>

        {tab === 'setup' ? (<section className="ops-col">
          <h2>Pathways <span>{pathways.length}</span></h2>
          <p className="ops-empty">From Website → Pathways. Each CE pathway needs its Circle course space id (circle_space_id) so lesson and course completions count; lessons and runtime_minutes make the progress bar and the pace check work.</p>
          <div className="ops-table-wrap"><table className="ops-table"><thead><tr><th scope="col">Pathway</th><th scope="col">CE hours</th><th scope="col">Category</th><th scope="col">Circle space</th><th scope="col">Lessons</th><th scope="col">Runtime</th></tr></thead>
            <tbody>{pathways.map(p => (<tr key={p.slug}><td>{p.title}</td><td className="mono">{p.hours}</td><td>{p.category}</td>
              <td className="mono">{p.spaceIds.length ? p.spaceIds.join(', ') : <span className="ce-miss">Not set</span>}</td>
              <td className="mono">{p.lessons || <span className="ce-miss">—</span>}</td><td className="mono">{p.runtimeMinutes ? `${Math.round(p.runtimeMinutes / 6) / 10} h` : <span className="ce-miss">—</span>}</td></tr>))}</tbody></table></div>
          <h2>Circle events we couldn’t match <span>{data.unmatched.length}</span></h2>
          {data.unmatched.length ? (<div className="ops-table-wrap"><table className="ops-table"><thead><tr><th scope="col">When</th><th scope="col">Kind</th><th scope="col">Member</th><th scope="col">Space</th><th scope="col">Lesson</th></tr></thead>
            <tbody>{data.unmatched.map(e => <tr key={e.id}><td className="mono">{when(e.at)}</td><td>{e.kind}</td><td>{e.email || <span className="ce-miss">No email in the event</span>}</td><td className="mono">{e.space_id || '—'}</td><td className="mono">{e.lesson_id || '—'}</td></tr>)}</tbody></table></div>)
            : <p className="ops-empty">Every event from Circle matched a pathway{counts.last_event ? `. Last one ${when(counts.last_event)}.` : '. None received yet.'}</p>}
          <h2>Mark a pathway finished</h2>
          <p className="ops-empty">For lessons finished before the Circle workflows were switched on, or anything Circle didn’t send. The member then writes the reflection as usual.</p>
          <MarkDone pathways={pathways} />
        </section>) : !list.length ? (
          <p className="ops-empty-box">{tab === 'held' ? 'Nothing held. Certificates finished unusually fast land here for a quick look before they’re issued.' : tab === 'withdrawn' ? 'No certificates have been withdrawn.' : 'No certificates yet. They appear here as members finish pathways.'}</p>
        ) : (
          <ul className="ops-lib-rows ce-rows">{list.map(c => (
            <li key={c.id} className="ops-lib-row">
              <span className="body">
                <span className="ttl">{c.name} · {c.title}</span>
                <span className="meta">
                  <span className="mono">{c.id}</span>
                  <span>{c.hours} h · {c.category}</span>
                  <span className="mono">{tab === 'held' ? `Finished ${day(c.done_at)}` : `Issued ${day(c.issued_at)}`}</span>
                  {c.first_at && c.done_at && <span className={c.pace === 'held' ? 'ce-fast' : ''}>Studied over {span(c.first_at, c.done_at)}</span>}
                  <span>{c.email}</span>
                  {c.ya_id && <span className="mono">YA {c.ya_id}</span>}
                </span>
                {c.notes && <span className="ce-notes">{c.notes}</span>}
              </span>
              {c.status === 'held' ? <HeldActions id={c.id} r1={c.r1} r2={c.r2} /> : c.status === 'issued' ? <IssuedActions id={c.id} name={c.name} pdf={c.pdf} /> : null}
            </li>))}</ul>
        )}
      </>)}
    </Shell>
  );
}
