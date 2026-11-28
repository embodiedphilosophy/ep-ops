// The draft campaign (Ads PR 2): made when someone says yes to "Run Meta ads for this launch?", filled from what the launch already has, and
// rebuilt on "Refresh draft" without touching anything a person has edited. Nothing here talks to Meta except reads (interest search); sending is adssend.js.
//
// Where the defaults come from: the launch's playbooks carry no ads settings, so the starting budget and the automatic rules start from the values in
// BUDGET_BY_PLAYBOOK and RULE_DEFAULTS below (the handoff's: return 1.5×, cost per lead $1.50, 20% steps every 48 hours) and are then edited on the campaign.
import { adDates as datesOf, startingBudget as budgetOf, RULE_DEFAULTS } from './adsplan';
import { createRow, getRow, listRows, updateRow, deleteRow } from './adsstore';
import { SET_CEILING_CENTS } from './adsaccountmath';
import { launchRows } from './launches';
import { loadCalendar } from '../calendar';
import { draftCopySets, placeholderSet } from './adscopy';
import { pickFive } from './adsimages';
import { suggestAudiences, blankAudience, libraryCandidate } from './adsaudiences';

export const GOAL_LIST = [['Purchase', 'Purchase', 'Optimise for checkouts on the Circle paywall. Judged on return on ad spend.'], ['Lead', 'Lead', 'Optimise for sign-ups (Kit or the quiz). Judged on cost per lead.'], ['Traffic', 'Traffic', 'Landing page visits. Only for warming an audience; no automatic rules.']];
export const TYPE_LIST = [['test', 'Targeting test · 5 × 5', '5 ad sets, each a different audience, each with the same 5 ads.'], ['advantage', 'Advantage+', '1 ad set. Meta finds the audience; the same 5 ads.']];
export const CTA_LIST = [['LEARN_MORE', 'Learn more'], ['SIGN_UP', 'Sign up'], ['SHOP_NOW', 'Shop now'], ['GET_OFFER', 'Get offer'], ['SUBSCRIBE', 'Subscribe']];
const plainError = m => Object.assign(new Error(m), { user: true });   // a sentence meant for the person, shown as it is
export const adDatesOf = launch => datesOf(launch?.dates);
export const startingBudget = (launch, structure) => budgetOf(launch?.playbook_id, structure);
export const wantAdSets = structure => (structure === 'advantage' ? 1 : 5);

const slug = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50);
export const utmFor = launch => ({ utm_source: 'meta', utm_medium: 'paid_social', utm_campaign: slug(launch?.name) || 'launch' });
// The landing page address with the tags on it (anything already on the address is kept)
export function adLink(c) {
  if (!/^https?:\/\//i.test(c?.landing_url || '')) return '';
  try { const u = new URL(c.landing_url); for (const [k, v] of Object.entries(c.utm || {})) if (v && !u.searchParams.has(k)) u.searchParams.set(k, v); return u.toString(); } catch { return ''; }
}
export const campaignTotal = (c, adsets) => c.budget_mode === 'campaign' ? c.daily_budget_cents : adsets.reduce((s, a) => s + (a.daily_budget_cents || 0), 0);

export const launchById = async id => (await launchRows()).find(l => l.id === id) || null;
export async function eventOf(launch) {
  const id = String(launch?.event_id || '').toUpperCase();
  return id ? (await loadCalendar().catch(() => [])).find(e => String(e.sched_id || e.id).toUpperCase() === id) || null : null;
}
const edited = (c, kind) => new Set(c.meta_settings?._edited?.[kind] || []);
export const markEdited = (c, kind, n) => { const e = c.meta_settings?._edited || {}; return { ...c.meta_settings, _edited: { ...e, [kind]: [...new Set([...(e[kind] || []), n])] } }; };

// ---- Rules: one row per campaign; Traffic gets none
export async function ensureRules(c, ceilingCents = SET_CEILING_CENTS) {
  const have = (await listRows('rules', { campaign_id: c.id }))[0];
  if (c.goal === 'Traffic') { if (have) await deleteRow('rules', have.id); return null; }
  const d = RULE_DEFAULTS[c.goal];
  if (have) return have.metric === d.metric ? have : updateRow('rules', have.id, { metric: d.metric, raise_threshold: d.raise_threshold, off_threshold: d.off_threshold });
  return createRow('rules', { campaign_id: c.id, ...d, ceiling_cents: ceilingCents, off_min_spend_cents: 4000 });
}

// ---- Ad sets and ads
async function writeAdSets(c, list, total) {
  const want = wantAdSets(c.structure), per = c.structure === 'advantage' ? total : Math.round(total / want);
  for (const a of await listRows('adsets', { campaign_id: c.id })) await deleteRow('adsets', a.id);   // the ads under them go too
  const rows = [];
  for (let i = 0; i < want; i++) {
    const a = list[i] || blankAudience;
    rows.push(await createRow('adsets', { campaign_id: c.id, position: i + 1, label: a.label, audience_id: a.audience_id || '', audience_name: a.name, targeting: { ...a.targeting, _detail: a.detail || '', _result: a.result || '' }, daily_budget_cents: per, budget_ceiling_cents: 6000 }));
  }
  await writeAds(c, rows);
  return rows;
}
export async function writeAds(c, adsets) {
  const creatives = await listRows('creatives', { campaign_id: c.id });
  for (const a of await listRows('ads', { campaign_id: c.id })) await deleteRow('ads', a.id);
  for (const s of adsets) for (const [k, cr] of creatives.entries()) await createRow('ads', { campaign_id: c.id, adset_id: s.id, creative_id: cr.id, position: k + 1, name: `Ad ${k + 1}` });
}
// One Advantage+ ad set starts from the interests of the audiences it replaces
const adAudience = list => {
  const interests = list.flatMap(a => a.targeting?.flexible_spec?.[0]?.interests || []).slice(0, 3);
  return { label: 'New test', name: 'Advantage+ audience', detail: interests.length ? 'Meta starts from: ' + interests.map(i => i.name).join(', ') : 'Meta chooses who sees it.', result: '', audience_id: '',
    targeting: { geo_locations: { countries: ['US', 'GB', 'CA', 'AU'] }, age_min: 25, age_max: 65, ...(interests.length ? { flexible_spec: [{ interests }] } : {}) } };
};

// ---- Make the draft when the switch is saved
// `over` (campaign fields, and meta_settings to merge) and `fill` (run instead of the full generation) are for a relaunch (adsrelaunch.js): it brings the old campaign's
// audiences, pictures and link over and only writes fresh copy. Everything else about a draft is the same.
export async function createDraft({ launch, goal, structure, dailyCents, who, over = {}, fill }) {
  const ev = await eventOf(launch), want = structure === 'advantage' ? 'advantage' : 'test', total = dailyCents || startingBudget(launch, want);
  const name = launch.name, month = (adDatesOf(launch).start_date || new Date().toISOString().slice(0, 10)).slice(0, 7);
  const { meta_settings: more = {}, ...rest } = over;
  const c = await createRow('campaigns', {
    launch_id: launch.id, program_id: launch.event_id || '', name, goal, structure: want, status: 'draft', draft_step: 1, landing_url: launch.landing_url || '', utm: utmFor(launch),
    cta: goal === 'Traffic' ? 'LEARN_MORE' : 'SIGN_UP', ...adDatesOf(launch), dates_follow_launch: true, budget_mode: want === 'advantage' ? 'campaign' : 'per_adset', daily_budget_cents: total,
    meta_settings: { campaign_name: `${month} · ${name}`, placements: 'advantage', pool: [], notes: [], _edited: {}, ...more }, created_by: who, ...rest,
  });
  for (let i = 0; i < 5; i++) await createRow('copysets', { campaign_id: c.id, position: i + 1, ...placeholderSet(i) });
  for (let i = 0; i < 5; i++) await createRow('creatives', { campaign_id: c.id, position: i + 1, name: `Ad ${i + 1}`, kind: 'image', images: {}, source: '' });
  await ensureRules(c);
  if (fill) await fill(c, { launch, ev }); else await refreshDraft(c.id, 'all', { launch, ev });
  return getRow('campaigns', c.id);
}

// ---- Refresh: rebuild what is generated, keep what a person edited → [notes]
export async function refreshDraft(id, what = 'all', ctx = {}) {
  let c = await getRow('campaigns', id); if (!c) throw plainError('No such campaign');
  if (c.status !== 'draft') throw plainError('This campaign is already in Meta, so it can’t be redrafted here.');
  const launch = ctx.launch || (c.launch_id ? await launchById(c.launch_id) : null), ev = ctx.ev !== undefined ? ctx.ev : await eventOf(launch);
  const notes = [], all = what === 'all', meta = { ...c.meta_settings };
  if ((all || what === 'link' || what === 'dates') && launch) {
    const patch = {};
    if (all || what === 'link') { if (launch.landing_url) patch.landing_url = launch.landing_url; patch.utm = utmFor(launch); }
    if (c.dates_follow_launch) Object.assign(patch, adDatesOf(launch));
    c = await updateRow('campaigns', id, patch);
  }
  if ((all || what === 'copy') && launch) {
    const { sets, note } = await draftCopySets({ launch, ev }), keep = edited(c, 'copy');
    for (const row of await listRows('copysets', { campaign_id: id })) if (!keep.has(row.position)) await updateRow('copysets', row.id, sets[row.position - 1]);
    if (note) notes.push(note);
  }
  if ((all || what === 'images')) {
    let five = []; try { five = await pickFive({ ev, folder: id }); } catch (e) { notes.push(e.message); }
    const keep = edited(c, 'creatives');
    for (const row of await listRows('creatives', { campaign_id: id })) {
      const p = five[row.position - 1]; if (keep.has(row.position) || row.kind !== 'image' || !p) continue;
      await updateRow('creatives', row.id, { name: `Ad ${row.position}`, images: p.images, source: p.source });
    }
    if (!five.length) notes.push('No pictures found for this launch yet. Choose or upload one for each ad.');
    else if (five.length < 5 || five.some(p => !Object.keys(p.images).length)) notes.push('Some ads have no picture yet. Choose or upload them.');
  }
  if (all || what === 'audiences') {
    const topic = [ev?.title, ev?.program_name, launch?.name].filter(Boolean).join(' '), { candidates, note } = await suggestAudiences({ topic, types: [launch?.kind, ev?.track].filter(Boolean).join(' ') });
    const keep = edited(c, 'adsets'), current = await listRows('adsets', { campaign_id: id });
    meta.pool = candidates.slice(0, 24); if (note) notes.push(note);
    c = await updateRow('campaigns', id, { meta_settings: meta });
    if (c.structure === 'advantage') { if (!keep.has(1)) await writeAdSets(c, [adAudience(candidates)], c.daily_budget_cents); }
    else {
      const fixed = new Map(current.filter(a => keep.has(a.position)).map(a => [a.position, a]));
      const fresh = candidates.filter(x => !current.some(a => keep.has(a.position) && a.audience_name === x.name));
      const per = current[0]?.daily_budget_cents || Math.round(c.daily_budget_cents / 5);
      for (const [i, a] of current.entries()) { if (fixed.has(a.position)) continue; const n = fresh.shift() || blankAudience; await updateRow('adsets', a.id, { label: n.label, audience_id: n.audience_id || '', audience_name: n.name, targeting: { ...n.targeting, _detail: n.detail || '', _result: n.result || '' }, daily_budget_cents: a.daily_budget_cents || per }); }
      if (!current.length) await writeAdSets(c, candidates, c.daily_budget_cents);
    }
  }
  const final = await getRow('campaigns', id);
  await updateRow('campaigns', id, { meta_settings: { ...final.meta_settings, notes } });
  return notes;
}

// ---- Switch type: only the audiences change
export async function setStructure(id, structure) {
  const c = await getRow('campaigns', id); if (!c) throw plainError('No such campaign');
  if (!['test', 'advantage'].includes(structure) || c.structure === structure) return c;
  if (c.status !== 'draft') throw plainError('This campaign is already in Meta.');
  const adsets = await listRows('adsets', { campaign_id: id }), total = campaignTotal(c, adsets) || c.daily_budget_cents;
  const meta = { ...c.meta_settings };
  const asCand = a => ({ label: a.label, name: a.audience_name, audience_id: a.audience_id, detail: a.targeting?._detail, result: a.targeting?._result, targeting: a.targeting });
  if (structure === 'advantage') {
    meta.test_audiences = adsets.map(asCand);
    const next = await updateRow('campaigns', id, { structure, budget_mode: 'campaign', daily_budget_cents: total, meta_settings: meta });
    await writeAdSets(next, [adAudience(meta.test_audiences)], total);
    return getRow('campaigns', id);
  }
  const saved = meta.test_audiences || [], used = new Set(saved.map(a => a.name)), more = (meta.pool || []).filter(p => !used.has(p.name));
  const next = await updateRow('campaigns', id, { structure, budget_mode: 'per_adset', daily_budget_cents: total, meta_settings: { ...meta, test_audiences: null } });
  await writeAdSets(next, [...saved, ...more], total);
  return getRow('campaigns', id);
}

// ---- The goal changed: its rules and their kind follow
export async function setGoal(id, goal) {
  const c0 = await getRow('campaigns', id), c = await updateRow('campaigns', id, { goal, cta: goal === 'Traffic' ? 'LEARN_MORE' : c0.cta });
  await ensureRules(c); return c;
}

// ---- A person chose another audience for ad set `adset` from the ranked suggestions (or the blank one)
export async function swapAudience(id, adsetId, key) {
  const c = await getRow('campaigns', id), a = await getRow('adsets', adsetId); if (!c || !a || a.campaign_id !== id) throw plainError('No such ad set');
  const n = (c.meta_settings.pool || []).find(p => p.key === key); if (!n) throw plainError('That suggestion isn’t on the list any more. Refresh the draft.');
  await updateRow('adsets', adsetId, { label: n.label, audience_id: n.audience_id || '', audience_name: n.name, targeting: { ...n.targeting, _detail: n.detail || '', _result: n.result || '' } });
  await updateRow('campaigns', id, { meta_settings: markEdited(c, 'adsets', a.position) });
}

// ---- "Use in a campaign" (Ads PR 4): a person chose an Audience library row for ad set `adset`. The library row joins the draft's list of suggestions, then it is swapped in
// exactly like any other suggestion (swapAudience above). A Retired audience needs the person to have seen the warning (confirmRetired).
export async function useLibraryAudience(id, adsetId, audience, { confirmRetired = false } = {}) {
  const c = await getRow('campaigns', id); if (!c) throw plainError('No such campaign');
  if (c.status !== 'draft') throw plainError('This campaign is already in Meta, so its audiences can’t be swapped here.');
  if (c.structure !== 'test') throw plainError('This draft is Advantage+ (one ad set where Meta finds the audience). Switch it to a targeting test on the campaign page first, then swap an audience in.');
  if (audience.standing === 'Retired' && !confirmRetired) throw plainError('This audience was retired because it fell below the floor three times. Confirm to use it anyway.');
  const cand = libraryCandidate(audience);
  const pool = [cand, ...(c.meta_settings.pool || []).filter(p => p.key !== cand.key)];
  await updateRow('campaigns', id, { meta_settings: { ...c.meta_settings, pool } });
  await swapAudience(id, adsetId, cand.key);
  return cand;
}
