import Shell, { opsUser } from '../../Shell';
import { isStaff } from '@/lib/ops/nav';
import { Reminders } from '../Reminders';
import '../../social/social.css';
import '../email.css';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Reminders — Embodied Philosophy', robots: { index: false, follow: false } };

export default async function Page() {
  const user = await opsUser(isStaff);
  return <Shell user={user} current="email-reminders"><Reminders /></Shell>;
}
