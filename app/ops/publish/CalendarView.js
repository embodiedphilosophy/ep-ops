import Shell, { opsUser } from '../Shell';
import { isStaff, canYouTube, canEditSocial, canEditEmail } from '@/lib/ops/nav';
import { statusCards, planLine } from '@/lib/ops/socialcards';
import { studio } from '@/lib/ops/youtube';
import PublishCalendar from './PublishCalendar';
import '../social/social.css';
import '../email/email.css';
import './publish.css';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Publish — Embodied Philosophy', robots: { index: false, follow: false } };
const first = v => (Array.isArray(v) ? v[0] : v) || '';

// Publish › Calendar: email, social, video and the automatic reminders on one calendar. The page reads nothing the old calendars didn't:
// the YouTube cuts come from the same studio() the Video page uses (directors and the Media role only), and the four status cards of the
// Social calendar are read only when the Social kind is chosen.
export default async function Page({ searchParams } = {}) {
  const user = await opsUser(isStaff);
  const sp = (await searchParams) || {}, show = first(sp.show);
  const canVideo = canYouTube(user);
  const [cards, s] = await Promise.all([
    show === 'social' ? statusCards(user) : null,
    canVideo ? studio().catch(() => null) : null,
  ]);
  const videos = s ? [...s.review, ...s.published].map(c => ({ id: c.id, status: c.status, yt_title: c.yt_title, source_title: c.source_title, publish_at: c.publish_at || '', published_at: c.published_at || '' })) : null;
  return (
    <Shell user={user} current="publish">
      <PublishCalendar show={show} canVideo={canVideo} canPost={canEditSocial(user)} canEmail={canEditEmail(user)} videos={videos} initialLayout={first(sp.layout)}
        socialProps={cards ? { cards: cards.cards, reviewCount: cards.reviewCount, dateLine: planLine() } : null} />
    </Shell>
  );
}
