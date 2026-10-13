import { NextResponse } from 'next/server';
import { teacherContext } from '@/lib/ops/auth';
import { profileFor, saveProfile, siteTeacher, offeringsFor, completeTasks } from '@/lib/teach';
import { loadTeam } from '@/lib/calendar';
import { sendEmail, layout, esc } from '@/lib/ops/email';

export const dynamic = 'force-dynamic';
const words = s => (String(s).trim().match(/\S+/g) || []).length;

// Save (or confirm) the teacher's name, bio and headshot → Teachers tab
// { name, bio, photo_url } to submit a new/updated profile, or { keep: true, name } to confirm what's on file
export async function POST(req) {
  const b = await req.json().catch(() => ({}));
  const ctx = await teacherContext(b.as);
  if (!ctx) return NextResponse.json({ error: 'Please sign in again' }, { status: 401 });
  const name = String(b.name || '').trim();
  if (!name) return NextResponse.json({ error: 'Please add your name as you’d like it to appear.' }, { status: 400 });
  const existing = await profileFor(ctx.email);
  // Directors trying it out as a teacher: check the input, save nothing
  const dry = !!ctx.actingAs;

  let saved;
  if (b.keep) {
    const site = await siteTeacher(name);
    const src = existing || site;
    if (!src?.bio) return NextResponse.json({ error: 'We don’t have a bio on file for you yet. Please add one.' }, { status: 400 });
    const row = { name, role: src.role || '', bio: src.bio, photo_url: src.photo_url || '', status: existing?.status || 'on file' };
    saved = dry ? row : await saveProfile(ctx.email, row);
  } else {
    const w = words(b.bio);
    if (w < 60 || w > 100) return NextResponse.json({ error: `Your bio is ${w} words. Please keep it between 60 and 100.` }, { status: 400 });
    if (!/^https:\/\//.test(String(b.photo_url || ''))) return NextResponse.json({ error: 'Please add a headshot.' }, { status: 400 });
    const site = await siteTeacher(name);
    const row = { name, role: existing?.role || site?.role || 'Guest teacher', bio: String(b.bio).trim(), photo_url: b.photo_url, status: 'submitted' };
    saved = dry ? row : await saveProfile(ctx.email, row);
    // Let the directors know there's a profile to approve (status → approved puts it on the site)
    if (!ctx.actingAs) {
      const directors = (await loadTeam()).filter(t => t.director && t.email).map(t => t.email.trim());
      for (const to of directors) await sendEmail({ to, subject: `New teacher profile to approve: ${name}`,
        html: layout(`${esc(name)} sent a bio and headshot`, `<p><img src="${esc(b.photo_url)}" width="120" height="120" style="border-radius:60px;object-fit:cover" alt=""></p><p>${esc(b.bio)}</p><p>To use it on the website, set <b>status</b> to <b>approved</b> on the Teachers tab.</p>`) }).catch(() => {});
    }
  }
  // Close "Send bio and headshot" in Motion for every upcoming offering
  const sessionIds = (await offeringsFor(ctx.email)).flatMap(o => o.sessions.map(s => s.id));
  const motion = ctx.actingAs ? { completed: 0, note: 'not changed while trying it out' } : await completeTasks({ name, sessionIds, kinds: ['bio'] });
  return NextResponse.json({ ok: true, profile: saved, motion });
}
