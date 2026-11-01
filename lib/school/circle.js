// Circle Headless Member API, server side only. Vercel: CIRCLE_HEADLESS_TOKEN (a "Headless Auth" token from
// Circle → Developers → Tokens; an Admin V2 token gets a 403). Optional: CIRCLE_HEADLESS_BASE (tests).
//
// Who the member is comes from our own signed cookie (lib/school/session.js), which is only ever issued after a
// verified Circle sign-in. This file turns that email into a one-hour Circle access token and keeps it in
// memory, so no Circle token reaches the browser and there is no refresh token to store.
import { deletePostAsAdmin, circleConfigured } from '../circle';
const ORIGIN = () => (process.env.CIRCLE_HEADLESS_BASE || 'https://app.circle.so').replace(/\/$/, '');
const V1 = () => `${ORIGIN()}/api/headless/v1`;

export const headlessConfigured = () => !!process.env.CIRCLE_HEADLESS_TOKEN;

let blockedUntil = 0; // after a 429 we leave Circle alone for a minute
const tokens = new Map(); // email → { token, exp }
const cache = new Map(); // key → { at, value }

export class CircleError extends Error {
  constructor(message, status) { super(message); this.status = status; }
}

async function raw(url, init = {}) {
  if (Date.now() < blockedUntil) throw new CircleError('Circle is busy', 429);
  const res = await fetch(url, { cache: 'no-store', ...init, headers: { 'Content-Type': 'application/json', ...(init.headers || {}) } });
  if (res.status === 429) { blockedUntil = Date.now() + 60 * 1000; throw new CircleError('Circle is busy', 429); }
  const text = await res.text();
  let body = {}; try { body = text ? JSON.parse(text) : {}; } catch { body = { message: text }; }
  if (!res.ok) throw new CircleError(`Circle ${res.status}: ${body.message || body.error || ''}`.slice(0, 200), res.status);
  return body;
}

async function accessToken(email, fresh = false) {
  const hit = tokens.get(email);
  if (!fresh && hit && hit.exp > Date.now() + 2 * 60 * 1000) return hit.token;
  const r = await raw(`${ORIGIN()}/api/v1/headless/auth_token`, {
    method: 'POST', headers: { Authorization: `Bearer ${process.env.CIRCLE_HEADLESS_TOKEN}` }, body: JSON.stringify({ email }),
  });
  const token = r.access_token;
  if (!token) throw new CircleError('Circle gave no access token', 502);
  tokens.set(email, { token, memberId: r.community_member_id, exp: Date.now() + 55 * 60 * 1000 }); // Circle's tokens last an hour
  return token;
}

// This member's id in the community (it comes with the access token), to tell their own posts from everyone else's
export async function myMemberId(email) { await accessToken(email); return tokens.get(email)?.memberId ?? null; }

async function member(email, path, init = {}) {
  const go = async fresh => raw(`${V1()}${path}`, { ...init, headers: { ...(init.headers || {}), Authorization: `Bearer ${await accessToken(email, fresh)}` } });
  try { return await go(false); }
  catch (e) { if (e.status === 401) return go(true); throw e; }
}

// Cached read: key by member so one person's view is never served to another
async function cached(email, key, ttl, load) {
  const k = `${email}|${key}`, hit = cache.get(k);
  if (hit && Date.now() - hit.at < ttl) return hit.value;
  const value = await load();
  cache.set(k, { at: Date.now(), value });
  if (cache.size > 500) for (const [key2, v] of cache) if (Date.now() - v.at > 10 * 60 * 1000) cache.delete(key2);
  return value;
}

const rows = r => (Array.isArray(r) ? r : r.records || r.data || r.items || []);

async function all(email, path, maxPages = 10) {
  const out = [];
  for (let page = 1; page <= maxPages; page++) {
    const r = await member(email, `${path}${path.includes('?') ? '&' : '?'}page=${page}&per_page=100`);
    const list = rows(r);
    out.push(...list);
    if (!list.length || r.has_next_page === false || (r.has_next_page === undefined && list.length < 100)) break;
  }
  return out;
}

// The spaces this member can see (ids as strings)
export const memberSpaceIds = email => cached(email, 'spaces', 5 * 60 * 1000, async () => new Set((await all(email, '/spaces')).map(s => String(s.id))));

// The full space records this member can see (name, url, type, space group), for the member Library
export const memberSpaces = email => cached(email, 'spacerecs', 5 * 60 * 1000, () => all(email, '/spaces'));

// Spaces the member has actually joined. Circle may list private spaces to non-members; if the record carries an explicit
// "not a member" flag we honour it, otherwise being listed counts as joined (as the season pages already assume).
// Not yet checked against the live API: /api/school/debug shows which flag names Circle really sends.
const NOT_JOINED_FLAGS = ['is_member', 'member', 'joined', 'is_joined', 'current_user_is_member', 'current_member_joined'];
export const isJoined = rec => !NOT_JOINED_FLAGS.some(k => rec?.[k] === false);
// The id of a space the member is in, found by its address slug (e.g. "mentee-questions" from /c/mentee-questions), so a space can be set up from its link alone.
// Circle's space record carries slug and url (url checked on the mock only); a space the member is not in is not found.
export const spaceIdBySlug = async (email, slug) => {
  const want = String(slug || '').toLowerCase();
  if (!want) return null;
  const hit = (await joinedSpaces(email)).find(s => String(s.slug || '').toLowerCase() === want || String(s.url || '').toLowerCase().replace(/[?#].*$/, '').replace(/\/$/, '').endsWith(`/c/${want}`));
  return hit ? hit.id : null;
};
export const joinedSpaces = email => memberSpaces(email).then(list => list.filter(isJoined));

// Circle's event list is upcoming sessions only unless past_events is asked for, so we read both and merge them
export const eventList = email => cached(email, 'events', 5 * 60 * 1000, async () => {
  const [up, past] = await Promise.all([all(email, '/community_events'), all(email, '/community_events?past_events=true')]);
  const seen = new Set();
  return [...up, ...past].filter(e => !seen.has(e.id) && seen.add(e.id));
});

// Posts in one space. Topic filtering happens in lib/school/tabs.js because the filter parameter isn't documented.
export const spacePosts = (email, spaceId) => cached(email, `posts:${spaceId}`, 60 * 1000, () => all(email, `/spaces/${spaceId}/posts?status=published`, 5));

// The newest posts of one space, one request, for the hub's "latest" line and new-item counts.
// 20 is enough to count new items; the sort is repeated client side in lib/school/hub.js because the parameter isn't verified.
export const latestPosts = (email, spaceId) => cached(email, `latest:${spaceId}`, 2 * 60 * 1000, async () => rows(await member(email, `/spaces/${spaceId}/posts?status=published&sort=latest&per_page=20`)));

// Questions for the Group: the newest posts of the questions space with their comment counts, and whether a Circle admin has answered.
// Field names follow Circle's Headless posts (name, comments_count, author); each is read defensively. The comments call is
// best effort (an unverified request shape): if it fails, "Jacob answered" is simply not shown.
export const questionPosts = (email, spaceId, limit = 7) => cached(email, `questions:${spaceId}`, 2 * 60 * 1000, async () => {
  const list = rows(await member(email, `/spaces/${Number(spaceId)}/posts?status=published&sort=latest&per_page=${limit}`));
  const out = list.slice(0, limit).map(p => ({
    id: String(p.id), title: String(p.name || p.title || '').trim(), url: p.url || '', at: p.created_at || p.published_at || '',
    by: String(p.author?.name || p.user_name || p.user?.name || '').trim(), answers: Number(p.comments_count ?? p.comment_count ?? 0) || 0, staff: false,
  })).filter(p => p.title);
  await Promise.all(out.slice(0, 2).filter(p => p.answers > 0).map(async p => {
    try { p.staff = rows(await member(email, `/posts/${encodeURIComponent(p.id)}/comments?per_page=50`)).some(c => c?.author?.community_admin || c?.user?.community_admin); } catch { /* best effort */ }
  }));
  return out;
});

// "This week" only needs what is coming up plus a few recent ones, so it reads far less than the season view does
export const weekEvents = email => cached(email, 'weekevents', 5 * 60 * 1000, async () => {
  const [up, past] = await Promise.all([all(email, '/community_events', 3), all(email, '/community_events?past_events=true', 1)]);
  const seen = new Set();
  return [...up, ...past].filter(e => !seen.has(e.id) && seen.add(e.id));
});

export async function rsvp(email, eventId) {
  const r = await member(email, `/events/${encodeURIComponent(eventId)}/event_attendees`, { method: 'POST', body: '{}' });
  cache.delete(`${email}|events`);
  return r;
}

// Request body per Circle's Headless Member API spec: name, topics (ids), tiptap_body (a document of paragraphs)
const paragraphs = text => String(text).split(/\n{1,}/).map(t => t.trim()).filter(Boolean).map(t => ({ type: 'paragraph', content: [{ type: 'text', text: t }] }));
export async function createPost(email, spaceId, { title, body, topicId }) {
  const r = await member(email, `/spaces/${spaceId}/posts`, {
    method: 'POST',
    body: JSON.stringify({
      space_id: Number(spaceId), name: title, topics: topicId != null ? [Number(topicId)] : [],
      is_comments_enabled: true, is_liking_enabled: true,
      tiptap_body: { body: { type: 'doc', content: paragraphs(body) } },
    }),
  });
  cache.delete(`${email}|posts:${spaceId}`);
  return r;
}

// Comments on a post, as the member sees them (oldest first happens in lib/school/reflections.js). Each comment carries id, parent_comment_id,
// a body and its author; the request and these field names are checked against the mock only (docs/school-seasons.md).
export const postComments = (email, postId) => cached(email, `comments:${postId}`, 30 * 1000, () => all(email, `/posts/${encodeURIComponent(postId)}/comments`, 5));

// A reply or comment on a post, written as the member. Same document shape as a new post; parent_comment_id makes it a reply to a comment.
export async function createComment(email, postId, { text, parentId }) {
  const r = await member(email, `/posts/${encodeURIComponent(postId)}/comments`, {
    method: 'POST',
    body: JSON.stringify({ ...(parentId ? { parent_comment_id: Number(parentId) } : {}), tiptap_body: { body: { type: 'doc', content: paragraphs(text) } } }),
  });
  cache.delete(`${email}|comments:${postId}`);
  return r;
}

// Take a post down: the member deletes their own post; if Circle will not let a member do that (403, 404 or 405), the admin API does it.
// The member request is checked on the mock only.
export async function deletePost(email, postId) {
  try { await member(email, `/posts/${encodeURIComponent(postId)}`, { method: 'DELETE' }); }
  catch (e) {
    if (![403, 404, 405].includes(e.status) || !circleConfigured()) throw e;
    await deletePostAsAdmin(postId);
  }
}

// The latest messages of a chat room the member belongs to (the cohort chat). Read as the member, so a room they are not in reads as empty.
// Each message has body (plain text), sent_at and sender { name, community_admin, moderator } (checked against the real API, 21 Oct 2026).
export const chatMessages = (email, roomUuid, limit = 30) => cached(email, `chat:${roomUuid}`, 30 * 1000, async () => {
  if (!/^[0-9a-f-]{36}$/i.test(String(roomUuid))) return [];
  const r = await member(email, `/messages/${roomUuid}/chat_room_messages?per_page=${limit}`);
  return rows(r).filter(m => m && m.body && m.sent_at).sort((a, b) => Date.parse(a.sent_at) - Date.parse(b.sent_at)).slice(-limit);
});

// A course's sections with their lessons, each with this member's progress ({ status: 'incomplete' | 'complete' }) (checked 21 Oct 2026).
export const courseSections = (email, courseSpaceId, ttl = 2 * 60 * 1000) => cached(email, `course:${courseSpaceId}`, ttl, async () => {
  const r = await member(email, `/courses/${Number(courseSpaceId)}/sections`);
  return Array.isArray(r) ? r : rows(r);
});

// Send a message to a chat room as the member. Circle asks for rich_text_body (a document of paragraphs, the same shape messages are
// read back in); the missing-parameter error named it on 21 Oct 2026. The success response has not been seen yet.
export async function sendChatMessage(email, roomUuid, text) {
  if (!/^[0-9a-f-]{36}$/i.test(String(roomUuid))) throw new CircleError('Unknown chat room', 400);
  const r = await member(email, `/messages/${roomUuid}/chat_room_messages`, { method: 'POST', body: JSON.stringify({ rich_text_body: { body: { type: 'doc', content: paragraphs(text) } } }) });
  cache.delete(`${email}|chat:${roomUuid}`);
  return r;
}

// Start (or reuse) a direct chat with another member, as the member. NOT yet checked against the real API (the body shape is a guess from Circle's docs);
// the nudge job that uses it is off until MENTEE_NUDGES=on and records nothing when this fails.
export async function startDirectChat(email, otherMemberId) {
  const r = await member(email, '/messages', { method: 'POST', body: JSON.stringify({ community_member_ids: [Number(otherMemberId)] }) });
  return r?.uuid || r?.chat_room?.uuid || '';
}

// Start a GROUP chat as the member (the mentor), with other members in it. NOT yet checked against the real API: the body shape is a guess from Circle's
// docs (chat_room_kind, name, community_member_ids). The pair-chat job runs `mode=test` first, which returns the raw reply so the shape can be confirmed.
export async function startGroupChat(email, { name, memberIds }) {
  return member(email, '/messages', { method: 'POST', body: JSON.stringify({ chat_room_kind: 'group_chat', name: String(name || '').slice(0, 100), community_member_ids: memberIds.map(Number) }) });
}
