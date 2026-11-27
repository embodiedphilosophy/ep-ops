import Shell, { opsUser } from '../Shell';
import { isStaff } from '@/lib/ops/nav';
import { todayET } from '@/lib/events';
import ReviewPage from '../social/ReviewPage';
import '../social/social.css';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Review & approve — Embodied Philosophy', robots: { index: false, follow: false } };

export default async function Page() {
  const user = await opsUser(isStaff);
  const d = new Date(todayET() + 'T12:00:00Z'), toSun = (7 - d.getUTCDay()) % 7;
  d.setUTCDate(d.getUTCDate() + toSun);
  const sun = d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
  return (
    <Shell user={user} current="social-review">
      <ReviewPage closes={`Approvals close ${sun} 18:00 ET (23:00 London)`} />
    </Shell>
  );
}
