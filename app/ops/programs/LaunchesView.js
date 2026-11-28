import Shell, { opsUser } from '../Shell';
import { isStaff } from '@/lib/ops/nav';
import { Launches } from '../email/Launches';
import '../social/social.css';
import '../email/email.css';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Launches — Embodied Philosophy', robots: { index: false, follow: false } };

export default async function Page() {
  const user = await opsUser(isStaff);
  return (
    <Shell user={user} current="email-launches" eyebrow="Programs" title="Launches"
      desc="Everything around one moment, together: its emails, social posts and countdowns, landing page and tasks, counted from key dates. Below: which upcoming events to promote.">
      <Launches bare />
    </Shell>);
}
