import { NextResponse } from 'next/server';
import { pipelineGate, fail } from '@/lib/ops/pipelineauth';
import { markPublished } from '@/lib/ops/youtube';

export const dynamic = 'force-dynamic';

// POST { youtube_id, youtube_url } once the upload is done
export async function POST(req, { params }) {
  const no = pipelineGate(req); if (no) return no;
  try { return NextResponse.json({ ok: true, youtube_url: (await markPublished((await params).id, await req.json())).youtube_url }); }
  catch (e) { return fail(e); }
}
