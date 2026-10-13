import { revalidatePath, revalidateTag } from 'next/cache';
import { after } from 'next/server';
import { SHEET_TAG } from '../google';

// After the dashboard writes to the sheet, expire cached sheet reads in BOTH apps so the change shows on the
// next request instead of within 5 minutes:
//   this app (ep-ops): directly;
//   the public website (ep-website, its own Vercel project): by calling its /api/revalidate with
//   REVALIDATE_SECRET (same value set on both projects). Runs after the response, so saves stay fast.
//   If the call fails, the site still catches up on its own within 5 minutes.
export function refreshSite() {
  revalidateTag(SHEET_TAG, { expire: 0 });
  revalidatePath('/', 'layout');
  const secret = process.env.REVALIDATE_SECRET;
  if (!secret) return;
  const site = (process.env.SITE_URL || 'https://www.embodiedphilosophy.com').replace(/\/$/, '');
  const ping = () => fetch(`${site}/api/revalidate`, {
    method: 'POST', headers: { 'x-revalidate-secret': secret }, signal: AbortSignal.timeout(8000),
  }).then(r => { if (!r.ok) console.error('Site refresh failed', r.status); })
    .catch(e => console.error('Site refresh failed', e.message));
  try { after(ping); } catch { ping(); }
}
