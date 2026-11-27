import Shell, { opsUser } from '../../Shell';
import { canAds } from '@/lib/ops/nav';
import Campaign from '../Campaign';
import '../../social/social.css';
import '../ads.css';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Campaign — Embodied Philosophy', robots: { index: false, follow: false } };

// One campaign: the four draft steps (Ads PR 2) while it is a draft, and the live page (Ads PR 3: results, the rules, what the Ad Agent did, Reverse) once it is in Meta.
// The page itself is a shell; everything reads and saves through /api/ops/ads.
export default async function CampaignPage({ params }) {
  const user = await opsUser(canAds), { id } = await params;
  return <Shell user={user} current="ads" eyebrow="Ads · directors and the Ads role" title="Campaign"><Campaign id={decodeURIComponent(id)} /></Shell>;
}
