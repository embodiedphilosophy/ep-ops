import { NextResponse } from 'next/server';
import { pipelineGate, fail } from '@/lib/ops/pipelineauth';
import { addCut } from '@/lib/ops/youtube';

export const dynamic = 'force-dynamic';

// POST a finished cut → { cut_id }. A re-cut for the same proposal updates that cut (staff edits kept).
export async function POST(req) {
  const no = pipelineGate(req); if (no) return no;
  try { return NextResponse.json({ cut_id: (await addCut(await req.json())).id }); }
  catch (e) { return fail(e); }
}
