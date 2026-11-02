import { NextResponse } from 'next/server';
import { pipelineGate, fail } from '@/lib/ops/pipelineauth';
import { usedVimeoIds, upcomingPrograms } from '@/lib/ops/youtube';

export const dynamic = 'force-dynamic';

// GET → { used_vimeo_ids, upcoming_programs: [{ title, start, summary }] } for the weekly proposals
export async function GET(req) {
  const no = pipelineGate(req); if (no) return no;
  try {
    const [used_vimeo_ids, upcoming_programs] = await Promise.all([usedVimeoIds(), upcomingPrograms()]);
    return NextResponse.json({ used_vimeo_ids, upcoming_programs });
  } catch (e) { return fail(e); }
}
