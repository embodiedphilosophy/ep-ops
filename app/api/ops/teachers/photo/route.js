import { NextResponse } from 'next/server';
import sharp from 'sharp';
import { currentUser } from '@/lib/ops/auth';
import { isStaff, canEditEmail } from '@/lib/ops/nav';
import { teacherRows, lower, parse } from '@/lib/ops/teachers';
import { todayET } from '@/lib/events';
import { updatePlain } from '@/lib/ops/store';
import { refreshSite } from '@/lib/ops/refresh';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;
const SHAPES = { square: [800, 800], portrait: [800, 1000], circle: [800, 800] };

// GET ?email=&shape=square|portrait|circle  → the headshot cropped around its focal point (a circle is a PNG with a round edge)
export async function GET(req) {
  const user = await currentUser();
  if (!isStaff(user)) return NextResponse.json({ error: 'Please sign in again' }, { status: 401 });
  const u = new URL(req.url), shape = u.searchParams.get('shape') || 'square';
  if (!SHAPES[shape]) return NextResponse.json({ error: 'Unknown shape' }, { status: 400 });
  const r = (await teacherRows({ fresh: false })).find(x => lower(x.values.email) === lower(u.searchParams.get('email')));
  if (!r?.values.photo_url) return NextResponse.json({ error: 'No headshot yet' }, { status: 404 });
  try {
    const res = await fetch(r.values.photo_url, { signal: AbortSignal.timeout(15000) }); if (!res.ok) throw new Error(`photo ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer()), img = sharp(buf), { width, height } = await img.metadata(), [w, h] = SHAPES[shape];
    const fx = Math.min(100, Math.max(0, Number(r.values.focal_x) || 50)) / 100, fy = Math.min(100, Math.max(0, Number(r.values.focal_y) || 50)) / 100;
    // the biggest box of the right shape that fits, centred on the focal point and kept inside the picture
    const ratio = w / h, bw = Math.min(width, Math.floor(height * ratio)), bh = Math.floor(bw / ratio);
    const left = Math.round(Math.min(width - bw, Math.max(0, fx * width - bw / 2))), top = Math.round(Math.min(height - bh, Math.max(0, fy * height - bh / 2)));
    let out = sharp(buf).extract({ left, top, width: bw, height: bh }).resize(w, h);
    if (shape === 'circle') { out = out.composite([{ input: Buffer.from(`<svg width="${w}" height="${h}"><circle cx="${w / 2}" cy="${h / 2}" r="${w / 2}"/></svg>`), blend: 'dest-in' }]).png(); const png = await out.toBuffer(); return new NextResponse(png, { headers: { 'Content-Type': 'image/png', 'Cache-Control': 'private, max-age=300' } }); }
    return new NextResponse(await out.jpeg({ quality: 88 }).toBuffer(), { headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'private, max-age=300' } });
  } catch (e) { console.error('Headshot crop failed', e.message); return NextResponse.json({ error: 'Couldn’t read that headshot' }, { status: 502 }); }
}

// POST { email, data: base64 JPEG, name } → stores a new headshot (Vercel Blob) and keeps the earlier one as a version
export async function POST(req) {
  const user = await currentUser();
  if (!canEditEmail(user)) return NextResponse.json({ error: 'Only the email team can change this' }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  if (!process.env.BLOB_READ_WRITE_TOKEN) return NextResponse.json({ error: 'Photo storage isn’t connected here (BLOB_READ_WRITE_TOKEN).' }, { status: 503 });
  if (typeof b.data !== 'string' || !b.data.startsWith('/9j/') || b.data.length > 6_000_000) return NextResponse.json({ error: 'Send a JPEG under 4 MB' }, { status: 400 });
  const r = (await teacherRows()).find(x => lower(x.values.email) === lower(b.email)); if (!r) return NextResponse.json({ error: 'No such teacher' }, { status: 404 });
  try {
    const { put } = await import('@vercel/blob'), v = r.values, now = todayET(), me = user.name || user.email;
    const file = `teachers/${String(v.name || 'teacher').toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now().toString(36)}.jpg`;
    const blob = await put(file, Buffer.from(b.data, 'base64'), { access: 'public', contentType: 'image/jpeg' });
    const vs = parse(v.photo_versions_json, []); if (v.photo_url) vs.unshift({ url: v.photo_url, at: now, by: me });
    await updatePlain('Teachers', r.row, { photo_url: blob.url, photo_versions_json: JSON.stringify(vs.slice(0, 12)), focal_x: '50', focal_y: '40', updated_on: now }, { before: { photo_url: v.photo_url }, who: me });
    refreshSite(); return NextResponse.json({ ok: true, photo_url: blob.url });
  } catch (e) { console.error('Headshot upload failed', e.message); return NextResponse.json({ error: 'Couldn’t save the headshot' }, { status: 502 }); }
}
