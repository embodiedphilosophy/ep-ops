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
export async function giveTeacherAccess({ email, name, spaceId }) {
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
  if (spaceId) {
    try { await circle('/space_members', { method: 'POST', body: JSON.stringify({ email, space_id: Number(spaceId) }) }); steps.push({ step: 'space', ok: true, note: 'Added to the course space' }); }
    catch (e) { if (!already(e)) throw e; steps.push({ step: 'space', ok: true, note: 'Already in the course space' }); }
  } else steps.push({ step: 'space', ok: false, note: 'Course space not assigned yet: the EP team will add you' });
  return steps;
}
