import Shell, { opsUser } from '../Shell';
import { canAds } from '@/lib/ops/nav';
import Library from './Library';
import '../social/social.css';
import './ads.css';

// Ads › Audience library: every audience EP has tried, how it did in each campaign, and a way to use it again. Directors and the Ads role.
export default async function LibraryView() {
  const user = await opsUser(canAds);
  return (
    <Shell user={user} current="ads" eyebrow="Ads · directors and the Ads role" title="Ads"
      desc="Every audience EP has tried, with the exact Meta settings saved for reuse. Updated every morning from the ad results.">
      <Library />
    </Shell>
  );
}
