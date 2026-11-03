// The YouTube pipeline's door into Ops (repo embodiedphilosophy/ep-youtube-pipeline). Machine-only:
// every call carries Authorization: Bearer OPS_PIPELINE_SECRET. Staff use /api/ops/youtube instead.
// The sub-path travels as ?path=…, e.g. /api/youtube?path=/cuts/12/thumbnail (no catch-all folder).
//   GET  state                    → { used_vimeo_ids, upcoming_programs }
//   GET  queue[?peek=1]           → { jobs } (claims them) or { waiting }
//   POST proposals                → { added }
//   POST cuts                     → { cut_id }
//   GET  cuts/:id                 → the cut and everything staff edited
//   POST cuts/:id/thumbnail       multipart file (JPEG) [+ thumb_headline, thumb_accent]
//   POST cuts/:id/published       { youtube_id, youtube_url }
//   POST cuts/:id/failed          { error }
import { NextResponse } from 'next/server';
import { put } from '@vercel/blob';
import {
  youtubeAvailable, pipelineState, claimJobs, addProposals, recordCut, cutForPipeline,
  setThumbnail, markPublished, markFailed,
} from '@/lib/ops/youtube';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;
const fail = (error, status = 400) => NextResponse.json({ error }, { status });

function allowed(req) {
  const secret = process.env.OPS_PIPELINE_SECRET || '';
  const got = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  return secret.length >= 16 && got === secret;
}

function guard(req) {
  if (!allowed(req)) return { error: fail('Not allowed', 401) };
  if (!youtubeAvailable()) return { error: fail('The database isn’t connected', 503) };
  const path = new URL(req.url).searchParams.get('path') || '';
  return { slug: path.split('/').map(s => s.trim()).filter(Boolean) };
}

export async function GET(req) {
  const g = guard(req);
  if (g.error) return g.error;
  const [a, id] = g.slug;
  try {
    if (a === 'state') return NextResponse.json(await pipelineState());
    if (a === 'queue') return NextResponse.json(await claimJobs({ peek: new URL(req.url).searchParams.get('peek') === '1' }));
    if (a === 'cuts' && id) return NextResponse.json(await cutForPipeline(id));
    return fail('Not found', 404);
  } catch (e) {
    console.error('YouTube pipeline GET failed', a, e.message);
    return fail(e.message, 500);
  }
}

export async function POST(req) {
  const g = guard(req);
  if (g.error) return g.error;
  const [a, id, sub] = g.slug;
  try {
    if (a === 'proposals' && !id) return NextResponse.json(await addProposals(await req.json()));
    if (a === 'cuts' && !id) return NextResponse.json(await recordCut(await req.json()));
    if (a === 'cuts' && id && sub === 'thumbnail') {
      const form = await req.formData();
      const file = form.get('file');
      if (!file || typeof file === 'string') return fail('No image');
      if (file.size > 2 * 1024 * 1024) return fail('Thumbnails must be under 2 MB (YouTube’s limit)');
      const blob = await put(`youtube/thumbnails/${id}-${Date.now()}.jpg`, file, { access: 'public', contentType: 'image/jpeg' });
      const headline = form.get('thumb_headline'), accent = form.get('thumb_accent');
      await setThumbnail(id, blob.url, { headline: headline ? String(headline) : undefined, accent: accent === null ? undefined : String(accent) });
      return NextResponse.json({ ok: true, url: blob.url });
    }
    if (a === 'cuts' && id && sub === 'published') return NextResponse.json(await markPublished(id, await req.json()));
    if (a === 'cuts' && id && sub === 'failed') { const b = await req.json().catch(() => ({})); return NextResponse.json(await markFailed(id, b.error || 'The pipeline stopped')); }
    return fail('Not found', 404);
  } catch (e) {
    console.error('YouTube pipeline POST failed', a, sub, e.message);
    return fail(e.message, 500);
  }
}
