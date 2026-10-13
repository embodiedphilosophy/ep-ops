import { emailsOf } from '../events';
import { zoomMode, MANUAL_SERIES } from '../zoomplan';
import { whereOf } from './eventfields';

// Event readiness checks (Ops Dashboard v2 spec, "Event readiness"), read straight from the calendar sheet:
// nobody keeps a separate checklist. Each check applies to some tracks, has a due date, and says which field
// in the event drawer fixes it. The Kit tag and promo-email checks read Kit (never write to it); 'Social posts
// approved' reads the EP Social Engine. The Circle space comes later.
const addDays = (d, n) => { const x = new Date(d + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const names = s => String(s || '').split(',').map(x => x.trim()).filter(Boolean);
const filled = v => String(v ?? '').trim() !== '';
const key = n => String(n || '').toLowerCase().replace(/^dr\.?\s+/, '').replace(/[^a-z]+/g, ' ').trim();
const lower = s => String(s || '').trim().toLowerCase();

// "Promo Starts" can be a date or a raw sheet serial number (46271)
export function promoStart(v) {
  const s = String(v || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  if (/^\d{5}$/.test(s)) return addDays('1899-12-30', Number(s));
  return '';
}

// Tracks whose Enrolled Tag must exist in Kit before promotion starts
const KIT_TAG_TRACKS = ['EVENT', 'SS', 'SSWW', 'LAUNCH'];
// Broadcasts carry the event ID ("[E047] Promo #2") from this date; events whose first email was due earlier aren't checked
const KIT_NAMING_FROM = '2026-10-08';
const PUBLIC = ev => /public/i.test(ev.audience || '') && ev.track !== 'LAUNCH';
const PAID = ev => /paid|donation|pay what|\$|retreat|rate/i.test(`${ev.access} ${ev.price}`) && !/^free/i.test(String(ev.price || ''));

// ctx: { profileOf(name) → Teachers-tab row, siteTeacher(name) → Site Teachers row, pageOf(ev) → Course Pages row,
//        offsets: { TRACK: { title: -21, replay: 1 } } from Task Templates, seriesLinks: { series: link },
//        emails: { TRACK: [offset_days of each Marketing kit_email template] }, kit: kitSignals() or null }
export function checksFor(ev, ctx) {
  const T = ev.track, out = [];
  const add = (key, label, ready, due, field, detail = '') => out.push({ key, label, ready: !!ready, due, field, detail });
  const promo = promoStart(ev.promo_starts);
  const off = ctx.offsets[T] || {};
  // Kit (read only): skipped when Kit can't be reached, so a Kit outage never turns events red
  if (ctx.kit && KIT_TAG_TRACKS.includes(T)) {
    const tags = ev.enrolled_tags || [], missing = tags.filter(t => !ctx.kit.tags.has(lower(t)));
    add('kit_tag', 'Kit tag', tags.length && !missing.length, promo ? addDays(promo, -1) : addDays(ev.date, -28), 'Enrolled Tag',
      !tags.length ? 'No Enrolled Tag' : missing.length ? `Not in Kit: ${missing.join(', ')}` : '');
  }
  const mails = ctx.emails?.[T] || [];
  if (ctx.kit && mails.length && ev.sched_id && addDays(ev.date, Math.min(...mails)) >= KIT_NAMING_FROM) {
    const n = ctx.kit.broadcasts.filter(b => b.at && b.ids.includes(ev.sched_id)).length;
    add('promo_emails', 'Promo emails scheduled', n >= mails.length, addDays(ev.date, Math.min(...mails)), null,
      `${n} of ${mails.length} in Kit carry [${ev.sched_id}]`);
  }
  if (T === 'LAUNCH') return out;
  const teachers = names(ev.teachers);

  add('teacher', 'Teacher assigned', teachers.length && emailsOf(ev).length, addDays(ev.date, -21), 'Teachers & Hosts',
    !teachers.length ? 'No teacher named' : !emailsOf(ev).length ? 'No reminder email' : '');
  if (['WSML', 'LRL', 'WSQ', 'SSWW', 'EVENT'].includes(T)) {
    const page = ctx.pageOf(ev), sent = page && ['submitted', 'published'].includes(lower(page.status));
    add('title', 'Title and description', (filled(ev.public_title) && filled(ev.summary)) || sent, addDays(ev.date, off.title ?? -21), 'Summary',
      !filled(ev.public_title) ? 'No public title' : !filled(ev.summary) ? 'No summary' : '');
  }
  if (T !== 'MM' && teachers.length) {
    const missing = teachers.filter(n => { const p = ctx.profileOf(n), s = ctx.siteTeacher(n); return !((p && filled(p.bio) && filled(p.photo_url)) || (s && filled(s.bio))); });
    add('bio', 'Bio and headshot', !missing.length, addDays(ev.date, -28), null, missing.join(', '));
  }
  if (T === 'EVENT' && teachers.length === 1) {
    const page = ctx.pageOf(ev);
    add('blurbs', 'Promo blurbs', page && ['promo_1', 'promo_2', 'promo_3'].every(k => filled(page[k])), addDays(ev.date, -42), null, 'From the teacher’s onboarding');
  }
  if (PUBLIC(ev)) add('web', 'On the website', ev.website, promo || addDays(ev.date, -21), 'Website');
  if (PUBLIC(ev) && PAID(ev)) add('registration', 'Registration open', filled(ev.registration_url), promo || addDays(ev.date, -21), 'Registration URL');
  const where = whereOf(ev.zoom, T);
  // A pasted Zoom link always wins; otherwise Circle needs its event, Zoom needs a link or an automatic meeting
  const linked = filled(ev.zoom_link) || (where === 'circle' ? filled(ev.circle_event)
    : (ev.series && ctx.seriesLinks[ev.series]) || ['one-off', 'series'].includes(zoomMode(ev.zoom)) || MANUAL_SERIES.has(ev.series));
  add('link', 'Session link', linked, addDays(ev.date, -7), 'Zoom Type', where === 'circle' && !linked ? 'Circle event not created yet' : !linked ? 'No Zoom link' : '');
  // Social Engine posts link to an event as "Event name — YYYY-MM-DD"; one Approved (or Posted) post is enough
  if (PUBLIC(ev) && !['MM', 'SS'].includes(T)) {
    const head = lower(ev.internal_title || ev.title).slice(0, 12);
    const posts = ctx.social.filter(p => String(p.linked_event || '').trim().endsWith(ev.date) && lower(p.linked_event).startsWith(head));
    add('social', 'Social posts approved', posts.some(p => ['approved', 'posted'].includes(lower(p.status))), addDays(ev.date, -7), null,
      posts.length ? `${posts.length} planned, none approved` : 'None planned yet');
  }
  if (['SS', 'EVENT'].includes(T)) add('host', 'Course host', filled(ev.course_host), addDays(ev.date, -7), 'Course Host');
  // The recording posted in Circle (a Vimeo ID from before the move counts too)
  if (off.replay != null) add('replay', 'Replay posted', filled(ev.replay_link) || filled(ev.video_id), addDays(ev.end_date || ev.date, off.replay), 'Replay Link');
  return out;
}

// red: a check past due, or the event under 7 days away with one still missing; amber: one due within 7 days;
// green: everything due so far is in; grey: nothing due yet
export function checkStatus(ev, checks, today) {
  const soon = addDays(today, 7), missing = checks.filter(c => !c.ready);
  if (missing.some(c => c.due < today) || (ev.date >= today && ev.date < soon && missing.some(c => c.due <= ev.date))) return 'red';
  if (missing.some(c => c.due <= soon)) return 'amber';
  return checks.some(c => c.due <= soon) ? 'green' : 'grey';
}

// Everything checksFor needs, loaded once
export async function checkContext(cal) {
  const { loadTemplates, PROFILES_TAB } = await import('../calendar');
  const { readRange, toObjects } = await import('../google');
  const { loadPages, offeringKey } = await import('../teach');
  const { getAllTeachers } = await import('../content');
  const { seriesLinksOf } = await import('./joinurl');
  const { ruleOf } = await import('./autocomplete');
  const { socialSheetId } = await import('../social');
  const { kitSignals } = await import('../kit');
  const [tpls, pages, profiles, site, social, kit] = await Promise.all([
    loadTemplates().catch(() => []), loadPages({ fresh: false }).catch(() => []),
    readRange(process.env.CALENDAR_SHEET_ID, `'${PROFILES_TAB}'!A1:Z2000`).then(toObjects).catch(() => []),
    getAllTeachers().catch(() => []),
    readRange(socialSheetId(), "'Weekly Plan'!A1:AB1000").then(toObjects).catch(() => []),
    kitSignals().catch(() => null),
  ]);
  const offsets = {}, emails = {};
  for (const t of tpls) {
    const r = ruleOf(t), tr = String(t.track).toUpperCase(), o = Number(t.offset_days) || 0;
    if (r === 'kit_email' && /^marketing$/i.test(String(t.assign_to).trim())) (emails[tr] ||= []).push(o);
    if (r === 'title') (offsets[tr] ||= {}).title = Math.min(offsets[tr]?.title ?? 0, o);
    if (r === 'video_id') (offsets[tr] ||= {}).replay = o;
  }
  const prof = Object.fromEntries(profiles.filter(p => p.name).map(p => [key(p.name), p]));
  const sit = Object.fromEntries(site.filter(p => p.name).map(p => [key(p.name), p]));
  const pg = Object.fromEntries(pages.map(p => [p.offering, p]));
  return { social, offsets, emails, kit, seriesLinks: seriesLinksOf(cal), profileOf: n => prof[key(n)], siteTeacher: n => sit[key(n)], pageOf: ev => pg[offeringKey(ev)] };
}
