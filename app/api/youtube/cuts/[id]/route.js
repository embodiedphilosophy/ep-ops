import { NextResponse } from 'next/server';
import { pipelineGate } from '@/lib/ops/pipelineauth';
import { getCut, forWorker } from '@/lib/ops/youtube';

export const dynamic = 'force-dynamic';

// GET the cut as staff left it (title, description, tags, thumbnail_url, privacy, publish_at, playlist_id…)
export async function GET(req, { params }) {
  const no = pipelineGate(req); if (no) return no;
  const cut = await getCut((await params).id);
  return cut ? NextResponse.json(forWorker(cut)) : NextResponse.json({ error: 'No such cut' }, { status: 404 });
}
