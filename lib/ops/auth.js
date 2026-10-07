import crypto from 'crypto';
import { cookies } from 'next/headers';
import { loadTeam } from '../calendar';

// Signed tokens (no database). Vercel: OPS_SECRET
const secret = () => { if (!process.env.OPS_SECRET) throw new Error('OPS_SECRET is not set'); return process.env.OPS_SECRET; };
export const COOKIE = 'ep_ops';

export function sign(data, ttlSeconds) {
  const body = Buffer.from(JSON.stringify({ ...data, exp: Date.now() + ttlSeconds * 1000 })).toString('base64url');
  const sig = crypto.createHmac('sha256', secret()).update(body).digest('base64url');
  return `${body}.${sig}`;
}
export function verify(token) {
  const [body, sig] = String(token || '').split('.');
  if (!body || !sig) return null;
  const good = crypto.createHmac('sha256', secret()).update(body).digest('base64url');
  if (good.length !== sig.length || !crypto.timingSafeEqual(Buffer.from(good), Buffer.from(sig))) return null;
  const data = JSON.parse(Buffer.from(body, 'base64url').toString());
  return data.exp > Date.now() ? data : null;
}

// The signed-in team member, or null
export async function currentUser() {
  const c = (await cookies()).get(COOKIE);
  const data = verify(c?.value);
  if (!data?.email) return null;
  const team = await loadTeam();
  const member = team.find(t => t.email.trim() === data.email);
  if (member) return member;
  // Teachers assigned on the Master Schedule (Teacher/Host Emails) who haven't been added to the Team tab yet
  const { isTeacherEmail, profileFor } = await import('../teach');
  if (!(await isTeacherEmail(data.email))) return null;
  const p = await profileFor(data.email).catch(() => null);
  return { name: p?.name || '', email: data.email, type: 'teacher', roles: ['Teacher'], director: false, newTeacher: true };
}

// Who onboarding acts for: the signed-in teacher, or (for directors trying it out) ?as=teacher@email
export async function teacherContext(as) {
  const user = await currentUser();
  if (!user) return null;
  const actingAs = user.director && as ? String(as).trim().toLowerCase() : '';
  return { user, email: actingAs || user.email, actingAs, director: !!user.director };
}
