// A dashboard sign-in cookie for local tests, signed exactly like sign() in lib/ops/auth.js (keep in step).
//   node scripts/ops-test/cookie.mjs [email]   (needs OPS_SECRET: source env.sh first)
import crypto from 'node:crypto';
const email = process.argv[2] || 'jacob@embodiedphilosophy.com';
if (!process.env.OPS_SECRET) throw new Error('OPS_SECRET is not set: source scripts/ops-test/env.sh');
const body = Buffer.from(JSON.stringify({ email, exp: Date.now() + 86400 * 1000 })).toString('base64url');
process.stdout.write(`${body}.${crypto.createHmac('sha256', process.env.OPS_SECRET).update(body).digest('base64url')}`);
