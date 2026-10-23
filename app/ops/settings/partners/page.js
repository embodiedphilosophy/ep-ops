import { canEditSite } from '@/lib/ops/nav';
import Shell, { opsUser } from '../../Shell';
import Partners from './Partners';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Peer partners — Embodied Philosophy', robots: { index: false, follow: false } };

// Each month Jacob pairs the Sahṛdaya Upāya mentees. The mentees see their partner on their Sahṛdaya Upāya page in Circle.
export default async function PartnersPage() {
  const user = await opsUser(canEditSite);
  return (
    <Shell user={user} current="settings" eyebrow="Sahṛdaya Upāya" title="Peer partners">
      <Partners />
    </Shell>
  );
}
