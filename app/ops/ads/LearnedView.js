import Shell, { opsUser } from '../Shell';
import { canAds } from '@/lib/ops/nav';
import Learned from './Learned';
import '../social/social.css';
import './ads.css';

// Ads › What we’ve learned: what the ads EP has already run in Meta tell us (which kinds did better and worse), each statement linked to the ads and numbers behind it.
// Directors and the Ads role. For reading only: nothing here changes anything in Meta.
export default async function LearnedView() {
  const user = await opsUser(canAds);
  return (
    <Shell user={user} current="ads" eyebrow="Ads · directors and the Ads role" title="Ads"
      desc="What the ads you have already run tell us. Patterns only, read from your Meta account: nothing here changes anything in Meta.">
      <Learned />
    </Shell>
  );
}
