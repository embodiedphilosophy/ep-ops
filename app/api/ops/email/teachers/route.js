import { NextResponse } from 'next/server';
import { currentUser } from '@/lib/ops/auth';
import { isStaff, canEditEmail, canEditSite } from '@/lib/ops/nav';
import { loadCalendar } from '@/lib/calendar';
import { loadPages } from '@/lib/teach';
import { todayET } from '@/lib/events';
import { updatePlain, addPlain } from '@/lib/ops/store';
import { planRows } from '@/lib/ops/emailplan';
import { sendEmail, layout, esc } from '@/lib/ops/email';
import { directory, teacherRows, EDITABLE, lower, words, parse, diffWords, STALE_DAYS } from '@/lib/ops/teachers';
import { refreshSite } from '@/lib/ops/refresh';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;
const SHORT = [20, 60]; // words: "about 40"
const find = async email => (await teacherRows()).find(r => lower(r.values.email) === lower(email));

// GET → directory   GET ?email= → one teacher   GET ?what=review → the review queue
export async function GET(req) {
  const user = await currentUser();
  if (!isStaff(user)) return NextResponse.json({ error: 'Please sign in again' }, { status: 401 });
  const u = new URL(req.url), email = u.searchParams.get('email'), what = u.searchParams.get('what'), meta = { canEdit: canEditEmail(user), canApprove: canEditSite(user) };
  try {
    if (what === 'review') {
      const [rows, pages] = await Promise.all([teacherRows(), loadPages().catch(() => [])]);
      const bios = rows.filter(r => r.values.status === 'submitted').map(r => { const v = r.values; return { email: v.email, name: v.name, bio: v.bio, live_bio: v.live_bio || '', photo_url: v.photo_url, live_photo_url: v.live_photo_url || '', new_photo: !!v.photo_url && v.photo_url !== (v.live_photo_url || ''),
        first: !v.live_bio && !v.live_photo_url, diff: v.live_bio ? diffWords(v.live_bio, v.bio) : null, words: words(v.bio), review_note: v.review_note || '' }; });
      return NextResponse.json({ ...meta, bios, pages: pages.filter(p => ['submitted', 'published'].includes(lower(p.status))).map(p => ({ offering: p.offering, title: p.title || p.offering, slug: p.slug, status: lower(p.status), teachers: p.teacher_emails })) });
    }
    if (!email) { const list = await directory(); return NextResponse.json({ ...meta, teachers: list, counts: { submissions: list.filter(t => t.flags.includes('submission')).length, photo: list.filter(t => t.flags.includes('photo')).length, update: list.filter(t => t.flags.includes('update') || t.flags.includes('bio')).length, test: list.filter(t => t.test).length } }); }
    const r = await find(email); if (!r) return NextResponse.json({ error: 'No profile for that teacher yet' }, { status: 404 });
    const v = r.values, today = todayET(), [cal, pages, plan] = await Promise.all([loadCalendar().catch(() => []), loadPages().catch(() => []), planRows({ light: false }).catch(() => [])]);
    const mine = cal.filter(e => !/cancel/i.test(e.status) && (lower(e.teacher_host_emails).includes(lower(email)) || lower(e.teachers).includes(lower(v.name)))), age = /^\d{4}-\d{2}-\d{2}$/.test(v.bio_updated_on || v.updated_on || '') ? Math.floor((Date.parse(today + 'T12:00:00Z') - Date.parse((v.bio_updated_on || v.updated_on) + 'T12:00:00Z')) / 864e5) : null;
    const emails = plan.map(x => x.values).filter(x => (parse(x.blocks_json, []) || []).some(b => b.type === 'teacher' && lower(b.teacher) === lower(email)) && x.status !== 'Not needed');
    const live = v.status === 'approved', ready = !!(v.bio && v.photo_url);
    return NextResponse.json({ ...meta, profile: { ...v, links: parse(v.links_json, []), versions: parse(v.photo_versions_json, []) }, words: { bio: words(v.bio), short: words(v.short_bio) }, short_range: SHORT,
      stale: age == null || age > STALE_DAYS, age_days: age, diff: v.live_bio && v.status === 'submitted' ? diffWords(v.live_bio, v.bio) : null,
      usage: { sessions: mine.filter(e => e.date >= today).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 12).map(e => ({ id: e.sched_id || e.id, title: e.title, date: e.date })), taught: mine.filter(e => e.date < today).length,
        pages: pages.filter(p => lower(p.teacher_emails).includes(lower(email))).map(p => ({ offering: p.offering, title: p.title || p.offering, status: p.status })), emails: emails.map(x => ({ id: x.id, subject: x.subject, date: x.planned_date, status: x.status })) },
      targets: [
        { key: 'website', label: 'Website: faculty and landing pages', state: live ? (ready ? 'Live' : 'Live, but missing a bio or headshot') : 'Not live', note: live ? 'Updates the moment you save.' : 'Goes live when the profile is approved.' },
        { key: 'circle', label: 'Circle profile', state: 'Copy by hand', note: 'Ops can’t write Circle profiles. Copy the bio from here.' },
        { key: 'kit', label: 'Kit teacher snippet', state: v.short_bio ? 'Text ready' : 'Needs a short bio', note: 'Kit snippets are updated in Kit. Copy the short bio from here; emails built here use it automatically.' },
        { key: 'social', label: 'Social: Meet the teacher', state: live && ready ? 'Ready' : 'Not ready', note: 'Needs an approved profile with a bio and a headshot.' }] });
  } catch (e) { console.error('Teachers read failed', e.message); return NextResponse.json({ error: 'Couldn’t read the teachers' }, { status: 502 }); }
}

// POST { action: create | save | approve | sendBack | archive | restore | photoMeta | restoreVersion }
export async function POST(req) {
  const user = await currentUser();
  if (!canEditEmail(user)) return NextResponse.json({ error: 'Only the email team can change this' }, { status: 403 });
  const b = await req.json().catch(() => ({})), me = user.name || user.email, now = todayET(), bad = (error, status = 400, extra = {}) => NextResponse.json({ error, ...extra }, { status });
  const ok = () => { refreshSite(); return NextResponse.json({ ok: true }); };
  try {
    if (b.action === 'create') {
      const email = lower(b.email); if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return bad('That doesn’t look like an email address');
      if (await find(email)) return bad('There is already a profile for that email');
      await addPlain('Teachers', { email, name: String(b.name || '').trim().slice(0, 120), role: '', status: 'on file', updated_on: now }, { who: me }); return ok();
    }
    const r = await find(b.email); if (!r) return bad('No such teacher', 404);
    const v = r.values, write = (ch, before) => updatePlain('Teachers', r.row, ch, { before: before ?? Object.fromEntries(Object.keys(ch).map(k => [k, v[k]])), who: me });
    if (b.action === 'save') {
      const ch = {}; for (const k of EDITABLE) if (b.changes?.[k] !== undefined) ch[k] = String(b.changes[k]).slice(0, k === 'bio' || k === 'short_bio' ? 2000 : 300);
      if (b.changes?.links) ch.links_json = JSON.stringify((Array.isArray(b.changes.links) ? b.changes.links : []).filter(l => l && /^https?:\/\//.test(l.url || '')).map(l => ({ label: String(l.label || '').slice(0, 60), url: String(l.url).slice(0, 300) })));
      if (!Object.keys(ch).length) return NextResponse.json({ ok: true });
      if ('short_bio' in ch && ch.short_bio && (words(ch.short_bio) < SHORT[0] || words(ch.short_bio) > SHORT[1])) return bad(`The short bio is ${words(ch.short_bio)} words. About 40 (${SHORT[0]}–${SHORT[1]}) works best.`);
      if (v.status === 'approved' && ('bio' in ch || 'name' in ch) && !b.confirm) return bad('This profile is live on the website, so saving changes it there straight away. Please confirm.', 400, { needConfirm: true });
      if ('bio' in ch && ch.bio !== v.bio) ch.bio_updated_on = now;
      ch.updated_on = now; if (v.status === 'approved') { if ('bio' in ch) ch.live_bio = ch.bio; if ('name' in ch) { /* the website matches on name: nothing else to do */ } }
      await write(ch); return ok();
    }
    if (b.action === 'approve') { // puts the profile on the website; what is live is remembered so a later change can be compared
      if (!v.bio || !v.photo_url) return bad('A profile needs a bio and a headshot before it can go on the website.');
      await write({ status: 'approved', live_bio: v.bio, live_photo_url: v.photo_url, bio_updated_on: now, updated_on: now, review_note: '', review_by: me, review_at: now }); return ok();
    }
    if (b.action === 'sendBack') {
      if (!b.confirm) return bad('Please confirm first'); const note = String(b.note || '').trim(); if (!note) return bad('Tell them what to change');
      await write({ status: 'on file', review_note: note.slice(0, 500), review_by: me, review_at: now });
      let mailed = false; try { if (v.email) { await sendEmail({ to: v.email, subject: 'A note on your Embodied Philosophy profile', html: layout('A note on your profile', `<p>Thank you for sending your profile. Before it goes on the website, we’d like one change:</p><p><i>${esc(note)}</i></p><p>You can update it any time from your onboarding link.</p>`) }); mailed = true; } } catch (e) { console.error('Send-back email failed', e.message); }
      refreshSite(); return NextResponse.json({ ok: true, mailed });
    }
    if (b.action === 'archive' || b.action === 'restore') { // hides a profile (a test entry, say). Nothing is deleted.
      if (!b.confirm) return bad('Please confirm first');
      await write(b.action === 'archive' ? { hidden: 'TRUE', status: v.status === 'approved' ? 'on file' : v.status } : { hidden: '' }); return ok();
    }
    if (b.action === 'photoMeta') {
      const ch = {}; for (const k of ['photo_alt', 'photo_credit']) if (b.changes?.[k] !== undefined) ch[k] = String(b.changes[k]).slice(0, 300);
      for (const k of ['focal_x', 'focal_y']) if (b.changes?.[k] !== undefined) { const n = Math.round(Number(b.changes[k])); if (!(n >= 0 && n <= 100)) return bad('The focal point must be between 0 and 100'); ch[k] = String(n); }
      await write(ch); return ok();
    }
    if (b.action === 'restoreVersion') { // an earlier headshot becomes the current one; the one being replaced is kept
      const vs = parse(v.photo_versions_json, []), pick = vs[Number(b.index)]; if (!pick) return bad('No such version');
      const next = vs.filter((_, i) => i !== Number(b.index)); if (v.photo_url) next.unshift({ url: v.photo_url, at: now, by: me });
      await write({ photo_url: pick.url, photo_versions_json: JSON.stringify(next.slice(0, 12)), updated_on: now, ...(v.status === 'approved' ? { live_photo_url: pick.url } : {}) }); return ok();
    }
    return bad('Unknown request');
  } catch (e) {
    if (e?.name === 'ConflictError') return bad('Someone changed this a moment ago. Reload and try again.', 409);
    console.error('Teacher write failed', e.message); return bad('Couldn’t save that', 502);
  }
}
