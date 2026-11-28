// The Audience library (Ads PR 4): every audience EP has tried, with its exact Meta settings saved for reuse, and how it did in each campaign.
//
// STANDING is worked out, never typed (the only people's decisions are "Bring back" and the tags):
//   for each campaign an audience ran in, its ad set's whole-life total (ads_results) is judged against THAT campaign's own rules, once the ad set has spent the minimum
//   money over the minimum days:  at or above the target (return Y, or cost per lead at most Y)  → "above target";  below the turn-off value Z → "below floor" (a strike);
//   between the two → "below target". Traffic campaigns have no rules and are not judged. Not enough spend or days yet → "too early" (counts for nothing).
//   Proven = above target in 2 or more campaigns, Promising = once, Not tested = neither yet, Retired = below the floor 3 times (a strike each).
//   "Bring back" (a person) forgives the strikes so far, recording who and when; a later strike counts again from there.
// THE THRESHOLDS (2, 1, 3, the minimum spend, the minimum days) live in Settings, in the ads_settings table; these are only the starting values.
// The daily job (runLibraryUpdate) keeps ads_audience_results and the standings up to date from ads_results. It never writes to Meta and never reads the quiz.
import { adsTablesExist, listRows, getRow, createRow, updateRow, resultTotals, resultDays } from './adsstore.js';
import { hasAudience, topicWords } from './adsaudiences.js';
import { RULE_DEFAULTS } from './adsplan.js';

// ---- Thresholds
export const DEFAULT_THRESHOLDS = { proven_after: 2, promising_after: 1, retire_after: 3, min_spend_cents: 4000, min_days: 3 };
// field → [label, help, lowest, highest]
export const THRESHOLD_FIELDS = {
  proven_after: ['Campaigns at or above target for Proven', 'An audience is Proven once it has met the target in this many campaigns.', 1, 20],
  promising_after: ['Campaigns at or above target for Promising', 'Promising means it has met the target in this many campaigns (and not yet enough to be Proven).', 1, 20],
  retire_after: ['Times below the floor to retire', 'An audience is Retired after falling below the turn-off value in this many campaigns.', 1, 20],
  min_spend_cents: ['Minimum spend before judging (dollars)', 'An ad set is not judged until it has spent this much in the campaign.', 0, 5_000_000],
  min_days: ['Minimum days before judging', 'Nor until it has spent money on this many separate days.', 0, 60],
};
const SETTING_KEY = 'audience_standing';
export async function getThresholds() {
  if (!(await adsTablesExist().catch(() => false))) return { ...DEFAULT_THRESHOLDS };
  const row = (await listRows('settings', { key: SETTING_KEY }))[0];
  return { ...DEFAULT_THRESHOLDS, ...(row?.value || {}) };
}
// A director saves new values (Settings). Only the five known numbers; each is checked; every changed one goes on the Change Log.
// log(who, tab, label, field, from, to) writes the Change Log line; the route passes store.js's logSettingChange (kept out of this file so it also runs in plain node tests)
export async function saveThresholds(values, who, log = async () => {}) {
  const have = await getThresholds(), next = { ...have };
  for (const [k, v] of Object.entries(values || {})) {
    const f = THRESHOLD_FIELDS[k]; if (!f) continue;
    const n = Math.round(Number(v));
    if (!Number.isFinite(n) || n < f[2] || n > f[3]) throw Object.assign(new Error(`“${f[0]}” needs a whole number from ${k === 'min_spend_cents' ? f[2] / 100 + ' to ' + f[3] / 100 : f[2] + ' to ' + f[3]}.`), { user: true });
    next[k] = n;
  }
  if (next.promising_after > next.proven_after) throw Object.assign(new Error('Promising can’t need more campaigns than Proven.'), { user: true });
  const changed = Object.keys(DEFAULT_THRESHOLDS).filter(k => next[k] !== have[k]);
  if (!changed.length) return { ...next, changed: [] };
  const row = (await listRows('settings', { key: SETTING_KEY }))[0];
  if (row) await updateRow('settings', row.id, { value: next, updated_by: who }); else await createRow('settings', { key: SETTING_KEY, value: next, updated_by: who });
  for (const k of changed) await log(who, 'Ads: audience library', 'Audience standing', THRESHOLD_FIELDS[k][0], k === 'min_spend_cents' ? have[k] / 100 : have[k], k === 'min_spend_cents' ? next[k] / 100 : next[k]);
  return { ...next, changed };
}

// ---- Judging (pure)
const round2 = v => Math.round(v * 100) / 100;
// totals: { spend, revenue, leads } in cents / counts; days: days with spend. rule: the campaign's rules row (or null → the goal's defaults)
export function judge({ goal, rule, spend = 0, revenue = 0, leads = 0, days = 0 }, th) {
  if (goal === 'Traffic') return { outcome: 'not judged' };
  const d = RULE_DEFAULTS[goal] || RULE_DEFAULTS.Purchase, metric = rule?.metric || d.metric, y = rule ? rule.raise_threshold : d.raise_threshold, z = rule ? rule.off_threshold : d.off_threshold;
  const roas = spend > 0 ? round2(revenue / spend) : null, cpl = leads > 0 ? round2(spend / leads / 100) : null;
  const base = { metric, roas, cpl_cents: leads > 0 ? Math.round(spend / leads) : null, target: y, floor: z };
  if (spend <= 0 || spend < th.min_spend_cents || days < th.min_days) return { ...base, outcome: 'too early' };
  if (metric === 'cpl') { const v = cpl ?? Infinity; return { ...base, outcome: v <= y ? 'above target' : v > z ? 'below floor' : 'below target' }; }
  return { ...base, outcome: roas >= y ? 'above target' : roas < z ? 'below floor' : 'below target' };
}
const JUDGED = ['above target', 'below target', 'below floor'];
// results: an audience's audience_results rows. override: { strikes_forgiven } from Bring back.
export function standingOf(results, override, th) {
  const wins = results.filter(r => r.outcome === 'above target').length, strikes = results.filter(r => r.outcome === 'below floor').length;
  const live = Math.max(0, strikes - (override?.strikes_forgiven || 0));
  const standing = live >= th.retire_after ? 'Retired' : wins >= th.proven_after ? 'Proven' : wins >= th.promising_after ? 'Promising' : 'Not tested';
  return { standing, wins, strikes, live_strikes: live, campaigns_count: results.filter(r => r.spend_cents > 0).length };
}
// The best result in any judged campaign: the highest return and the lowest cost per lead
export function bestOf(results) {
  const ok = results.filter(r => JUDGED.includes(r.outcome)), roas = ok.filter(r => r.roas != null).map(r => r.roas), cpl = ok.filter(r => r.cpl_cents != null).map(r => r.cpl_cents);
  return { ...(roas.length ? { roas: Math.max(...roas) } : {}), ...(cpl.length ? { cpl_cents: Math.min(...cpl) } : {}) };
}

// ---- The daily update. preview: work it all out and say, record nothing.
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const clean = t => Object.fromEntries(Object.entries(t || {}).filter(([k]) => !k.startsWith('_')));   // an ad set's own notes (_detail, _result…) are not Meta settings
const ids = t => (t?.flexible_spec || []).flatMap(f => Object.values(f).flat().map(x => x?.id)).filter(Boolean).map(String);
const fingerprint = t => { const i = [...ids(t), ...(t?.custom_audiences || []).map(x => String(x.id))].sort(); return i.length ? i.join(',') : ''; };
const isBlankName = n => !n || n === 'Choose an audience' || n === 'Advantage+ audience';

export async function runLibraryUpdate({ preview = false, now = new Date() } = {}) {
  const out = { preview, at: now.toISOString(), campaigns: 0, audiences: { created: 0, changed: 0, unchanged: 0 }, results: { written: 0 }, standings: {}, changes: [] };
  if (!(await adsTablesExist())) return { ...out, note: 'No campaigns yet.' };
  // campaigns that really are in Meta (a dry-run send has an id that starts "dryrun-", and never ran)
  const camps = (await listRows('campaigns')).filter(c => c.status !== 'draft' && c.meta_campaign_id && !c.meta_campaign_id.startsWith('dryrun-'));
  if (!camps.length) return { ...out, note: 'No campaigns yet.' };
  out.campaigns = camps.length;
  const th = await getThresholds(), lib = await listRows('audiences'), have = await listRows('audience_results', {}, { limit: 2000 });
  const totals = await resultTotals(), days = await resultDays();
  const tot = new Map(totals.map(t => [`${t.campaign_id}|${t.adset_id}`, t])), dayOf = new Map(days.map(d => [`${d.campaign_id}|${d.adset_id}`, d.days]));
  const byId = new Map(lib.map(a => [a.id, a])), byName = new Map(lib.map(a => [a.name.toLowerCase(), a])), byFp = new Map(lib.filter(a => fingerprint(a.meta_settings?.targeting)).map(a => [fingerprint(a.meta_settings.targeting), a]));
  const fresh = [];   // audiences used in a campaign that the library doesn't have yet
  const entries = new Map();   // audience key → { audience | fresh, per: Map<campaign id, { adset_id, spend, revenue, purchases, leads, days, goal, rule }> }

  for (const c of camps) {
    if (c.structure === 'advantage') continue;   // Advantage+ lets Meta choose who sees it: there is no audience to remember
    const [adsets, rules] = await Promise.all([listRows('adsets', { campaign_id: c.id }), listRows('rules', { campaign_id: c.id })]);
    for (const a of adsets) {
      if (!a.meta_adset_id || isBlankName(a.audience_name) || !hasAudience(a.targeting)) continue;
      let hit = (a.audience_id && byId.get(a.audience_id)) || byName.get(a.audience_name.toLowerCase()) || byFp.get(fingerprint(a.targeting)), key = hit?.id;
      if (!hit) {
        key = `new:${fresh.length}`;
        const settings = clean(a.targeting), words = topicWords(c.name);
        hit = { key, name: a.audience_name, description: a.targeting?._detail || '', source: ids(a.targeting).length ? 'interest' : 'custom', meta_settings: { targeting: settings }, tags: words.slice(0, 4) };
        fresh.push(hit); byName.set(hit.name.toLowerCase(), hit); if (fingerprint(settings)) byFp.set(fingerprint(settings), hit);
      } else key = hit.id || hit.key;
      const t = tot.get(`${c.id}|${a.id}`) || { spend_cents: 0, revenue_cents: 0, purchases: 0, leads: 0 }, e = entries.get(key) || { hit, per: new Map() };
      const p = e.per.get(c.id) || { adset_id: a.id, spend: 0, revenue: 0, purchases: 0, leads: 0, days: 0, goal: c.goal, rule: rules[0] || null };
      p.spend += t.spend_cents; p.revenue += t.revenue_cents; p.purchases += t.purchases; p.leads += t.leads; p.days = Math.max(p.days, dayOf.get(`${c.id}|${a.id}`) || 0);
      e.per.set(c.id, p); entries.set(key, e);
    }
  }

  // Work out each audience's results and standing (the whole library, so one with no campaign any more is still brought up to date)
  const all = [...lib, ...fresh.map(f => ({ ...f, id: f.key, override: {} }))];
  const plan = all.map(a => {
    const e = entries.get(a.id), results = [...(e?.per || new Map())].map(([campaign_id, p]) => {
      const j = judge({ goal: p.goal, rule: p.rule, spend: p.spend, revenue: p.revenue, leads: p.leads, days: p.days }, th);
      return { audience_id: a.id, campaign_id, adset_id: p.adset_id, spend_cents: p.spend, purchases: p.purchases, revenue_cents: p.revenue, leads: p.leads, roas: j.roas ?? null, cpl_cents: j.cpl_cents ?? null, outcome: j.outcome };
    });
    return { a, results, st: standingOf(results, a.override, th), best: bestOf(results) };
  });

  const wrote = new Map(have.map(r => [`${r.audience_id}|${r.campaign_id}`, r]));
  for (const { a, results, st, best } of plan) {
    out.standings[st.standing] = (out.standings[st.standing] || 0) + 1;
    const isNew = !!a.key, patch = { standing: st.standing, campaigns_count: st.campaigns_count, wins: st.wins, strikes: st.strikes, best_result: best, retired_at: st.standing === 'Retired' ? (a.retired_at || now.toISOString()) : '' };
    let id = a.id;
    if (isNew) {
      out.audiences.created++; out.changes.push({ audience: a.name, from: '', to: st.standing, created: true });
      if (!preview) id = (await createRow('audiences', { name: a.name, description: a.description, source: a.source, meta_settings: a.meta_settings, tags: a.tags, ...patch, retired_at: patch.retired_at || null })).id;
    } else {
      const diff = Object.keys(patch).filter(k => k === 'retired_at' ? (!!a.retired_at) !== (!!patch.retired_at) : !same(a[k], patch[k]));
      if (!diff.length) out.audiences.unchanged++;
      else { out.audiences.changed++; if (a.standing !== st.standing) out.changes.push({ audience: a.name, from: a.standing, to: st.standing }); if (!preview) await updateRow('audiences', a.id, { ...patch, retired_at: patch.retired_at || null }); }
    }
    for (const r of results) {
      const row = wrote.get(`${a.id}|${r.campaign_id}`), mine = { ...r, audience_id: id };
      const stale = !row || ['adset_id', 'spend_cents', 'purchases', 'revenue_cents', 'leads', 'roas', 'cpl_cents', 'outcome'].some(k => row[k] !== mine[k]);
      if (!stale) continue;
      out.results.written++;
      if (!preview) { if (row) await updateRow('audience_results', row.id, mine); else await createRow('audience_results', mine); }
    }
  }
  return out;
}

// ---- What the pages show
const money = c => `$${(c / 100).toFixed(2)}`;
const x = v => `${+Number(v).toFixed(2)}×`;
export const valueText = r => (r.roas != null && (r.metric || 'roas') !== 'cpl' ? x(r.roas) : r.cpl_cents != null ? `${money(r.cpl_cents)} a lead` : r.roas != null ? x(r.roas) : '—');
export const bestText = b => (b?.roas ? `${x(b.roas)} return` : b?.cpl_cents ? `${money(b.cpl_cents)} a lead` : '');
const SORT = { Proven: 0, Promising: 1, 'Not tested': 2, Retired: 3 };

export async function libraryList() {
  const th = await getThresholds();
  if (!(await adsTablesExist().catch(() => false))) return { exists: false, rows: [], counts: {}, tags: [], thresholds: th };
  const rows = (await listRows('audiences')).map(a => ({ id: a.id, name: a.name, description: a.description, source: a.source, standing: a.standing, campaigns_count: a.campaigns_count, best: bestText(a.best_result), best_result: a.best_result, tags: a.tags || [], wins: a.wins || 0, strikes: a.strikes || 0, retired_at: a.retired_at, brought_back: a.override?.at ? { by: a.override.by, at: a.override.at } : null }))
    .sort((p, q) => (SORT[p.standing] ?? 9) - (SORT[q.standing] ?? 9) || p.name.localeCompare(q.name));
  const counts = {}; for (const r of rows) counts[r.standing] = (counts[r.standing] || 0) + 1;
  return { exists: true, rows, counts, tags: [...new Set(rows.flatMap(r => r.tags))].sort(), thresholds: th };
}

// One audience: its exact Meta settings, its result in every campaign it ran in, and a plain account of what it does and doesn't buy
export async function libraryDetail(id) {
  if (!(await adsTablesExist().catch(() => false))) return null;
  const a = await getRow('audiences', id); if (!a) return null;
  const th = await getThresholds(), results = (await listRows('audience_results', { audience_id: id })).sort((p, q) => String(q.created_at).localeCompare(String(p.created_at)));
  const per = [];
  for (const r of results) {
    const [c, rules] = await Promise.all([getRow('campaigns', r.campaign_id), listRows('rules', { campaign_id: r.campaign_id })]);
    if (!c) continue;
    const j = judge({ goal: c.goal, rule: rules[0] || null, spend: r.spend_cents, revenue: r.revenue_cents, leads: r.leads, days: 99 }, { ...th, min_spend_cents: 0, min_days: 0 });
    const metric = j.metric || (c.goal === 'Lead' ? 'cpl' : 'roas');
    per.push({ campaign_id: c.id, campaign: c.name, goal: c.goal, status: c.status, utm_campaign: c.utm?.utm_campaign || '', adset_id: r.adset_id, spend_cents: r.spend_cents, purchases: r.purchases, leads: r.leads, outcome: r.outcome, value: valueText({ ...r, metric }),
      target: c.goal === 'Traffic' ? '' : metric === 'cpl' ? `target ${money(Math.round(j.target * 100))} a lead, floor ${money(Math.round(j.floor * 100))}` : `target ${x(j.target)}, floor ${x(j.floor)}` });
  }
  return { id: a.id, name: a.name, description: a.description, source: a.source, standing: a.standing, campaigns_count: a.campaigns_count, best: bestText(a.best_result), tags: a.tags || [], wins: a.wins || 0, strikes: a.strikes || 0, retired_at: a.retired_at,
    brought_back: a.override?.at ? { by: a.override.by, at: a.override.at } : null, settings: a.meta_settings?.targeting || a.meta_settings || {}, meta_audience_id: a.meta_audience_id, results: per, says: explain(a, per, th) };
}

const list = a => (a.length <= 2 ? a.join(' and ') : `${a.slice(0, -1).join(', ')} and ${a.at(-1)}`);
// A few plain sentences from the numbers: where it beat its target, where it fell below the floor, what it is tagged for
export function explain(a, per, th) {
  const judged = per.filter(r => JUDGED.includes(r.outcome)), good = judged.filter(r => r.outcome === 'above target'), floor = judged.filter(r => r.outcome === 'below floor'), mid = judged.filter(r => r.outcome === 'below target');
  const lines = [];
  if (!per.length) lines.push('It hasn’t run in a campaign yet, so there is nothing to say about what it buys.');
  else if (!judged.length) lines.push(`It has run in ${per.length} campaign${per.length === 1 ? '' : 's'}, but not long enough or with enough spend to judge (at least ${money(th.min_spend_cents)} over ${th.min_days} days).`);
  else {
    if (good.length) lines.push(`It met its target in ${good.length} of ${judged.length} judged campaign${judged.length === 1 ? '' : 's'}: ${list(good.map(r => `${r.campaign} (${r.value})`))}.`);
    else lines.push(`It hasn’t met its target in any of the ${judged.length} campaign${judged.length === 1 ? '' : 's'} judged so far.`);
    if (mid.length) lines.push(`It landed between the target and the floor in ${list(mid.map(r => r.campaign))}.`);
    if (floor.length) lines.push(`It fell below the floor in ${list(floor.map(r => `${r.campaign} (${r.value})`))}.`);
    const GOAL_ORDER = ['Purchase', 'Lead', 'Traffic'], goals = [...new Set(judged.map(r => r.goal))].sort((p, q) => (GOAL_ORDER.indexOf(p) + 1 || 9) - (GOAL_ORDER.indexOf(q) + 1 || 9));   // a fixed order: the results arrive in whatever order the database returns rows made in the same millisecond
    if (goals.length > 1) lines.push('By goal: ' + goals.map(g => `${g} ${judged.filter(r => r.goal === g && r.outcome === 'above target').length} of ${judged.filter(r => r.goal === g).length}`).join(', ') + ' at or above target.');
  }
  const tags = a.tags || [];
  lines.push(tags.length ? `Tagged for: ${tags.join(', ')}. New campaigns on those topics and course types are offered it first.` : 'It has no tags yet. Add the course types and topics it buys, so new campaigns on those are offered it first.');
  if (a.standing === 'Retired') lines.push('It is Retired, so new campaigns don’t suggest it. You can bring it back, or pick it by hand.');
  return lines;
}

// ---- A person's edits
const TAG = /^[\p{L}\p{N}][\p{L}\p{N} '’&-]{1,29}$/u;
export async function setTags(id, tags) {
  const a = await getRow('audiences', id); if (!a) return null;
  const list = [...new Set((Array.isArray(tags) ? tags : String(tags || '').split(',')).map(t => String(t).trim().toLowerCase().replace(/\s+/g, ' ')).filter(Boolean))];
  if (list.length > 12) throw Object.assign(new Error('Twelve tags is the most one audience can carry.'), { user: true });
  if (list.some(t => !TAG.test(t))) throw Object.assign(new Error('A tag is a short word or two (letters and numbers, 2 to 30 characters).'), { user: true });
  return updateRow('audiences', id, { tags: list });
}
// A person brings a Retired audience back: the strikes so far are forgiven (it can be retired again by new ones), and who and when are kept
export async function bringBack(id, who, now = new Date()) {
  const a = await getRow('audiences', id); if (!a) return { ok: false, status: 404, error: 'No such audience.' };
  if (a.standing !== 'Retired') return { ok: false, status: 409, error: 'Only a Retired audience can be brought back.' };
  const th = await getThresholds(), rs = await listRows('audience_results', { audience_id: id }), forgiven = standingOf(rs, {}, th).strikes, st = standingOf(rs, { strikes_forgiven: forgiven }, th);
  await updateRow('audiences', id, { override: { by: who, at: now.toISOString(), strikes_forgiven: forgiven }, standing: st.standing, retired_at: null });
  return { ok: true, standing: st.standing, message: `${a.name} is back in the library as ${st.standing}.` };
}

// ---- Ideas from the Practice Report (read only; nothing is uploaded anywhere)
const LOOKALIKE_MIN = 100;   // Meta wants roughly this many people in the source before it can build a lookalike
export function audienceIdeas(counts, { limit = 4 } = {}) {
  if (!counts?.ok) return [];
  return counts.archetypes.slice(0, limit).map(a => ({ archetype: a.archetype, count: a.count, enough: a.count >= LOOKALIKE_MIN,
    text: `A lookalike of people who got “${a.archetype}” (${a.count.toLocaleString('en-US')} ${a.count === 1 ? 'person' : 'people'})${a.count >= LOOKALIKE_MIN ? '' : `. That is a small group: Meta needs about ${LOOKALIKE_MIN} to build one.`}` }));
}

// Which quiz archetypes an audience overlaps with: the people who arrived from the campaigns it ran in (by the tags on their link), as counts. If the quiz's links carry the ad set
// (utm_content), only that ad set's visitors count; otherwise it is the campaign's, and says so. With no match at all it says nothing rather than guess.
export function overlapOf(detail, byAd) {
  if (!byAd?.connected) return { state: 'not_connected' };
  if (!byAd.ok) return { state: 'error', note: byAd.error };
  const mine = new Map(), slugs = new Set(detail.results.map(r => r.utm_campaign).filter(Boolean)), sets = new Set(detail.results.map(r => r.adset_id));
  let level = 'campaign';
  const rows = byAd.rows.filter(r => slugs.has(r.campaign)), precise = rows.filter(r => r.content && sets.has(r.content));
  const use = precise.length ? precise : rows.filter(r => !r.content || !byAd.hasContent);
  if (precise.length) level = 'ad set';
  for (const r of use) mine.set(r.archetype, (mine.get(r.archetype) || 0) + r.count);
  const total = [...mine.values()].reduce((n, v) => n + v, 0);
  if (!total) return { state: 'none' };
  return { state: 'ok', level, total, rows: [...mine].map(([archetype, count]) => ({ archetype, count, share: Math.round((count / total) * 100) })).sort((p, q) => q.count - p.count) };
}

// The drafts "Use in a campaign" can put an audience into, and their ad set slots. A test draft has five slots; an Advantage+ draft says it needs switching first.
export async function draftsForPicker(me) {
  if (!(await adsTablesExist().catch(() => false))) return [];
  const out = [];
  for (const c of (await listRows('campaigns', { status: 'draft' }))) {
    const sets = await listRows('adsets', { campaign_id: c.id });
    out.push({ id: c.id, name: c.name, goal: c.goal, structure: c.structure, mine: !!me && c.created_by === me, slots: c.structure === 'test' ? sets.map(a => ({ id: a.id, position: a.position, audience: a.audience_name })) : [] });
  }
  return out.sort((p, q) => Number(q.mine) - Number(p.mine) || p.name.localeCompare(q.name));
}
