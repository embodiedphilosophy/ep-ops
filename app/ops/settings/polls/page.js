import { canEditSite } from '@/lib/ops/nav';
import Shell, { opsUser } from '../../Shell';
import PollResults from './PollResults';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Mentee surveys — Embodied Philosophy', robots: { index: false, follow: false } };

// Who answered the Sahṛdaya Upāya "which time works?" surveys, and which times are most popular.
export default async function PollsPage() {
  const user = await opsUser(canEditSite);
  return (
    <Shell user={user} current="settings" eyebrow="Sahṛdaya Upāya" title="Mentee surveys">
      <PollResults />
    </Shell>
  );
}
