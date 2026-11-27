import Shell, { opsUser } from '../Shell';
import { canAds } from '@/lib/ops/nav';
import Campaigns from './Campaigns';
import '../social/social.css';
import './ads.css';

// Ads › Campaigns: every launch's Meta campaign, as a draft to review or paused in Meta. Directors and the Ads role.
export default async function CampaignsView() {
  const user = await opsUser(canAds);
  return (
    <Shell user={user} current="ads" eyebrow="Ads · directors and the Ads role" title="Ads"
      desc="Meta campaigns for every launch, built and run from here. Nothing is sent to Meta until someone presses a button.">
      <Campaigns />
    </Shell>
  );
}
