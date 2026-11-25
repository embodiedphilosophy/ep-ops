import Shell, { opsUser } from '../Shell';
import { isStaff } from '@/lib/ops/nav';
import { ThisWeek } from './EmailKit';
import '../social/social.css';
import './email.css';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Teachers & Email — Embodied Philosophy', robots: { index: false, follow: false } };

export default async function Page() {
  const user = await opsUser(isStaff);
  return <Shell user={user} current="email-week"><ThisWeek /></Shell>;
}
