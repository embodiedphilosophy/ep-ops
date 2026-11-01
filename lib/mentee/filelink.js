// Short-lived signed links to hand-in files, which live in a private Blob store (SUBMISSIONS_BLOB_TOKEN).
// Only the mentor view is given links; the route re-checks the signature and expiry before streaming anything.
import crypto from 'crypto';

const secret = () => { const s = process.env.MEMBER_SECRET || process.env.OPS_SECRET; if (!s) throw new Error('MEMBER_SECRET is not set'); return s; };
const sig = (id, exp) => crypto.createHmac('sha256', secret()).update(`file|${id}|${exp}`).digest('base64url');
// The private store's token: Vercel names it SUBMISSIONS_READ_WRITE_TOKEN when the store is connected with the prefix SUBMISSIONS
export const blobToken = () => process.env.SUBMISSIONS_BLOB_TOKEN || process.env.SUBMISSIONS_READ_WRITE_TOKEN || '';
export const filesConfigured = () => !!blobToken();

export function fileLink(id, ttlMs = 10 * 60 * 1000) {
  const exp = Date.now() + ttlMs;
  return `/api/member/file?id=${encodeURIComponent(id)}&exp=${exp}&sig=${sig(id, exp)}`;
}
export function checkFileLink(id, exp, given) {
  const good = sig(String(id), String(exp));
  return Number(exp) > Date.now() && good.length === String(given || '').length && crypto.timingSafeEqual(Buffer.from(good), Buffer.from(String(given)));
}
