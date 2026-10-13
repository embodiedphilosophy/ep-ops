import { NextResponse } from 'next/server';
import { teacherContext } from '@/lib/ops/auth';
import { offeringsFor, loadPages, savePage, slugify, deliverables, profileFor, completeTasks } from '@/lib/teach';
import { loadTeam } from '@/lib/calendar';
import { readRange, writeRange, colLetter } from '@/lib/google';
import { todayET } from '@/lib/events';
import { sendEmail, layout, esc, button } from '@/lib/ops/email';

export const dynamic = 'force-dynamic';
const words = s => (String(s || '').trim().match(/\S+/g) || []).length;
const FIELDS = ['title', 'subtitle', 'summary', 'explore', 'audience', 'readings_mode', 'readings', 'promo_1', 'promo_2', 'promo_3', 'promo_clip'];

function missing(f, needs) {
  const m = [];
  if (!f.title?.trim()) m.push('a public title');
  if (!f.subtitle?.trim()) m.push('a one-line subtitle');
  const sw = words(f.summary); if (sw < 25 || sw > 90) m.push('a 2–3 sentence description');
  if (String(f.explore || '').split('\n').filter(x => x.trim()).length < 3) m.push('at least three things students will explore');
  if (!f.audience?.trim()) m.push('who it’s for');
  if (needs.readings && !['all', 'weekly', 'none'].includes(f.readings_mode)) m.push('how you’ll share readings');
  if (needs.readings && f.readings_mode === 'all' && !String(f.readings || '').trim()) m.push('your readings (or choose to send them weekly)');
  if (needs.promo) for (const k of ['promo_1', 'promo_2', 'promo_3']) if (words(f[k]) < 30) { m.push('three promotional email blurbs (at least 30 words each)'); break; }
  return m;
}

// A single-session offering's title and description also fill its Event Details row (matched by
// event ID), if those cells are empty. The Master Schedule is formulas, so it picks them up from there.
async function fillSchedule(offering, f) {
  if (offering.sessions.length !== 1) return;
  const sheet = process.env.CALENDAR_SHEET_ID;
  const { loadCalendar } = await import('@/lib/calendar');
  const ev = (await loadCalendar({ fresh: true })).find(e => e.id === offering.sessions[0].id);
  if (!ev?.sched_id) return;
  const rows = await readRange(sheet, "'Event Details'!A4:Z1000", { fresh: true });
  const head = (rows[0] || []).map(h => String(h).trim().toLowerCase());
  const i = rows.findIndex((r, n) => n > 0 && String(r[0] || '').trim() === ev.sched_id);
  if (i < 0) return;
  const rowNum = i + 4;
  for (const [name, val] of [['public title', f.title], ['summary', f.summary]]) {
    const c = head.indexOf(name); if (c < 0 || !val) continue;
    if (!String(rows[i][c] || '').trim()) await writeRange(sheet, `'Event Details'!${colLetter(c)}${rowNum}`, [[val]]);
  }
}

// Save a draft ({ submit: false }) or send the course page for review ({ submit: true })
export async function POST(req) {
  const b = await req.json().catch(() => ({}));
  const ctx = await teacherContext(b.as);
  if (!ctx) return NextResponse.json({ error: 'Please sign in again' }, { status: 401 });
  const offering = (await offeringsFor(ctx.email, { fresh: true })).find(o => o.key === b.offering);
  if (!offering) return NextResponse.json({ error: 'We couldn’t find that offering on your schedule.' }, { status: 404 });

  const f = Object.fromEntries(FIELDS.map(k => [k, String(b.fields?.[k] ?? '').trim()]));
  const profile = await profileFor(ctx.email);
  const dl = await deliverables(offering, { hasProfile: true });
  const needs = { readings: dl.some(d => d.kind === 'readings'), promo: dl.some(d => d.kind === 'promo') };
  if (b.submit) {
    const m = missing(f, needs);
    if (m.length) return NextResponse.json({ error: `Still needed: ${m.join(', ')}.` }, { status: 400 });
  }
  if (ctx.actingAs) return NextResponse.json({ ok: true, preview: true, page: { ...f, slug: slugify(f.title || offering.title) } });
  const all = await loadPages();
  const existing = all.find(p => p.offering === offering.key);
  // Each course page needs its own address: add -2, -3… if another offering already uses the slug
  const uniqueSlug = base => { let s = base || slugify(offering.key), n = 1; while (all.some(p => p.slug === s && p.offering !== offering.key)) s = `${base}-${++n}`; return s; };
  const status = existing?.status === 'published' ? 'published' : b.submit ? 'submitted' : 'draft';
  const page = await savePage(offering.key, {
    ...f, track: offering.track, slug: existing?.slug || uniqueSlug(slugify(f.title || offering.title)),
    teacher_emails: [...new Set([...String(existing?.teacher_emails || '').split(/[\s,]+/).filter(Boolean), ctx.email])].join(', '),
    status, submitted_on: b.submit ? todayET() : existing?.submitted_on || '',
  });
  if (!b.submit) return NextResponse.json({ ok: true, page });

  const out = { ok: true, page };
  if (!ctx.actingAs) {
    // Close the tasks this covers: title/description, promo blurbs, and readings if they sent them all now
    const kinds = ['confirm', ...(needs.promo ? ['promo'] : []), ...(f.readings_mode === 'all' || f.readings_mode === 'none' ? ['readings'] : [])];
    out.motion = await completeTasks({ name: profile?.name, sessionIds: offering.sessions.map(s => s.id), kinds });
    await fillSchedule(offering, f).catch(e => { out.scheduleError = e.message; });
    const directors = (await loadTeam()).filter(t => t.director && t.email).map(t => t.email.trim());
    const base = process.env.OPS_URL || new URL(req.url).origin;
    for (const to of directors) await sendEmail({ to, subject: `Course page ready for review: ${f.title}`,
      html: layout(`${esc(f.title)}`, `<p>${esc(profile?.name || ctx.email)} sent the course page for <b>${esc(offering.title)}</b> (${esc(offering.start)}).</p>
        <p><i>${esc(f.subtitle)}</i></p><p>${esc(f.summary)}</p>
        ${f.readings ? `<p><b>Readings:</b><br>${esc(f.readings).replace(/\n/g, '<br>')}</p>` : ''}
        ${needs.promo ? `<p><b>Promo blurbs:</b></p><ol>${[f.promo_1, f.promo_2, f.promo_3].map(x => `<li>${esc(x)}</li>`).join('')}</ol>` : ''}
        <p>Preview it, then set <b>status</b> to <b>published</b> on the Course Pages tab to put it live.</p>${button(`${base}/teach/preview/${page.slug}`, 'Preview the page')}`) }).catch(() => {});
  }
  return NextResponse.json(out);
}
