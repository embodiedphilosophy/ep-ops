import { NextResponse } from 'next/server';
import { COOKIE } from '@/lib/ops/auth';
export async function GET(req) {
  const res = NextResponse.redirect(new URL('/ops/login', req.url));
  res.cookies.set(COOKIE, '', { path: '/', maxAge: 0 });
  return res;
}
