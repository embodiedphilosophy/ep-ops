import { canEditSite } from '@/lib/ops/nav';
import Shell, { opsUser } from '../../Shell';
import Partners from './Partners';
import Chosen from './Chosen';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Articulation partners — Embodied Philosophy', robots: { index: false, follow: false } };

// Since Nov 2026 the Sahṛdaya Upāya mentees choose their own articulation partner each month on their Mentorship Dashboard (Chosen shows them).
// The older editor below still keeps where each mentee lives (city and time zone); its assigned pairs are only used if the mentee record is down.
export default async function PartnersPage() {
  const user = await opsUser(canEditSite);
  return (
    <Shell user={user} current="settings" eyebrow="Sahṛdaya Upāya" title="Articulation partners">
      <Chosen />
      <details style={{ marginTop: 8 }}>
        <summary style={{ cursor: 'pointer', fontWeight: 600 }}>Where each mentee lives, and the old assigned pairs</summary>
        <div style={{ marginTop: 12 }}><Partners /></div>
      </details>
    </Shell>
  );
}
