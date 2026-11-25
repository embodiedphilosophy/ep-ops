import Shell, { opsUser } from '../../Shell';
import { isStaff, canPublishSocial, canEditSocial, canEditEvents } from '@/lib/ops/nav';
import ThisWeek from '../ThisWeek';
import '../social.css';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'This Week at EP — Embodied Philosophy', robots: { index: false, follow: false } };

// The standing Sunday 09:00 ET carousel: built from the Master Schedule, nothing posts until someone presses a button (design: "This Week at EP")
export default async function Page() {
  const user = await opsUser(isStaff);
  return (
    <Shell user={user} current="social-thisweek">
      <ThisWeek canEdit={canEditSocial(user)} canPublish={canPublishSocial(user)} canSchedule={canEditEvents(user)} />
    </Shell>
  );
}
