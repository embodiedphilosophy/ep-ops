import { NextResponse } from 'next/server';
import { currentUser } from '@/lib/ops/auth';
import { canEditSocial } from '@/lib/ops/nav';
import { approve, skip, saveEdits, requeue, publish, retry, youtubeAvailable } from '@/lib/ops/youtube';

export const dynamic = 'force-dynamic';
const fail = (error, status = 400) => NextResponse.json({ error }, { status });

// POST { action, id, ... } from the YouTube page (people who edit Content: directors, editors, Social role)
//   approve { teacher, series } · skip · save { ytTitle, ytDescription, ytTags, hashtags, privacy, publishAt, playlistId }
//   recut { start, end } · thumb { headline, accent } · publish · retry
export async function POST(req) {
  const user = await currentUser();
  if (!user) return fail('Please sign in again', 401);
  if (!canEditSocial(user)) return fail('Only the content team can do that', 403);
  if (!youtubeAvailable()) return fail('The database isn’t connected');
  const b = await req.json().catch(() => ({}));
  const who = user.name || user.email;
  const id = String(b.id || '');
  if (!/^\d+$/.test(id)) return fail('Which video?');
  try {
    switch (b.action) {
      case 'approve': return NextResponse.json(await approve(id, b, who));
      case 'skip': return NextResponse.json(await skip(id, who));
      case 'save': return NextResponse.json(await saveEdits(id, b));
      case 'recut': return NextResponse.json(await requeue(id, 'produce', b));
      case 'thumb': return NextResponse.json(await requeue(id, 'thumb', b));
      case 'publish': await saveEdits(id, b); return NextResponse.json(await publish(id, who));
      case 'retry': return NextResponse.json(await retry(id));
      default: return fail('Unknown action');
    }
  } catch (e) {
    console.error('YouTube action failed', b.action, e.message);
    return fail(e.message, 400);
  }
}
