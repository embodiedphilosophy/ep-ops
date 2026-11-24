// Instagram → the EP Social Engine sheet. Runs hourly (and once as a backfill):
//   1. appends posts newer than the newest one in Post History
//   2. refreshes likes and comments for posts from the last 90 days
//   3. matches each new post to its Weekly Plan row (same day, same caption or time) and marks it Posted
//      with its link, which clears "Approved but not confirmed"
// It only reads Instagram. Writes go through lib/ops/store.js like every other change.
// Vercel: META_ACCESS_TOKEN (system-user token), META_IG_USER_ID. Optional: META_APP_ID + META_APP_SECRET (token expiry check).
import { readPlain, updatePlainMany, addPlainRows, ensureColumns } from './store';
import { V2_COLS } from './socialengine';
import { setHealth } from './socialhealth';

const GRAPH = () => process.env.META_GRAPH_URL || 'https://graph.facebook.com/v21.0';
const WHO = 'Instagram sync';
const SHEET = { sheet: 'social' };
export const igConfigured = () => !!(process.env.META_ACCESS_TOKEN && process.env.META_IG_USER_ID);

async function graph(path, params = {}) {
  const q = new URLSearchParams({ ...params, access_token: process.env.META_ACCESS_TOKEN });
  const res = await fetch(path.startsWith('http') ? path : `${GRAPH()}/${path}?${q}`, { cache: 'no-store', signal: AbortSignal.timeout(20000) });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Instagram said: ${j.error?.message || res.status}`);
  return j;
}

// Newest first, until a post older than `stopBefore` (ISO) shows up
export async function fetchMedia({ stopBefore = '', max = 400 } = {}) {
  const out = [];
  let page = await graph(`${process.env.META_IG_USER_ID}/media`, { fields: 'id,timestamp,media_type,media_product_type,caption,permalink,like_count,comments_count,thumbnail_url,media_url', limit: '50' });
  while (page) {
    for (const m of page.data || []) { if (stopBefore && m.timestamp < stopBefore) return out; out.push(m); if (out.length >= max) return out; }
    page = page.paging?.next ? await graph(page.paging.next) : null;
  }
  return out;
}

const norm = s => String(s || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const etDate = iso => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
const etMinutes = iso => { const p = new Date(iso).toLocaleTimeString('en-GB', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).split(':'); return +p[0] * 60 + +p[1]; };
const minutesOf = t => { const m = String(t || '').match(/^(\d{1,2}):(\d{2})/); return m ? +m[1] * 60 + +m[2] : null; };

// Which Weekly Plan row is this Instagram post? Same New York day, then the same opening words, else the closest time within 3 hours.
export function matchPlan(media, planRows, taken = new Set()) {
  const day = etDate(media.timestamp);
  const cands = planRows.filter(r => !taken.has(r.row) && r.values.publish_date === day && !r.values.ig_media_id && ['Approved', 'Failed', 'Manual', 'Posted'].includes(r.values.status));
  const head = norm(media.caption).slice(0, 60);
  const byText = head && cands.find(r => norm(r.values.caption).slice(0, 60) === head);
  if (byText) return byText;
  const at = etMinutes(media.timestamp);
  return cands.map(r => ({ r, d: Math.abs((minutesOf(r.values.publish_time_ET) ?? 1e4) - at) })).filter(x => x.d <= 180).sort((a, b) => a.d - b.d)[0]?.r || null;
}

// from: 'YYYY-MM-DD' backfills everything since that day (used once, for 1 Oct); otherwise only what is new
export async function syncInstagram({ from = '', dry = false } = {}) {
  if (!igConfigured()) return { ok: false, error: 'Instagram isn’t connected yet: add META_ACCESS_TOKEN and META_IG_USER_ID in Vercel.' };
  const hist = await readPlain('Post History', { ...SHEET });
  const newest = hist.rows.reduce((m, r) => (r.values.posted_at > m ? r.values.posted_at : m), '');
  const stopBefore = from ? `${from}T00:00:00` : (newest ? new Date(Date.parse(newest) - 90 * 864e5).toISOString() : '');
  return applyMedia(await fetchMedia({ stopBefore }), { backfill: !!from, dry, hist });
}

// Posts handed over by Make (its Instagram connection reads them, so no Meta token is needed here). Any post not yet
// in Post History is added, whatever its age; known ones just get fresh likes and comments.
export const ingestMedia = (media, { dry = false } = {}) => applyMedia(media.filter(m => m?.id && m.timestamp), { backfill: true, dry });

// The shared part: add new posts to Post History, refresh likes and comments, mark matching plan rows Posted.
//   backfill: also add posts older than the newest one already recorded
async function applyMedia(media, { backfill = false, dry = false, hist } = {}) {
  hist ||= await readPlain('Post History', { ...SHEET });
  const known = new Map(hist.rows.map(r => [r.values.ig_media_id, r]));
  const newest = hist.rows.reduce((m, r) => (r.values.posted_at > m ? r.values.posted_at : m), '');
  const fresh = media.filter(m => !known.has(m.id)).sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  const newestMs = newest ? Date.parse(newest) : 0;
  // Posts older than the newest known one that were never recorded are only added during a backfill
  const toAdd = backfill ? fresh : fresh.filter(m => Date.parse(m.timestamp) > newestMs);

  const rows = toAdd.map(m => ({ ig_media_id: m.id, posted_at: m.timestamp, media_type: m.media_product_type === 'REELS' ? 'REELS' : m.media_type, caption: m.caption || '',
    permalink: m.permalink, like_count: String(m.like_count ?? 0), comments_count: String(m.comments_count ?? 0), notes: m.media_type === 'VIDEO' ? 'video: cover not archived yet' : '' }));
  // likes and comments for the last 90 days
  const cutoff = Date.now() - 90 * 864e5, updates = [];
  for (const m of media) {
    const r = known.get(m.id);
    if (r && Date.parse(m.timestamp) >= cutoff) updates.push({ row: r.row, changes: { like_count: String(m.like_count ?? 0), comments_count: String(m.comments_count ?? 0) } });
  }
  // match to the plan
  const plan = await readPlain('Weekly Plan', { ...SHEET });
  const taken = new Set(), matched = [];
  for (const m of [...toAdd, ...media.filter(x => known.has(x.id))]) {
    const hit = matchPlan(m, plan.rows, taken);
    if (!hit) continue;
    taken.add(hit.row);
    matched.push({ row: hit.row, changes: { status: 'Posted', ig_media_id: m.id, ig_feed_id: m.id, permalink: m.permalink, ...(hit.values.post_links ? {} : { post_links: m.permalink }), updated_by: WHO, updated_at: new Date().toISOString() } });
  }
  const result = { ok: true, seen: media.length, added: rows.length, refreshed: updates.length, matched: matched.length, dry };
  if (dry) return result;
  if (matched.length) await ensureColumns('Weekly Plan', V2_COLS.concat(['ig_media_id', 'permalink']), SHEET);
  await addPlainRows('Post History', rows, { who: WHO, label: `${rows.length} from Instagram`, ...SHEET });
  await updatePlainMany('Post History', updates, { who: WHO, ...SHEET });
  await updatePlainMany('Weekly Plan', matched, { who: WHO, ...SHEET });
  await setHealth('ig_sync', { last_synced_at: new Date().toISOString(), ...result }).catch(() => {});
  return result;
}

// Days until the Meta token stops working (needs the app id and secret); null when unknown
export async function tokenDaysLeft() {
  if (!process.env.META_ACCESS_TOKEN || !process.env.META_APP_ID || !process.env.META_APP_SECRET) return null;
  const j = await graph('debug_token', { input_token: process.env.META_ACCESS_TOKEN, access_token: `${process.env.META_APP_ID}|${process.env.META_APP_SECRET}` }).catch(() => null);
  const exp = j?.data?.data_access_expires_at ?? j?.data?.expires_at;
  return exp ? Math.floor((exp * 1000 - Date.now()) / 864e5) : (j?.data?.is_valid ? 9999 : null);
}
