import { NextResponse } from 'next/server';
import { currentUser } from '@/lib/ops/auth';
import { canEditSite } from '@/lib/ops/nav';
import { ceCsv } from '@/lib/ops/ce';

export const dynamic = 'force-dynamic';

// Every CE certificate as CSV (for a Yoga Alliance audit, or the finance records)
export async function GET() {
  const user = await currentUser();
  if (!user || !canEditSite(user)) return NextResponse.json({ error: 'Please sign in again' }, { status: 401 });
  try {
    return new NextResponse(await ceCsv(), { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="ep-ce-certificates-${new Date().toISOString().slice(0, 10)}.csv"`, 'Cache-Control': 'no-store' } });
  } catch (e) { return NextResponse.json({ error: e.message }, { status: 502 }); }
}
