import { NextResponse } from 'next/server';
import { verify, sign, COOKIE } from '@/lib/ops/auth';

export const dynamic = 'force-dynamic';
export async function GET(req) {
  const url = new URL(req.url);
  const data = verify(url.searchParams.get('token'));
  if (!data || data.purpose !== 'login') return NextResponse.redirect(new URL('/ops/login?expired=1', url));
  const res = NextResponse.redirect(new URL('/ops', url));
  res.cookies.set(COOKIE, sign({ email: data.email }, 60 * 60 * 24 * 30), { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 30 });
  return res;
}
