import Shell, { opsUser } from '../Shell';
import { canAds } from '@/lib/ops/nav';
import Creative from './Creative';
import '../social/social.css';
import './ads.css';

// Ads › Creative results: which pictures and which words did best and worst in the ads built here. Directors and the Ads role. For reading only: it changes nothing and picks nothing.
export default async function CreativeView() {
  const user = await opsUser(canAds);
  return (
    <Shell user={user} current="ads" eyebrow="Ads · directors and the Ads role" title="Ads"
      desc="Which pictures and which words worked best in the ads built here. It is for deciding what to keep, change or retire. It changes nothing and never chooses for you.">
      <Creative />
    </Shell>
  );
}
