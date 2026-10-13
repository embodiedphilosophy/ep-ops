// Circle (ss.embodiedphilosophy.com) Admin API v2. Vercel: CIRCLE_API_TOKEN (Admin v2 token from
// Circle → Developers → Tokens), optional CIRCLE_TEACHER_ACCESS_GROUP_ID, CIRCLE_API_BASE.
const BASE = () => (process.env.CIRCLE_API_BASE || 'https://app.circle.so/api/admin/v2').replace(/\/$/, '');
export const circleConfigured = () => !!process.env.CIRCLE_API_TOKEN;

async function circle(path, init = {}) {
  const res = await fetch(BASE() + path, {
    ...init, cache: 'no-store',
    headers: { Authorization: `Bearer ${process.env.CIRCLE_API_TOKEN}`, 'Content-Type': 'application/json', ...(init.headers || {}) },
  });
  const text = await res.text();
  let body = {}; try { body = text ? JSON.parse(text) : {}; } catch { body = { message: text }; }
  if (!res.ok) { const e = new Error(`Circle ${path}: ${res.status} ${body.message || body.error || text}`.slice(0, 300)); e.status = res.status; throw e; }
  return body;
}
// Circle answers 409/422 when someone is already a member; that's fine for us
const already = e => [409, 422].includes(e.status) || /already/i.test(e.message);

export async function findMember(email) {
  try { const m = await circle(`/community_members/search?email=${encodeURIComponent(email)}`); return m?.id ? m : (m?.community_member || null); }
  catch (e) { if (e.status === 404) return null; throw e; }
}

// Invite (or find) the teacher, add them to the Teachers access group and to their course space.
// Safe to run again: existing memberships are left as they are. Returns one line per step.
export async function giveTeacherAccess({ email, name, spaceId, groupIds = [] }) {
  if (!circleConfigured()) throw new Error('CIRCLE_API_TOKEN is not set');
  const steps = [];
  const member = await findMember(email);
  if (member) steps.push({ step: 'account', ok: true, note: 'Already a member of the Circle community' });
  else {
    try { await circle('/community_members', { method: 'POST', body: JSON.stringify({ email, name, skip_invitation: false }) }); steps.push({ step: 'account', ok: true, note: 'Invitation sent by Circle' }); }
    catch (e) { if (!already(e)) throw e; steps.push({ step: 'account', ok: true, note: 'Already a member of the Circle community' }); }
  }
  const group = process.env.CIRCLE_TEACHER_ACCESS_GROUP_ID;
  if (group) {
    try { await circle(`/access_groups/${group}/community_members`, { method: 'POST', body: JSON.stringify({ email }) }); steps.push({ step: 'teachers', ok: true, note: 'Added to the Teachers access group' }); }
    catch (e) { if (!already(e)) throw e; steps.push({ step: 'teachers', ok: true, note: 'Already in the Teachers access group' }); }
  } else steps.push({ step: 'teachers', ok: false, note: 'No Teachers access group set (CIRCLE_TEACHER_ACCESS_GROUP_ID)' });
  // The course's own access group(s) in Circle (e.g. "SS 26-27 · Fall", which opens its Live Sessions and Recordings spaces)
  for (const id of groupIds) {
    try { await circle(`/access_groups/${id}/community_members`, { method: 'POST', body: JSON.stringify({ email }) }); steps.push({ step: `group-${id}`, ok: true, note: 'Added to your course spaces' }); }
    catch (e) { if (!already(e)) throw e; steps.push({ step: `group-${id}`, ok: true, note: 'Already in your course spaces' }); }
  }
  if (groupIds.length && !spaceId) return steps;
  if (spaceId) {
    try { await circle('/space_members', { method: 'POST', body: JSON.stringify({ email, space_id: Number(spaceId) }) }); steps.push({ step: 'space', ok: true, note: 'Added to the course space' }); }
    catch (e) { if (!already(e)) throw e; steps.push({ step: 'space', ok: true, note: 'Already in the course space' }); }
  } else steps.push({ step: 'space', ok: false, note: 'Course space not assigned yet: the EP team will add you' });
  return steps;
}

// ---- Member sync (Kit tags → Circle groups). Groups are matched by name: access groups first, then space groups.
// Names match without case or diacritics: "Sadhana School" = "Sādhana School"
export const norm = n => String(n || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();

async function listAll(path) {
  const out = [];
  for (let page = 1; page <= 20; page++) {
    const r = await circle(`${path}${path.includes('?') ? '&' : '?'}per_page=100&page=${page}`);
    const rows = r.records || r.data || (Array.isArray(r) ? r : []);
    out.push(...rows);
    if (!r.has_next_page || !rows.length) break;
  }
  return out;
}

let groupCache = null;
// { normalised name: { kind: 'access'|'space_group', id, name } }
export async function groupIndex() {
  if (groupCache && Date.now() - groupCache.at < 10 * 60 * 1000) return groupCache.map;
  const map = {};
  for (const g of await listAll('/space_groups').catch(() => [])) map[norm(g.name)] = { kind: 'space_group', id: g.id, name: g.name };
  for (const g of await listAll('/access_groups').catch(() => [])) map[norm(g.name)] = { kind: 'access', id: g.id, name: g.name };
  groupCache = { at: Date.now(), map };
  return map;
}

// Adds the person to Circle if needed. skipInvite=false means Circle emails them an invitation.
export async function ensureMember(email, name, { skipInvite = false } = {}) {
  const found = await findMember(email);
  if (found) return { member: found, created: false };
  try {
    const r = await circle('/community_members', { method: 'POST', body: JSON.stringify({ email, name: name || undefined, skip_invitation: skipInvite }) });
    return { member: r.community_member || r, created: true };
  } catch (e) { if (already(e)) return { member: null, created: false }; throw e; }
}

async function resolveGroup(groupName) {
  const g = (await groupIndex())[norm(groupName)];
  if (!g) throw new Error(`No Circle group named "${groupName}"`);
  return g;
}

export async function grantGroup(groupName, email) {
  const g = await resolveGroup(groupName);
  try {
    if (g.kind === 'access') return await circle(`/access_groups/${g.id}/community_members`, { method: 'POST', body: JSON.stringify({ email }) });
    return await circle('/space_group_members', { method: 'POST', body: JSON.stringify({ email, space_group_id: g.id }) });
  } catch (e) { if (already(e)) return { already: true }; throw e; }
}

export async function revokeGroup(groupName, email) {
  const g = await resolveGroup(groupName);
  const q = encodeURIComponent(email);
  const ignore404 = e => { if (e.status === 404) return { already: 'not a member' }; throw e; };
  if (g.kind === 'access') return circle(`/access_groups/${g.id}/community_members?email=${q}`, { method: 'DELETE' }).catch(ignore404);
  return circle(`/space_group_members?email=${q}&space_group_id=${g.id}`, { method: 'DELETE' }).catch(ignore404);
}

// ---- Events (Ops: Circle event sync, lib/ops/circlesync.js) ----
export async function listSpaces() { return listAll('/spaces'); }
export async function listEvents() { return listAll('/events'); }
// Body shape follows Circle's event records (name, body, starts_at, duration_in_seconds, location_type).
// live_room = Circle's built-in live stream, as on the events made by hand.
export async function createEvent(spaceId, fields) {
  const r = await circle('/events', { method: 'POST', body: JSON.stringify({ space_id: Number(spaceId), event: { location_type: 'live_room', send_email_reminder: true, send_in_app_notification_reminder: true, ...fields } }) });
  return r.event || r;
}
export async function updateEvent(id, fields) {
  const r = await circle(`/events/${id}`, { method: 'PUT', body: JSON.stringify({ event: fields }) });
  return r.event || r;
}
