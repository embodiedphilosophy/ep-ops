import { NextResponse } from 'next/server';
import { currentUser } from '@/lib/ops/auth';
import { canEditSite } from '@/lib/ops/nav';
import { runLibrarySync } from '@/lib/ops/librarysync';
import * as A from '@/lib/ops/libraryactions';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// POST { action, id?, ... } from the Course Library desk (Jacob, Irene, Floss and directors).
//   sync                        "Check Circle now"
//   save { id, changes }        edit the listing details
//   skip / unskip { id }
//   link { id, onboarding_id }  link to a teacher onboarding submission ("" unlinks)
//   publish / update / unpublish { id }
//   seen { id }                 clear "Changed in Circle"
//   map { circle_id, title, access, requires, unlock_note }   the access map
//   add_url { url }             fallback when Circle lists no courses
export async function POST(req) {
  const user = await currentUser();
  if (!canEditSite(user)) return NextResponse.json({ error: 'Only Jacob, Irene, Floss and directors can change the Course Library' }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const who = user.name || user.email;
  try {
    switch (b.action) {
      case 'sync': return NextResponse.json({ result: await runLibrarySync({ manual: true }) });
      case 'save': return NextResponse.json(await A.save(b.id, b.changes, who));
      case 'skip': return NextResponse.json(await A.skip(b.id, who));
      case 'unskip': return NextResponse.json(await A.skip(b.id, who, true));
      case 'link': return NextResponse.json(await A.link(b.id, b.onboarding_id, who));
      case 'publish': return NextResponse.json(await A.publish(b.id, who));
      case 'update': return NextResponse.json(await A.publish(b.id, who, { update: true }));
      case 'unpublish': return NextResponse.json(await A.unpublish(b.id, who));
      case 'seen': return NextResponse.json(await A.markSeen(b.id, who));
      case 'map': return NextResponse.json(await A.setMap(b));
      case 'add_url': return NextResponse.json(await A.addByUrl(b.url, who));
      default: return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
    }
  } catch (e) { return NextResponse.json({ error: e.message }, { status: 400 }); }
}
