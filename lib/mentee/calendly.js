// The monthly one-to-one with Jacob, read from Calendly (read-only). Vercel: CALENDLY_TOKEN (a personal access token with
// users:read, event_types:read, availability:read and scheduled_events:read). The event type is in data/mentee.json.
// If Calendly is down or the token is missing, the page just shows the booking button as before.
const BASE = (process.env.CALENDLY_API_BASE || 'https://api.calendly.com').replace(/\/$/, ''); // CALENDLY_API_BASE is for tests
export const calendlyConfigured = () => !!process.env.CALENDLY_TOKEN;

const cache = new Map();
async function cached(key, ttl, load) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttl) return hit.value;
  const value = await load();
  cache.set(key, { at: Date.now(), value });
  if (cache.size > 200) for (const [k, v] of cache) if (Date.now() - v.at > 15 * 60 * 1000) cache.delete(k);
  return value;
}

async function get(path, params) {
  const res = await fetch(`${BASE}${path}?${new URLSearchParams(params)}`, { headers: { Authorization: `Bearer ${process.env.CALENDLY_TOKEN}` }, cache: 'no-store' });
  if (!res.ok) throw new Error(`Calendly ${res.status}`);
  return res.json();
}

const eventTypeUri = id => `${BASE}/event_types/${id}`;
const userUri = () => cached('user', 6 * 3600e3, async () => (await get('/users/me', {})).resource.uri);

// Open times inside one window (Calendly allows at most 7 days at a time). Starts from now if the window has begun.
export async function openSlots(eventTypeId, from, to, now = Date.now(), limit = 12) {
  if (!calendlyConfigured() || !eventTypeId || !from || !to) return [];
  const start = Math.max(Date.parse(from + 'T00:00:00Z') - 24 * 3600e3, now + 60 * 1000); // a day of slack: the window is in UK evenings
  const end = Math.min(Date.parse(to + 'T00:00:00Z') + 2 * 24 * 3600e3, start + 7 * 24 * 3600e3);
  if (end <= start) return [];
  const iso = ms => new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z');
  return cached(`slots|${eventTypeId}|${from}|${to}`, 5 * 60 * 1000, async () => {
    const d = await get('/event_type_available_times', { event_type: eventTypeUri(eventTypeId), start_time: iso(start), end_time: iso(end) });
    return (d.collection || []).filter(s => s.status === 'available' && s.start_time && /^https:\/\/calendly\.com\//.test(s.scheduling_url || ''))
      .map(s => ({ start: s.start_time, url: s.scheduling_url })).slice(0, limit);
  });
}

// What the mentee wrote when they booked: Calendly's invitee form answers ("What would you like to work on, discuss, or what are you struggling with?").
// The question is added to the event type in Calendly (Event type → Invitee questions → required). Answers come back as questions_and_answers.
export const uuidOf = uri => String(uri || '').split('/').pop();
export const summaryOf = qa => (qa || []).filter(x => x && String(x.answer || '').trim()).sort((a, b) => (a.position ?? 0) - (b.position ?? 0)).map(x => ({ q: String(x.question || '').trim(), a: String(x.answer).trim() }));
async function inviteesOf(uuid) {
  const d = await get(`/scheduled_events/${encodeURIComponent(uuid)}/invitees`, { count: '10', status: 'active' });
  return (d.collection || []).map(i => ({ name: i.name || '', email: String(i.email || '').toLowerCase(), answers: summaryOf(i.questions_and_answers), reschedule: i.reschedule_url || '' }));
}

// The mentee's next booked one-to-one, if any (matched on their email; short cache)
export async function bookedFor(eventTypeId, email, now = Date.now()) {
  if (!calendlyConfigured() || !eventTypeId || !email) return null;
  return cached(`booked|${email}`, 2 * 60 * 1000, async () => {
    const d = await get('/scheduled_events', { user: await userUri(), invitee_email: String(email).toLowerCase(), min_start_time: new Date(now).toISOString().replace(/\.\d{3}Z$/, 'Z'), status: 'active', sort: 'start_time:asc', count: '10' });
    const e = (d.collection || []).find(x => x.event_type === eventTypeUri(eventTypeId));
    if (!e) return null;
    const uuid = uuidOf(e.uri);
    const mine = (await inviteesOf(uuid).catch(() => [])).find(i => i.email === String(email).toLowerCase());
    return { start: e.start_time, url: e.location?.join_url || '', uuid, answers: mine?.answers || [] };
  });
}

// Every booked one-to-one in the next `days` days with who booked and what they wrote, soonest first (for the Ops dashboard). Short cache.
export async function upcomingBookings(eventTypeId, { days = 60, now = Date.now(), limit = 40 } = {}) {
  if (!calendlyConfigured() || !eventTypeId) return [];
  const iso = ms => new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z');
  return cached(`upcoming|${eventTypeId}|${days}`, 2 * 60 * 1000, async () => {
    const d = await get('/scheduled_events', { user: await userUri(), min_start_time: iso(now), max_start_time: iso(now + days * 86400e3), status: 'active', sort: 'start_time:asc', count: '100' });
    const events = (d.collection || []).filter(x => x.event_type === eventTypeUri(eventTypeId)).slice(0, limit);
    return Promise.all(events.map(async e => {
      const who = (await inviteesOf(uuidOf(e.uri)).catch(() => []))[0] || { name: '', email: '', answers: [] };
      return { uuid: uuidOf(e.uri), start: e.start_time, end: e.end_time || '', joinUrl: e.location?.join_url || '', name: who.name, email: who.email, answers: who.answers };
    }));
  });
}
