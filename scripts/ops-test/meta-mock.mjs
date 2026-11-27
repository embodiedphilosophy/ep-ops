// Stand-in for Meta's Marketing API (Graph API) for the Ads tests. Port 4556. Nothing real is ever contacted.
//   META_ADS_BASE=http://localhost:4556 (env.sh sets it) and any META_ADS_TOKEN: the mock only checks that a Bearer token is present.
// Endpoints (under /v21.0): act_MOCK1 (account), PIX1 (pixel, last fired 2 hours ago), PAGE1 (page), search?type=adinterest, act_*/campaigns,
// act_*/adsets, act_*/adcreatives, act_*/ads, act_*/adimages, act_*/customaudiences (GET and POST), <id>/users (hashed emails), POST <id> (update),
// act_*/insights (a week of per-day results, the same every time).
// Test controls: GET /__log (every request, newest last; ?reset=1 clears), GET /__mode?rejectWrites=1|0, ?pixelAgeHours=N, ?noPayment=1|0, ?failInsights=1|0 (results answer with Meta's "too many calls" error), GET /__state (what exists), GET /__reset (forget everything).
// The log records the method, the path, the body (hashes shortened) and whether a Bearer token was present, never the token itself.
// The mock refuses a campaign, ad set or ad that is not PAUSED, as a check on the client.
import http from 'node:http';

const PORT = Number(process.env.META_MOCK_PORT || 4556);
const V = '/v21.0';
const log = [];
const mode = { rejectWrites: false, pixelAgeHours: 2, noPayment: false, failInsights: false };
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
    const i = s.i % 5, spend = 10 + i * 2 + (d % 3), items = level === 'ad' ? objects.ads.filter(a => a.adset_id === s.id).map((a, k) => ({ ad: a.id, share: 0.2, f: AD_SHARE[k % 5] })) : [{ ad: null, share: 1, f: 1 }];
    for (const it of items) {
      const sp = spend * it.share, roas = ROAS[i] * it.f, rev = sp * roas, leads = Math.round(sp / (CPL[i] / it.f));
      rows.push({ date_start: day(d), date_stop: day(d), campaign_id: s.campaign_id, ...(level === 'campaign' ? {} : { adset_id: s.id }), ...(it.ad ? { ad_id: it.ad } : {}),
        spend: sp.toFixed(2), impressions: String(Math.round(1000 * it.share + i * 100)), clicks: String(Math.round(20 * it.share + i)),
        actions: [{ action_type: 'purchase', value: String(Math.round(rev / 20)) }, { action_type: 'lead', value: String(leads) }],
        action_values: [{ action_type: 'purchase', value: rev.toFixed(2) }], purchase_roas: [{ action_type: 'omni_purchase', value: String(roas) }] });
    }
  }
  return rows;
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x'), p = url.pathname;
  if (p === '/__log') { const out = { total: log.length, requests: log.slice() }; if (url.searchParams.get('reset')) log.length = 0; return send(res, 200, out); }
  if (p === '/__reset') { log.length = 0; counter = 0; for (const k of Object.keys(objects)) objects[k] = Array.isArray(objects[k]) ? [] : {}; Object.assign(mode, { rejectWrites: false, pixelAgeHours: 2, noPayment: false, failInsights: false }); return send(res, 200, { reset: true }); }
  if (p === '/__mode') {
    for (const [k, v] of url.searchParams) mode[k] = k === 'pixelAgeHours' ? Number(v) : v === '1';
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
  if (write && mode.rejectWrites) return fail(res, '(mock) writes are switched off', 100);

  const [first, second] = path.split('/');
  if (req.method === 'GET') {
    if (/^act_/.test(first) && !second) return send(res, 200, { id: first, name: 'EP Mock Ads', account_status: 1, currency: 'USD', timezone_name: 'America/New_York', amount_spent: '12345', ...(mode.noPayment ? {} : { funding_source_details: { id: '1', display_string: 'Visa ending 4242', type: 1 } }) });
    if (first === 'PIX1') return send(res, 200, { id: 'PIX1', name: 'EP Pixel', is_unavailable: false, last_fired_time: new Date(Date.now() - mode.pixelAgeHours * 3600e3).toISOString() });
    if (first === 'PAGE1') return send(res, 200, { id: 'PAGE1', name: 'Embodied Philosophy', link: 'https://example.test/page' });
    if (first === 'search') { const q = (url.searchParams.get('q') || '').toLowerCase(); return send(res, 200, { data: INTERESTS.filter(([, n]) => n.toLowerCase().includes(q)).map(([id, name], i) => ({ id, name, audience_size_lower_bound: 1000000 * (i + 1), path: ['Interests', name] })) }); }
    if (second === 'campaigns') return send(res, 200, { data: objects.campaigns });
    if (second === 'customaudiences') return send(res, 200, { data: objects.customaudiences });
    if (second === 'insights') {
      if (mode.failInsights) return fail(res, '(mock) Too many calls to this ad-account. Please try again later.', 17, 400);
      let only = ''; try { only = (JSON.parse(url.searchParams.get('filtering') || '[]').find(f => f.field === 'campaign.id') || {}).value || ''; } catch {}
      return send(res, 200, { data: insights(url.searchParams.get('level'), only) });
    }
    if (!second) { const o = Object.values(objects).flat().find(x => x?.id === first); if (o) return send(res, 200, { id: o.id, name: o.name, status: o.status, effective_status: o.status, ...(o.daily_budget ? { daily_budget: o.daily_budget } : {}) }); }
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
  if (!second) {
    const o = Object.values(objects).flat().find(x => x?.id === first);
    if (!o) return fail(res, 'Unsupported post request: object does not exist', 100);
    Object.assign(o, b); return send(res, 200, { success: true });
  }
  return fail(res, 'Unsupported post request', 100);
}).listen(PORT, () => console.log(`meta mock on :${PORT}`));
