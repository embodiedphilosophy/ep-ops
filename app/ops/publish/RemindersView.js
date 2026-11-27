import Shell, { opsUser } from '../Shell';
import { isStaff } from '@/lib/ops/nav';
import ReminderSends from './ReminderSends';
import '../social/social.css';
import '../email/email.css';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Reminder sends — Embodied Philosophy', robots: { index: false, follow: false } };

export default async function Page() {
  const user = await opsUser(isStaff);
  return <Shell user={user} current="publish"><ReminderSends /></Shell>;
}
