import { canEditSite } from '@/lib/ops/nav';
import Shell, { opsUser } from '../../Shell';
import PodsAdmin from './PodsAdmin';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Study pods — Embodied Philosophy', robots: { index: false, follow: false } };

// Sādhana School study pods: approve students who ask to lead one, and give each begun pod its chat link.
export default async function PodsPage() {
  const user = await opsUser(canEditSite);
  return (
    <Shell user={user} current="settings" eyebrow="Sādhana School" title="Study pods">
      <PodsAdmin />
    </Shell>
  );
}
