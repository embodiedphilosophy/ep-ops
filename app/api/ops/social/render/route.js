import { NextResponse } from 'next/server';
import { currentUser } from '@/lib/ops/auth';
import { canEditSocial } from '@/lib/ops/nav';
import { readPlain, addPlain } from '@/lib/ops/store';
import { readImage, saveImage, lh3, driveIdOf } from '@/lib/ops/socialimages';
import { renderTemplate } from '@/lib/ops/templates/render';
import { templateOf, boldOk, slideList, MAX_CAROUSEL_SLIDES } from '@/lib/ops/templates/registry';
import { findEvent, eventFacts, teacherFacts, weekEventList } from '@/lib/ops/templates/facts';
import { refreshSite } from '@/lib/ops/refresh';
import { todayET } from '@/lib/events';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;
const SHOW = { sheet: 'social', light: true };
const T = v => String(v ?? '').trim().toUpperCase() === 'TRUE';
class Bad extends Error { constructor(m, status = 400) { super(m); this.status = status; } }
const clip = (s, n) => String(s ?? '').trim().slice(0, n);

// A picture from the Library as a data URL. Art only: reuse OK, not hidden, no words on it.
async function artOf(imageId, library) {
  const img = library.find(r => r.values.image_id === imageId)?.values;
  if (!img) throw new Bad('Choose a picture from the Library');
  if (!T(img.reuse_ok) || T(img.hidden) || T(img.has_text)) throw new Bad('That picture can’t be used (it isn’t marked OK to reuse, or it has words on it)');
  const id = img.drive_file_id || driveIdOf(img.public_url);
  if (!id) throw new Bad('That picture has no file in Drive');
  const { buf } = await readImage(id);
  const sharp = (await import('sharp')).default;
  return { url: `data:image/jpeg;base64,${(await sharp(Buffer.from(buf)).resize({ width: 1600, withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer()).toString('base64')}`, credit: img.credit_line || '' };
}

// Everything a template needs, with its facts checked: → { data, art, arts, credit, quote, intro }
async function build(b, t) {
  const out = { data: {}, art: '', arts: [], credit: '' };
  if (t.needs.includes('quote')) {
    // the quote (locked): verified rows only, copied exactly
    const q = (await readPlain('Quote Library', SHOW)).rows.find(r => r.values.quote_id === b.quote_id)?.values;
    if (!q) throw new Bad('Pick a quote from the Quote Library');
    if (!T(q.verified)) throw new Bad('Only verified quotes can go on a card');
    if (!boldOk(q.quote, b.bold)) throw new Bad('The bold phrase has to be words that are in the quote');
    out.data = { quote: q.quote, author: q.author || '', label: q.work || q.publication || '', bold: b.bold || '', layout: b.layout === 'panel' ? 'panel' : 'overlay', devanagari: q.devanagari || '', translation: q.translation || '' };
    out.quote = { quote_id: q.quote_id, quote_text: q.quote, quote_source: [q.author, q.work].filter(Boolean).join(', ') };
    if (t.needs.includes('art')) { const a = await artOf(b.art, (await readPlain('Image Library', SHOW)).rows); out.art = a.url; out.credit = a.credit; }
  } else if (t.needs.includes('event')) {
    const e = await findEvent(b.event_id);
    if (!e) throw new Bad('Pick an event from the Master Schedule');
    const f = eventFacts(e);
    if (f.missing) throw new Bad(`The Master Schedule is missing: ${f.missing.join(', ')}. Add ${f.missing.length === 1 ? 'it' : 'them'} in Programming, then try again.`);
    out.data = f.data;
  } else if (t.needs.includes('teacher')) {
    const f = await teacherFacts(b.teacher_email);
    if (f.missing) throw new Bad(`This teacher’s profile is missing: ${f.missing.join(', ')}.`);
    out.data = f.data; out.status = f.status;
    const res = await fetch(f.photo, { cache: 'no-store', signal: AbortSignal.timeout(15000) }).catch(() => null);
    if (!res?.ok) throw new Bad('The headshot couldn’t be loaded');
    const sharp = (await import('sharp')).default;
    out.art = `data:image/jpeg;base64,${(await sharp(Buffer.from(await res.arrayBuffer())).resize(900, 900, { fit: 'cover' }).jpeg({ quality: 88 }).toBuffer()).toString('base64')}`;
    if (b.program) out.data.program = clip(b.program, 60);
  } else if (t.id === 'thisweek') {
    const w = b.week || {};
    if (!/^\d{4}-\d{2}-\d{2}$/.test(w.monday || '')) throw new Bad('Which week?');
    const all = await weekEventList(w.monday, { all: true }), want = new Set((w.events || []).map(x => x.id)), lines = Object.fromEntries((w.events || []).map(x => [x.id, clip(x.line, 160)]));
    const chosen = all.filter(e => want.has(e.id));
    if (!chosen.length) throw new Bad('Tick at least one event');
    const bad = chosen.find(e => e.missing.length); if (bad) throw new Bad(`${bad.title || 'An event'} is missing from the Master Schedule: ${bad.missing.join(', ')}.`);
    const f = d => new Date(d + 'T12:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
    const sun = new Date(w.monday + 'T12:00:00Z'); sun.setUTCDate(sun.getUTCDate() + 6);
    out.data = { title: clip(w.title, 80) || 'This week at Embodied Philosophy', subtitle: clip(w.subtitle, 80) || `${f(w.monday)} – ${f(sun.toISOString().slice(0, 10))}`, cta: clip(w.cta, 200) || 'Details and registration for every session are at the link in our bio.',
      events: chosen.map(e => ({ title: e.title, day: e.day, time: e.time, london: e.london, program: e.program, line: lines[e.id] ?? e.line })) };
    out.intro = clip(w.intro, 300);
  } else if (t.carousel) {
    const c = b.carousel || {}, slides = Array.isArray(c.slides) ? c.slides.slice(0, MAX_CAROUSEL_SLIDES) : [];
    if (!clip(c.title, 120)) throw new Bad('Write the cover title');
    if (!slides.length || slides.some(s => !clip(s.body, 420) && !(t.id === 'story'))) throw new Bad('Every slide needs its words');
    const lib = t.id === 'story' ? (await readPlain('Image Library', SHOW)).rows : [];
    out.data = { title: clip(c.title, 120), subtitle: clip(c.subtitle, 140), cta: clip(c.cta, 200) || 'Details and registration are at the link in our bio.', keyword: t.keyword ? clip(c.keyword, 24).toUpperCase().replace(/[^A-Z0-9]/g, '') : '',
      slides: slides.map(s => ({ heading: clip(s.heading, 90), body: clip(s.body, 420) })) };
    if (t.keyword && !out.data.keyword) throw new Bad('Add the campaign keyword');
    if (t.id === 'story') for (const s of slides) { const a = await artOf(s.art, lib); out.arts.push(a.url); if (a.credit) out.credit = [out.credit, a.credit].filter(Boolean).join(' · '); }
  }
  return out;
}

// POST { template, colourway, size, …inputs, slide?, export?: true | 'all' }
//   preview → the picture itself (PNG), so the screen shows exactly what will be posted
//   export  → JPEG(s) saved to Drive and the Image Library (type Design) → { exports: [{ size, slide, image_id, image_url }], … }
// Words come from the Quote Library, the Master Schedule or onboarding, never from the request, except the editable text of carousels.
export async function POST(req) {
  const user = await currentUser();
  if (!canEditSocial(user)) return NextResponse.json({ error: 'Only the social team can make cards' }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const t = templateOf(b.template);
  if (!t) return NextResponse.json({ error: 'Pick a template' }, { status: 400 });
  const size = t.sizes.includes(b.size) ? b.size : t.sizes[0];
  try {
    const x = await build(b, t);
    const base = { template: b.template, colourway: b.colourway, size, data: x.data, art: x.art, arts: x.arts };
    if (!b.export) {
      const { buffer, type } = await renderTemplate({ ...base, slide: Number(b.slide) || 0 });
      return new NextResponse(buffer, { headers: { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Credit': encodeURIComponent(x.credit), 'X-Slides': String(t.carousel ? slideList(b.template, x.data).length : 1) } });
    }
    const jobs = t.carousel ? slideList(b.template, x.data).map((_, i) => ({ size, slide: i })) : (b.export === 'all' ? t.sizes : [size]).map(s => ({ size: s, slide: 0 }));
    const who = user.name || user.email, out = [];
    const lib = await readPlain('Image Library', { sheet: 'social' });
    let n = Math.max(0, ...lib.rows.map(r => Number(String(r.values.image_id).match(/^IMG-(\d+)$/)?.[1]) || 0));
    const stamp = Date.now().toString(36);
    for (const j of jobs) {
      const { buffer, width, height } = await renderTemplate({ ...base, size: j.size, slide: j.slide, jpeg: true });
      const file = `${t.id}-${b.quote_id || b.event_id || b.week?.monday || 'card'}-${j.size.replace(':', 'x')}${t.carousel ? `-s${j.slide + 1}` : ''}-${stamp}.jpg`.replace(/[^\w.\-]+/g, '');
      const id = await saveImage(file, buffer.toString('base64'));
      const image_id = `IMG-${String(++n).padStart(4, '0')}`;
      await addPlain('Image Library', { image_id, file_name: file, drive_file_id: id, public_url: lh3(id), folder: 'Designs', type: 'Design', category: 'Designed', drive_link: `https://drive.google.com/file/d/${id}/view`,
        year: todayET().slice(0, 4), reuse_ok: 'FALSE', has_text: 'TRUE', hidden: 'FALSE', times_used: '0', tags: `${t.name} · ${b.colourway} · ${j.size}${t.carousel ? ` · slide ${j.slide + 1}` : ''}`, width: String(width), height: String(height) }, { who, sheet: 'social' });
      out.push({ ...j, image_id, image_url: lh3(id), drive_file_id: id });
    }
    refreshSite();
    return NextResponse.json({ ok: true, exports: out, quote: x.quote || null, credit: x.credit, intro: x.intro || '', carousel: !!t.carousel, keyword: x.data.keyword || '', teacherStatus: x.status || '' });
  } catch (e) {
    if (e instanceof Bad) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error('Card render failed', e.message);
    return NextResponse.json({ error: /SOCIAL_IMAGES_HOOK/.test(e.message) ? e.message : `Couldn’t make the card (${e.message})` }, { status: 502 });
  }
}

// GET ?what=events | teachers | week&monday=…   what the program templates can be made from
export async function GET(req) {
  const user = await currentUser();
  if (!canEditSocial(user)) return NextResponse.json({ error: 'Only the social team can make cards' }, { status: 403 });
  const u = new URL(req.url), what = u.searchParams.get('what');
  try {
    if (what === 'events') {
      const { loadCalendar } = await import('@/lib/calendar');
      const today = todayET(), end = new Date(Date.now() + 120 * 864e5).toISOString().slice(0, 10);
      const rows = (await loadCalendar()).filter(e => e.date >= today && e.date <= end && /public/i.test(e.audience || 'public') && e.newsletter !== 'hide' && !/cancel/i.test(e.status) && !/s[āa]dhana school.*(weekly|session|wk\s*\d+)|weekly.*s[āa]dhana school/i.test([e.program, e.series, e.internal_title].join(' '))).slice(0, 80);
      return NextResponse.json({ events: rows.map(e => ({ id: e.id, title: e.title, date: e.date, time: e.time, missing: eventFacts(e).missing || [] })) });
    }
    if (what === 'teachers') { const { listTeachers } = await import('@/lib/ops/templates/facts'); return NextResponse.json({ teachers: await listTeachers() }); }
    if (what === 'week') {
      const monday = u.searchParams.get('monday');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(monday || '')) return NextResponse.json({ error: 'Which week?' }, { status: 400 });
      // events: listed by default · others: on the schedule this week but not listed (with why), to add by hand
      const list = await weekEventList(monday, { all: true });
      return NextResponse.json({ events: list.filter(e => e.listed), others: list.filter(e => !e.listed) });
    }
    return NextResponse.json({ error: 'Unknown request' }, { status: 400 });
  } catch (e) { console.error('Card facts failed', e.message); return NextResponse.json({ error: 'Couldn’t read the Master Schedule' }, { status: 502 }); }
}
