import { isStaff } from '@/lib/ops/nav';
import { BiosReview } from './ProfileEditor';
import Shell, { opsUser } from '../Shell';
import '../social/social.css';
import '../email/email.css';

// People › Bios to review (the old Teacher profiles → Review queue): bios and headshots teachers sent, set against what is live,
// and the course pages they sent. Approving and sending back work as before.
export default async function ReviewView() {
  const user = await opsUser(isStaff);
  return (
    <Shell user={user} current="people" desc="Teachers send their own bio and headshot through onboarding. Look them over here before they go on the website." eyebrow="Waiting for a look" title="Bios to review">
      <BiosReview />
    </Shell>);
}
