import { NextResponse } from 'next/server';
import { currentUser } from '@/lib/ops/auth';
import { isStaff, canEditSocial } from '@/lib/ops/nav';
import { readPlain, addPlain } from '@/lib/ops/store';
import { readImage, saveImage, lh3, driveIdOf, DRIVE_ID } from '@/lib/ops/socialimages';
import { refreshSite } from '@/lib/ops/refresh';
import { todayET } from '@/lib/events';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;
const SHOW = { sheet: 'social', light: true };
const MAX = 4_000_000; // base64 characters (~3 MB picture); the screen shrinks pictures before sending

// GET ?id=<Drive file id>  the full-size picture, for the crop tool. Only pictures the Social Engine uses.
export async function GET(req) {
  const user = await currentUser();
  if (!isStaff(user)) return NextResponse.json({ error: 'Please sign in again' }, { status: 401 });
  const id = new URL(req.url).searchParams.get('id') || '';
  if (!DRIVE_ID.test(id)) return NextResponse.json({ error: 'Unknown picture' }, { status: 400 });
  const [lib, plan] = await Promise.all([readPlain('Image Library', SHOW), readPlain('Weekly Plan', SHOW)]);
  const known = lib.rows.some(r => r.values.drive_file_id === id || driveIdOf(r.values.public_url) === id) || plan.rows.some(r => driveIdOf(r.values.image_url) === id);
  if (!known) return NextResponse.json({ error: 'Not a Social Engine picture' }, { status: 404 });
  try {
    const { buf, type } = await readImage(id);
    return new NextResponse(buf, { headers: { 'Content-Type': type, 'Cache-Control': 'private, max-age=86400' } });
  } catch (e) {
    console.error('Social image read failed', e.message);
    return NextResponse.json({ error: e.message }, { status: 502 });
  }
}

// POST { kind: 'upload' | 'crop', name, data: base64 JPEG }
//   upload → a new Image Library row (reuse OK) → { image_id, image_url }
//   crop   → just the new file → { image_url }; the post saves it as its image_url
export async function POST(req) {
  const user = await currentUser();
  if (!canEditSocial(user)) return NextResponse.json({ error: 'Only the social team can change posts' }, { status: 403 });
  const { kind, name, data } = await req.json().catch(() => ({}));
  if (!['upload', 'crop'].includes(kind)) return NextResponse.json({ error: 'Unknown request' }, { status: 400 });
  if (typeof data !== 'string' || !data.startsWith('/9j/')) return NextResponse.json({ error: 'Send a JPEG picture' }, { status: 400 });
  if (data.length > MAX) return NextResponse.json({ error: 'That picture is too large' }, { status: 413 });
  const base = String(name || 'picture').replace(/\.[a-z0-9]+$/i, '').replace(/[^\w\-. ]+/g, '').trim().slice(0, 80) || 'picture';
  const file = `${base}${kind === 'crop' ? '-crop' : ''}-${Date.now().toString(36)}.jpg`;
  try {
    const id = await saveImage(file, data), url = lh3(id);
    if (kind === 'crop') return NextResponse.json({ ok: true, image_url: url });
    const lib = await readPlain('Image Library', { sheet: 'social' });
    const n = Math.max(0, ...lib.rows.map(r => Number(String(r.values.image_id).match(/^IMG-(\d+)$/)?.[1]) || 0)) + 1;
    const image_id = `IMG-${String(n).padStart(4, '0')}`;
    await addPlain('Image Library', {
      image_id, file_name: file, drive_file_id: id, public_url: url, folder: 'EP Social – Dashboard images', type: 'Upload',
      drive_link: `https://drive.google.com/file/d/${id}/view`, year: todayET().slice(0, 4), reuse_ok: 'TRUE', times_used: '0', hidden: 'FALSE', tags: 'uploaded',
    }, { who: user.name || user.email, sheet: 'social' });
    refreshSite();
    return NextResponse.json({ ok: true, image_id, image_url: url });
  } catch (e) {
    console.error('Social image save failed', e.message);
    return NextResponse.json({ error: /SOCIAL_IMAGES_HOOK/.test(e.message) ? e.message : `Couldn’t save the picture (${e.message})` }, { status: 502 });
  }
}
