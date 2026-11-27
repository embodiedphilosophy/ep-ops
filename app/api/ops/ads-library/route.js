import { NextResponse } from 'next/server';
import { currentUser } from '@/lib/ops/auth';
import { canAds } from '@/lib/ops/nav';
import { getRow, adsTablesExist } from '@/lib/ops/adsstore';
import { libraryList, libraryDetail, setTags, bringBack, saveThresholds, getThresholds, audienceIdeas, overlapOf, draftsForPicker, THRESHOLD_FIELDS } from '@/lib/ops/adslibrary';
import { useLibraryAudience } from '@/lib/ops/adsdraft';
import { archetypeCounts, archetypesByAd, reportStatus } from '@/lib/ops/reportdata';
import { logSettingChange } from '@/lib/ops/store';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;
const bad = (error, status = 400) => NextResponse.json({ error }, { status });
const who = u => u.name || u.email;
const ninety = () => new Date(Date.now() - 90 * 86400e3).toISOString().slice(0, 10);

// The Audience library (Ads PR 4). Directors and the Ads role, like the rest of Ads.
// GET            → the library, the Practice Report's state and its ideas, and the thresholds
// GET ?id=…      → one audience with its result in every campaign, what it buys, and the quiz archetypes it overlaps with (anonymous counts from the Practice Report)
// GET ?drafts=1  → the draft campaigns "Use in a campaign" can swap an audience into
// GET ?settings=1 → the five thresholds and what each means (the Settings page; directors)
export async function GET(req) {
  const user = await currentUser();
  if (!canAds(user)) return bad('Ads is for directors and the Ads role', 403);
  const q = new URL(req.url).searchParams;
  try {
    if (q.get('settings')) {
      if (!user.director) return bad('Settings are for directors', 403);
      return NextResponse.json({ values: await getThresholds(), fields: Object.fromEntries(Object.entries(THRESHOLD_FIELDS).map(([k, f]) => [k, { label: f[0], help: f[1], min: f[2], max: f[3] }])) });
    }
    if (q.get('drafts')) return NextResponse.json({ drafts: await draftsForPicker(who(user)) });
    if (q.get('id')) {
      const d = await libraryDetail(q.get('id')); if (!d) return bad('No such audience', 404);
      const report = reportStatus(), byAd = report.connected ? await archetypesByAd({ since: ninety() }) : report;
      return NextResponse.json({ ...d, overlap: overlapOf(d, byAd), report });
    }
    const lib = await libraryList(), report = reportStatus(), counts = report.connected ? await archetypeCounts({ since: ninety() }) : null;
    return NextResponse.json({ ...lib, report, ideas: counts?.ok ? { total: counts.total, since: ninety(), items: audienceIdeas(counts) } : null, ideas_error: counts && !counts.ok ? counts.error : '' });
  } catch (e) { console.error('Audience library read failed', e.message); return bad('Couldn’t read the Audience library', 502); }
}

export async function POST(req) {
  const user = await currentUser();
  if (!canAds(user)) return bad('Ads is for directors and the Ads role', 403);
  const b = await req.json().catch(() => ({})), me = who(user);
  try {
    if (b.action === 'saveThresholds') {
      if (!user.director) return bad('Settings are for directors', 403);
      const r = await saveThresholds(b.values, me, logSettingChange);
      return NextResponse.json({ ok: true, values: r, changed: r.changed });
    }
    if (!(await adsTablesExist())) return bad('There is nothing in the library yet.', 404);
    const a = await getRow('audiences', String(b.id || ''));
    if (!a) return bad('No such audience', 404);
    if (b.action === 'setTags') { const r = await setTags(a.id, b.tags); return NextResponse.json({ ok: true, tags: r.tags }); }
    if (b.action === 'bringBack') {
      if (!b.confirm) return bad('Please confirm first');
      const r = await bringBack(a.id, me);
      return NextResponse.json(r, { status: r.ok ? 200 : r.status || 409 });
    }
    if (b.action === 'useInCampaign') {
      const cand = await useLibraryAudience(String(b.campaign_id || ''), String(b.adset_id || ''), a, { confirmRetired: !!b.confirm_retired });
      return NextResponse.json({ ok: true, message: `${cand.name} is now in the draft. Open it to see the ad set.`, campaign_id: b.campaign_id });
    }
    return bad('Unknown request');
  } catch (e) { console.error('Audience library write failed', e.message); return bad(e.user ? e.message : 'Couldn’t save that. Try again in a moment.', e.user ? 400 : 502); }
}
