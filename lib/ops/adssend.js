// "Send to Meta, paused" and "Start" (Ads PR 2). Both only ever run because a person pressed the button, and both go through the one write gate in
// meta-ads.js: unless META_ADS_LIVE is exactly "live" they are dry runs that send nothing and say what they would have sent.
// Everything is made PAUSED in Meta so its ad review can begin early; Start is a separate step that needs every check to pass.
import { buildCampaign, uploadAdImage, setStatus, isLive } from './meta-ads';
import { campaignTree, updateRow, createRow } from './adsstore';
import { adLink, campaignTotal } from './adsdraft';
import { runChecks } from './adscheck';

const PLACEMENTS = { feeds_stories: { publisher_platforms: ['facebook', 'instagram'], facebook_positions: ['feed', 'story'], instagram_positions: ['stream', 'story'] } };
const clean = (t, placements) => { const o = Object.fromEntries(Object.entries(t || {}).filter(([k]) => !k.startsWith('_'))); return { ...o, ...(PLACEMENTS[placements] || {}) }; };
const offset = (date, hour) => { // the date and hour as New York time, with its offset that day
  const d = new Date(`${date}T12:00:00Z`), p = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', timeZoneName: 'shortOffset' }).formatToParts(d).find(x => x.type === 'timeZoneName')?.value || 'GMT-5';
  const n = Number((p.match(/-?\d+/) || ['-5'])[0]); return `${date}T${String(hour).padStart(2, '0')}:00:00${n < 0 ? '-' : '+'}${String(Math.abs(n)).padStart(2, '0')}00`;
};
async function base64Of(url) {
  if (url.startsWith('data:')) return url.split(',')[1] || '';
  const r = await fetch(url, { signal: AbortSignal.timeout(20000), cache: 'no-store' }); if (!r.ok) throw new Error('Couldn’t read one of the pictures');
  return Buffer.from(await r.arrayBuffer()).toString('base64');
}
const summary = (c, t) => ({ campaign: c.meta_settings.campaign_name || c.name, goal: c.goal, structure: c.structure, adsets: t.adsets.length, ads: t.ads.length, creatives: t.creatives.length, images: t.creatives.reduce((n, x) => n + Object.values(x.images || {}).filter(Boolean).length, 0),
  copy_sets: t.copysets.length, daily_budget_cents: campaignTotal(c, t.adsets), budget_mode: c.budget_mode, start: c.start_date, end: c.end_date, link: adLink(c), audiences: t.adsets.map(a => a.audience_name) });
const log = (c, kind, by, dry, detail) => createRow('actions', { campaign_id: c.id, kind, by, dry_run: dry, detail }).catch(() => {});

export async function sendPaused(id, who) {
  const t = await campaignTree(id); if (!t) return { ok: false, error: 'No such campaign' };
  const c = t.campaign;
  if (c.status !== 'draft') return { ok: false, error: 'This campaign has already been sent to Meta.' };
  const checks = await runChecks(t);
  if (!checks.canSend) return { ok: false, error: `Not ready to send: ${checks.failing.join('; ')}.` };
  const live = isLive(), dry = !live;
  if (live && t.creatives.some(x => x.kind === 'video')) return { ok: false, error: 'Video ads can’t be sent from here yet. Make that ad a picture, or add the video in Meta’s own Ads Manager.' };
  // 1) each picture to Meta (a write, so gated), 2) the whole campaign, paused
  const ads = [];
  for (const cr of t.creatives) {
    const images = {};
    for (const [ratio, url] of Object.entries(cr.images || {})) {
      const name = `${c.id}-${cr.position}-${ratio.replace(':', 'x')}`;
      const r = await uploadAdImage({ name, bytesBase64: live ? await base64Of(url).catch(() => '') : '' });
      if (!r.ok) return { ok: false, error: r.error };
      images[ratio] = r.images?.[name]?.hash || r.id;
    }
    ads.push({ name: `Ad ${cr.position}`, images });
  }
  const per = c.budget_mode === 'per_adset';
  const r = await buildCampaign({
    name: c.meta_settings.campaign_name || c.name, goal: c.goal, type: c.structure, link: adLink(c), cta: c.cta,
    copySets: t.copysets.map(x => ({ text: x.main_text, headline: x.headline })), ads,
    audiences: t.adsets.map(a => ({ name: a.audience_name, targeting: clean(a.targeting, c.meta_settings.placements), ...(per ? { dailyBudgetCents: a.daily_budget_cents } : {}) })),
    budget: per ? {} : { campaignDailyCents: c.daily_budget_cents }, spendCapCents: c.spend_cap_cents || undefined,
    startTime: c.start_date ? offset(c.start_date, 0) : undefined, endTime: c.end_date ? offset(c.end_date, 23) : undefined,
  });
  if (!r.ok) {
    if (r.made?.campaign) await updateRow('campaigns', id, { meta_settings: { ...c.meta_settings, partial: { at: new Date().toISOString(), campaign: r.made.campaign, adsets: r.made.adsets.length, ads: r.made.ads.length } } });
    return { ok: false, error: r.error, made: r.made };
  }
  const sum = summary(c, t);
  if (r.dryRun) {
    await updateRow('campaigns', id, { meta_settings: { ...c.meta_settings, last_dry_run: { at: new Date().toISOString(), kind: 'send', counts: { adsets: sum.adsets, ads: sum.ads } } } });
    await log(c, 'send_to_meta', who, true, `Dry run: would make 1 campaign, ${sum.adsets} ad set(s), ${sum.ads} ads, paused`);
    return { ok: true, dryRun: true, message: 'Dry run — nothing was sent to Meta', would: sum };
  }
  const ord = (a, b) => a.position - b.position, sets = [...t.adsets].sort(ord), crs = [...t.creatives].sort(ord);
  for (const [i, s] of sets.entries()) await updateRow('adsets', s.id, { meta_adset_id: r.made.adsets[i] || '', status: 'paused' });
  for (const [i, x] of crs.entries()) await updateRow('creatives', x.id, { meta_creative_id: r.made.creatives[i] || '' });
  const rows = [...t.ads].sort((a, b) => sets.findIndex(s => s.id === a.adset_id) - sets.findIndex(s => s.id === b.adset_id) || a.position - b.position);
  for (const [i, x] of rows.entries()) await updateRow('ads', x.id, { meta_ad_id: r.made.ads[i] || '', status: 'paused' });
  await updateRow('campaigns', id, { status: 'sent_paused', meta_campaign_id: r.made.campaign, meta_settings: { ...c.meta_settings, partial: null } });
  await log(c, 'send_to_meta', who, false, `Sent to Meta, paused: 1 campaign, ${sum.adsets} ad set(s), ${sum.ads} ads`);
  return { ok: true, dryRun: false, message: 'Sent to Meta, paused. Nothing spends until you press Start.', would: sum };
}

export async function startCampaign(id, who) {
  const t = await campaignTree(id); if (!t) return { ok: false, error: 'No such campaign' };
  const c = t.campaign;
  if (!['draft', 'sent_paused'].includes(c.status)) return { ok: false, error: 'This campaign has already started.' };
  const checks = await runChecks(t);
  if (!checks.canStart) return { ok: false, error: `Can’t start yet: ${checks.failing.join('; ')}.` };
  const live = isLive();
  if (live && c.status !== 'sent_paused') return { ok: false, error: 'Send it to Meta, paused, first. Starting turns on what is already there.' };
  const ids = live ? [c.meta_campaign_id, ...t.adsets.map(a => a.meta_adset_id), ...t.ads.map(a => a.meta_ad_id)] : [`dryrun-campaign-${c.id}`, ...t.adsets.map(a => `dryrun-adset-${a.id}`), ...t.ads.map(a => `dryrun-ad-${a.id}`)];
  if (ids.some(x => !x)) return { ok: false, error: 'Something sent to Meta has no Meta ID. Nothing was started.' };
  for (const m of ids) { const r = await setStatus(m, 'ACTIVE'); if (!r.ok) return { ok: false, error: `Meta stopped part-way (${r.error}). Some of it may be on; check it in Meta.` }; }
  const sum = summary(c, t);
  if (!live) { await log(c, 'start', who, true, 'Dry run: would turn on the campaign, its ad sets and ads'); return { ok: true, dryRun: true, message: 'Dry run — nothing was sent to Meta', would: sum }; }
  await updateRow('campaigns', id, { status: 'live' });
  await log(c, 'start', who, false, 'Started');
  return { ok: true, dryRun: false, message: 'Started. The campaign is live.', would: sum };
}
