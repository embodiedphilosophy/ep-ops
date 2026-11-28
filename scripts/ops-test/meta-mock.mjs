// Stand-in for Meta's Marketing API (Graph API) for the Ads tests. Port 4556. Nothing real is ever contacted.
//   META_ADS_BASE=http://localhost:4556 (env.sh sets it) and any META_ADS_TOKEN: the mock only checks that a Bearer token is present.
// Endpoints (under /v21.0): act_MOCK1 (account), PIX1 (pixel, last fired 2 hours ago), PAGE1 (page), search?type=adinterest, act_*/campaigns,
// act_*/adsets, act_*/adcreatives, act_*/ads, act_*/adimages, act_*/customaudiences (GET and POST), <id>/users (hashed emails), POST <id> (update),
// act_*/insights (a week of per-day results, the same every time).
// Test controls: GET /__log (every request, newest last; ?reset=1 clears), GET /__mode?rejectWrites=1|0, ?pixelAgeHours=N, ?noPayment=1|0, ?scale=5,5,0.3 (results sized per campaign by the order made), ?failInsights=1|0 (results answer with Meta's "too many calls" error), GET /__state (what exists), GET /__reset (forget everything).
// Ads account view: world 'account' is a mix of everything (an active healthy one, one made in Ops (w_ops, and anything made through the app at the mock), past its end, open-ended,
// spending with nothing to show, a low return, paused, finished, archived, a lead campaign, budgets and start dates); world 'empty' has no campaigns. Modes: ?rateLimitReads=1 (every read answers
// with Meta's rate-limit code 17), ?permissionReads=1 (the key may not read: code 200), ?failAdsets=1 (only the ad set list fails).
// Ads safety net: GET /__world?name=healthy|trouble|off makes the WHOLE ad account (not only what Ops built) answer from a crafted state: campaigns, ad sets, ads with issues and per-day results,
// all relative to now. 'healthy' raises nothing; 'trouble' has one of every problem (past end, open-ended, no purchases, spike, low return, a rejected ad). Also /__mode?accountStatus=N (Meta's
// account_status), ?failReads=1 (every read answers with a Meta error: for the heartbeat), ?pageSize=N (long lists come back in pages of N, with Meta's cursors).
// Ad history (Ads › What we've learned): GET /__world?name=history is a synthetic account with 20 weeks of history: 7 campaigns (sales, sign-ups, visits), ad sets aimed at interests, lookalikes, a warm list or everyone,
// 40 ads with varied creatives (image, video, carousel, and Ops-style asset feeds; every ad's words carry a marker that must never be kept or shown), mixed performance, a few ads with very little spend.
// level=ad insights are answered for any time_range (one row per ad, added up). Modes: ?histFlip=1 (video and warm-list ads turn out badly from then on), ?rateLimitInsightsOnce=1: the next ad-level insights request answers with Meta's rate-limit code 17, then it goes back to normal.
// Hands-on buttons (Ads account view): in world 'account' (and the others) a POST of status ACTIVE|PAUSED or daily_budget (cents) to a campaign id or to one of its ad sets (as_<campaign>[_n]) is
// ACCEPTED and kept (so the next read shows it, and /__log records it); GET /__touch?id=W_OPEN&status=PAUSED&daily=4000 changes it as if someone did it in Meta's own tool (not logged as a write);
// /__mode?failWriteId=as_W_SETS_2 makes a write to that id answer with a Meta error. A campaign read by id also answers account_id (MOCK1) and objective, as Meta does.
// The log records the method, the path, the body (hashes shortened) and whether a Bearer token was present, never the token itself.
// The mock refuses a campaign, ad set or ad that is not PAUSED, as a check on the client.
import http from 'node:http';

const PORT = Number(process.env.META_MOCK_PORT || 4556);
const V = '/v21.0';
const log = [];
const mode = { rejectWrites: false, pixelAgeHours: 2, noPayment: false, failInsights: false, accountStatus: 1, failReads: false, rateLimitReads: false, permissionReads: false, failAdsets: false, pageSize: 0, failWriteId: '', rateLimitInsightsOnce: false, histFlip: false };
let worldName = '';
const over = {};   // what the buttons (or /__touch) changed in the world's campaigns and ad sets: id → { status?, daily? }
const objects = { campaigns: [], adsets: [], adcreatives: [], ads: [], adimages: [], customaudiences: [], users: {} };
let counter = 0;

const INTERESTS = [['6003107902433', 'Meditation'], ['6003012297772', 'Yoga'], ['6003139266461', 'Mindfulness'], ['6003349442621', 'Buddhism'],
  ['6003195797498', 'Hinduism'], ['6003397425735', 'Philosophy'], ['6003020834693', 'Spirituality'], ['6003384248805', 'Tantra']];
// Per ad set (by order made), the return on ad spend each day is spend × roas: 2.4, 1.8, 1.2, 0.8, 0.4, so a rule can raise, hold and turn off
const ROAS = [2.4, 1.8, 1.2, 0.8, 0.4];

const body = req => new Promise(r => { let b = ''; req.on('data', c => (b += c)); req.on('end', () => { try { r(b ? JSON.parse(b) : {}); } catch { r({}); } }); });
const short = v => (typeof v === 'string' && /^[0-9a-f]{64}$/.test(v) ? v.slice(0, 8) + '…' : Array.isArray(v) ? v.map(short) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, short(x)])) : v);
const send = (res, code, o) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
const fail = (res, message, code = 100, status = 400) => send(res, status, { error: { message, code, type: 'OAuthException', error_user_msg: message } });
const day = n => new Date(Date.now() - n * 86400e3).toISOString().slice(0, 10);

// Results a day at a time. Per ad set (by the order made) the return on ad spend each day is spend x roas (2.4, 1.8, 1.2, 0.8, 0.4) and the cost per lead is CPL
// (1.00, 1.50, 2.00, 3.00, 5.00), so a rule can raise, hold and turn off for a Purchase campaign and for a Lead campaign. At ad level each ad has a fifth of the set's spend
// and a different share of its return, ad 5 always the weakest. campaignId limits the answer to one campaign's ad sets (as the client's filtering does).
const CPL = [1, 1.5, 2, 3, 5], AD_SHARE = [1.15, 1.05, 1, 0.9, 0.5];
function insights(level, campaignId) {
  const sets = (objects.adsets.length ? objects.adsets : ROAS.map((_, i) => ({ id: `mock_adset_${i + 1}`, campaign_id: 'mock_campaign_1' }))).map((s, i) => ({ ...s, i })).filter(s => !campaignId || s.campaign_id === campaignId);
  const rows = [];
  for (let d = 7; d >= 1; d--) for (const s of sets) {
    const sc = (mode.scale || [])[objects.campaigns.findIndex(c => c.id === s.campaign_id)] ?? 1;   // ?scale=5,5,0.3: a size for each campaign by the order made (the Creative results flow)
    const i = s.i % 5, spend = (10 + i * 2 + (d % 3)) * sc, items = level === 'ad' ? objects.ads.filter(a => a.adset_id === s.id).map((a, k) => ({ ad: a.id, share: 0.2, f: AD_SHARE[k % 5] })) : [{ ad: null, share: 1, f: 1 }];
    for (const it of items) {
      const sp = spend * it.share, roas = ROAS[i] * it.f, rev = sp * roas, leads = Math.round(sp / (CPL[i] / it.f));
      rows.push({ date_start: day(d), date_stop: day(d), campaign_id: s.campaign_id, ...(level === 'campaign' ? {} : { adset_id: s.id }), ...(it.ad ? { ad_id: it.ad } : {}),
        spend: sp.toFixed(2), impressions: String(Math.round((1000 * it.share + i * 100) * sc)), clicks: String(Math.round((20 * it.share + i) * sc)),
        actions: [{ action_type: 'purchase', value: String(Math.round(rev / 20)) }, { action_type: 'lead', value: String(leads) }],
        action_values: [{ action_type: 'purchase', value: rev.toFixed(2) }], purchase_roas: [{ action_type: 'omni_purchase', value: String(roas) }] });
    }
  }
  return rows;
}


// ---- The whole ad account (Ads safety net). Each campaign: spend per day in cents (hist for the days before today, today so far), roas (0 = nothing bought), a stop time relative to now.
const DAYS = 86400e3;
function worldCampaigns(name) {
  if (!name || name === 'off') return null;
  const c = (id, nm, o) => ({ id, name: nm, objective: 'OUTCOME_SALES', status: 'ACTIVE', effective_status: 'ACTIVE', created_time: new Date(Date.now() - 30 * DAYS).toISOString(), hist: 4000, today: 400, roas: 2, ...o });
  const base = [
    c('W_OK1', 'Kali: winter enrollment', { stopDays: 20, hist: 5000, today: 500, roas: 2 }),
    c('W_OK2', 'Newsletter sign-ups', { objective: 'OUTCOME_LEADS', stopDays: 10, hist: 3000, today: 300, roas: 0, leadsPerDollar: 0.5 }),
    c('w_ops', 'Ops built: Kali', { stopDays: 5, hist: 2000, today: 200, roas: 2.2 }),
  ];
  if (name === 'healthy') return base;
  if (name === 'empty') return [];
  if (name === 'account') return [...base, ...objects.campaigns.map(o => c(o.id, o.name, { status: o.status, effective_status: o.status, objective: o.objective, hist: 0, today: 0, roas: 0, stopDays: 30 })),   // the Ads account view: a mix of everything, with budgets and start dates, some made in Ops (w_ops) and some not
    c('W_PAST', 'Old retreat promo', { stopDays: -2, hist: 3000, today: 400, roas: 1.8, daily: 5000, startDays: -40 }),
    c('W_OPEN', 'Evergreen interest test', { stopDays: null, hist: 2000, today: 200, roas: 2.2, daily: 3000, startDays: -60 }),
    c('W_ZERO', 'Spring yoga to sale', { stopDays: 5, hist: 4000, today: 300, roas: 0, lifetime: 90000, startDays: -10 }),
    c('W_LOW', 'Weak return test', { stopDays: 5, hist: 5000, today: 400, roas: 0.6, daily: 6000, startDays: -20 }),
    c('W_PAUSED', 'Paused autumn test', { status: 'PAUSED', effective_status: 'PAUSED', stopDays: 8, hist: 0, today: 0, roas: 0, daily: 2000, startDays: -30 }),
    c('W_ARCH', 'Old 2025 sale', { status: 'ARCHIVED', effective_status: 'ARCHIVED', stopDays: -200, hist: 0, today: 0, roas: 0, startDays: -300 }),
    c('W_SETS', 'Quiet evergreen (budget on its ad sets)', { stopDays: 12, hist: 1000, today: 100, roas: 2.5, sets: [1000, 500], startDays: -15 }),
    c('W_ENDED', 'Finished retreat push', { status: 'PAUSED', effective_status: 'PAUSED', stopDays: -9, hist: 1500, today: 0, roas: 2, daily: 4000, startDays: -40 }),
  ];
  return [...base,
    c('W_PAST', 'Old retreat promo', { stopDays: -2, hist: 3000, today: 400, roas: 1.8 }),
    c('W_OPEN', 'Evergreen interest test', { stopDays: null, hist: 2000, today: 200, roas: 2.2 }),
    c('W_ZERO', 'Spring yoga to sale', { stopDays: 5, hist: 4000, today: 300, roas: 0 }),
    c('W_SPIKE', 'Boosted post', { stopDays: 5, hist: 2000, today: 30000, roas: 1.6 }),
    c('W_LOW', 'Weak return test', { stopDays: 5, hist: 5000, today: 400, roas: 0.6 }),
  ];
}
const asMeta = c0 => { const c = { ...c0, ...(over[c0.id] || {}) }; return { id: c.id, name: c.name, objective: c.objective, status: c.status, effective_status: over[c.id]?.status || c.effective_status, created_time: c.created_time, ...(c.stopDays != null ? { stop_time: new Date(Date.now() + c.stopDays * DAYS).toISOString() } : {}),
  ...(c.daily ? { daily_budget: String(c.daily) } : {}), ...(c.lifetime ? { lifetime_budget: String(c.lifetime) } : {}), ...(c.startDays != null ? { start_time: new Date(Date.now() + c.startDays * DAYS).toISOString() } : {}) }; };
const setsOf = list => list.flatMap(c => (c.sets || [c.setBudget || 0]).map((b, i, all) => { const id = all.length > 1 || c.sets ? `as_${c.id}_${i + 1}` : `as_${c.id}`, o = over[id] || {}, daily = o.daily ?? b;
  return { id, name: `Ad set of ${c.name}${all.length > 1 ? ` ${i + 1}` : ''}`, campaign_id: c.id, status: o.status || 'ACTIVE', effective_status: o.status || 'ACTIVE', ...(daily ? { daily_budget: String(daily) } : {}), ...(c.stopDays != null ? { end_time: new Date(Date.now() + c.stopDays * DAYS).toISOString() } : {}) }; }));
const WORLD_ISSUES = [{ id: 'ad_bad1', name: 'Retreat video ad', campaign_id: 'W_PAST', effective_status: 'DISAPPROVED' }];
const dayDiff = (a, b) => Math.round((Date.parse(a + 'T12:00:00Z') - Date.parse(b + 'T12:00:00Z')) / DAYS);
function worldInsights(list, level, since, until) {
  const rows = [];
  for (let d = since; d <= until; d = new Date(Date.parse(d + 'T12:00:00Z') + DAYS).toISOString().slice(0, 10)) {
    const off = dayDiff(until, d);
    for (const c of list) {
      const cents = off === 0 ? c.today : c.hist, sp = cents / 100, rev = sp * c.roas;
      const actions = [], vals = [];
      if (c.roas > 0) { actions.push({ action_type: 'purchase', value: String(Math.max(1, Math.floor(rev / 50))) }); vals.push({ action_type: 'purchase', value: rev.toFixed(2) }); }
      if (c.leadsPerDollar) actions.push({ action_type: 'lead', value: String(Math.round(sp * c.leadsPerDollar)) });
      rows.push({ date_start: d, date_stop: d, campaign_id: c.id, spend: sp.toFixed(2), impressions: '1000', clicks: '20', actions, action_values: vals });
    }
  }
  if (level !== 'account') return rows;
  const by = {}; for (const r of rows) { const a = by[r.date_start] ||= { date_start: r.date_start, date_stop: r.date_stop, spend: 0, impressions: '0', clicks: '0', actions: [], action_values: [] }; a.spend += Number(r.spend); }
  return Object.values(by).map(r => ({ ...r, spend: r.spend.toFixed(2) }));
}
const page = (res, url, all) => { const n = mode.pageSize, after = Number(url.searchParams.get('after') || 0); if (!n) return send(res, 200, { data: all }); const slice = all.slice(after, after + n), more = after + n < all.length; return send(res, 200, { data: slice, paging: { cursors: { after: String(after + n) }, ...(more ? { next: 'https://not-followed.invalid/next' } : {}) } }); };


// ---- The ad history world: 7 campaigns, ad sets of each audience kind, 40 ads, 20 weeks. Everything is derived from fixed numbers, so every run sees the same history.
const COPY_MARKER = 'MARKER-COPY-7731 write to marker.buyer@example.invalid';
const hash = str => { let h = 2166136261; for (const ch of str) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967295; };
const HIST_CAMPAIGNS = [
  ['H_C1', 'Kali: winter enrollment [E034]', 'OUTCOME_SALES', 20, 12], ['H_C2', 'Kali: spring enrollment', 'OUTCOME_SALES', 14, 6], ['H_C3', 'Tantra: summer intensive', 'OUTCOME_SALES', 17, 9],
  ['H_C4', 'Yoga Sutras: autumn course', 'OUTCOME_SALES', 9, 1], ['H_C5', 'Newsletter sign-ups', 'OUTCOME_LEADS', 19, 1], ['H_C6', 'Free guide sign-ups', 'OUTCOME_LEADS', 10, 1], ['H_C7', 'Blog traffic', 'OUTCOME_TRAFFIC', 12, 1],
];
const AUD = [
  ['interest', { flexible_spec: [{ interests: [{ id: '1', name: 'Meditation' }] }] }], ['lookalike', { custom_audiences: [{ id: 'a1', name: 'Lookalike (1%) of buyers' }] }],
  ['warm', { custom_audiences: [{ id: 'a2', name: 'Email list' }] }], ['broad', { age_min: 25 }], ['advantage', { targeting_automation: { advantage_audience: 1 } }],
];
const AUD_ROAS = { interest: 0.9, lookalike: 1.3, warm: 1.55, broad: 0.55, advantage: 1.0 }, FMT_ROAS = { image: 0.95, video: 1.3, carousel: 0.7 }, H_CPL = { interest: 4, lookalike: 2.5, warm: 1.5, broad: 6, advantage: 3 };
const TITLES = ['Join us for eight Wednesdays', 'Is this the practice you have been missing?', '7 weeks with the goddess', 'How to sit with the dark mother', 'Begin the course'];
const CTAS = ['LEARN_MORE', 'SIGN_UP', 'LEARN_MORE', 'SHOP_NOW', 'LEARN_MORE'];
const bodyOf = len => (COPY_MARKER + ' ' + 'Words about the practice. '.repeat(40)).slice(0, len);
const HIST = { campaigns: [], adsets: [], ads: [] };
function buildHistory() {
  if (HIST.ads.length) return;
  const now = Date.now();
  for (const [id, name, objective, weeksAgo, nSets] of HIST_CAMPAIGNS) {
    const created = new Date(now - weeksAgo * 7 * DAYS - 2 * DAYS), end = id === 'H_C1' ? 8 : id === 'H_C3' ? 4 : 0;   // some ended: days since the end, in weeks
    HIST.campaigns.push({ id, name, objective, created, endsWeeksAgo: end, daily_budget: ['H_C2', 'H_C6'].includes(id) ? '1500' : undefined });
    const sets = id === 'H_C4' || id === 'H_C6' || id === 'H_C7' ? 2 : 3;
    for (let k = 0; k < sets; k++) {
      const [akind, targeting] = AUD[(HIST_CAMPAIGNS.findIndex(c => c[0] === id) + k) % AUD.length], sid = `${id}_S${k + 1}`;
      HIST.adsets.push({ id: sid, campaign_id: id, name: `${name.split(':')[0]} · ${akind} ${k + 1}`, akind, targeting, daily_budget: [1000, 3000, 6000][k % 3] });
    }
  }
  let n = 0;
  const PER_SET = { H_C1: 3, H_C2: 3, H_C3: 3, H_C4: 1, H_C5: 2, H_C6: 2, H_C7: 1 };   // 27 + 2 + 6 + 4 + 2 = 41 ads, the first 40 are kept
  for (const s of HIST.adsets) {
    const c = HIST.campaigns.find(x => x.id === s.campaign_id);
    for (let k = 0; k < PER_SET[c.id] && n < 40; k++, n++) {
      const fmt = ['image', 'video', 'carousel'][(n + k) % 3], title = TITLES[n % 5], len = [90, 200, 420][n % 3], cta = CTAS[n % 5], style = n % 4;
      const creative = style === 0 ? { object_type: 'SHARE', title, body: bodyOf(len), call_to_action_type: cta, ...(fmt === 'video' ? { video_id: `v${n}` } : fmt === 'image' ? { image_hash: `h${n}` } : { object_story_spec: { link_data: { message: bodyOf(len), child_attachments: [{ name: 'a' }, { name: 'b' }] } } }) }
        : style === 1 ? { object_story_spec: fmt === 'video' ? { video_data: { message: bodyOf(len), title, call_to_action: { type: cta } } } : { link_data: { message: bodyOf(len), name: title, call_to_action: { type: cta }, ...(fmt === 'carousel' ? { child_attachments: [{ name: 'a' }, { name: 'b' }, { name: 'c' }] } : { picture: 'https://example.invalid/p.png' }) } } }
        : { asset_feed_spec: { bodies: [{ text: bodyOf(len) }, { text: bodyOf(len + 20) }], titles: [{ text: title }], call_to_action_types: [cta], ad_formats: [fmt === 'video' ? 'SINGLE_VIDEO' : fmt === 'carousel' ? 'CAROUSEL' : 'SINGLE_IMAGE'], ...(fmt === 'video' ? { videos: [{ video_id: `v${n}` }] } : { images: [{ hash: `h${n}` }] }) } };
      const tiny = c.id === 'H_C4';   // one campaign barely ran: too little to say anything about it
      HIST.ads.push({ id: `H_AD${n + 1}`, name: `Ad ${n + 1} · ${c.name.split(':')[0]}`, campaign_id: c.id, adset_id: s.id, created_time: new Date(c.created.getTime() + (k % 2) * 3 * DAYS).toISOString(), creative, akind: s.akind, fmt, q: /\?\s*$/.test(title) ? 1.15 : 1, tiny, objective: c.objective, endsWeeksAgo: c.endsWeeksAgo, n, effective_status: c.endsWeeksAgo ? 'ARCHIVED' : n % 5 === 0 ? 'PAUSED' : 'ACTIVE' });
    }
  }
}
// One ad on one day: spend and what it brought back. Weekly spend is about $60 to $260 a week for a normal ad, $2 a week for a "tiny" one.
function histDay(ad, day) {
  const t = Date.parse(day + 'T12:00:00Z'), start = Date.parse(ad.created_time), stop = ad.endsWeeksAgo ? Date.now() - ad.endsWeeksAgo * 7 * DAYS : Infinity;
  if (t < start || t > stop || t > Date.now() - DAYS * 0.5) return null;
  const j = 0.8 + 0.4 * hash(ad.id + day), base = ad.tiny ? 0.3 : (8 + (ad.n % 5) * 5);
  const flip = mode.histFlip && (ad.fmt === 'video' || ad.akind === 'warm') ? 0.3 : 1;   // a test switch: the best kinds of ad turn out badly, so a re-read can show what is no longer true
  const spend = base * j, roas = 1.4 * AUD_ROAS[ad.akind] * FMT_ROAS[ad.fmt] * ad.q * flip * (0.9 + 0.2 * hash(day + ad.id));
  if (ad.objective === 'OUTCOME_SALES') return { spend, rev: spend * roas, buys: Math.floor(spend * roas / 70 + hash(ad.id + day + 'b')), leads: 0 };
  if (ad.objective === 'OUTCOME_LEADS') return { spend, rev: 0, buys: 0, leads: Math.round(spend / H_CPL[ad.akind] * j) };
  return { spend, rev: 0, buys: 0, leads: 0 };
}
function histInsights(since, until) {
  const rows = [];
  for (const ad of HIST.ads) {
    let spend = 0, rev = 0, buys = 0, leads = 0, any = false;
    for (let t = Date.parse(since + 'T12:00:00Z'); t <= Date.parse(until + 'T12:00:00Z'); t += DAYS) { const d = histDay(ad, new Date(t).toISOString().slice(0, 10)); if (d) { any = true; spend += d.spend; rev += d.rev; buys += d.buys; leads += d.leads; } }
    if (!any) continue;
    rows.push({ date_start: since, date_stop: until, ad_id: ad.id, adset_id: ad.adset_id, campaign_id: ad.campaign_id, spend: spend.toFixed(2), impressions: String(Math.round(spend * 90)), clicks: String(Math.round(spend * 2)),
      actions: [...(buys ? [{ action_type: 'purchase', value: String(buys) }] : []), ...(leads ? [{ action_type: 'lead', value: String(leads) }] : [])], action_values: rev ? [{ action_type: 'purchase', value: rev.toFixed(2) }] : [] });
  }
  return rows;
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x'), p = url.pathname;
  if (p === '/__log') { const out = { total: log.length, requests: log.slice() }; if (url.searchParams.get('reset')) log.length = 0; return send(res, 200, out); }
  if (p === '/__reset') { log.length = 0; counter = 0; for (const k of Object.keys(over)) delete over[k]; for (const k of Object.keys(objects)) objects[k] = Array.isArray(objects[k]) ? [] : {}; Object.assign(mode, { rejectWrites: false, pixelAgeHours: 2, noPayment: false, failInsights: false, accountStatus: 1, failReads: false, rateLimitReads: false, permissionReads: false, failAdsets: false, pageSize: 0, failWriteId: '', scale: [], rateLimitInsightsOnce: false, histFlip: false }); worldName = ''; return send(res, 200, { reset: true }); }
  if (p === '/__touch') { const id = url.searchParams.get('id'), st = url.searchParams.get('status'), dl = url.searchParams.get('daily'); over[id] = { ...(over[id] || {}), ...(st ? { status: st } : {}), ...(dl ? { daily: Number(dl) } : {}) }; return send(res, 200, { id, ...over[id] }); }
  if (p === '/__world') { worldName = url.searchParams.get('name') || ''; return send(res, 200, { world: worldName || 'off', campaigns: (worldCampaigns(worldName) || []).length }); }
  if (p === '/__mode') {
    for (const [k, v] of url.searchParams) mode[k] = ['pixelAgeHours', 'accountStatus', 'pageSize'].includes(k) ? Number(v) : k === 'failWriteId' ? v : k === 'scale' ? v.split(',').map(Number).filter(Number.isFinite) : v === '1';
    return send(res, 200, mode);
  }
  if (p === '/__state') return send(res, 200, Object.fromEntries(Object.entries(objects).map(([k, v]) => [k, Array.isArray(v) ? v : Object.fromEntries(Object.entries(v).map(([a, b]) => [a, b.length]))])));
  if (!p.startsWith(V + '/')) return fail(res, 'Unknown path', 2500, 404);
  const path = p.slice(V.length + 1), b = req.method === 'POST' ? await body(req) : {};
  const hasAuth = /^Bearer \S+/.test(req.headers.authorization || '');
  const tokenInUrl = url.searchParams.has('access_token') || b.access_token != null;
  const write = req.method !== 'GET';
  log.push({ n: log.length + 1, method: req.method, path, query: Object.fromEntries(url.searchParams), body: short(b), auth: hasAuth, tokenInUrl, write });
  if (!hasAuth) return fail(res, 'Invalid OAuth access token.', 190, 401);
  if (!write && mode.failReads) return fail(res, '(mock) Meta is down', 2, 500);
  if (!write && mode.rateLimitReads) return fail(res, '(mock) Too many calls to this ad-account. Please try again later.', 17, 400);
  if (!write && mode.permissionReads) return fail(res, '(mock) The key can’t read this.', 200, 403);
  if (write && mode.rejectWrites) return fail(res, '(mock) writes are switched off', 100);

  const [first, second] = path.split('/');
  if (req.method === 'GET') {
    if (/^act_/.test(first) && !second) return send(res, 200, { id: first, name: 'EP Mock Ads', account_status: mode.accountStatus, disable_reason: mode.accountStatus === 2 ? 1 : 0, currency: 'USD', timezone_name: 'America/New_York', amount_spent: '12345', ...(mode.noPayment ? {} : { funding_source_details: { id: '1', display_string: 'Visa ending 4242', type: 1 } }) });
    if (first === 'PIX1') return send(res, 200, { id: 'PIX1', name: 'EP Pixel', is_unavailable: false, last_fired_time: new Date(Date.now() - mode.pixelAgeHours * 3600e3).toISOString() });
    if (first === 'PAGE1') return send(res, 200, { id: 'PAGE1', name: 'Embodied Philosophy', link: 'https://example.test/page' });
    if (first === 'search') { const q = (url.searchParams.get('q') || '').toLowerCase(); return send(res, 200, { data: INTERESTS.filter(([, n]) => n.toLowerCase().includes(q)).map(([id, name], i) => ({ id, name, audience_size_lower_bound: 1000000 * (i + 1), path: ['Interests', name] })) }); }
    if (worldName === 'history') {
      buildHistory();
      if (second === 'campaigns') return page(res, url, HIST.campaigns.map(c => ({ id: c.id, name: c.name, objective: c.objective, effective_status: c.endsWeeksAgo ? 'ARCHIVED' : 'ACTIVE', created_time: c.created.toISOString(), ...(c.daily_budget ? { daily_budget: c.daily_budget } : {}) })));
      if (second === 'adsets') return mode.failAdsets ? fail(res, '(mock) ad sets are down', 2, 500) : page(res, url, HIST.adsets.map(a => ({ id: a.id, name: a.name, campaign_id: a.campaign_id, daily_budget: String(a.daily_budget), targeting: a.targeting })));
      if (second === 'ads') return page(res, url, HIST.ads.map(a => ({ id: a.id, name: a.name, campaign_id: a.campaign_id, adset_id: a.adset_id, created_time: a.created_time, creative: a.creative })));
      if (second === 'insights') {
        if (mode.rateLimitInsightsOnce) { mode.rateLimitInsightsOnce = false; return fail(res, '(mock) Too many calls to this ad-account. Please try again later.', 17, 400); }
        let tr = {}; try { tr = JSON.parse(url.searchParams.get('time_range') || '{}'); } catch {}
        return page(res, url, histInsights(tr.since, tr.until));
      }
    }
    const W = worldCampaigns(worldName);
    if (W && second === 'campaigns') return page(res, url, W.map(asMeta));
    if (W && second === 'adsets') return mode.failAdsets ? fail(res, '(mock) ad sets are down', 2, 500) : page(res, url, setsOf(W).filter(x => /^act_/.test(first) || x.campaign_id === first));
    if (W && second === 'ads') return page(res, url, worldName === 'trouble' ? WORLD_ISSUES : []);
    if (W && !second) { const c = W.find(x => x.id === first), a = setsOf(W).find(x => x.id === first); if (c) return send(res, 200, { ...asMeta(c), account_id: 'MOCK1' }); if (a) return send(res, 200, a); }
    if (second === 'campaigns') return send(res, 200, { data: objects.campaigns });
    if (second === 'customaudiences') return send(res, 200, { data: objects.customaudiences });
    if (second === 'insights') {
      if (mode.failInsights) return fail(res, '(mock) Too many calls to this ad-account. Please try again later.', 17, 400);
      const lvl = url.searchParams.get('level'), W2 = worldCampaigns(worldName);
      if (W2 && (lvl === 'account' || (lvl === 'campaign' && !url.searchParams.get('filtering')))) { let tr = {}; try { tr = JSON.parse(url.searchParams.get('time_range') || '{}'); } catch {} return page(res, url, worldInsights(W2, lvl, tr.since, tr.until)); }
      let only = ''; try { only = (JSON.parse(url.searchParams.get('filtering') || '[]').find(f => f.field === 'campaign.id') || {}).value || ''; } catch {}
      return send(res, 200, { data: insights(url.searchParams.get('level'), only) });
    }
    if (!second) { const o = Object.values(objects).flat().find(x => x?.id === first); if (o) return send(res, 200, { id: o.id, name: o.name, status: o.status, effective_status: o.status, ...(o.objective ? { objective: o.objective, account_id: 'MOCK1' } : {}), ...(o.daily_budget ? { daily_budget: o.daily_budget } : {}), ...(o.lifetime_budget ? { lifetime_budget: o.lifetime_budget } : {}) }); }
    return fail(res, 'Unsupported get request', 100, 400);
  }

  // Writes
  const make = (list, kindName, extra = {}) => { const o = { id: `mock_${kindName}_${++counter}`, ...b, ...extra }; list.push(o); return send(res, 200, { id: o.id }); };
  if (/^act_/.test(first)) {
    if (second === 'campaigns') return b.status === 'PAUSED' ? make(objects.campaigns, 'campaign') : fail(res, 'A campaign must be created PAUSED (mock rule).');
    if (second === 'adsets') return b.status === 'PAUSED' && b.campaign_id ? make(objects.adsets, 'adset') : fail(res, 'An ad set must be created PAUSED and belong to a campaign (mock rule).');
    if (second === 'adcreatives') return make(objects.adcreatives, 'creative');
    if (second === 'ads') return b.status === 'PAUSED' && b.adset_id && b.creative?.creative_id ? make(objects.ads, 'ad') : fail(res, 'An ad must be created PAUSED with an ad set and a creative (mock rule).');
    if (second === 'adimages') { const o = { hash: `hash${++counter}`, name: b.name }; objects.adimages.push(o); return send(res, 200, { images: { [b.name || 'image']: { hash: o.hash } } }); }
    if (second === 'customaudiences') return make(objects.customaudiences, 'audience');
  }
  if (second === 'users') {
    const data = b.payload?.data || [], valid = data.filter(r => /^[0-9a-f]{64}$/.test(r?.[0]));
    objects.users[first] = [...(objects.users[first] || []), ...valid.map(r => r[0].slice(0, 8))];
    return send(res, 200, { audience_id: first, num_received: data.length, num_invalid_entries: data.length - valid.length });
  }
  if (!second && mode.failWriteId && first === mode.failWriteId) return fail(res, '(mock) Meta refused this change.', 100);
  if (!second) {
    const W = worldCampaigns(worldName), wc = W && W.find(x => x.id === first), wa = W && setsOf(W).find(x => x.id === first);
    if (wc || wa) {   // a campaign or ad set of the world: a status and a daily budget may change, and are kept
      const o = {}; if (b.status !== undefined) { if (!['ACTIVE', 'PAUSED'].includes(b.status)) return fail(res, 'Invalid status (mock).'); o.status = b.status; }
      if (b.daily_budget !== undefined) { const n = Number(b.daily_budget); if (!Number.isInteger(n) || n < 100) return fail(res, 'Invalid daily budget (mock).'); o.daily = n; }
      over[first] = { ...(over[first] || {}), ...o }; return send(res, 200, { success: true });
    }
    const o = Object.values(objects).flat().find(x => x?.id === first);
    if (!o) return fail(res, 'Unsupported post request: object does not exist', 100);
    Object.assign(o, b); return send(res, 200, { success: true });
  }
  return fail(res, 'Unsupported post request', 100);
}).listen(PORT, () => console.log(`meta mock on :${PORT}`));
