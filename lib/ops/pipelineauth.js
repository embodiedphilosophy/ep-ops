import crypto from 'crypto';
import { NextResponse } from 'next/server';

// The YouTube pipeline (GitHub Actions) signs every call with Authorization: Bearer $OPS_PIPELINE_SECRET.
// Returns a 401/503 response to send back, or null when the caller is the pipeline.
export function pipelineGate(req) {
  const secret = process.env.OPS_PIPELINE_SECRET || '';
  if (secret.length < 24) return NextResponse.json({ error: 'OPS_PIPELINE_SECRET is not set on ep-ops' }, { status: 503 });
  const given = String(req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  const a = crypto.createHash('sha256').update(given).digest(), b = crypto.createHash('sha256').update(secret).digest();
  return crypto.timingSafeEqual(a, b) && given.length === secret.length ? null : NextResponse.json({ error: 'Not authorised' }, { status: 401 });
}

export const fail = e => NextResponse.json({ error: e.message || 'Something went wrong' }, { status: /no such/i.test(e.message) ? 404 : 400 });
