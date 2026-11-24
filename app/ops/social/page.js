import Shell, { opsUser } from '../Shell';
import { isStaff } from '@/lib/ops/nav';
import { statusCards, planLine } from '@/lib/ops/socialcards';
import SocialCalendar from './SocialCalendar';
import './social.css';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Social calendar — Embodied Philosophy', robots: { index: false, follow: false } };

// The Social calendar: the week at a glance (Content & Social v2 design, "Main")
export default async function Page() {
  const user = await opsUser(isStaff);
  const { cards, reviewCount } = await statusCards(user);
  return (
    <Shell user={user} current="social">
      <SocialCalendar cards={cards} reviewCount={reviewCount} dateLine={planLine()} />
    </Shell>
  );
}
