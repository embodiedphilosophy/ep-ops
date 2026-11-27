import { NextResponse } from 'next/server';
import { currentUser } from '@/lib/ops/auth';
import { canAds } from '@/lib/ops/nav';
import { adsTablesExist, campaignTree, createRow, getRow, listRows, updateRow, deleteRow } from '@/lib/ops/adsstore';
import { adsMode, MODE_TEXT, metaAdsStatus } from '@/lib/ops/meta-ads';
import { GOAL_LIST, TYPE_LIST, CTA_LIST, adDatesOf, adLink, campaignTotal, launchById, createDraft, refreshDraft, setStructure, setGoal, swapAudience, ensureRules, startingBudget, markEdited } from '@/lib/ops/adsdraft';
import { isPlaceholder, aiConfigured } from '@/lib/ops/adscopy';
import { artChoices, cropFrom, cropUpload } from '@/lib/ops/adsimages';
import { runChecks } from '@/lib/ops/adscheck';
import { sendPaused, startCampaign } from '@/lib/ops/adssend';
import { launchRows } from '@/lib/ops/launches';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const num = (v, lo, hi) => { const n = Math.round(Number(v)); return Number.isFinite(n) && n >= lo && n <= hi ? n : null; };
const flt = (v, lo, hi) => { const n = Number(v); return Number.isFinite(n) && n >= lo && n <= hi ? n : null; };
const str = (v, n) => String(v ?? '').trim().slice(0, n);
const bad = (error, status = 400) => NextResponse.json({ error }, { status });
const who = u => u.name || u.email;

// Dates that follow the launch move with it: whenever a draft is read, its dates are brought in line with the launch's key dates
async function follow(c, launch) {
  if (!c || c.status !== 'draft' || !c.dates_follow_launch || !launch) return c;
  const d = adDatesOf(launch);
  return d.start_date !== c.start_date || d.end_date !== c.end_date ? updateRow('campaigns', c.id, d) : c;
}
const brief = (c, adsets) => ({ id: c.id, name: c.name, goal: c.goal, structure: c.structure, status: c.status, start_date: c.start_date, end_date: c.end_date, daily_cents: campaignTotal(c, adsets || []), launch_id: c.launch_id });

// GET            → the campaigns
// GET ?launch=L1 → the ads switch for that launch
// GET ?id=…      → one draft with everything under it   (&checks=1 adds the checklist, &art=1 the pictures to choose from)
export async function GET(req) {
  const user = await currentUser();
  if (!canAds(user)) return bad('Ads is for directors and the Ads role', 403);
  const q = new URL(req.url).searchParams, mode = adsMode(), meta = { mode, mode_text: MODE_TEXT[mode], ai: aiConfigured(), settings: metaAdsStatus().settings };
  try {
    const exists = await adsTablesExist();
    if (q.get('launch')) {
      const launch = await launchById(q.get('launch')); if (!launch) return bad('No such launch', 404);
      const c = exists ? (await listRows('campaigns', { launch_id: launch.id }))[0] : null;
      return NextResponse.json({ ...meta, launch: { id: launch.id, name: launch.name }, dates: adDatesOf(launch), budgets: { test: startingBudget(launch, 'test'), advantage: startingBudget(launch, 'advantage') }, campaign: c ? brief(await follow(c, launch), await listRows('adsets', { campaign_id: c.id })) : null, goals: GOAL_LIST, types: TYPE_LIST });
    }
    if (q.get('id')) {
      if (!exists) return bad('No such campaign', 404);
      let t = await campaignTree(q.get('id')); if (!t) return bad('No such campaign', 404);
      const launch = t.campaign.launch_id ? await launchById(t.campaign.launch_id) : null;
      t = { ...t, campaign: await follow(t.campaign, launch) };
      const out = { ...meta, ...t, launch: launch && { id: launch.id, name: launch.name, event_id: launch.event_id }, total_cents: campaignTotal(t.campaign, t.adsets), link: adLink(t.campaign), cta_list: CTA_LIST, goals: GOAL_LIST, types: TYPE_LIST };
      if (q.get('checks')) out.checks = await runChecks(t);
      if (q.get('art')) out.art = (await artChoices({ limit: 40 }).catch(() => [])).map(a => ({ id: a.id, name: a.name }));
      return NextResponse.json(out);
    }
    const cs = exists ? await listRows('campaigns') : [], launches = cs.some(c => c.launch_id) ? await launchRows().catch(() => []) : [];
    const rows = [];
    for (const c0 of cs) { const l = launches.find(x => x.id === c0.launch_id) || null, c = await follow(c0, l); rows.push({ ...brief(c, await listRows('adsets', { campaign_id: c.id })), launch_name: l?.name || '', event_id: l?.event_id || '', rules_on: c.rules_on }); }
    return NextResponse.json({ ...meta, campaigns: rows });
  } catch (e) { console.error('Ads read failed', e.message); return bad('Couldn’t read the campaigns', 502); }
}

export async function POST(req) {
  const user = await currentUser();
  if (!canAds(user)) return bad('Ads is for directors and the Ads role', 403);
  const b = await req.json().catch(() => ({})), me = who(user);
  try {
    if (b.action === 'saveSwitch') {
      const launch = await launchById(b.launch_id); if (!launch) return bad('No such launch', 404);
      const exists = await adsTablesExist(), c = exists ? (await listRows('campaigns', { launch_id: launch.id }))[0] : null;
      if (!b.on) {
        if (!c) return NextResponse.json({ ok: true, campaign: null });
        if (c.status !== 'draft') return bad('This campaign is already in Meta, so the switch can’t be turned off here.', 409);
        await deleteRow('campaigns', c.id); return NextResponse.json({ ok: true, campaign: null });
      }
      const goal = GOAL_LIST.some(g => g[0] === b.goal) ? b.goal : 'Purchase', structure = b.structure === 'advantage' ? 'advantage' : 'test', cents = num(b.daily_cents, 0, 5_000_000) || 0;
      if (!c) { const made = await createDraft({ launch, goal, structure, dailyCents: cents, who: me }); return NextResponse.json({ ok: true, campaign: brief(made, await listRows('adsets', { campaign_id: made.id })), notes: made.meta_settings.notes || [] }); }
      if (c.status !== 'draft') return bad('This campaign is already in Meta, so these can’t change here.', 409);
      if (goal !== c.goal) await setGoal(c.id, goal);
      if (structure !== c.structure) await setStructure(c.id, structure);
      if (cents) { const sets = await listRows('adsets', { campaign_id: c.id }); await updateRow('campaigns', c.id, { daily_budget_cents: cents }); for (const a of sets) await updateRow('adsets', a.id, { daily_budget_cents: structure === 'advantage' ? cents : Math.round(cents / sets.length) }); }
      const now = await getRow('campaigns', c.id); return NextResponse.json({ ok: true, campaign: brief(now, await listRows('adsets', { campaign_id: c.id })) });
    }
    const c = b.id ? await getRow('campaigns', b.id).catch(() => null) : null;
    if (!c) return bad('No such campaign', 404);
    if (b.action === 'sendToMeta' || b.action === 'start') {
      if (!b.confirm) return bad('Please confirm first');
      const r = b.action === 'start' ? await startCampaign(c.id, me) : await sendPaused(c.id, me);
      return NextResponse.json(r, { status: r.ok ? 200 : 409 });
    }
    if (c.status !== 'draft') return bad('This campaign is already in Meta, so it can’t be edited here.', 409);
    const id = c.id;
    if (b.action === 'refresh') { const notes = await refreshDraft(id, ['all', 'copy', 'images', 'audiences', 'link'].includes(b.what) ? b.what : 'all'); return NextResponse.json({ ok: true, notes }); }
    if (b.action === 'setStructure') { await setStructure(id, b.structure); return NextResponse.json({ ok: true }); }
    if (b.action === 'swapAudience') { await swapAudience(id, String(b.adset_id), String(b.key)); return NextResponse.json({ ok: true }); }
    if (b.action === 'addHint' || b.action === 'removeHint') {   // what an Advantage+ ad set lets Meta start from
      const a = await getRow('adsets', String(b.adset_id)); if (!a || a.campaign_id !== id) return bad('No such ad set', 404);
      let list = a.targeting?.flexible_spec?.[0]?.interests || [];
      if (b.action === 'addHint') { const n = (c.meta_settings.pool || []).find(p => p.key === b.key); const add = n?.targeting?.flexible_spec?.[0]?.interests || []; if (!add.length) return bad('That suggestion has no interests to add'); list = [...list, ...add.filter(i => !list.some(x => x.id === i.id))]; }
      else list = list.filter(i => String(i.id) !== String(b.interest_id));
      const t = { ...a.targeting }; if (list.length) t.flexible_spec = [{ interests: list }]; else delete t.flexible_spec;
      await updateRow('adsets', a.id, { targeting: t }); await updateRow('campaigns', id, { meta_settings: markEdited(c, 'adsets', a.position) }); return NextResponse.json({ ok: true });
    }
    if (b.action === 'deleteDraft') { await deleteRow('campaigns', id); return NextResponse.json({ ok: true }); }
    if (b.action === 'update') {
      const ch = b.changes || {}, p = {};
      if (ch.name !== undefined) p.name = str(ch.name, 120) || c.name;
      if (ch.cta !== undefined) { if (!CTA_LIST.some(x => x[0] === ch.cta)) return bad('Choose one of the buttons'); p.cta = ch.cta; }
      if (ch.landing_url !== undefined) { const u = str(ch.landing_url, 400); if (u && !/^https?:\/\/[^\s]+$/i.test(u)) return bad('The landing page address must start with https://'); p.landing_url = u; }
      for (const k of ['start_date', 'end_date']) if (ch[k] !== undefined) { if (ch[k] && !DATE.test(ch[k])) return bad('Dates look like 2027-01-06'); p[k] = ch[k] || ''; p.dates_follow_launch = false; }
      if (ch.dates_follow_launch === true && c.launch_id) { const l = await launchById(c.launch_id); Object.assign(p, { dates_follow_launch: true }, l ? adDatesOf(l) : {}); }
      if (ch.budget_mode !== undefined) { if (!['per_adset', 'campaign'].includes(ch.budget_mode)) return bad('Unknown budget choice'); p.budget_mode = ch.budget_mode; }
      if (ch.daily_budget_cents !== undefined) { const n = num(ch.daily_budget_cents, 0, 5_000_000); if (n === null) return bad('That daily budget doesn’t look right'); p.daily_budget_cents = n; }
      if (ch.spend_cap_cents !== undefined) { const n = num(ch.spend_cap_cents, 0, 100_000_000); if (n === null) return bad('That spending cap doesn’t look right'); p.spend_cap_cents = n; }
      if (ch.draft_step !== undefined) p.draft_step = num(ch.draft_step, 1, 4) || 1;
      if (ch.meta_settings) {
        const m = ch.meta_settings, ms = { ...c.meta_settings };
        if (m.campaign_name !== undefined) ms.campaign_name = str(m.campaign_name, 150) || ms.campaign_name;
        if (m.placements !== undefined) { if (!['advantage', 'feeds_stories'].includes(m.placements)) return bad('Unknown placements choice'); ms.placements = m.placements; }
        p.meta_settings = ms;
      }
      if (ch.goal !== undefined) { if (!GOAL_LIST.some(g => g[0] === ch.goal)) return bad('Unknown goal'); await setGoal(id, ch.goal); }
      await updateRow('campaigns', id, p); return NextResponse.json({ ok: true });
    }
    if (b.action === 'editAdset') {
      const a = await getRow('adsets', String(b.adset_id)); if (!a || a.campaign_id !== id) return bad('No such ad set', 404);
      const ch = b.changes || {}, p = {}, t = { ...a.targeting };
      if (ch.audience_name !== undefined) p.audience_name = str(ch.audience_name, 120) || a.audience_name;
      if (ch.daily_budget_cents !== undefined) { const n = num(ch.daily_budget_cents, 0, 5_000_000); if (n === null) return bad('That budget doesn’t look right'); p.daily_budget_cents = n; }
      if (ch.budget_ceiling_cents !== undefined) { const n = num(ch.budget_ceiling_cents, 0, 5_000_000); if (n === null) return bad('That ceiling doesn’t look right'); p.budget_ceiling_cents = n; }
      for (const k of ['age_min', 'age_max']) if (ch[k] !== undefined) { const n = num(ch[k], 13, 65); if (n === null) return bad('Ages run from 13 to 65'); t[k] = n; }
      if (ch.exclusions_note !== undefined) t._exclusions = str(ch.exclusions_note, 300);
      if (t.age_min && t.age_max && t.age_min > t.age_max) return bad('The youngest age can’t be above the oldest');
      await updateRow('adsets', a.id, { ...p, targeting: t });
      await updateRow('campaigns', id, { meta_settings: markEdited(c, 'adsets', a.position) }); return NextResponse.json({ ok: true });
    }
    if (b.action === 'editCopy') {
      const s = await getRow('copysets', String(b.copy_id)); if (!s || s.campaign_id !== id) return bad('No such copy set', 404);
      const main = str(b.main_text, 600), head = str(b.headline, 100), ph = isPlaceholder(main, head);
      const written = s.is_placeholder && !ph;   // a person wrote real words into a placeholder: it now has a source (the person)
      await updateRow('copysets', s.id, { main_text: main, headline: head, is_placeholder: ph, ...(written ? { source_kind: 'written', source_ref: `Written by ${me}`, source_text: '' } : {}), ...(ph && !s.is_placeholder ? { source_kind: 'placeholder', source_ref: 'Needs words and a source' } : {}) });
      await updateRow('campaigns', id, { meta_settings: markEdited(c, 'copy', s.position) }); return NextResponse.json({ ok: true });
    }
    if (b.action === 'editCreative') {
      const x = await getRow('creatives', String(b.creative_id)); if (!x || x.campaign_id !== id) return bad('No such ad', 404);
      const p = {};
      if (b.kind !== undefined) { if (!['image', 'video'].includes(b.kind)) return bad('An ad is a picture or a video'); p.kind = b.kind; if (b.kind !== x.kind) p.images = {}; }
      if (b.images) { const im = {}; for (const [k, v] of Object.entries(b.images)) { if (!['9:16', '4:5'].includes(k)) continue; const u = str(v, 600); if (u && !/^https:\/\//i.test(u)) return bad('A video link must start with https://'); im[k] = u; } p.images = im; p.video_url = im['9:16'] || ''; }
      await updateRow('creatives', x.id, p);
      await updateRow('campaigns', id, { meta_settings: markEdited(c, 'creatives', x.position) }); return NextResponse.json({ ok: true });
    }
    if (b.action === 'chooseArt') {
      const x = await getRow('creatives', String(b.creative_id)); if (!x || x.campaign_id !== id) return bad('No such ad', 404);
      let images, source;
      if (typeof b.data === 'string') {
        if (b.data.length > 8_000_000 || !/^(\/9j\/|iVBOR)/.test(b.data)) return bad('Send a JPEG or PNG picture under 6 MB');
        images = await cropUpload(b.data, `${id}/${x.position}`); source = `Uploaded by ${me}`;
      } else {
        const a = (await artChoices({ limit: 200 })).find(r => r.id === b.image_id); if (!a) return bad('That picture isn’t in the library’s Art');
        images = await cropFrom(a, `${id}/${x.position}`); source = a.source;
      }
      await updateRow('creatives', x.id, { kind: 'image', images, source, video_url: '' });
      await updateRow('campaigns', id, { meta_settings: markEdited(c, 'creatives', x.position) }); return NextResponse.json({ ok: true });
    }
    if (b.action === 'saveRules') {
      if (c.goal === 'Traffic') return bad('Traffic campaigns have no automatic rules.');
      const rule = await ensureRules(c), r = b.rules || {}, p = {};
      const set = (k, v) => { if (v === null) throw new Error(`“${k}” doesn’t look right`); p[k] = v; };
      if (r.raise_pct !== undefined) set('raise_pct', flt(r.raise_pct, 1, 100));
      if (r.raise_every_hours !== undefined) set('raise_every_hours', num(r.raise_every_hours, 24, 168));
      if (r.raise_threshold !== undefined) set('raise_threshold', flt(r.raise_threshold, 0, 1000));
      if (r.ceiling_cents !== undefined) set('ceiling_cents', num(r.ceiling_cents, 0, 5_000_000));
      if (r.off_threshold !== undefined) set('off_threshold', flt(r.off_threshold, 0, 1000));
      if (r.off_min_spend_cents !== undefined) set('off_min_spend_cents', num(r.off_min_spend_cents, 0, 5_000_000));
      if (r.pause_weakest_after_days !== undefined) set('pause_weakest_after_days', num(r.pause_weakest_after_days, 0, 60));
      await updateRow('rules', rule.id, p);
      if (b.rules_on !== undefined) await updateRow('campaigns', id, { rules_on: !!b.rules_on });
      return NextResponse.json({ ok: true });
    }
    return bad('Unknown request');
  } catch (e) { const mine = e.user || /doesn’t look right/.test(e.message); console.error('Ads write failed', e.message); return bad(mine ? e.message : 'Couldn’t save that. Try again in a moment.', mine ? 400 : 502); }
}
