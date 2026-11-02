import { NextResponse } from 'next/server';
import { pipelineGate, fail } from '@/lib/ops/pipelineauth';
import { addProposals } from '@/lib/ops/youtube';

export const dynamic = 'force-dynamic';

// POST { week_of, proposals: [{ vimeo_id, title, link, duration_sec, plays, picture, teacher, angle, reason }] }
export async function POST(req) {
  const no = pipelineGate(req); if (no) return no;
  try {
    const saved = await addProposals(await req.json());
    return NextResponse.json({ ok: true, proposal_ids: saved.map(p => p.id) });
  } catch (e) { return fail(e); }
}
