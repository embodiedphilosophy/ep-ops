import { NextResponse } from 'next/server';
import { pipelineGate, fail } from '@/lib/ops/pipelineauth';
import { saveThumbnail } from '@/lib/ops/youtube';

export const dynamic = 'force-dynamic';

// POST multipart: file (JPEG 1280×720), optional thumb_headline, thumb_accent → stored in Vercel Blob
export async function POST(req, { params }) {
  const no = pipelineGate(req); if (no) return no;
  try {
    const form = await req.formData();
    const cut = await saveThumbnail((await params).id, form.get('file'), { thumb_headline: form.get('thumb_headline'), thumb_accent: form.get('thumb_accent') });
    return NextResponse.json({ ok: true, thumbnail_url: cut.thumbnail_url });
  } catch (e) { return fail(e); }
}
