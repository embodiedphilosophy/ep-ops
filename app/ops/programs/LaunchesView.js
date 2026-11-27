import Shell, { opsUser } from '../Shell';
import { isStaff } from '@/lib/ops/nav';
import { Launches } from '../email/Launches';
import '../social/social.css';
import '../email/email.css';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Launches — Embodied Philosophy', robots: { index: false, follow: false } };

export default async function Page() {
  const user = await opsUser(isStaff);
  return <Shell user={user} current="email-launches"><Launches /></Shell>;
}
