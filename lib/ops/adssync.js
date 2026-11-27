// The hourly results sync (Ads PR 3). For every campaign that has been sent to Meta (paused, running or paused again) it reads Meta's results through the
// client, a day at a time for each ad set and each ad, and keeps them in ads_results. It only READS Meta (nothing here goes near the write gate) and needs only
// META_ADS_TOKEN. The same day again is the same row updated, so running it twice, or every hour, changes nothing but the numbers.
// A Meta error (a refusal, a rate limit, no network) is written on that campaign ("the last sync said ...") and the other campaigns carry on: the job never throws.
import { hasToken, getInsights } from './meta-ads.js';
import { adsTablesExist, listRows, getRow, updateRow, upsertResults } from './adsstore.js';

export const nyDate = (d = new Date()) => new Date(d).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
export const addDays = (date, n) => { const x = new Date(`${date}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };

const SENT = ['sent_paused', 'live', 'paused'];
const SLOW_DOWN = [4, 17, 32, 613];   // Meta's codes for "too many requests"
const say = r => (SLOW_DOWN.includes(r.code) ? 'Meta asked us to slow down. The next hourly sync will try again.' : r.notConnected ? r.error : `${r.error}`);

// dry: reads Meta and says what it would keep, writes nothing (not even the note on the campaign)
export async function runResultsSync({ days = 7, now = new Date(), dry = false } = {}) {
  const out = { dry, campaigns: 0, rows: 0, skippedRows: 0, errors: [] };
  if (!hasToken()) return { ...out, notConnected: true, note: 'Meta isn’t connected (no ads access key), so there is nothing to sync.' };
  if (!(await adsTablesExist())) return { ...out, note: 'No campaigns yet.' };
  const today = nyDate(now), since = addDays(today, -Math.min(Math.max(Number(days) || 7, 1), 60));
  const campaigns = (await listRows('campaigns')).filter(c => SENT.includes(c.status) && c.meta_campaign_id && !c.meta_campaign_id.startsWith('dryrun-'));
  for (const c of campaigns) {
    out.campaigns++;
    try {
      const [adsets, ads] = await Promise.all([listRows('adsets', { campaign_id: c.id }), listRows('ads', { campaign_id: c.id })]);
      const setOf = new Map(adsets.filter(a => a.meta_adset_id).map(a => [a.meta_adset_id, a.id])), adOf = new Map(ads.filter(a => a.meta_ad_id).map(a => [a.meta_ad_id, a]));
      const [bySet, byAd] = [await getInsights({ level: 'adset', since, until: today, campaignId: c.meta_campaign_id }), await getInsights({ level: 'ad', since, until: today, campaignId: c.meta_campaign_id })];
      const bad = [bySet, byAd].find(r => !r.ok);
      if (bad) { const msg = say(bad); out.errors.push({ campaign: c.id, error: msg }); if (!dry) await note(c.id, { at: new Date().toISOString(), ok: false, error: msg }); continue; }
      const rows = [];
      for (const r of bySet.rows) { const a = setOf.get(r.adset_id); if (a) rows.push({ ...r, campaign_id: c.id, adset_id: a, ad_id: '' }); else out.skippedRows++; }
      for (const r of byAd.rows) { const a = adOf.get(r.ad_id); if (a && r.date) rows.push({ ...r, campaign_id: c.id, adset_id: a.adset_id, ad_id: a.id }); else out.skippedRows++; }
      if (!dry) { await upsertResults(rows); await note(c.id, { at: new Date().toISOString(), ok: true, rows: rows.length }); }
      out.rows += rows.length;
    } catch (e) {
      out.errors.push({ campaign: c.id, error: 'The sync stopped on this campaign: ' + String(e.message || e).slice(0, 120) });
      if (!dry) await note(c.id, { at: new Date().toISOString(), ok: false, error: 'The sync stopped before it finished. The next hourly sync will try again.' }).catch(() => {});
    }
  }
  return out;
}

// "The last sync" is kept on the campaign; read it fresh so nothing else kept there (the draft's edits, the dry-run note) is lost
async function note(id, sync) {
  const c = await getRow('campaigns', id);
  if (c) await updateRow('campaigns', id, { meta_settings: { ...c.meta_settings, sync } });
}
