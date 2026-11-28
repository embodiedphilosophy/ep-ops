// Ads › What we've learned: the pure part. What an ad "looks like" (its features), how ads are grouped, which groups came out ahead of or behind the 1.5× line, the statements
// made from them, and the CHECK every statement passes. No database, no Meta, no model in this file; the tests load it on its own.
//
// PATTERNS, NOT CAUSES. Past ads were not controlled tests: a group of ads that did better may simply have been run to a warmer audience, or in a better season. So every statement
// says "ads like this returned X", and the checker drops any that gives a reason or advice (reasoningWord in insightsverify.js).
// NO PERSON AND NO COPY: only the measures of an ad's words are kept (how long, what kind of headline, which button), never the words themselves.
import { Metrics, verifyClaim, topicName, topicKey, money, MIN_PURCHASES, MIN_LEADS, MIN_SPEND_CENTS } from './insightsverify.js';

export const TARGET = 1.5;   // Jake's aim: $1.50 back for every $1 spent
// What a group needs before it is "enough to read": well above the small minimums the weekly read uses, because a pattern is a bigger claim than a number.
export const ENOUGH = { spend_cents: MIN_SPEND_CENTS * 10, purchases: MIN_PURCHASES * 3, leads: MIN_LEADS * 3, ads: 3, campaigns: 2 };
export const EARLY = { spend_cents: MIN_SPEND_CENTS, purchases: MIN_PURCHASES, leads: MIN_LEADS };
export const LEAD_BETTER = 0.8, LEAD_WORSE = 1.25;   // a lead group is ahead at 80% of the cost per lead of all lead ads, behind at 125%

// ---- What an ad looks like
const OBJECTIVES = [[/SALES|CONVERSIONS|CATALOG/i, 'sales'], [/LEAD/i, 'leads'], [/TRAFFIC|LINK_CLICKS/i, 'traffic']];
export const goalOf = objective => (OBJECTIVES.find(([re]) => re.test(objective || '')) || [0, 'other'])[1];
export const kindOfGoal = goal => (goal === 'sales' ? 'purchase' : goal === 'leads' ? 'lead' : 'other');

const textsOf = (arr, key = 'text') => (arr || []).map(x => (typeof x === 'string' ? x : x?.[key])).filter(t => typeof t === 'string' && t.trim());
// A Meta creative → its measures. Meta shows a creative's words in more than one place (plain fields, a link, a video, or a set of alternatives), so all are looked at.
export function creativeFeatures(c) {
  const creative = c || {}, spec = creative.object_story_spec || {}, link = spec.link_data || {}, vid = spec.video_data || {}, feed = creative.asset_feed_spec || {};
  const bodies = [creative.body, link.message, vid.message, ...textsOf(feed.bodies)].filter(t => typeof t === 'string' && t.trim());
  const titles = [creative.title, link.name, vid.title, ...textsOf(feed.titles)].filter(t => typeof t === 'string' && t.trim());
  const cta = creative.call_to_action_type || link.call_to_action?.type || vid.call_to_action?.type || (feed.call_to_action_types || [])[0] || '';
  const kinds = [creative.object_type, ...(feed.ad_formats || [])].map(x => String(x || '').toUpperCase());
  const format = creative.video_id || spec.video_data || (feed.videos || []).length || kinds.some(k => /VIDEO/.test(k)) ? 'video'
    : (link.child_attachments || []).length > 1 || kinds.some(k => /CAROUSEL/.test(k)) ? 'carousel'
    : creative.image_hash || link.picture || link.image_hash || (feed.images || []).length || kinds.some(k => /PHOTO|IMAGE|SHARE/.test(k)) ? 'image' : 'unknown';
  const chars = bodies.length ? Math.round(bodies.reduce((n, t) => n + t.trim().length, 0) / bodies.length) : null;
  return { format, copy_chars: chars, copy: copyBucket(chars), headline: headlineKind(titles), cta: String(cta || '') };
}
export const copyBucket = n => (n == null ? 'none' : n < 125 ? 'short' : n <= 300 ? 'medium' : 'long');
// One kind per headline: a question, one that opens with a number, a "how to", else short or longer. Only the kind is kept.
export function headlineKind(titles) {
  const t = String((titles || [])[0] || '').trim();
  if (!t) return 'none';
  if (/\?\s*$/.test(t)) return 'question';
  if (/^\d/.test(t)) return 'number';
  if (/^how\b/i.test(t) || /\bhow to\b/i.test(t)) return 'howto';
  return t.split(/\s+/).length <= 4 ? 'short' : 'long';
}
// What kind of audience an ad set aims at, from its settings and its name. Only the kind leaves this function.
export function audienceKind(targeting, adsetName = '') {
  if (!targeting || typeof targeting !== 'object') return 'unknown';
  const custom = [...(targeting.custom_audiences || [])], names = [adsetName, ...custom.map(a => a?.name || '')].join(' ');
  if (/look-?alike|\blal\b|similar/i.test(names)) return 'lookalike';
  if (custom.length) return 'warm';
  if (targeting.targeting_automation?.advantage_audience === 1) return 'advantage';
  const spec = [...(targeting.flexible_spec || []), targeting];
  if (spec.some(s => (s.interests || []).length || (s.behaviors || []).length)) return 'interest';
  return 'broad';
}
export const budgetBucket = cents => (!cents ? 'none' : cents < 2000 ? 'small' : cents < 5000 ? 'middle' : 'large');
// Meteorological seasons, in the northern hemisphere (EP's year)
export const seasonOf = iso => { const m = Number(String(iso || '').slice(5, 7)); return !m ? 'none' : [12, 1, 2].includes(m) ? 'winter' : m <= 5 ? 'spring' : m <= 8 ? 'summer' : 'autumn'; };

// ---- How each group is named. A label reads as the start of a sentence: "Video ads returned ..." / "Ads with a question as the headline returned ...".
const ctaLabel = c => `Ads with a “${String(c).toLowerCase().replace(/_/g, ' ').replace(/^./, x => x.toUpperCase())}” button`;
export const DIMENSIONS = [
  { key: 'goal', title: 'What the ad was for', values: { sales: 'Ads made for sales', leads: 'Ads made for sign-ups (leads)', traffic: 'Ads made for visits', other: 'Ads made for other goals' } },
  { key: 'offer', title: 'What it offered' },
  { key: 'audience', title: 'Who it aimed at', values: { lookalike: 'Ads aimed at people like our best customers (lookalikes)', warm: 'Ads aimed at people who already know EP (lists and past visitors)', interest: 'Ads aimed by interests', advantage: 'Ads where Meta chose the audience', broad: 'Ads with no audience narrowing' } },
  { key: 'format', title: 'Picture or video', values: { image: 'Single-image ads', video: 'Video ads', carousel: 'Carousel ads' } },
  { key: 'copy', title: 'How long the words were', values: { short: 'Ads with short copy (under 125 characters)', medium: 'Ads with medium copy (125 to 300 characters)', long: 'Ads with long copy (over 300 characters)' } },
  { key: 'headline', title: 'The headline', values: { question: 'Ads with a question as the headline', number: 'Ads whose headline starts with a number', howto: 'Ads with a “how to” headline', short: 'Ads with a short headline (4 words or fewer)', long: 'Ads with a longer headline (5 words or more)' } },
  { key: 'cta', title: 'The button', label: ctaLabel },
  { key: 'season', title: 'The season it began', values: { winter: 'Ads that began in winter (December to February)', spring: 'Ads that began in spring (March to May)', summer: 'Ads that began in summer (June to August)', autumn: 'Ads that began in autumn (September to November)' } },
  { key: 'budget', title: 'How big the budget was', values: { small: 'Ads in ad sets with under $20 a day', middle: 'Ads in ad sets with $20 to $49 a day', large: 'Ads in ad sets with $50 or more a day' } },
];
const NOT_KNOWN = new Set(['unknown', 'none', '']);
// Every ad's value for each dimension, as { key, label } (or null when it isn't known: such ads are left out of that dimension)
export function groupValue(dim, f) {
  const d = DIMENSIONS.find(x => x.key === dim);
  const k = dim === 'offer' ? f.offer : f[dim];
  if (NOT_KNOWN.has(String(k || ''))) return null;
  if (dim === 'offer') return { key: k, label: `Ads about ${f.offer_label}` };
  const label = d.values ? d.values[k] : d.label(k);
  return label ? { key: k, label } : null;
}
// The offer: the topic in the campaign's name ("Kali: winter enrollment [E047]" → Kali). "" when the name has no topic.
export const offerOf = campaignName => { const label = topicName(campaignName); return { offer: topicKey(campaignName), offer_label: label }; };

// ---- Putting an ad together from what Meta said about it (pure; the reader passes in the lists it read)
export function adFeatures({ ad, adset, campaign, firstWeek = '' }) {
  const c = creativeFeatures(ad?.creative), goal = goalOf(campaign?.objective);
  const daily = Number(adset?.daily_budget) || Number(campaign?.daily_budget) || 0;
  return {
    goal, ...offerOf(campaign?.name), audience: audienceKind(adset?.targeting, adset?.name), ...c,
    season: seasonOf(String(ad?.created_time || '').slice(0, 10) || firstWeek), budget: budgetBucket(daily),
    started: String(ad?.created_time || '').slice(0, 7) || String(firstWeek).slice(0, 7),
  };
}

// ---- Groups
const sum = (rows, k) => rows.reduce((n, r) => n + (Number(r[k]) || 0), 0);
const round2 = v => Math.round(v * 100) / 100;
function totalsOf(rows) {
  const spend = sum(rows, 'spend_cents'), revenue = sum(rows, 'revenue_cents'), purchases = sum(rows, 'purchases'), leads = sum(rows, 'leads');
  return { spend_cents: spend, revenue_cents: revenue, purchases, leads, ads: rows.length, campaigns: new Set(rows.map(r => r.campaign_id)).size,
    ret: spend > 0 ? revenue / spend : null, cpl_cents: leads > 0 ? spend / leads : null };
}
// How far to trust a group, and which side of the line it fell on. kind: 'purchase' | 'lead'. overallCpl: the cost per lead of all lead ads (cents).
export function judgeGroup(kind, g, overallCpl) {
  let side;
  if (kind === 'purchase') side = g.ret != null && round2(g.ret) >= TARGET ? 'ahead' : 'behind';
  else side = g.cpl_cents == null ? 'behind' : overallCpl && g.cpl_cents <= overallCpl * LEAD_BETTER ? 'ahead' : overallCpl && g.cpl_cents >= overallCpl * LEAD_WORSE ? 'behind' : 'even';
  const count = kind === 'purchase' ? g.purchases : g.leads, min = kind === 'purchase' ? EARLY.purchases : EARLY.leads, big = kind === 'purchase' ? ENOUGH.purchases : ENOUGH.leads;
  const wide = g.spend_cents >= ENOUGH.spend_cents && g.ads >= ENOUGH.ads && g.campaigns >= ENOUGH.campaigns;
  // Falling short after plenty of spending is itself the finding, so "behind" needs no minimum number of purchases; "ahead" does.
  const reliability = wide && (count >= big || side === 'behind') ? 'enough' : g.spend_cents >= EARLY.spend_cents && count >= min ? 'early' : 'too_little';
  return { side, reliability };
}
export const RELIABILITY_TEXT = { enough: 'Enough to read', early: 'Early sign', too_little: 'Too little to say' };

// ads: [{ ad_id, name, campaign_id, campaign_name, adset_name, f, spend_cents, purchases, revenue_cents, leads, impressions, clicks }]
export function groupAds(ads) {
  const out = [];
  for (const kind of ['purchase', 'lead']) {
    const mine = ads.filter(a => kindOfGoal(a.f?.goal) === kind && a.spend_cents > 0);
    const all = totalsOf(mine);
    for (const dim of DIMENSIONS) {
      if (dim.key === 'goal') continue;   // the two kinds are the goal; they are reported as the totals
      const by = new Map();
      for (const a of mine) { const v = groupValue(dim.key, a.f || {}); if (v) { const k = `${dim.key}:${v.key}`; if (!by.has(k)) by.set(k, { id: `${kind}:${k}`, kind, dim: dim.key, dim_title: dim.title, key: v.key, label: v.label, members: [] }); by.get(k).members.push(a); } }
      for (const g of by.values()) { Object.assign(g, totalsOf(g.members)); Object.assign(g, judgeGroup(kind, g, all.cpl_cents)); out.push(g); }
    }
  }
  return { groups: out, totals: { purchase: totalsOf(ads.filter(a => kindOfGoal(a.f?.goal) === 'purchase' && a.spend_cents > 0)), lead: totalsOf(ads.filter(a => kindOfGoal(a.f?.goal) === 'lead' && a.spend_cents > 0)) } };
}

// ---- Statements. Code writes each one from numbers that have ids; every number in the text is one of them.
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
export const ret2 = g => round2(g.ret);
// urlFor(campaignId) → the Ads Manager link. Sources: the ads that carry the group, biggest spender first.
export function findingFor(g, M, ctx) {
  const ids = [];
  const add = (label, value, unit, extra = {}) => { const m = M.add({ label: `${g.label}: ${label}`, value, unit, source: 'meta', period: ctx.period, ...extra }); if (m) ids.push(m.id); return m; };
  if (g.kind === 'purchase') {
    if (!ctx.targetId) ctx.targetId = M.add({ label: 'The return aimed for', value: TARGET, unit: 'ratio', source: 'meta', period: ctx.period })?.id;
    ids.push(ctx.targetId);
    const spend = add('ad spend', g.spend_cents / 100, 'usd'), buys = add('purchases Meta counted', g.purchases, 'count'), ret = add('return on ad spend', ret2(g), 'ratio');
    const ads = add('ads', g.ads, 'count'), camps = add('campaigns', g.campaigns, 'count');
    const text = `${g.label} returned ${ret2(g).toFixed(2)}× on ${money(g.spend_cents)} spent (${plural(g.purchases, 'purchase', 'purchases')} across ${plural(g.ads, 'ad', 'ads')} in ${plural(g.campaigns, 'campaign', 'campaigns')}), ${g.side === 'ahead' ? 'ahead of' : 'behind'} the ${TARGET}× line.`;
    return finish(g, ids, text, ctx, [spend, buys, ret, ads, camps]);
  }
  const spend = add('ad spend', g.spend_cents / 100, 'usd'), leads = add('sign-ups Meta counted', g.leads, 'count'), cpl = add('cost per sign-up', g.cpl_cents / 100, 'usd');
  const all = M.add({ label: 'Cost per sign-up across all sign-up ads', value: ctx.overallCpl / 100, unit: 'usd', source: 'meta', period: ctx.period });
  if (all) ids.push(all.id);
  const ads = add('ads', g.ads, 'count'), camps = add('campaigns', g.campaigns, 'count');
  const text = `${g.label} cost ${money(Math.round(g.cpl_cents))} a sign-up on ${money(g.spend_cents)} spent (${plural(g.leads, 'sign-up', 'sign-ups')} across ${plural(g.ads, 'ad', 'ads')} in ${plural(g.campaigns, 'campaign', 'campaigns')}), ${g.side === 'ahead' ? 'lower' : 'higher'} than the ${money(Math.round(ctx.overallCpl))} across all sign-up ads.`;
  return finish(g, ids, text, ctx, [spend, leads, cpl, all, ads, camps]);
}
function finish(g, ids, text, ctx, metrics) {
  const sources = [...g.members].sort((a, b) => b.spend_cents - a.spend_cents).slice(0, 10).map(a => ({
    ad_id: a.ad_id, name: a.name, campaign_id: a.campaign_id, campaign_name: a.campaign_name, spend_cents: a.spend_cents,
    result: g.kind === 'purchase' ? (a.spend_cents > 0 ? round2(a.revenue_cents / a.spend_cents) : null) : (a.leads > 0 ? Math.round(a.spend_cents / a.leads) : null), url: ctx.urlFor(a.campaign_id) }));
  return { key: `${g.kind}|${g.dim}|${g.key}|${g.side}`, group: g.id, kind: g.kind, dim: g.dim, label: g.label, side: g.side, reliability: g.reliability, text, ids, metric_ids: metrics.filter(Boolean).map(m => m.id),
    sources, more: Math.max(0, g.members.length - sources.length), member_ids: g.members.map(a => a.ad_id), ads: g.ads, campaigns: g.campaigns, spend_cents: g.spend_cents };
}

// ---- The check. A statement is kept only if: its numbers exist and match (verifyClaim, which also refuses reasons and advice), it names its own group, it agrees with the side it
// reports, and every ad it lists as a source really is one of the ads in its group and has a link to Ads Manager.
const ADS_MANAGER = /^https:\/\/adsmanager\.facebook\.com\//;
export function verifyFinding(f, byId) {
  const why = verifyClaim(f.text, f.ids, byId, [f.label]);
  if (why) return why;
  if (!String(f.text).startsWith(f.label)) return 'It doesn’t start with the group it is about.';
  if (f.side === 'ahead' && /\b(behind|below|worse|higher than)\b/i.test(f.text.replace(f.label, '')) && f.kind === 'purchase') return 'It says behind for a group that is ahead.';
  if (f.side === 'behind' && /\b(ahead|above|better|lower than)\b/i.test(f.text.replace(f.label, '')) && f.kind === 'purchase') return 'It says ahead for a group that is behind.';
  if (!f.sources.length) return 'It lists no ads.';
  const members = new Set(f.member_ids);
  for (const s of f.sources) if (!members.has(s.ad_id) || !ADS_MANAGER.test(s.url || '')) return 'It lists an ad that isn’t in its group.';
  return '';
}

// Everything the page shows, made from the ads: the totals, the findings (checked), and the groups with too little to say.
export function analyse(ads, { urlFor, period, maxFindings = 40 } = {}) {
  const { groups, totals } = groupAds(ads), M = new Metrics(), ctx = { urlFor, period, targetId: null };
  const ranked = groups.filter(g => g.reliability !== 'too_little' && g.side !== 'even' && g.spend_cents > 0 && (g.kind === 'purchase' || g.leads > 0)).sort((a, b) => b.spend_cents - a.spend_cents).slice(0, maxFindings);
  const findings = [], leftOut = [];
  for (const g of ranked) {
    if (g.kind === 'lead') ctx.overallCpl = totals.lead.cpl_cents;
    const f = findingFor(g, M, ctx), byId = new Map(M.list.map(m => [m.id, m])), why = verifyFinding(f, byId);
    if (why) leftOut.push({ label: g.label, why }); else findings.push(f);
  }
  const notEnough = groups.filter(g => g.reliability === 'too_little').sort((a, b) => b.spend_cents - a.spend_cents).slice(0, 40)
    .map(g => ({ group: g.id, kind: g.kind, label: g.label, spend_cents: g.spend_cents, count: g.kind === 'purchase' ? g.purchases : g.leads, ads: g.ads, campaigns: g.campaigns }));
  const even = groups.filter(g => g.reliability !== 'too_little' && g.side === 'even').length;
  return { totals, metrics: M.list, findings, notEnough, even, left_out: leftOut, group_count: groups.length };
}

// ---- Re-reading: what changed since the last read. current = the checked findings now; saved = rows from earlier reads ({ key, first_read, last_read, ... }).
// Returns each finding with its status: 'newer' (first seen in this read), 'still_true', and the saved ones no longer found as 'no_longer_true'.
export function statusFor(current, saved, readNo) {
  const had = new Map(saved.map(s => [s.key, s]));
  const now = current.map(f => ({ ...f, first_read: had.get(f.key)?.first_read ?? readNo, last_read: readNo, status: had.has(f.key) && had.get(f.key).first_read < readNo ? 'still_true' : 'newer' }));
  const keys = new Set(current.map(f => f.key));
  const gone = saved.filter(s => !keys.has(s.key)).map(s => ({ ...s, status: 'no_longer_true' }));
  return { now, gone };
}
export const STATUS_TEXT = { newer: 'Newer', still_true: 'Still true', no_longer_true: 'No longer true' };
