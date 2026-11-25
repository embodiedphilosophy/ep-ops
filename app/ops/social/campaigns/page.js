import Shell, { opsUser } from '../../Shell';
import { isStaff } from '@/lib/ops/nav';
import Campaigns from '../Campaigns';
import '../social.css';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Coming up & campaigns — Embodied Philosophy', robots: { index: false, follow: false } };

export default async function Page() {
  const user = await opsUser(isStaff);
  return <Shell user={user} current="social-campaigns"><Campaigns /></Shell>;
}
