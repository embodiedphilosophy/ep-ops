import { NextResponse } from 'next/server';
import { currentUser } from '@/lib/ops/auth';
import { isStaff, canEditSocial, canPublishSocial, canDeleteSocial } from '@/lib/ops/nav';
import { readPlain, updatePlain, addPlain, ensureColumns, ConflictError } from '@/lib/ops/store';
import { viewOf, isLocked, checkSocial, thumbOf, mondayOf, postIdFor, eventLabel, hasText, timeKey, isFeed, displayStatus, V2_COLS, MIN_SLIDES } from '@/lib/ops/socialengine';
import { loadCalendar } from '@/lib/calendar';
import { todayET } from '@/lib/events';
import { refreshSite } from '@/lib/ops/refresh';
import { driveIdOf } from '@/lib/ops/socialimages';

export const dynamic = 'force-dynamic';
const SHEET = { sheet: 'social' }, SHOW = { sheet: 'social', light: true };
// The Weekly Plan gains v2 columns (authors, media kind, slides) the first time anything is written
let v2Ready = null;
const ensureV2 = () => (v2Ready ||= ensureColumns('Weekly Plan', V2_COLS, { sheet: 'social' }).catch(e => { v2Ready = null; throw e; }));
// Carousels, Reels and Stories can't be published by Make (it posts one picture). Until the dashboard publishes
// them itself (META_PUBLISH=live), approving one marks it "Manual": post by hand, and Make leaves it alone.
const autoPublishes = kind => !kind || kind === 'single' || process.env.META_PUBLISH === 'live';
const addDays = (d, n) => { const x = new Date(d + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };

// GET ?view=plan | history | quotes | images | captions | rules | categories | sources  (&q=search &offset=)
export async function GET(req) {
  const user = await currentUser();
  if (!isStaff(user)) return NextResponse.json({ error: 'Please sign in again' }, { status: 401 });
  const url = new URL(req.url), v = viewOf(url.searchParams.get('view') || 'plan');
  if (!v) return NextResponse.json({ error: 'Unknown view' }, { status: 400 });
  if (v.director && !user.director) return NextResponse.json({ error: 'Directors only' }, { status: 403 });
  const q = String(url.searchParams.get('q') || '').trim().toLowerCase(), offset = Math.max(0, Number(url.searchParams.get('offset')) || 0);
  try {
    // The Upload Log tab is made on the first upload; until then there are no videos
    const data = await readPlain(v.tab, SHOW).catch(e => { if (v.key === 'videos') return { head: [], rows: [] }; throw e; });
    let rows = data.rows;
    // Rows with no name (the sheet's empty "Row 12" lines) and columns whose header broke (#REF!) are left out
    if (!['plan', 'history'].includes(v.key) && !v.images && v.name) rows = rows.filter(r => String(v.name(r.values) || '').trim());
    data.head = data.head.map(h => /^#(REF|N\/A|ERROR|NAME|VALUE)/i.test(h) ? '' : h);
    if (v.key === 'videos') rows = rows.filter(r => r.values.kind === 'video').reverse();
    let extra = {};
    if (v.key === 'plan') {
      // Last week and everything ahead, soonest first; each with its thumbnail
      const from = addDays(todayET(), -7), today = todayET();
      const lib = await readPlain('Image Library', SHOW).catch(() => ({ rows: [] }));
      const byImage = Object.fromEntries(lib.rows.map(r => [r.values.image_id, r.values]));
      const mine = r => { const img = byImage[r.values.image_id] || {}; return { ...r, display_status: displayStatus(r.values), thumb: thumbOf(r.values.image_url || img.public_url, r.values.image_url ? '' : img.drive_file_id), src: img.drive_file_id || driveIdOf(img.public_url) || driveIdOf(r.values.image_url) }; };
      const order = (a, b) => (a.values.publish_date || '9').localeCompare(b.values.publish_date || '9') || timeKey(a.values.publish_time_ET).localeCompare(timeKey(b.values.publish_time_ET));
      const live = data.rows.filter(r => !['Skip', 'Failed', 'Needs edit', 'Deleted'].includes(r.values.status) && r.values.publish_date);
      // When each type of post last went out, and when the next one is planned
      const types = {};
      for (const r of live) {
        const t = String(r.values.pillar || '').trim(); if (!t) continue;
        const d = r.values.publish_date, e = types[t] || (types[t] = {});
        if (d <= today && (!e.last || d > e.last)) e.last = d;
        if (d > today && (!e.next || d < e.next)) e.next = d;
      }
      // The grid preview: the last twelve feed posts that went out, for context beneath the upcoming ones
      const past = live.filter(r => r.values.publish_date <= today && ['Posted', 'Manual'].includes(r.values.status) && isFeed(r.values)).sort(order).reverse().slice(0, 12).map(mine);
      extra = { types, past };
      rows = rows.filter(r => r.values.status !== 'Deleted' && (r.values.publish_date || '9') >= from).sort(order).map(mine);
    } else if (v.images && url.searchParams.get('pick')) {
      // The post editor's picker: only Art (no words on the picture) that may be used, newest first (uploads are added at the bottom)
      rows = rows.filter(r => !hasText(r.values) && String(r.values.reuse_ok).toUpperCase() === 'TRUE' && String(r.values.hidden).toUpperCase() !== 'TRUE').reverse();
    } else if (v.only) {
      rows = rows.filter(r => v.only(r.values));
    } else if (v.key === 'history') {
      rows = rows.sort((a, b) => String(b.values.posted_at).localeCompare(String(a.values.posted_at)));
    }
    // Quotes and pictures: when each was last put in a post, so people can see what's fresh
    let used = {};
    if (v.images || v.key === 'quotes') {
      const idCol = v.images ? 'image_id' : 'quote_id', plan = await readPlain('Weekly Plan', SHOW).catch(() => ({ rows: [] }));
      for (const r of plan.rows) {
        if (['Skip', 'Failed', 'Needs edit'].includes(r.values.status)) continue;
        const id = r.values[idCol], d = r.values.publish_date; if (!id || !d) continue;
        if (!used[id] || d > used[id]) used[id] = d;
      }
      for (const r of rows) { const id = r.values[idCol], d = String(r.values.last_used || '').slice(0, 10); if (id && /^\d{4}-\d{2}-\d{2}$/.test(d) && (!used[id] || d > used[id])) used[id] = d; }
      rows = rows.map(r => ({ ...r, used: used[r.values[idCol]] || '' }));
    }
    if (q && v.search) rows = rows.filter(r => v.search.some(c => String(r.values[c] || '').toLowerCase().includes(q)));
    const total = rows.length, page = v.key === 'plan' ? rows : rows.slice(offset, offset + 60);
    if (v.key === 'history') {
      // Instagram's history has no picture of its own: borrow it from the plan row that published it, or the archive image
      const [plan, lib] = await Promise.all([readPlain('Weekly Plan', SHOW).catch(() => ({ rows: [] })), readPlain('Image Library', SHOW).catch(() => ({ rows: [] }))]);
      const byMedia = {}; for (const r of plan.rows) for (const k of ['ig_feed_id', 'ig_story_id']) if (r.values[k]) byMedia[r.values[k]] = r.values;
      const byImage = Object.fromEntries(lib.rows.map(r => [r.values.image_id, r.values]));
      for (const r of page) {
        const p = byMedia[r.values.ig_media_id], img = byImage[r.values.archived_image_id || p?.image_id];
        r.thumb = thumbOf(p?.image_url || img?.public_url, p?.image_url ? '' : img?.drive_file_id); r.type = r.values.pillar || p?.pillar || '';
      }
    }
    if (v.images) for (const r of page) r.thumb = thumbOf(r.values.public_url, r.values.drive_file_id);
    const events = v.key !== 'plan' ? undefined : (await loadCalendar().catch(() => []))
      .filter(e => e.date >= addDays(todayET(), -3) && e.date <= addDays(todayET(), 120) && /public/i.test(e.audience || '') && e.track !== 'MM')
      .filter((e, i, a) => a.findIndex(x => eventLabel(x) === eventLabel(e)) === i).slice(0, 60).map(eventLabel);
    return NextResponse.json({ head: data.head, rows: page, total, offset, events, ...extra, canEdit: canEditSocial(user) && (!v.director || user.director), canPublish: canPublishSocial(user), me: user.name || user.email,
      locked: data.head.filter(h => isLocked(v.tab, h)) });
  } catch (e) {
    console.error('Social read failed', v.tab, e.message);
    return NextResponse.json({ error: /429/.test(e.message) ? 'Google is busy for a moment. Try again in a minute.' : /403/.test(e.message) ? 'The Social Engine sheet isn’t shared with the website yet.' : 'Couldn’t read the Social Engine. Try again shortly.' }, { status: 502 });
  }
}

// POST { view, row, changes, before }  one row          { view, add: true, values }  a new library row
//      { view: 'plan', approve: [{ row, before }] }        approve several posts at once
export async function POST(req) {
  const user = await currentUser();
  if (!canEditSocial(user)) return NextResponse.json({ error: 'Only the social team can change posts' }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const v = viewOf(body.view);
  if (!v || v.key === 'history') return NextResponse.json({ error: 'Unknown view' }, { status: 400 });
  if (v.director && !user.director) return NextResponse.json({ error: 'Directors only' }, { status: 403 });
  const who = user.name || user.email;
  const clean = obj => {
    const out = {}, errors = {};
    for (const [col, raw] of Object.entries(obj || {})) {
      if (isLocked(v.tab, col)) { errors[col] = 'Can’t be changed here'; continue; }
      const r = checkSocial(v.tab, col, raw);
      if (r.error) errors[col] = r.error; else out[col] = r.value;
    }
    return { out, errors };
  };
  const now = () => new Date().toISOString();
  const wantsApproved = out => out.status === 'Approved';
  try {
    if (v.key === 'plan') await ensureV2();
    // Approving (= scheduling: Make or the dashboard publishes at the date and time) needs publish rights
    if (v.key === 'plan' && (Array.isArray(body.approve) || wantsApproved(body.changes || {}) || wantsApproved(body.values || {})) && !canPublishSocial(user))
      return NextResponse.json({ error: 'Only people who schedule posts can approve them' }, { status: 403 });
    // Swap two posts' slots (date and time): what dragging in the grid preview does
    if (v.key === 'plan' && body.swap) {
      const [a, b] = body.swap;
      if (!a || !b || a.row === b.row) return NextResponse.json({ error: 'Pick two different posts' }, { status: 400 });
      for (const x of [a, b]) if (['Posted', 'Manual'].includes(x.before?.status)) return NextResponse.json({ error: 'A post that’s already out can’t be moved' }, { status: 400 });
      const slot = x => ({ publish_date: x.before.publish_date, publish_time_ET: x.before.publish_time_ET, updated_by: who, updated_at: now() });
      await updatePlain(v.tab, Number(a.row), slot(b), { before: a.before, who, ...SHEET });
      await updatePlain(v.tab, Number(b.row), slot(a), { before: b.before, who, ...SHEET });
      refreshSite();
      return NextResponse.json({ ok: true });
    }
    if (v.key === 'plan' && Array.isArray(body.approve)) {
      let n = 0;
      for (const a of body.approve) {
        if (a.before?.status !== 'Proposed' || displayStatus(a.before) === 'Expired') continue;
        const status = autoPublishes(a.before.media_kind) ? 'Approved' : 'Manual';
        n += (await updatePlain(v.tab, Number(a.row), { status, approved_by: who, updated_by: who, updated_at: now() }, { before: a.before, who, ...SHEET })).length ? 1 : 0;
      }
      refreshSite();
      return NextResponse.json({ ok: true, approved: n });
    }
    // Archive several posts at once (the Expired banner): they become Skip
    if (v.key === 'plan' && Array.isArray(body.skip)) {
      let n = 0;
      for (const a of body.skip) n += (await updatePlain(v.tab, Number(a.row), { status: 'Skip', updated_by: who, updated_at: now() }, { before: { status: a.before?.status }, who, ...SHEET })).length ? 1 : 0;
      refreshSite();
      return NextResponse.json({ ok: true, skipped: n });
    }
    // Delete: Proposed, Needs edit, Skip or Expired posts only. The row stays (so no row numbers move) and is hidden.
    if (v.key === 'plan' && Array.isArray(body.delete)) {
      const plan = await readPlain(v.tab, SHEET);
      let n = 0;
      for (const d of body.delete) {
        const cur = plan.rows.find(r => r.row === Number(d.row))?.values;
        if (!cur || !['Proposed', 'Needs edit', 'Skip'].includes(cur.status || 'Proposed')) continue; // never an Approved or published post
        if (!canDeleteSocial(user, cur.created_by)) return NextResponse.json({ error: 'Only a post’s author or an approver can delete it' }, { status: 403 });
        n += (await updatePlain(v.tab, Number(d.row), { status: 'Deleted', updated_by: who, updated_at: now() }, { before: { status: cur.status }, who, ...SHEET })).length ? 1 : 0;
      }
      refreshSite();
      return NextResponse.json({ ok: true, deleted: n });
    }
    if (body.add && v.key === 'plan') {
      const { out, errors } = clean(body.values);
      if (!out.publish_date) errors.publish_date = 'Pick a date';
      if (!out.publish_time_ET) errors.publish_time_ET = 'Pick a time';
      if (!out.platforms) errors.platforms = 'Where it goes, e.g. IG Feed, Facebook';
      if (!out.caption && out.media_kind !== 'story') errors.caption = 'Write the caption';
      if (out.media_kind === 'carousel' && JSON.parse(out.slides_json || '[]').length < MIN_SLIDES) errors.slides_json = `A carousel needs at least ${MIN_SLIDES} slides`;
      else if (['reel', 'story'].includes(out.media_kind) && !out.slides_json) errors.slides_json = out.media_kind === 'reel' ? 'Add the video' : 'Add the picture or video';
      if (!errors.slides_json && !out.image_id && !out.image_url && !out.slides_json) errors.image_id = 'Choose or upload a picture';
      if (Object.keys(errors).length) return NextResponse.json({ error: 'Some fields need fixing', errors }, { status: 400 });
      if (out.status && !['Proposed', 'Approved'].includes(out.status)) out.status = 'Proposed';
      if (out.status === 'Approved' && !autoPublishes(out.media_kind)) out.status = 'Manual';
      if (out.slides_json && !out.image_id && !out.image_url) {
        // The cover (first slide) stands in as the post's picture so the plan, thumbnails and Make still have one
        const first = JSON.parse(out.slides_json)[0];
        if (first.kind === 'image' && first.drive_file_id) out.image_url = `https://lh3.googleusercontent.com/d/${first.drive_file_id}`;
      }
      if (out.image_id && !out.image_url) {
        const img = (await readPlain('Image Library', SHOW)).rows.find(r => r.values.image_id === out.image_id);
        if (!img) return NextResponse.json({ error: 'Not an image in the Image Library', errors: { image_id: 'Unknown image' } }, { status: 400 });
        out.image_url = img.values.public_url;
      }
      const plan = await readPlain(v.tab, SHEET);
      const post = { post_id: postIdFor(out.publish_date, plan.rows.map(r => r.values.post_id)), week_of: mondayOf(out.publish_date), status: 'Proposed', ...out,
        created_by: who, updated_by: who, updated_at: now(), ...(['Approved', 'Manual'].includes(out.status) && { approved_by: who }) };
      const row = await addPlain(v.tab, post, { who, ...SHEET });
      refreshSite();
      return NextResponse.json({ ok: true, row, post_id: post.post_id });
    }
    if (body.add) {
      if (!v.add) return NextResponse.json({ error: 'Rows can’t be added here' }, { status: 400 });
      const { out, errors } = clean(body.values);
      if (Object.keys(errors).length) return NextResponse.json({ error: 'Some fields need fixing', errors }, { status: 400 });
      const row = await addPlain(v.tab, out, { who, ...SHEET });
      refreshSite();
      return NextResponse.json({ ok: true, row });
    }
    const { out, errors } = clean(body.changes);
    // Needs edit only makes sense with a note saying what to change
    if (out.status === 'Needs edit' && !String(body.changes.jake_notes ?? body.before?.jake_notes ?? '').trim()) errors.jake_notes = 'Say what should change';
    if (Object.keys(errors).length) return NextResponse.json({ error: 'Some fields need fixing', errors }, { status: 400 });
    // A new library image (or a crop undone): the picture link comes from the Image Library, so the plan and
    // Make agree. A crop sends its own Drive link instead.
    if ((out.image_id && !out.image_url) || ('image_url' in out && !out.image_url)) {
      const id = out.image_id || body.before?.image_id;
      const img = (await readPlain('Image Library', SHOW)).rows.find(r => r.values.image_id === id);
      if (!img) return NextResponse.json({ error: 'Not an image in the Image Library', errors: { image_id: 'Unknown image' } }, { status: 400 });
      out.image_url = img.values.public_url;
    }
    if (v.key === 'plan' && out.slides_json && (out.media_kind || body.before?.media_kind) === 'carousel' && JSON.parse(out.slides_json).length < MIN_SLIDES)
      return NextResponse.json({ error: 'Some fields need fixing', errors: { slides_json: `A carousel needs at least ${MIN_SLIDES} slides` } }, { status: 400 });
    if (v.key === 'plan') {
      const kind = out.media_kind || body.before?.media_kind;
      if (out.status === 'Approved' && !autoPublishes(kind)) out.status = 'Manual';
      if (['Approved', 'Manual'].includes(out.status)) out.approved_by = who;
      out.updated_by = who; out.updated_at = now();
    }
    const written = await updatePlain(v.tab, Number(body.row), out, { before: body.before || {}, who, ...SHEET });
    refreshSite();
    return NextResponse.json({ ok: true, written });
  } catch (e) {
    if (e instanceof ConflictError) { refreshSite(); return NextResponse.json({ error: e.message, conflict: e.current }, { status: 409 }); }
    console.error('Social save failed', e.message);
    return NextResponse.json({ error: /403/.test(e.message) ? 'The website can only read the Social Engine. Give its service account Editor access.' : /^Sheets|^Google/.test(e.message) ? 'Couldn’t save. Try again shortly.' : e.message }, { status: 502 });
  }
}
