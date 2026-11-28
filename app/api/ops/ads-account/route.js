import { NextResponse } from 'next/server';
import { currentUser } from '@/lib/ops/auth';
import { canAds } from '@/lib/ops/nav';
import { accountView } from '@/lib/ops/adsaccount';
import { actOnCampaign, reverseChange, listChanges } from '@/lib/ops/adsmanual';
import { isLive } from '@/lib/ops/meta-ads';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;
const bad = (error, status = 400) => NextResponse.json({ error }, { status });

// Ads › Campaigns › "In your Meta account" (Ads account view). Directors and the Ads role, like the rest of Ads; everyone else gets 403 on every request, buttons included.
// GET                        → every campaign in the real ad account with its last 7 and 30 days, totals, and a status block (not connected / couldn't be read, with a plain reason / ok, with "as of"),
//                              plus the changes made with the buttons below (last two weeks) and whether live changes are on. Served from a 5-minute memory; only the first look in five minutes asks Meta.
// POST { action: 'refresh' } → asks Meta again now, at most once a minute per person (inside the minute it answers from memory and says how long to wait)
// POST { action: 'act', id, what: 'pause' | 'resume' | 'raise' | 'set', dollars?, seen, confirm: true }
//                            → one hands-on press on a campaign NOT made in Ops (lib/ops/adsmanual.js): through the one write gate (only recorded unless live), after reading Meta again
// POST { action: 'reverse', action_id, confirm: true } → puts a change made with these buttons back, if Meta has not changed again since
const view = async (opts, user) => ({ ...(await accountView({ ...opts, who: user.email })), can_act: true, live: isLive(), changes: await listChanges().catch(() => []) });

export async function GET() {
  const user = await currentUser();
  if (!canAds(user)) return bad('Ads is for directors and the Ads role', 403);
  try { return NextResponse.json(await view({}, user)); }
  catch (e) { console.error('Ads account view failed', String(e.message || e).slice(0, 120)); return bad('Couldn’t read your Meta account just now. Try again in a moment.', 502); }
}

export async function POST(req) {
  const user = await currentUser();
  if (!canAds(user)) return bad('Ads is for directors and the Ads role', 403);
  const b = await req.json().catch(() => ({})), me = user.name || user.email;
  try {
    if (b.action === 'act' || b.action === 'reverse') {
      if (b.confirm !== true) return bad('Please confirm first');
      const r = b.action === 'reverse' ? await reverseChange({ actionId: b.action_id, who: me }) : await actOnCampaign({ id: b.id, what: String(b.what || ''), dollars: b.dollars, seen: b.seen, who: me });
      return NextResponse.json(r.ok ? r : { error: r.error }, { status: r.ok ? 200 : r.status || 409 });
    }
    if (b.action !== 'refresh') return bad('Unknown request');
    return NextResponse.json(await view({ refresh: true }, user));
  } catch (e) { console.error('Ads account request failed', String(e.message || e).slice(0, 120)); return bad('Couldn’t do that just now. Nothing was changed. Try again in a moment.', 502); }
}
