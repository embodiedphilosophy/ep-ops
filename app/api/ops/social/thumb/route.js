import { NextResponse } from 'next/server';
import { currentUser } from '@/lib/ops/auth';
import { isStaff } from '@/lib/ops/nav';
import { readThumb, DRIVE_ID } from '@/lib/ops/socialimages';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// GET ?id=<Drive file id>  a small picture for the Social Engine screens, for any signed-in team member
export async function GET(req) {
  const user = await currentUser();
  if (!isStaff(user)) return NextResponse.json({ error: 'Please sign in again' }, { status: 401 });
  const id = new URL(req.url).searchParams.get('id') || '';
  if (!DRIVE_ID.test(id)) return NextResponse.json({ error: 'Unknown picture' }, { status: 400 });
  try {
    const { buf, type } = await readThumb(id);
    return new NextResponse(buf, { headers: { 'Content-Type': type, 'Cache-Control': 'private, max-age=604800' } });
  } catch (e) {
    console.error('Social thumbnail read failed', e.message);
    return NextResponse.json({ error: e.message }, { status: 502 });
  }
}
