import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { ingestMedia } from '@/lib/ops/igsync';
import { setHealth } from '@/lib/ops/socialhealth';
import { refreshSite } from '@/lib/ops/refresh';
import { jobsHere, SKIPPED } from '@/lib/crongate';

// Instagram posts sent by a Make scenario ("EP Social: Instagram to dashboard"), whose Instagram connection already works.
// This is the way in until the dashboard has its own Meta access token (then /api/ops/social-sync reads Instagram itself).
// Vercel: SOCIAL_INGEST_SECRET. Make sends it in the `x-ingest-secret` header.
// Body: JSON { media: [{ id, timestamp, media_type, media_product_type?, caption, permalink, like_count, comments_count }] }
//       or one post as form fields (application/x-www-form-urlencoded) with the same names.
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const same = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };

export async function POST(req) {
  const secret = process.env.SOCIAL_INGEST_SECRET;
  if (!secret || secret.length < 16 || !same(req.headers.get('x-ingest-secret') || '', secret)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!jobsHere()) return NextResponse.json(SKIPPED);
  const type = req.headers.get('content-type') || '';
  let media = [];
  try {
    if (type.includes('json')) { const b = await req.json(); media = Array.isArray(b?.media) ? b.media : []; }
    else { const f = Object.fromEntries(new URLSearchParams(await req.text())); if (f.id) media = [f]; }
  } catch { return NextResponse.json({ error: 'Couldn’t read that' }, { status: 400 }); }
  media = media.slice(0, 100).map(m => ({ ...m, id: String(m.id || '').replace(/^'/, ''), timestamp: new Date(m.timestamp).toString() === 'Invalid Date' ? '' : new Date(m.timestamp).toISOString(),
    like_count: Number(m.like_count) || 0, comments_count: Number(m.comments_count) || 0, caption: String(m.caption || ''), permalink: String(m.permalink || '') }));
  const dry = new URL(req.url).searchParams.get('dry') === '1';
  try {
    const r = await ingestMedia(media, { dry });
    if (!dry) refreshSite();
    return NextResponse.json(r);
  } catch (e) {
    console.error('Instagram ingest failed', e.message);
    await setHealth('ig_sync_error', { error: e.message, failed_at: new Date().toISOString() }).catch(() => {});
    return NextResponse.json({ ok: false, error: e.message }, { status: 502 });
  }
}
