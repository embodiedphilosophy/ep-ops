// Ads › Creative results: which pictures and which words did best and worst, for the ads Ops itself built. Reads only. It informs; it changes nothing in Meta, in the ads,
// or in any table, and it never picks creative for anyone.
//
// What the numbers can and cannot say:
//  - A PICTURE is attributable. Every ad is one picture inside one ad set, and Meta's results come back per ad, so a picture's numbers are the sum of its ads.
//  - WORDS are not. Ops sends all five copy sets inside every ad (createAdCreative: one creative = one picture + all five texts) and Meta mixes them, and the results kept here
//    are per ad, not per text. So the words are judged as the LINE-UP that ran together (the campaigns that carried exactly those texts), never one text at a time.
//    A line-up of one text, if there ever is one, is that text on its own.
//  - A PAIRING is a line-up with one picture: that picture's ads in the campaigns that carried that line-up.
// Fairness: a picture or line-up can run in different audiences and budgets, so every row says how many ad sets, audiences and campaigns are behind it, and a row that ran in one
// audience says so. Sales ads (goal Purchase) and lead ads (goal Lead) are never mixed, and Traffic campaigns are left out (no sales or leads to judge).
// Thresholds are the ones already used elsewhere: the least spend and the least sales or leads before a number counts (insightsverify.js), and the 1.5 line (adsplan.js).
import { createHash } from 'node:crypto';
import { peekRows, adTotals, adsTablesExist } from './adsstore.js';
import { hasToken, managerUrl } from './meta-ads.js';
import { RULE_DEFAULTS } from './adsplan.js';
import { MIN_PURCHASES, MIN_LEADS, MIN_SPEND_CENTS } from './insightsverify.js';
import { valueOf } from './adsrules.js';

const IN_META = ['live', 'paused', 'sent_paused', 'ended'];
const KINDS = { Purchase: { key: 'sales', metric: 'roas', line: RULE_DEFAULTS.Purchase.raise_threshold, min: MIN_PURCHASES, word: 'sale' }, Lead: { key: 'leads', metric: 'cpl', line: RULE_DEFAULTS.Lead.raise_threshold, min: MIN_LEADS, word: 'lead' } };
const hash = s => createHash('sha1').update(String(s)).digest('hex').slice(0, 12);
const words = s => String(s || '').replace(/\s+/g, ' ').trim();
const money = c => `$${(c / 100).toLocaleString('en-US', { minimumFractionDigits: c % 100 ? 2 : 0, maximumFractionDigits: 2 })}`;
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

// Is this a number to act on yet? Not before the least spend AND the least sales (or leads): the bar the weekly read uses.
export function judge(kind, t) {
  const k = KINDS[kind], value = valueOf(k.metric, { spend: t.spend_cents, revenue: t.revenue_cents, purchases: t.purchases, leads: t.leads }), n = k.metric === 'cpl' ? t.leads : t.purchases;
  const v = value === Infinity ? null : value, line = k.metric === 'cpl' ? `$${k.line.toFixed(2)} a lead` : `$${k.line.toFixed(2)}`;
  if (t.spend_cents < MIN_SPEND_CENTS || n < k.min) {
    const need = [t.spend_cents < MIN_SPEND_CENTS ? `at least ${money(MIN_SPEND_CENTS)} spent (so far ${money(t.spend_cents)})` : '', n < k.min ? `at least ${plural(k.min, k.word)} (so far ${n})` : ''].filter(Boolean).join(' and ');
    return { value: v, verdict: { key: 'early', tone: 'calm', label: 'Too early to say', why: `A result needs ${need}.` } };
  }
  if (v != null && (k.metric === 'cpl' ? v <= k.line : v >= k.line)) {
    return { value: v, verdict: { key: 'ahead', tone: 'good', label: `Ahead of the ${line} line`, why: k.metric === 'cpl' ? `It costs $${v.toFixed(2)} a lead, against the ${line} line.` : `It brought back $${v.toFixed(2)} for every $1 spent, against the ${line} line.` } };
  }
  return { value: v, verdict: { key: 'behind', tone: 'warn', label: 'Behind the line', why: k.metric === 'cpl' ? (v == null ? 'It has spent money and brought no leads.' : `It costs $${v.toFixed(2)} a lead, against the ${line} line.`) : `It brought back $${(v ?? 0).toFixed(2)} for every $1 spent, against the ${line} line.` } };
}

// Best first: those with a result by that result, then the ones that are too early by what they have spent. The best and the weakest are marked (only when two or more can be judged).
function rank(rows, metric) {
  const done = rows.filter(r => r.verdict.key !== 'early'), early = rows.filter(r => r.verdict.key === 'early');
  const q = r => (r.value == null ? (metric === 'cpl' ? Infinity : -1) : r.value);
  done.sort((a, b) => (metric === 'cpl' ? q(a) - q(b) : q(b) - q(a)) || b.spend_cents - a.spend_cents);
  early.sort((a, b) => b.spend_cents - a.spend_cents);
  if (done.length > 1) { done[0].standing = 'best'; done.at(-1).standing = 'weakest'; }
  return [...done, ...early];
}

const FIELDS = ['spend_cents', 'revenue_cents', 'purchases', 'leads', 'impressions', 'clicks'];
const sum = runs => runs.reduce((t, r) => { for (const f of FIELDS) t[f] += r.t[f]; return t; }, Object.fromEntries(FIELDS.map(f => [f, 0])));

// One row: the numbers, the verdict, and where it ran (so a person can see whether two rows were compared fairly)
function rowOf(kind, runs, extra) {
  const t = sum(runs), j = judge(kind, t), byCampaign = new Map(), byAudience = new Map();
  for (const r of runs) {
    const c = byCampaign.get(r.campaign.id) || { id: r.campaign.id, name: r.campaign.name, status: r.campaign.status, spend_cents: 0, ops_url: `/ops/ads/${r.campaign.id}`, manager_url: r.manager_url };
    c.spend_cents += r.t.spend_cents; byCampaign.set(r.campaign.id, c);
    const a = byAudience.get(r.audience) || { name: r.audience_name, spend_cents: 0 }; a.spend_cents += r.t.spend_cents; byAudience.set(r.audience, a);
  }
  const audiences = [...byAudience.values()].sort((a, b) => b.spend_cents - a.spend_cents), campaigns = [...byCampaign.values()].sort((a, b) => b.spend_cents - a.spend_cents);
  return { ...extra, ...t, value: j.value, verdict: j.verdict, ctr: t.impressions > 0 ? Math.round((t.clicks / t.impressions) * 1000) / 10 : null,
    ads: runs.length, adsets: new Set(runs.map(r => r.adset.id)).size, audiences, one_audience: audiences.length === 1, campaigns, one_campaign: campaigns.length === 1 };
}

const imageOf = cr => {
  const im = cr.images || {}, src = String(cr.source || '');
  if (cr.kind === 'video') return { key: `vid:${hash(cr.video_url || im['9:16'] || im['4:5'] || cr.id)}`, name: 'A video ad', thumb: '', video: true };
  const first = im['1:1'] || im['4:5'] || im['1.91:1'] || im['9:16'] || '';
  // a picture chosen from the library is the same picture wherever it ran; an upload is told apart by its file (and who uploaded it is never shown)
  if (src && !/^Uploaded by /i.test(src)) return { key: `src:${src}`, name: src.replace(/^(Image library|Course Library cover) · /, ''), thumb: first, video: false };
  return { key: `up:${hash(first || cr.id)}`, name: 'An uploaded picture', thumb: first, video: false };
};
// The words as saved on the ad: only real copy (a placeholder never ran: it blocks Start)
const textsOf = sets => sets.filter(s => !s.is_placeholder && (words(s.main_text) || words(s.headline))).sort((a, b) => a.position - b.position)
  .map(s => ({ headline: words(s.headline), body: words(s.main_text) }));   // the source line names people (a testimonial's author, who wrote it), so it is not carried here
const lineupKey = texts => (texts.length ? `words:${hash(JSON.stringify(texts.map(t => [t.headline, t.body]).sort()))}` : '');

export function buildGroups({ campaigns, adsets, creatives, copysets, ads, totals, connected }) {
  const tot = new Map(totals.map(t => [t.ad_id, t])), set = new Map(adsets.map(a => [a.id, a])), cre = new Map(creatives.map(c => [c.id, c])), camp = new Map(campaigns.map(c => [c.id, c]));
  const texts = new Map(campaigns.map(c => [c.id, textsOf(copysets.filter(s => s.campaign_id === c.id))]));
  const runs = [];
  for (const a of ads) {
    const t = tot.get(a.id), c = camp.get(a.campaign_id), s = set.get(a.adset_id), cr = cre.get(a.creative_id);
    if (!t || !c || !s || !cr || !(t.spend_cents > 0 || t.impressions > 0)) continue;   // an ad that never ran is not "where it ran"
    const lineup = texts.get(c.id) || [];
    runs.push({ campaign: c, adset: s, t, audience: s.audience_id || s.audience_name || s.id, audience_name: s.audience_name || 'An audience', img: imageOf(cr), lineup, lineup_key: lineupKey(lineup),
      manager_url: connected && c.meta_campaign_id && !String(c.meta_campaign_id).startsWith('dryrun-') ? managerUrl(c.meta_campaign_id) : '' });
  }
  const by = (list, keyOf) => { const m = new Map(); for (const r of list) { const key = keyOf(r); if (key) (m.get(key) || m.set(key, []).get(key)).push(r); } return m; };
  const groups = [];
  for (const [kind, k] of Object.entries(KINDS)) {
    const mine = runs.filter(r => r.campaign.goal === kind);
    if (!mine.length) continue;
    const images = rank([...by(mine, r => r.img.key)].map(([key, rs]) => rowOf(kind, rs, { key, name: rs[0].img.name, thumb: rs[0].img.thumb, video: rs[0].img.video })), k.metric);
    const copy = rank([...by(mine, r => r.lineup_key)].map(([key, rs]) => rowOf(kind, rs, { key, texts: rs[0].lineup, together: rs[0].lineup.length > 1 })), k.metric);
    const pairs = [...by(mine, r => r.lineup_key && `${r.lineup_key}|${r.img.key}`)].map(([key, rs]) => rowOf(kind, rs, { key, name: rs[0].img.name, thumb: rs[0].img.thumb, video: rs[0].img.video, texts: rs[0].lineup }));
    const enough = pairs.filter(p => p.spend_cents >= MIN_SPEND_CENTS);
    groups.push({ kind, key: k.key, metric: k.metric, line: k.line, campaigns: new Set(mine.map(r => r.campaign.id)).size, images, copy, pairs: rank(enough, k.metric), pairs_hidden: pairs.length - enough.length });
  }
  return groups;
}

export async function creativeView() {
  const base = { exists: false, connected: hasToken(), synced_at: '', groups: [], left_out: { traffic: 0 }, in_meta: 0,
    thresholds: { min_spend_cents: MIN_SPEND_CENTS, min_purchases: MIN_PURCHASES, min_leads: MIN_LEADS, sales_line: KINDS.Purchase.line, lead_line: KINDS.Lead.line } };
  if (!(await adsTablesExist())) return base;
  const campaigns = (await peekRows('campaigns', {}, { limit: 2000 })).filter(c => IN_META.includes(c.status));
  const [adsets, creatives, copysets, ads, { rows: totals, synced_at }] = await Promise.all([peekRows('adsets', {}, { limit: 2000 }), peekRows('creatives', {}, { limit: 2000 }), peekRows('copysets', {}, { limit: 2000 }), peekRows('ads', {}, { limit: 2000 }), adTotals()]);
  const judged = campaigns.filter(c => KINDS[c.goal]);
  return { ...base, exists: true, synced_at, in_meta: campaigns.length, left_out: { traffic: campaigns.filter(c => c.goal === 'Traffic').length }, groups: buildGroups({ campaigns: judged, adsets, creatives, copysets, ads, totals, connected: base.connected }) };
}
