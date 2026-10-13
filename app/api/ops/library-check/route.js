import { NextResponse } from 'next/server';
import { currentUser } from '@/lib/ops/auth';
import { circleChecks } from '@/lib/ops/circlecatalog';

// Director only. Read-only probes of the Circle Admin API with the key already on the server: which endpoints
// answer and which field names they have. Returns no secrets and no member data. Result is recorded in docs/circle-api-checks.md.
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET() {
  const user = await currentUser();
  if (!user?.director) return NextResponse.json({ error: 'Directors only' }, { status: 403 });
  try { return NextResponse.json(await circleChecks()); }
  catch (e) { return NextResponse.json({ error: String(e.message).slice(0, 200) }, { status: 500 }); }
}
