// Relaunch (Ads): "make a new draft from this campaign". One click on a past Ops-made campaign gives a NEW DRAFT, still unsent, that a person reviews in the usual four steps.
// It goes through the same door as every draft (createDraft in adsdraft.js), so it is made unsent and the only way to Meta is still "Send to Meta, paused" (adssend.js). This file
// never talks to Meta. The old campaign is only read.
//
// COPIED (what a person chose and what the campaign was built on): goal, structure (targeting test or Advantage+), the audiences, the pictures, the ad link and button, the daily budget
// (the one the campaign was drafted with, not an amount the morning rules raised it to; editable in the request and on step 3), the spending cap, the placements.
// REGENERATED: the five copy sets, written again from the launch's own emails, course page and testimonials exactly as for a normal draft (no drafting key: the usual [placeholders]).
// The old ad words are never copied. The automatic rules start from the defaults for the goal (Traffic: none) and are switched off: thresholds somebody tuned for one run are not carried into the next.
// DATES: from the program's newest launch that starts after this campaign ended (it follows that launch); when there is none, left empty and flagged "Set the dates".
import { adDatesOf, createDraft, launchById, eventOf, refreshDraft, utmFor, writeAds, wantAdSets } from './adsdraft';
import { campaignTree, createRow, getRow, listRows, updateRow } from './adsstore';
import { launchRows } from './launches';

const plainError = m => Object.assign(new Error(m), { user: true });
const norm = t => String(t || '').toLowerCase().replace(/\s+/g, ' ').trim();
const today = () => new Date().toISOString().slice(0, 10);

// The launch a relaunch should follow: the program's newest launch (this campaign's own launch included, in case its dates moved) that starts after this campaign ended
// and has not already finished. → { launch, dates } or null
function newerLaunch(c, launch, all) {
  const after = c.end_date || c.start_date || today();
  const found = all.filter(l => l.id === launch.id || (launch.event_id && l.event_id === launch.event_id))
    .map(l => ({ launch: l, dates: adDatesOf(l) }))
    .filter(x => x.dates.start_date && x.dates.start_date > after && (!x.dates.end_date || x.dates.end_date >= today()))
    .sort((a, b) => a.dates.start_date.localeCompare(b.dates.start_date));
  return found[0] || null;
}

// One relaunch at a time per campaign: a second click while the first is still working gets the first one's answer
const working = new Map();
export function relaunch(sourceId, opts = {}) {
  if (working.has(sourceId)) return working.get(sourceId);
  const p = run(sourceId, opts).finally(() => working.delete(sourceId));
  working.set(sourceId, p);
  return p;
}

async function run(sourceId, { who, dailyCents } = {}) {
  const old = await campaignTree(sourceId); if (!old) throw plainError('No such campaign');
  const c = old.campaign;
  if (c.status === 'draft') throw plainError('This one is still a draft. Open it to edit and send it; there is nothing to relaunch yet.');
  // already made a draft from it that nobody has sent? Open that one instead of making a second
  const have = (await listRows('campaigns')).find(x => x.status === 'draft' && x.meta_settings?.relaunched_from?.id === c.id);
  if (have) return { campaign: have, existing: true, notes: have.meta_settings.notes || [] };
  const launch = c.launch_id ? await launchById(c.launch_id) : null;
  if (!launch) throw plainError('The launch this campaign was made for isn’t there any more, so there is nothing to write fresh words from. Start a new draft from a launch instead.');
  const next = newerLaunch(c, launch, await launchRows().catch(() => [launch]));
  const use = next ? next.launch : launch, dates = next ? next.dates : { start_date: '', end_date: '' };
  const total = dailyCents || c.daily_budget_cents || old.adsets.reduce((s, a) => s + (a.daily_budget_cents || 0), 0);
  const month = (dates.start_date || today()).slice(0, 7), same = use.id === launch.id;
  const ms = c.meta_settings || {}, picked = old.creatives.filter(x => Object.keys(x.images || {}).length).map(x => x.position);
  const link = !same && use.landing_url ? use.landing_url : c.landing_url || use.landing_url || '';
  const made = await createDraft({
    launch: use, goal: c.goal, structure: c.structure, dailyCents: total, who,
    over: {
      name: same ? `${use.name} (relaunch)` : use.name, landing_url: link, utm: utmFor(use), cta: c.cta, budget_mode: c.budget_mode, spend_cap_cents: c.spend_cap_cents, start_date: dates.start_date || null, end_date: dates.end_date || null, dates_follow_launch: !!next,
      meta_settings: { campaign_name: `${month} · ${use.name}`, placements: ms.placements || 'advantage', pool: ms.pool || [], test_audiences: ms.test_audiences || null, notes: [],
        // the pictures and audiences were chosen by a person: "Refresh draft" keeps them. The copy is not marked, so a refresh writes it again.
        _edited: { creatives: picked, adsets: old.adsets.map(a => a.position) }, relaunched_from: { id: c.id, name: c.name, at: new Date().toISOString(), by: who } },
    },
    fill: async (draft, ctx) => {
      for (const cr of await listRows('creatives', { campaign_id: draft.id })) {
        const o = old.creatives.find(x => x.position === cr.position);
        if (o) await updateRow('creatives', cr.id, { name: o.name || cr.name, kind: o.kind, images: o.images || {}, video_url: o.video_url || '', source: o.source || '' });
      }
      const n = old.adsets.length || wantAdSets(c.structure), per = c.structure === 'advantage' ? total : Math.round(total / n), rows = [];
      for (const a of old.adsets) rows.push(await createRow('adsets', { campaign_id: draft.id, position: a.position, label: a.label, audience_id: a.audience_id, audience_name: a.audience_name, targeting: a.targeting, daily_budget_cents: per, budget_ceiling_cents: a.budget_ceiling_cents }));
      await writeAds(draft, rows);
      await refreshDraft(draft.id, 'copy', ctx);
    },
  });
  // what to tell the person, beside whatever the copy drafting said
  const notes = [...(made.meta_settings.notes || [])];
  if (!made.start_date) notes.push('Set the dates: there is no newer launch for this program yet, so the new draft has no dates. Choose them on step 3, or let them follow a launch once it has them.');
  const newCopy = await listRows('copysets', { campaign_id: made.id });
  for (const s of newCopy) if (!s.is_placeholder && old.copysets.some(o => norm(o.main_text) === norm(s.main_text) && norm(o.headline) === norm(s.headline))) notes.push(`Copy set ${s.position} came out the same as the old campaign’s. Change it if you want something different.`);
  for (const a of old.adsets) if (a.audience_id && (await getRow('audiences', a.audience_id).catch(() => null))?.standing === 'Retired') notes.push(`“${a.audience_name}” has been retired in the Audience library. Swap it on step 1 unless you mean to use it again.`);
  await updateRow('campaigns', made.id, { meta_settings: { ...made.meta_settings, notes } });
  await createRow('actions', { campaign_id: made.id, kind: 'relaunch', by: who, dry_run: false, detail: `Relaunched from “${c.name}”` }).catch(() => {});
  return { campaign: await getRow('campaigns', made.id), existing: false, notes, followsLaunch: !!next };
}
