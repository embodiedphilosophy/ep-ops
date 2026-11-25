import { NextResponse } from 'next/server';
import { currentUser } from '@/lib/ops/auth';
import { isStaff, canEditSocial, canPublishSocial, canDeleteSocial, canApproveSocial } from '@/lib/ops/nav';
import { readPlain, updatePlain, updatePlainMany, addPlain, ensureColumns, createTab, ConflictError } from '@/lib/ops/store';
import { viewOf, isLocked, checkSocial, thumbOf, mondayOf, postIdFor, eventLabel, hasText, timeKey, isFeed, displayStatus, V2_COLS, MIN_SLIDES } from '@/lib/ops/socialengine';
import { loadCalendar, loadTeam } from '@/lib/calendar';
import { todayET } from '@/lib/events';
import { refreshSite } from '@/lib/ops/refresh';
import { driveIdOf } from '@/lib/ops/socialimages';
import { guardrails, WEEKDAYS } from '@/lib/ops/socialrules';
import { publishPost, publishLive } from '@/lib/ops/igpublish';
import { eventList, rulesOf, reviewData, healthData } from '@/lib/ops/socialstatus';

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
    if (url.searchParams.get('flags')) return NextResponse.json({ publishLive: publishLive() });
    if (url.searchParams.get('counts') && v.images) {
      const [img, vids] = await Promise.all([readPlain('Image Library', SHOW), readPlain('Upload Log', SHOW).catch(() => ({ rows: [] }))]);
      const n = fn => img.rows.filter(r => fn(r.values)).length;
      return NextResponse.json({ counts: { art: n(x => !hasText(x)), promo: n(x => hasText(x) && String(x.type) !== 'Design'), designs: n(x => String(x.type) === 'Design'), videos: vids.rows.filter(r => r.values.kind === 'video').length } });
    }
    if (url.searchParams.get('view') === 'comments') {
      const post = String(url.searchParams.get('post') || '');
      const rows = (await readPlain('Comments', SHOW).catch(() => ({ rows: [] }))).rows.map(r => r.values).filter(c => c.post_id === post).sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
      return NextResponse.json({ comments: rows });
    }
    if (v.key === 'review') return NextResponse.json(await reviewData(user));
    if (v.key === 'health') return NextResponse.json(await healthData(user));
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
      extra = { types, past, team: (await loadTeam().catch(() => [])).filter(m => !/^teacher$/i.test(m.type)).map(m => m.name).filter(Boolean), rules: await rulesOf(), dayCategories: (await readPlain('Day Categories', SHOW).catch(() => ({ rows: [] }))).rows.map(r => r.values) };
      rows = rows.filter(r => r.values.status !== 'Deleted' && ((r.values.publish_date || '9') >= from || r.values.status === 'Draft')).sort(order).map(mine);
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
    // The Library's filters (category, deity, program, and the Use checkboxes) run on the whole table, so counts and paging stay right
    let facets;
    if (v.images && !url.searchParams.get('pick')) {
      const distinct = c => Object.entries(rows.reduce((m, r) => { const x = String(r.values[c] || '').trim(); if (x) m[x] = (m[x] || 0) + 1; return m; }, {})).sort((a, b) => b[1] - a[1]).map(([name, n]) => ({ name, n }));
      facets = { category: distinct('category'), deity: distinct('deity'), program: distinct('program') };
      const sp = url.searchParams, f = new Set(String(sp.get('f') || '').split(',').filter(Boolean)), t = todayET();
      const daysAgo = d => Math.round((Date.parse(t + 'T12:00:00Z') - Date.parse(String(d).slice(0, 10) + 'T12:00:00Z')) / 864e5);
      for (const c of ['category', 'deity', 'program']) if (sp.get(c)) rows = rows.filter(r => String(r.values[c] || '').trim() === sp.get(c));
      if (f.has('reuse')) rows = rows.filter(r => String(r.values.reuse_ok).toUpperCase() === 'TRUE' && String(r.values.hidden).toUpperCase() !== 'TRUE');
      if (f.has('nowords')) rows = rows.filter(r => !hasText(r.values));
      if (f.has('gap')) rows = rows.filter(r => !r.used || !/^\d{4}-\d{2}-\d{2}/.test(r.used) || daysAgo(r.used) > 90);
      if (f.has('licence')) rows = rows.filter(r => String(r.values.license || r.values.licence || '').trim());
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
    return NextResponse.json({ head: data.head, rows: page, total, offset, events, facets, ...extra, canEdit: canEditSocial(user) && (!v.director || user.director), canPublish: canPublishSocial(user), canCategory: canApproveSocial(user), me: user.name || user.email,
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
  const body = await req.json().catch(() => ({}));
  // Everyone on staff can comment on a post; changing posts is for the social team
  if (!canEditSocial(user) && !(isStaff(user) && body.comment)) return NextResponse.json({ error: 'Only the social team can change posts' }, { status: 403 });
  const v = viewOf(body.view);
  if (!v || v.key === 'history') return NextResponse.json({ error: 'Unknown view' }, { status: 400 });
  if (v.director && !user.director) return NextResponse.json({ error: 'Directors only' }, { status: 403 });
  const who = user.name || user.email;
  // A comment on a post (with @mentions kept as typed); the Comments tab is made on the first one
  if (body.comment) {
    const c = body.comment, text = String(c.body || '').trim().slice(0, 1000), post = String(c.post_id || '').trim();
    if (!text || !post) return NextResponse.json({ error: 'Write a comment' }, { status: 400 });
    try {
      if (!(await readPlain('Comments', SHEET).catch(() => null))) await createTab('Comments', ['post_id', 'author', 'body', 'created_at', 'mentions'], [], SHEET);
      await addPlain('Comments', { post_id: post, author: who, body: text, created_at: new Date().toISOString(), mentions: (text.match(/@[\p{L}][\p{L}'’-]*/gu) || []).join(', ') }, { who, ...SHEET });
      return NextResponse.json({ ok: true });
    } catch (e) { console.error('Comment failed', e.message); return NextResponse.json({ error: 'Couldn’t save the comment' }, { status: 502 }); }
  }
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
  // A post's quote columns are written only here, from a verified Quote Library row, so "Verbatim" always means it was copied from the library
  const stampQuote = async out => {
    for (const k of ['quote_text', 'quote_source', 'quote_check']) delete out[k];
    if (!out.quote_id) { if ('quote_id' in out) Object.assign(out, { quote_text: '', quote_source: '', quote_check: '' }); return null; }
    const q = (await readPlain('Quote Library', SHOW)).rows.find(r => r.values.quote_id === out.quote_id)?.values;
    if (!q || String(q.verified).toUpperCase() !== 'TRUE') return 'That quote isn’t a verified quote in the Quote Library';
    Object.assign(out, { quote_text: q.quote, quote_source: [q.author, q.work].filter(Boolean).join(', '), quote_check: 'Verbatim' });
    return null;
  };
  const wantsApproved = out => out.status === 'Approved';
  try {
    // Day categories: a weekday's standing post type, or an override for one week
    if (body.dayCategory) {
      if (!canApproveSocial(user)) return NextResponse.json({ error: 'Only editors and approvers change the day categories' }, { status: 403 });
      const d = body.dayCategory, weekday = WEEKDAYS.find(w => w.toLowerCase() === String(d.weekday || '').toLowerCase()), category = String(d.category || '').trim().slice(0, 80);
      const once = d.scope === 'week', week_of = once ? String(d.week_of || '').slice(0, 10) : '';
      if (!weekday) return NextResponse.json({ error: 'Pick a day' }, { status: 400 });
      if (once && !/^\d{4}-\d{2}-\d{2}$/.test(week_of)) return NextResponse.json({ error: 'Which week?' }, { status: 400 });
      const head = ['weekday', 'category', 'scope', 'week_of', 'updated_by'];
      let tab = await readPlain('Day Categories', SHEET).catch(() => null);
      if (!tab) { await createTab('Day Categories', head, [], SHEET); tab = await readPlain('Day Categories', SHEET); }
      const same = tab.rows.find(r => r.values.weekday === weekday && (once ? /week/i.test(r.values.scope) && String(r.values.week_of).slice(0, 10) === week_of : !/week/i.test(r.values.scope || '')));
      const values = { weekday, category, scope: once ? 'week_of' : 'standing', week_of, updated_by: who };
      if (same) await updatePlain('Day Categories', same.row, values, { before: {}, who, ...SHEET }); else await addPlain('Day Categories', values, { who, ...SHEET });
      refreshSite();
      return NextResponse.json({ ok: true });
    }
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
      // Missing facts block a post. Flags (teacher clearance and the like) only need a reason from whoever approves.
      let n = 0; const skipped = [];
      const labels = new Set(await eventList());
      for (const a of body.approve) {
        if (a.before?.status !== 'Proposed' || displayStatus(a.before) === 'Expired') { skipped.push({ row: a.row, why: 'Not a proposed post any more' }); continue; }
        const g = guardrails(a.before, { eventLabels: labels }), reason = String(a.reason || '').trim().slice(0, 300);
        if (g.blocked.length) { skipped.push({ row: a.row, why: g.blocked[0] }); continue; }
        if (g.flags.length && !reason) { skipped.push({ row: a.row, why: `Needs a reason: ${g.flags[0]}`, needReason: true }); continue; }
        const status = autoPublishes(a.before.media_kind) ? 'Approved' : 'Manual';
        n += (await updatePlain(v.tab, Number(a.row), { status, approved_by: who, updated_by: who, updated_at: now(), ...(g.flags.length && { override_reason: `${reason} (${g.flags.join('; ')})` }) }, { before: a.before, who, ...SHEET })).length ? 1 : 0;
      }
      refreshSite();
      return NextResponse.json({ ok: true, approved: n, skipped });
    }
    // Move several posts to the Drafts tray (the Expired banner): Make ignores them, and they can be dragged onto a day later
    if (v.key === 'plan' && Array.isArray(body.draft)) {
      let n = 0;
      for (const a of body.draft) n += (await updatePlain(v.tab, Number(a.row), { status: 'Draft', updated_by: who, updated_at: now() }, { before: { status: a.before?.status }, who, ...SHEET })).length ? 1 : 0;
      refreshSite();
      return NextResponse.json({ ok: true, drafted: n });
    }
    // Archive several posts at once (the Expired banner): they become Skip
    if (v.key === 'plan' && Array.isArray(body.skip)) {
      let n = 0;
      for (const a of body.skip) n += (await updatePlain(v.tab, Number(a.row), { status: 'Skip', updated_by: who, updated_at: now() }, { before: { status: a.before?.status }, who, ...SHEET })).length ? 1 : 0;
      refreshSite();
      return NextResponse.json({ ok: true, skipped: n });
    }
    // Bulk edit in the Library: the same change to several pictures, each checked against what the editor showed
    if (body.bulk && v.images) {
      if (!canEditSocial(user)) return NextResponse.json({ error: 'Only the social team can change the Library' }, { status: 403 });
      const { out, errors } = clean(body.bulk.changes);
      const ok = ['category', 'program', 'deity', 'hidden', 'reuse_ok', 'has_text'];
      for (const k of Object.keys(out)) if (!ok.includes(k)) errors[k] = 'Can’t be changed in bulk';
      if (!Object.keys(out).length && !Object.keys(errors).length) errors.changes = 'Choose what to change';
      if (Object.keys(errors).length) return NextResponse.json({ error: 'Some fields need fixing', errors }, { status: 400 });
      const table = await readPlain(v.tab, SHEET), rows = Array.isArray(body.bulk.rows) ? body.bulk.rows.slice(0, 200) : [];
      const updates = [], skipped = [];
      for (const r of rows) {
        const cur = table.rows.find(x => x.row === Number(r.row))?.values;
        if (!cur) { skipped.push(r.row); continue; }
        if (Object.keys(out).some(k => k in (r.before || {}) && String(r.before[k] ?? '').trim() !== String(cur[k] ?? '').trim())) { skipped.push(r.row); continue; } // changed by someone else
        updates.push({ row: Number(r.row), changes: out });
      }
      const n = await updatePlainMany(v.tab, updates, { who, ...SHEET });
      refreshSite();
      return NextResponse.json({ ok: true, changed: updates.length, cells: n, skipped });
    }
    // Delete every expired post at once (Proposed, past its time, never approved). Hidden, not wiped: the row stays with status Deleted.
    if (v.key === 'plan' && body.deleteExpired) {
      if (!canPublishSocial(user)) return NextResponse.json({ error: 'Only people who schedule or approve posts can clear expired posts' }, { status: 403 });
      const plan = await readPlain(v.tab, SHEET);
      const gone = plan.rows.filter(r => displayStatus(r.values) === 'Expired').map(r => ({ row: r.row, changes: { status: 'Deleted', updated_by: who, updated_at: now() } }));
      if (gone.length) await updatePlainMany(v.tab, gone, { who, ...SHEET });
      refreshSite();
      return NextResponse.json({ ok: true, deleted: gone.length });
    }
    // Post now: straight to Instagram (only when META_PUBLISH=live). The row is marked Publishing first so a second click can't post it twice.
    if (v.key === 'plan' && body.publishNow) {
      if (!canPublishSocial(user)) return NextResponse.json({ error: 'Only people who schedule posts can post' }, { status: 403 });
      if (!publishLive()) return NextResponse.json({ error: 'Publishing straight to Instagram isn’t switched on yet. Post it by hand and mark it posted.' }, { status: 400 });
      const row = Number(body.publishNow.row), cur = (await readPlain(v.tab, SHEET)).rows.find(r => r.row === row)?.values;
      if (!cur || !['Approved', 'Manual', 'Failed'].includes(cur.status)) return NextResponse.json({ error: 'Only an approved post can be posted' }, { status: 400 });
      if (cur.ig_media_id) return NextResponse.json({ error: 'This post is already on Instagram' }, { status: 409 });
      await updatePlain(v.tab, row, { status: 'Publishing', updated_by: who, updated_at: now() }, { before: { status: cur.status }, who, ...SHEET });
      try {
        const r = await publishPost(cur);
        await ensureColumns(v.tab, ['ig_media_id', 'permalink'], SHEET);
        await updatePlain(v.tab, row, { status: 'Posted', ig_media_id: r.media_id, permalink: r.permalink, post_links: r.permalink, updated_by: who, updated_at: now() }, { who, ...SHEET });
        refreshSite();
        return NextResponse.json({ ok: true, permalink: r.permalink });
      } catch (e) {
        await updatePlain(v.tab, row, { status: 'Failed', jake_notes: `Couldn’t post: ${e.message}`.slice(0, 300), updated_by: who, updated_at: now() }, { who, ...SHEET }).catch(() => {});
        refreshSite();
        return NextResponse.json({ error: `Instagram wouldn’t take it: ${e.message}` }, { status: 502 });
      }
    }
    // A story or other post made by hand: the person who posted it marks it Posted
    if (v.key === 'plan' && body.markPosted) {
      if (!canPublishSocial(user)) return NextResponse.json({ error: 'Only people who schedule posts can mark one posted' }, { status: 403 });
      const cur = (await readPlain(v.tab, SHEET)).rows.find(r => r.row === Number(body.markPosted.row))?.values;
      if (!cur || cur.status !== 'Manual') return NextResponse.json({ error: 'Only a post waiting to be posted by hand can be marked posted' }, { status: 400 });
      await updatePlain(v.tab, Number(body.markPosted.row), { status: 'Posted', updated_by: who, updated_at: now() }, { before: { status: 'Manual' }, who, ...SHEET });
      refreshSite();
      return NextResponse.json({ ok: true });
    }
    // Delete: Proposed, Needs edit, Skip or Expired posts only. The row stays (so no row numbers move) and is hidden.
    if (v.key === 'plan' && Array.isArray(body.delete)) {
      const plan = await readPlain(v.tab, SHEET);
      let n = 0;
      for (const d of body.delete) {
        const cur = plan.rows.find(r => r.row === Number(d.row))?.values;
        if (!cur || !['Proposed', 'Needs edit', 'Skip', 'Draft'].includes(cur.status || 'Proposed')) continue; // never an Approved or published post
        if (!canDeleteSocial(user, cur.created_by)) return NextResponse.json({ error: 'Only a post’s author or an approver can delete it' }, { status: 403 });
        n += (await updatePlain(v.tab, Number(d.row), { status: 'Deleted', updated_by: who, updated_at: now() }, { before: { status: cur.status }, who, ...SHEET })).length ? 1 : 0;
      }
      refreshSite();
      return NextResponse.json({ ok: true, deleted: n });
    }
    if (body.add && v.key === 'plan') {
      const { out, errors } = clean(body.values);
      { const e = await stampQuote(out); if (e) errors.quote_id = e; }
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
    if (v.key === 'plan' && 'quote_id' in out) { const e = await stampQuote(out); if (e) errors.quote_id = e; }
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
