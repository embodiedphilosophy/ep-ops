import { NextResponse } from 'next/server';
import { signContract, decline } from '@/lib/ops/faculty';

export const dynamic = 'force-dynamic';

// Public: the invited teacher's answer. The signed token in the link is the only key.
// POST { token, action: 'sign', name, agree } | { token, action: 'decline' }
export async function POST(req) {
  const b = await req.json().catch(() => ({}));
  const base = process.env.OPS_URL || new URL(req.url).origin;
  const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim();
  try {
    if (b.action === 'decline') { await decline(b.token, base); return NextResponse.json({ ok: true }); }
    if (b.action === 'sign') { const inv = await signContract(b.token, { name: b.name, agree: !!b.agree }, { ip, base }); return NextResponse.json({ ok: true, status: inv.status }); }
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (e) {
    console.error('Invitation answer failed', e.message);
    return NextResponse.json({ error: /^Sheets|^Google/.test(e.message) ? 'Something went wrong saving that. Please try again in a minute.' : e.message }, { status: 400 });
  }
}
