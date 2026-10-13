import { canEditSite } from '@/lib/ops/nav';
import { listOfferings, listAccessMap, getMeta } from '@/lib/ops/offerings';
import { bucketOf, circleChanges, onboardingChanges, progress, FIELD_NAMES } from '@/lib/ops/library';
import Shell, { opsUser } from '../Shell';
import Desk, { SyncButton, AddByLink, AccessMap } from './Desk';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Course Library — Embodied Philosophy', robots: { index: false, follow: false } };

const TITLES = { new: 'New from Circle', changed: 'Changed since publishing', published: 'Published', skipped: 'Skipped' };
const DESCS = { new: 'Courses and paywalls found in Circle that aren’t in the Course Library yet. Add the catalog details, then publish.', changed: 'Listings whose Circle details or teacher onboarding changed after you published them.', published: 'Everything live on the Course Library. Edit or unpublish from here.', skipped: 'Kept out of the library. Bring any of them back.' };
const TABS = [['new', 'New from Circle'], ['changed', 'Changed'], ['published', 'Published'], ['skipped', 'Skipped']];

export default async function Library({ searchParams }) {
  const user = await opsUser(canEditSite);
  const sp = await searchParams;
  const tab = TABS.some(t => t[0] === sp?.tab) ? sp.tab : 'new';
  const [all, map, meta] = await Promise.all([listOfferings().catch(() => []), listAccessMap().catch(() => []), getMeta().catch(() => null)]);
  const rows = all.map(o => ({
    id: o.offering_id, title: o.title, cover: o.cover_override || o.cover_url, price: o.price_label, circleStatus: o.circle_status, found: o.found_at, bucket: bucketOf(o),
    prefilled: !!o.onboarding_id, done: progress(o), status: o.status, publishedAt: o.published_at,
    circleChanged: circleChanges(o).map(f => FIELD_NAMES[f] || f), onboardingChanged: onboardingChanges(o).map(f => FIELD_NAMES[f] || f),
    paywall: o.circle_paywall_id, access: o.access, autoHidden: !!o.auto_hidden,
  }));
  const count = b => rows.filter(r => r.bucket === b).length;
  const sync = meta?.sync || null;
  const paywalls = [...new Map(all.filter(o => o.circle_paywall_id).map(o => [o.circle_paywall_id, { id: o.circle_paywall_id, title: o.title }])).values()]
    .map(p => ({ ...p, ...(map.find(m => m.circle_id === p.id) || {}) }));
  return (
    <Shell user={user} current="library" eyebrow="Course Library desk" title={TITLES[tab]} desc={DESCS[tab]}
      head={<div className="ops-actions">{sync && <span className="mono ops-last">Last checked Circle {new Date(sync.checkedAt).toLocaleString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>}<SyncButton /><AddByLink /></div>}>
      <div className="ops-tiles" role="list">
        {[[count('new'), 'New from Circle'], [count('changed'), 'Changed'], [rows.filter(r => r.bucket === 'new' && r.done > 0).length, 'Draft in progress'], [count('published'), 'Live on the Course Library']].map(([n, l]) => <div className="ops-tile" role="listitem" key={l}><span className="n">{n}</span><span className="l">{l}</span></div>)}
      </div>
      {sync?.notes?.length > 0 && <p className="ops-meta">{sync.notes[0]}</p>}
      {!sync && <p className="ops-meta">Circle hasn’t been checked yet. Press “Check Circle now”.</p>}
      <nav className="ops-tabs" aria-label="Course Library">
        {TABS.map(([k, name]) => <a key={k} href={`/ops/library?tab=${k}`} aria-current={k === tab ? 'page' : undefined}>{name}<span className="chipn mono">{count(k)}</span></a>)}
      </nav>
      <Desk rows={rows.filter(r => r.bucket === tab).sort((a, b) => String(a.found).localeCompare(String(b.found)))} tab={tab} />
      <AccessMap paywalls={paywalls} />
      <p className="ops-note ops-foot">Title, cover image, price, checkout link and published status come from Circle and can only be changed there. Everything else on a card is set here. Skipped items stay hidden unless you restore them from the Skipped tab.</p>
    </Shell>
  );
}
