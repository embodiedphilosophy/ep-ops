// Kit (ConvertKit) API v4. Vercel: KIT_API_KEY (Kit > Settings > Developer > API v4 key)
const BASE = () => process.env.KIT_BASE || 'https://api.kit.com/v4';

export const kitConfigured = () => !!process.env.KIT_API_KEY;

async function kit(path, { method = 'GET', body } = {}) {
  if (!process.env.KIT_API_KEY) throw new Error('KIT_API_KEY is not set');
  const res = await fetch(BASE() + path, {
    method, cache: 'no-store',
    headers: { 'X-Kit-Api-Key': process.env.KIT_API_KEY, 'Content-Type': 'application/json', Accept: 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Kit ${method} ${path} failed: ${res.status} ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : {};
}

export const draftUrl = id => `https://app.kit.com/campaigns/${id}/draft`;

export async function getBroadcast(id) {
  return (await kit(`/broadcasts/${id}`)).broadcast;
}

// Always a draft: send_at stays null, so nothing is scheduled or sent from here.
export async function createDraft(fields) {
  return (await kit('/broadcasts', { method: 'POST', body: { public: false, ...fields, send_at: null } })).broadcast;
}

export async function updateDraft(id, fields) {
  return (await kit(`/broadcasts/${id}`, { method: 'PUT', body: { public: false, ...fields, send_at: null } })).broadcast;
}

// A draft we may overwrite: not sent, not scheduled
export const isEditableDraft = b => b && !b.send_at && !b.published_at && (!b.status || b.status === 'draft');

// ---- Subscribers and tags (member sync) ----
export async function findSubscriber(email) {
  const q = new URLSearchParams({ email_address: String(email).trim().toLowerCase(), status: 'all' });
  return (await kit(`/subscribers?${q}`)).subscribers?.[0] || null;
}

// Upsert by email (Kit keeps the existing record if there is one)
export async function upsertSubscriber(email, first_name) {
  return (await kit('/subscribers', { method: 'POST', body: { email_address: String(email).trim().toLowerCase(), ...(first_name ? { first_name } : {}) } })).subscriber;
}

export async function addTag(tagId, email) {
  return kit(`/tags/${tagId}/subscribers`, { method: 'POST', body: { email_address: String(email).trim().toLowerCase() } });
}

export async function removeTag(tagId, subscriberId) {
  return kit(`/tags/${tagId}/subscribers/${subscriberId}`, { method: 'DELETE' });
}

export async function subscriberTagIds(subscriberId) {
  const ids = [];
  let after = '';
  for (let i = 0; i < 10; i++) {
    const r = await kit(`/subscribers/${subscriberId}/tags?per_page=100${after ? `&after=${after}` : ''}`);
    ids.push(...(r.tags || []).map(t => t.id));
    if (!r.pagination?.has_next_page) break;
    after = r.pagination.end_cursor;
  }
  return ids;
}

// ---- Read-only signals for the ops dashboard (readiness checks, auto-complete). Never writes to Kit. ----
async function listAllKit(path, key) {
  const out = [];
  let after = '';
  for (let i = 0; i < 20; i++) {
    const r = await kit(`${path}?per_page=500${after ? `&after=${after}` : ''}`);
    out.push(...(r[key] || []));
    if (!r.pagination?.has_next_page) break;
    after = r.pagination.end_cursor;
  }
  return out;
}
export const listTags = () => listAllKit('/tags', 'tags');

// Everyone with a tag (the Sahṛdaya Upāya cohort, lib/member/cohort.js). Read-only.
export const tagSubscribers = tagId => listAllKit(`/tags/${tagId}/subscribers`, 'subscribers');

// Subscribers tagged since an ISO date (Kit's tagged_after filter), or null if the tag isn't in Kit. Read-only.
export async function tagCountSince(name, sinceIso) {
  const n = String(name).trim().toLowerCase();
  const t = (await listTags()).find(x => String(x.name).trim().toLowerCase() === n);
  if (!t) return null;
  const r = await kit(`/tags/${t.id}/subscribers?per_page=1&include_total_count=true&tagged_after=${encodeURIComponent(sinceIso)}`);
  return Number(r.pagination?.total_count) || 0;
}

// How many subscribers carry each tag, by lower-cased tag name → { name: count }. Read-only; cached 10 minutes.
// Only the tags asked for are counted (one small request each).
const countCache = new Map();
export async function tagCounts(names) {
  const want = [...new Set(names.map(n => String(n).trim().toLowerCase()).filter(Boolean))];
  const stale = want.filter(n => !countCache.has(n) || Date.now() - countCache.get(n).at > 10 * 60 * 1000);
  if (stale.length) {
    const tags = await listTags();
    await Promise.all(stale.map(async n => {
      const t = tags.find(x => String(x.name).trim().toLowerCase() === n);
      if (!t) return;
      try {
        const r = await kit(`/tags/${t.id}/subscribers?per_page=1&include_total_count=true`);
        countCache.set(n, { at: Date.now(), n: Number(r.pagination?.total_count) || 0 });
      } catch {}
    }));
  }
  return Object.fromEntries(want.filter(n => countCache.has(n)).map(n => [n, countCache.get(n).n]));
}
export const listBroadcasts = () => listAllKit('/broadcasts', 'broadcasts');
// Unlike createDraft/updateDraft (which always keep send_at null), these may set send_at: only the confirmed Schedule action uses them for that.
export async function createBroadcast(fields) { return (await kit('/broadcasts', { method: 'POST', body: { public: false, ...fields } })).broadcast; }
export async function updateBroadcast(id, fields) { return (await kit(`/broadcasts/${id}`, { method: 'PUT', body: fields })).broadcast; }
// How many people a tag holds (Kit reports the total when asked)
export async function tagCount(tagId) {
  const r = await kit(`/tags/${tagId}/subscribers?per_page=1&include_total_count=true`);
  return Number(r.pagination?.total_count ?? NaN);
}
// A tag, made if it isn't there (so a launch's "Enrolled · Winter 2027" tag exists before anyone is added to it)
export async function createTag(name) { return (await kit('/tags', { method: 'POST', body: { name } })).tag; }
export const listSequences = () => listAllKit('/sequences', 'sequences');
export const listSegments = () => listAllKit('/segments', 'segments');
// Only the internal description changes: send_at, content and everything else stay as they are (a scheduled email stays scheduled)
export async function setDescription(id, description) {
  return (await kit(`/broadcasts/${id}`, { method: 'PUT', body: { description } })).broadcast;
}

// Event IDs a broadcast carries, by the naming rule "[E047] Promo #2" (subject or internal description)
export const eventIdsOf = b => [...new Set(`${b.subject || ''} ${b.description || ''}`.match(/\[E\d{3,}\]/gi) || [])].map(x => x.slice(1, -1).toUpperCase());

let signalCache = null;
// { tags: Set of lower-cased tag names, broadcasts: [{ id, subject, ids, at, sent }] }. at: when it was or will be
// sent (ISO), '' for a draft. Cached for 10 minutes.
export async function kitSignals({ fresh = false } = {}) {
  if (!fresh && signalCache && Date.now() - signalCache.at < 10 * 60 * 1000) return signalCache.data;
  const [tags, bs] = await Promise.all([listTags(), listBroadcasts()]);
  const data = {
    tags: new Set(tags.map(t => String(t.name).trim().toLowerCase())),
    broadcasts: bs.map(b => ({ id: b.id, subject: b.subject || '', ids: eventIdsOf(b), at: b.published_at || b.send_at || '', sent: !!b.published_at })),
  };
  signalCache = { at: Date.now(), data };
  return data;
}

// ---- Read-only commerce and engagement totals for Ads › Audience insights (Ads PR 5). ANONYMOUS TOTALS ONLY.
// A purchase from Kit carries the buyer's email address and id; they are dropped on the line they are read: this function keeps a count and the money for each
// product, week and campaign tag, and returns nothing else. Nothing here writes to Kit.
const productName = p => String(p?.name || p?.title || p?.sku || p?.pid || '').trim();
// The New York calendar day of a moment ('YYYY-MM-DD'): the dashboard counts weeks in New York days
export const etDay = iso => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
const isoOf = v => { const d = new Date(v); return v && !Number.isNaN(+d) ? d.toISOString() : ''; };
const centsOf = v => { const n = Number(v); return Number.isFinite(n) ? Math.round(n * 100) : 0; };
// → [{ day: 'YYYY-MM-DD', product, utm_campaign, count, cents }]  (purchases made between two ISO moments; paid ones only)
export async function kitPurchaseTotals(sinceIso, untilIso) {
  const names = new Map();   // product id → name (Kit's products list), so a purchase that only carries the product's id still has a name
  try { for (const p of await listAllKit('/products', 'products')) names.set(String(p.id), productName(p)); } catch { /* the names are a nicety: a purchase may carry its own */ }
  const out = new Map();
  let after = '';
  for (let i = 0; i < 20; i++) {
    const r = await kit(`/purchases?per_page=500${after ? `&after=${after}` : ''}`);
    for (const p of r.purchases || []) {
      const at = isoOf(p.transaction_time || p.created_at);
      if (!at || at < sinceIso || at >= untilIso || /refund|fail|cancel/i.test(String(p.status || ''))) continue;
      const lines = (Array.isArray(p.products) && p.products.length ? p.products : [{}]);
      const share = Math.round(centsOf(p.total ?? p.subtotal) / lines.length);
      for (const l of lines) {
        const product = productName(l) || names.get(String(l.pid ?? l.id ?? '')) || 'Other', utm = String(p.utm_campaign || p.utm?.campaign || '').trim().toLowerCase();
        const day = etDay(at), key = `${day}|${product}|${utm}`, row = out.get(key) || { day, product, utm_campaign: utm, count: 0, cents: 0 };
        row.count += Number(l.quantity) || 1; row.cents += share; out.set(key, row);
      }
    }
    if (!r.pagination?.has_next_page) break;
    after = r.pagination.end_cursor;
  }
  return [...out.values()];
}

// Broadcasts sent between two ISO moments with their own totals (recipients, opens, clicks). Subject lines are EP's own words; no subscriber is read.
// → [{ subject, at, recipients, opens, clicks }]
export async function kitBroadcastStats(sinceIso, untilIso, { limit = 25 } = {}) {
  const sent = (await listBroadcasts()).filter(b => isoOf(b.published_at) >= sinceIso && isoOf(b.published_at) < untilIso).slice(0, limit);
  const out = [];
  let failed = 0;
  for (const b of sent) {
    let s = {};
    try { s = (await kit(`/broadcasts/${b.id}/stats`)).broadcast?.stats || {}; } catch { failed++; continue; }
    const recipients = Number(s.recipients) || 0;
    out.push({ subject: String(b.subject || ''), at: isoOf(b.published_at), day: etDay(b.published_at), recipients, opens: Math.round((Number(s.open_rate) || 0) / 100 * recipients) || Number(s.emails_opened) || 0, clicks: Math.round((Number(s.click_rate) || 0) / 100 * recipients) || Number(s.total_clicks) || 0 });
  }
  if (sent.length && failed === sent.length) throw new Error('Kit would not give the email totals');
  return out;
}
