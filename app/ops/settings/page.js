import { canEditSite } from '@/lib/ops/nav';
import { tableOf } from '@/lib/ops/sitetables';
import Shell, { opsUser } from '../Shell';
import SiteEditor from '../content/SiteEditor';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Settings — Embodied Philosophy', robots: { index: false, follow: false } };

// Every sheet-backed table in one place. Website tables: Jacob, Irene and Floss. Operations tables
// (task templates, track defaults, the team, Circle spaces, resources): directors only. Edits write to the
// sheet; template changes apply on the next daily sync.
export default async function Settings({ searchParams }) {
  const user = await opsUser(canEditSite);
  const sp = await searchParams;
  const t = tableOf(sp?.t);
  const ok = t && ['site', 'admin'].includes(t.scope) && (t.scope !== 'admin' || user.director) && t.key !== 'scaffolding' && !['profiles', 'coursepages'].includes(t.key);
  const initial = ok ? t.key : user.director ? 'templates' : 'links';
  return (
    <Shell user={user} current="settings" eyebrow="Every table the dashboard and the website read" title="Settings">
      <SiteEditor scope="settings" director={!!user.director} initial={initial} base="/ops/settings?" />
    </Shell>
  );
}
