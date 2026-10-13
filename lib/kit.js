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
