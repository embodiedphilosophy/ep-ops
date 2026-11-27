import { canEditSite } from '@/lib/ops/nav';
import Shell, { opsUser } from '../Shell';
import PodsAdmin from './PodsAdmin';


// Sādhana School study pods: approve students who ask to lead one, and give each begun pod its chat link.
export default async function PodsView() {
  const user = await opsUser(canEditSite);
  return (
    <Shell user={user} current="students" eyebrow="Sādhana School" title="Study pods">
      <PodsAdmin />
    </Shell>
  );
}
