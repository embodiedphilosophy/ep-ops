import Shell, { opsUser } from '../../Shell';
import { isStaff } from '@/lib/ops/nav';
import { Emails } from '../EmailKit';
import '../../social/social.css';
import '../email.css';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Emails — Embodied Philosophy', robots: { index: false, follow: false } };

export default async function Page() {
  const user = await opsUser(isStaff);
  return <Shell user={user} current="email-emails"><Emails /></Shell>;
}
