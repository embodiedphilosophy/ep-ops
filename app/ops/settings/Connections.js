import { scheduledJobs, SYSTEMS } from '@/lib/ops/jobs';
import { metaAdsStatus } from '@/lib/ops/meta-ads';

// Settings › Connections and jobs › Systems and jobs. Connection health (is each system answering?) is a later piece; until then this lists
// what the dashboard talks to and the jobs that run on their own. Everything here is read from files; nothing is checked or run.
// The Meta ads row says only what can be known without calling Meta: which settings are in place (by name, never the value) and the mode.
function MetaAds({ what }) {
  const m = metaAdsStatus();
  const note = { not_connected: 'Add the access key and the ad account in Vercel to connect.', dry_run: 'Connected, not yet checked with Meta. Every change is only written down as a dry run.', live: 'Changes you confirm in Ads are sent to Meta.' }[m.mode];
  return (
    <>
      <p>{what}</p>
      <p><b>{m.label}.</b> {note}</p>
      <ul aria-label="Meta ads settings">{m.settings.map(x => <li key={x.name}>{x.what} (<code>{x.name}</code>): {x.set ? (x.name === 'META_ADS_LIVE' ? 'live' : 'set') : 'not set'}</li>)}</ul>
    </>
  );
}

export default function Connections() {
  const jobs = scheduledJobs();
  return (
    <div className="ops-conn">
      <section className="bz-panel" aria-label="Connections">
        <h2 className="ops-sub">What the dashboard talks to</h2>
        <div className="ops-table-wrap"><table className="ops-table">
          <thead><tr><th>System</th><th>What the dashboard does with it</th></tr></thead>
          <tbody>{SYSTEMS.map(([n, w]) => <tr key={n}><td><b>{n}</b></td><td>{n === 'Meta ads' ? <MetaAds what={w} /> : w}</td></tr>)}</tbody>
        </table></div>
        <p className="ops-empty">Whether each one is answering right now isn’t shown yet.</p>
      </section>
      <section className="bz-panel" aria-label="Scheduled jobs">
        <h2 className="ops-sub">Jobs that run on their own <span>{jobs.length}</span></h2>
        <div className="ops-table-wrap"><table className="ops-table">
          <thead><tr><th>Job</th><th>When</th><th>What it does</th></tr></thead>
          <tbody>{jobs.map(j => <tr key={j.path}><td><b>{j.name}</b></td><td>{j.when}</td><td>{j.what}</td></tr>)}</tbody>
        </table></div>
        <p className="ops-empty">Times are UTC. Nothing is run from this page.</p>
      </section>
    </div>
  );
}
