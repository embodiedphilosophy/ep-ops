import Shell, { opsUser } from '../Shell';
import { canAds } from '@/lib/ops/nav';
import Insights from './Insights';
import Funnel from './Funnel';
import '../social/social.css';
import './ads.css';

// Ads › Audience insights: the weekly read (every claim linked to its numbers), the quiz breakdowns, which topics convert in ads, suggested course topics, and the quiz funnel.
// Directors and the Ads role. For reading only: nothing here is sent, posted or changed in Meta.
export default async function InsightsView({ searchParams }) {
  const user = await opsUser(canAds);
  const sp = await searchParams;
  return (
    <Shell user={user} current="ads" eyebrow="Ads · directors and the Ads role" title="Ads"
      desc="What the week told us, from the quiz, the ads, Circle and Kit. It is for reading: nothing here is sent or posted.">
      <Insights />
      <Funnel f={Array.isArray(sp?.f) ? sp.f[0] : sp?.f} />
    </Shell>
  );
}
