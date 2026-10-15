import { NextResponse } from 'next/server';
import { currentUser } from '@/lib/ops/auth';
import { canEditSite } from '@/lib/ops/nav';
import { ceAction } from '@/lib/ops/ce';

export const dynamic = 'force-dynamic';

// CE ledger actions from /ops/ce. POST { action: approve | revoke | rename | done, id, name, why, email, slug }
export async function POST(req) {
  const user = await currentUser();
  if (!user || !canEditSite(user)) return NextResponse.json({ error: 'Please sign in again' }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  if (!['approve', 'revoke', 'rename', 'done'].includes(b.action)) return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  try { return NextResponse.json(await ceAction({ ...b, by: user.name || user.email })); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.status || 502 }); }
}
