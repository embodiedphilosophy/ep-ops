import { NextResponse } from 'next/server';
import { currentUser } from '@/lib/ops/auth';
import { canYouTube } from '@/lib/ops/nav';
import * as Y from '@/lib/ops/youtube';

export const dynamic = 'force-dynamic';

// POST { action, id, ... } from Ops → YouTube (directors and the Media role)
//   approve { id, teacher, series }    fires "produce"
//   skip / unskip { id }
//   retry { id }                       fires "produce" again for a proposal that seems stuck
//   save { id, changes }               title, description, tags, hashtags, privacy, publish_date/time, playlist, headline, accent
//   thumb { id, changes }              saves, then fires "thumb"
//   recut { id, start_sec, end_sec }   fires "produce" with the new in/out
//   publish { id, changes }            saves, checks, then fires "publish"
export async function POST(req) {
  const user = await currentUser();
  if (!canYouTube(user)) return NextResponse.json({ error: 'Only directors and the media team can use YouTube' }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const who = user.name || user.email;
  try {
    switch (b.action) {
      case 'approve': return NextResponse.json({ proposal: await Y.approve(b.id, b, who) });
      case 'skip': return NextResponse.json({ proposal: await Y.skip(b.id, who) });
      case 'unskip': return NextResponse.json({ proposal: await Y.skip(b.id, who, true) });
      case 'retry': return NextResponse.json({ proposal: await Y.retry(b.id, who) });
      case 'save': return NextResponse.json({ cut: await Y.saveCut(b.id, b.changes, who) });
      case 'thumb': return NextResponse.json({ cut: await Y.rethumb(b.id, b.changes, who) });
      case 'recut': return NextResponse.json({ cut: await Y.recut(b.id, b, who) });
      case 'publish': return NextResponse.json({ cut: await Y.publish(b.id, b.changes, who) });
      default: return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
    }
  } catch (e) { return NextResponse.json({ error: e.message }, { status: 400 }); }
}
