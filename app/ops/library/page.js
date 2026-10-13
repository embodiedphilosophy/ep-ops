import { canEditSite } from '@/lib/ops/nav';
import { listOfferings, listAccessMap, getMeta } from '@/lib/ops/offerings';
import { bucketOf, circleChanges, onboardingChanges, progress, FIELD_NAMES } from '@/lib/ops/library';
import Shell, { opsUser } from '../Shell';
import Desk, { SyncButton, AddByLink, AccessMap } from './Desk';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Course Library — Embodied Philosophy', robots: { index: false, follow: false } };

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
    <Shell user={user} current="library" eyebrow="Courses and programmes from Circle" title="Course Library" desc="Every course in Circle that could appear on the website: prepare it, preview it, publish it."
      head={<div className="ops-actions"><SyncButton /><AddByLink /></div>}>
      <div className="ops-tiles" role="list">
        {TABS.map(([k, name]) => <div className="ops-tile" role="listitem" key={k}><span className="n">{count(k)}</span><span className="l">{name}</span></div>)}
      </div>
      {sync && <p className="ops-meta">Circle last checked <b className="mono">{new Date(sync.checkedAt).toLocaleString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</b> ET · found <b className="mono">{sync.circle.courses}</b> courses and <b className="mono">{sync.circle.paywalls}</b> paywalls{sync.notes?.length ? ` · ${sync.notes[0]}` : ''}</p>}
      {!sync && <p className="ops-meta">Circle hasn’t been checked yet. Press “Check Circle now”.</p>}
      <nav className="ops-tabs" aria-label="Course Library">
        {TABS.map(([k, name]) => <a key={k} href={`/ops/library?tab=${k}`} aria-current={k === tab ? 'page' : undefined}>{name}<span className="chipn mono">{count(k)}</span></a>)}
      </nav>
      <Desk rows={rows.filter(r => r.bucket === tab)} tab={tab} />
      <AccessMap paywalls={paywalls} />
    </Shell>
  );
}
