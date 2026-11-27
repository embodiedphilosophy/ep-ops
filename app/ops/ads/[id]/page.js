import Shell, { opsUser } from '../../Shell';
import { canAds } from '@/lib/ops/nav';
import Draft from '../Draft';
import '../../social/social.css';
import '../ads.css';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Campaign — Embodied Philosophy', robots: { index: false, follow: false } };

// One campaign draft (Ads PR 2): the four steps. The page itself is a shell; the steps read and save through /api/ops/ads.
export default async function DraftPage({ params }) {
  const user = await opsUser(canAds), { id } = await params;
  return <Shell user={user} current="ads" eyebrow="Ads · draft to review" title="Campaign draft"><Draft id={decodeURIComponent(id)} /></Shell>;
}
