import { NextResponse } from 'next/server';
import { currentUser } from '@/lib/ops/auth';
import { canEditSite } from '@/lib/ops/nav';
import { runScaffolding } from '@/lib/ops/scaffoldrun';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

// GET ?date=YYYY-MM-DD → the email as a web page (nothing is created). &check=1 → what's blank, as JSON.
export async function GET(req) {
  const user = await currentUser();
  if (!canEditSite(user)) return NextResponse.json({ error: 'Please sign in again' }, { status: 401 });
  const url = new URL(req.url), date = url.searchParams.get('date');
  if (!DATE.test(String(date))) return NextResponse.json({ error: 'Pick an issue' }, { status: 400 });
  const r = await runScaffolding({ date, mode: url.searchParams.get('check') ? 'dry' : 'preview', origin: url.origin });
  if (r.html) return new NextResponse(r.html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  return NextResponse.json(r.json, { status: r.status });
}

// POST { date } → build (or rebuild) that Sunday's Kit draft. It is never scheduled or sent from here.
export async function POST(req) {
  const user = await currentUser();
  if (!canEditSite(user)) return NextResponse.json({ error: 'Only Jacob, Irene and Floss can build the newsletter' }, { status: 403 });
  const { date } = await req.json().catch(() => ({}));
  if (!DATE.test(String(date))) return NextResponse.json({ error: 'Pick an issue' }, { status: 400 });
  try {
    const r = await runScaffolding({ date, mode: 'build', origin: new URL(req.url).origin });
    return NextResponse.json(r.json, { status: r.status });
  } catch (e) {
    console.error('Scaffolding build failed', e.message);
    return NextResponse.json({ error: 'Couldn’t build the draft in Kit. Try again shortly.' }, { status: 502 });
  }
}
