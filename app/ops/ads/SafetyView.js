import Shell, { opsUser } from '../Shell';
import { canAds } from '@/lib/ops/nav';
import Safety from './Safety';
import '../social/social.css';
import './ads.css';

// Ads › Safety net: is money at risk right now? The seven checks, what needs a look, who was told, and (for directors) the ceilings and the phone numbers. Directors and the Ads role.
export default async function SafetyView() {
  const user = await opsUser(canAds);
  return (
    <Shell user={user} current="ads" eyebrow="Ads · directors and the Ads role" title="Ads"
      desc="The safety net watches your whole Meta ad account every hour and tells you if money is at risk. It only looks; a person decides what to pause.">
      <Safety />
    </Shell>
  );
}
