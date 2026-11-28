// The morning rules and Reverse (Ads PR 3).
//
// What it does: each morning, for every RUNNING campaign whose rules a person switched on (and never a Traffic campaign), it judges each ad set on the average of the
// last 72 hours (the three full days before today, from ads_results) against that campaign's stored rules, and makes one decision per ad set: raise its budget, hold,
// or turn it off; and, if the rule is set, pause the weakest ad in a set. Every decision is written to ads_actions with what it would change FROM and TO, what Reverse
// would put back, whether it was done or only said, and the reason in plain English with the numbers.
//
// THREE LOCKS, all must be open for a change to reach Meta; with any one closed the very same decisions are still made and recorded, marked dry run:
//   (a) the back-office jobs are live on this project (OPS_LIVE=1, lib/crongate.js),
//   (b) the Meta safety switch (META_ADS_LIVE=live; every change also goes through the one write gate in meta-ads.js),
//   (c) Make's Ad Agent is OFF (the Mode on the Ad Agent tab of the Revenue & Metrics sheet). Make's scenarios keep raising budgets until it is switched off,
//       so while it is anything but OFF (or cannot be read) Ops only watches. Never both live: the budgets would be raised twice.
// Reverse is always a person pressing a button; it also goes through the write gate and refuses if the value was changed again since.
import { jobsHere } from '../crongate.js';
import { readRange } from '../google.js';
import { isLive, hasToken, setBudget, setStatus, getObject } from './meta-ads.js';
import { adsTablesExist, listRows, getRow, createRow, updateRow, listResults, resultTotals, claimReversal, releaseReversal } from './adsstore.js';
import { nyDate, addDays } from './adssync.js';
import { readRealSales, realFor, judge, tagCounts } from './adsrealsales.js';

export const WINDOW_DAYS = 3;                       // "a 72-hour average": the three full days before today
const SPACING_SLACK_HOURS = 2;                      // a daily job can run a little early; 48 hours means 46 or more
const METRICS_SHEET = () => process.env.METRICS_SHEET_ID || '1gK_02Szjd76AYEUCNcUHAXZtJZh5PYIwSpzrek4OSYs';   // the same sheet lib/ops/metrics.js reads

export const usd = c => `$${((c || 0) / 100).toLocaleString('en-US', { minimumFractionDigits: c % 100 ? 2 : 0, maximumFractionDigits: 2 })}`;
const x2 = v => `${+Number(v).toFixed(2)}×`;
const show = (metric, v) => (metric === 'cpl' ? (v === Infinity ? 'no leads yet' : `$${v.toFixed(2)}`) : x2(v));
const LINES = { roas: 'return on ad spend', cpl: 'cost per lead' };

// ---- Make's Ad Agent: Mode on the Ad Agent tab of the Revenue & Metrics sheet (AUTO, recommend-only or OFF). Today and Finance read the same cell.
// A cached read for showing it on a page; the morning job reads it fresh. If it can't be read, it is treated as "not OFF".
export async function makeAgentMode({ fresh = false } = {}) {
  try {
    const rows = await readRange(METRICS_SHEET(), "'Ad Agent'!A1:B12", { fresh });
    const mode = String((rows.find(r => String(r[0] || '').trim().toLowerCase() === 'mode') || [])[1] || '').trim().toUpperCase();
    return mode ? { ok: true, mode, off: mode === 'OFF' } : { ok: false, mode: 'UNKNOWN', off: false, error: 'Make’s Ad Agent has no Mode set on the sheet.' };
  } catch { return { ok: false, mode: 'UNKNOWN', off: false, error: 'Ops couldn’t read Make’s Ad Agent setting.' }; }
}
export async function lockState({ fresh = false } = {}) {
  const make = await makeAgentMode({ fresh });
  const l = { cron: jobsHere(), gate: isLive(), token: hasToken(), makeOff: make.off, makeMode: make.mode, makeReadable: make.ok };
  l.open = l.cron && l.gate && l.token && l.makeOff;
  const why = [];
  if (!l.makeOff) why.push(l.makeReadable ? 'Make’s Ad Agent is still on' : 'Ops can’t tell whether Make’s Ad Agent is still on');
  if (!l.gate) why.push('the safety switch for Meta is off');
  if (!l.cron) why.push('the back-office jobs are paused here');
  if (!l.token) why.push('Meta isn’t connected');
  l.why = why;
  l.text = why.length ? `Dry run — ${why.length === 1 ? why[0] : why.slice(0, -1).join(', ') + ' and ' + why.at(-1)}, so nothing was changed` : 'All three locks are open: the rules change Meta for the campaigns they are switched on for';
  return l;
}

// ---- Judging
export const totalOf = rows => rows.reduce((t, r) => ({ spend: t.spend + r.spend_cents, revenue: t.revenue + r.revenue_cents, purchases: t.purchases + r.purchases, leads: t.leads + r.leads }), { spend: 0, revenue: 0, purchases: 0, leads: 0 });
export const valueOf = (metric, t) => (metric === 'cpl' ? (t.leads > 0 ? Math.round(t.spend / t.leads) / 100 : t.spend > 0 ? Infinity : null) : t.spend > 0 ? Math.round((t.revenue / t.spend) * 100) / 100 : null);
const isGood = (m, v, y) => v != null && (m === 'cpl' ? v <= y : v >= y);
const isBad = (m, v, z) => v != null && (m === 'cpl' ? v > z : v < z);
const hoursBetween = (a, b) => (new Date(a) - new Date(b)) / 3600e3;
const ago = h => (h = Math.max(0, h), h < 36 ? `${Math.round(h)} hours ago` : `${Math.round(h / 24)} days ago`);

// One campaign's decisions. Pure: no database, no Meta. `have` is what was already decided this morning; `actions` is the campaign's history.
// real: this campaign's real sales (lib/ops/adsrealsales.js `realFor`), or null when they weren't read. Real sales only ever make it MORE careful: they can lower the number an ad set is judged on, and a
// raise needs them to agree; without them (unreadable, or the campaign can't be matched) nothing is raised, and a turn-off still goes by Meta's number.
export function decideCampaign({ campaign: c, adsets, ads, rule, rows, lifetime, actions, now, live = false, real = null }) {
  const out = [], today = nyDate(now), from = addDays(today, -WINDOW_DAYS), to = addDays(today, -1), m = rule.metric === 'cpl' ? 'cpl' : 'roas';
  const inWin = rows.filter(r => r.date >= from && r.date <= to), name = LINES[m];
  // A real run is not held back by what an earlier dry run only said (and does not count it as a step): only changes that were made, and ones that failed, count.
  const counts = a => !live || !a.dry_run || a.after?.failed;
  const doneToday = new Set(actions.filter(a => a.by === 'rules' && counts(a) && nyDate(a.at) === today).map(a => `${a.kind === 'pause_ad' ? 'ad' : 'set'}:${a.adset_id}`));
  const spentSoFar = Object.fromEntries(lifetime.map(l => [l.adset_id, l.spend_cents]));
  for (const a of [...adsets].sort((p, q) => p.position - q.position)) {
    if (a.status === 'off' || !a.meta_adset_id) continue;
    const label = `Ad set ${a.position} (${String(a.audience_name || '').replace(/^Interests · /, '')})`;
    const t = totalOf(inWin.filter(r => r.adset_id === a.id && !r.ad_id)), vMeta = valueOf(m, t), g = m === 'roas' ? judge(real, vMeta) : { value: vMeta, canRaise: true, line: '', why: '' }, v = g.value, cur = a.daily_budget_cents, mine = actions.filter(x => x.adset_id === a.id && !x.ad_id && x.by === 'rules' && counts(x));
    const numbers = `${label}: ${v == null ? 'nothing spent' : `${name} ${show(m, v)}`} over the last ${WINDOW_DAYS} days (${usd(t.spend)} spent)${g.line ? `. ${g.line}` : ''}`;
    const set = (kind, detail, before, after, extra = {}) => out.push({ kind, adset_id: a.id, ad_id: '', detail, before, after, ...extra });
    let decided = false;
    if (!doneToday.has(`set:${a.id}`)) {
      decided = true;
      const lastOff = mine.filter(x => x.kind === 'turn_off' && x.reversed_at).sort((p, q) => new Date(q.reversed_at) - new Date(p.reversed_at))[0];
      const lastRaise = mine.filter(x => x.kind === 'raise_budget' && !x.after?.failed).sort((p, q) => new Date(q.at) - new Date(p.at))[0];
      const ceiling = a.budget_ceiling_cents || rule.ceiling_cents || 0;
      if (v == null) set('hold', `${numbers}. There is nothing to judge yet, so it stays as it is.`, { daily_budget_cents: cur }, { daily_budget_cents: cur });
      else if (isBad(m, v, rule.off_threshold)) {
        const spent = spentSoFar[a.id] || 0;
        if (lastOff && hoursBetween(now, lastOff.reversed_at) < WINDOW_DAYS * 24) set('hold', `${numbers}. That is ${m === 'cpl' ? 'above' : 'below'} the ${show(m, rule.off_threshold)} line, but ${lastOff.reversed_by || 'someone'} turned it back on ${ago(hoursBetween(now, lastOff.reversed_at))}, so the rules give it three more days.`, { daily_budget_cents: cur }, { daily_budget_cents: cur });
        else if (spent < (rule.off_min_spend_cents || 0)) set('hold', `${numbers}. That is ${m === 'cpl' ? 'above' : 'below'} the ${show(m, rule.off_threshold)} line, but it has only spent ${usd(spent)} so far and the rules wait until ${usd(rule.off_min_spend_cents)}, so it stays on.`, { daily_budget_cents: cur }, { daily_budget_cents: cur });
        else set('turn_off', `${numbers}. That is ${m === 'cpl' ? 'above' : 'below'} the ${show(m, rule.off_threshold)} line and it has spent ${usd(spent)} (the minimum is ${usd(rule.off_min_spend_cents)}), so the ad set is turned off.`, { status: 'on' }, { status: 'off' }, { reverse_to: { status: 'on' }, act: 'status', meta: a.meta_adset_id });
      } else if (isGood(m, v, rule.raise_threshold) && !g.canRaise) set('hold', `${numbers}. That is ${m === 'cpl' ? 'at or below' : 'at or above'} the ${show(m, rule.raise_threshold)} raise line on Meta’s number, but ${g.why}, so nothing was raised.`, { daily_budget_cents: cur }, { daily_budget_cents: cur });
      else if (isGood(m, v, rule.raise_threshold)) {
        const step = Math.round(cur * (1 + rule.raise_pct / 100)), next = ceiling ? Math.min(step, ceiling) : step, since = lastRaise ? hoursBetween(now, lastRaise.at) : Infinity;
        if (c.budget_mode === 'campaign') set('hold', `${numbers}. That is good, but this campaign uses one shared budget that Meta moves around itself, so the rules only turn ad sets off.`, { daily_budget_cents: cur }, { daily_budget_cents: cur });
        else if (!cur) set('hold', `${numbers}. That is good, but this ad set has no daily budget of its own to raise.`, { daily_budget_cents: 0 }, { daily_budget_cents: 0 });
        else if (since < rule.raise_every_hours - SPACING_SLACK_HOURS) set('hold', `${numbers}. That is good, but its budget was raised ${ago(since)} and the rules wait ${rule.raise_every_hours} hours between steps, so it stays at ${usd(cur)} for another ${Math.max(1, Math.round(rule.raise_every_hours - since))} hours.`, { daily_budget_cents: cur }, { daily_budget_cents: cur });
        else if (ceiling && cur >= ceiling) set('hold', `${numbers}. That is good, but it is already at the ${usd(ceiling)} a day ceiling, so it stays at ${usd(cur)}.`, { daily_budget_cents: cur }, { daily_budget_cents: cur });
        else set('raise_budget', `${numbers}. That is ${m === 'cpl' ? 'at or below' : 'at or above'} the ${show(m, rule.raise_threshold)} line, so the daily budget goes up ${rule.raise_pct}%, from ${usd(cur)} to ${usd(next)}${next < step ? ` (the ${usd(ceiling)} ceiling stops it going higher)` : ''}.`, { daily_budget_cents: cur }, { daily_budget_cents: next }, { reverse_to: { daily_budget_cents: cur }, act: 'budget', meta: a.meta_adset_id });
      } else set('hold', `${numbers}. That is between the ${show(m, rule.raise_threshold)} raise line and the ${show(m, rule.off_threshold)} turn-off line, so it stays as it is.`, { daily_budget_cents: cur }, { daily_budget_cents: cur });
    }
    // The weakest ad in the set, once, after N days of results, if the ad set itself is staying on
    const turnedOff = out.some(d => d.kind === 'turn_off' && d.adset_id === a.id);
    if (decided && rule.pause_weakest_after_days > 0 && !turnedOff && !doneToday.has(`ad:${a.id}`) && !actions.some(x => x.kind === 'pause_ad' && x.adset_id === a.id && !x.after?.failed && counts(x))) {
      const first = rows.filter(r => r.adset_id === a.id && !r.ad_id).map(r => r.date).sort()[0];
      const live = ads.filter(x => x.adset_id === a.id && x.status !== 'off' && x.meta_ad_id);
      if (first && live.length >= 3 && (new Date(`${today}T12:00:00Z`) - new Date(`${first}T12:00:00Z`)) / 86400e3 >= rule.pause_weakest_after_days) {
        const scored = live.map(x => ({ x, t: totalOf(inWin.filter(r => r.ad_id === x.id)) })).map(s => ({ ...s, v: valueOf(m, s.t) })).filter(s => s.v != null && s.t.spend > 0);
        const worse = (p, q) => (m === 'cpl' ? p.v > q.v : p.v < q.v), ranked = scored.sort((p, q) => (worse(p, q) ? -1 : worse(q, p) ? 1 : 0));
        if (ranked.length >= 3 && worse(ranked[0], ranked[1])) {
          const w = ranked[0];
          out.push({ kind: 'pause_ad', adset_id: a.id, ad_id: w.x.id, detail: `${w.x.name} is the weakest ad in ${label}: ${name} ${show(m, w.v)} over the last ${WINDOW_DAYS} days against ${show(m, v ?? w.v)} for the whole set, and the set has run for ${rule.pause_weakest_after_days} days or more, so the ad is paused.`, before: { status: 'on' }, after: { status: 'off' }, reverse_to: { status: 'on' }, act: 'status', meta: w.x.meta_ad_id });
        }
      }
    }
  }
  return out;
}

// ---- Running it
// preview: decide and say, record nothing. now: a pretend clock, for tests only (the route accepts it in preview alone).
export async function runMorningRules({ now = new Date(), preview = false } = {}) {
  const out = { preview, at: now.toISOString(), locks: null, campaigns: [], recorded: 0, applied: 0, would: 0, failed: 0 };
  out.locks = await lockState({ fresh: true });
  if (!(await adsTablesExist())) return { ...out, note: 'No campaigns yet.' };
  const live = out.locks.open && !preview, today = nyDate(now), since = addDays(today, -60);
  const all = await listRows('campaigns'), mine = all.filter(x => x.rules_on && x.status === 'live' && x.goal !== 'Traffic');
  // Real sales (Kit and Circle): read once for the whole run, never throws; a source that can't be read means no budget is raised (lib/ops/adsrealsales.js)
  const sales = mine.some(c => c.goal !== 'Lead') ? await readRealSales({ now, cache: new Map() }) : null, tags = tagCounts(all), from = addDays(today, -WINDOW_DAYS), to = addDays(today, -1);
  if (sales) out.real = { readable: sales.readable, tagged: sales.tagged, kit: { ok: sales.kit.ok, note: sales.kit.ok ? '' : sales.kit.note }, circle: { ok: sales.circle.ok, note: sales.circle.ok ? '' : sales.circle.note } };
  for (const c of mine) {
    const [adsets, ads, rules, actions, rows, lifetime] = await Promise.all([listRows('adsets', { campaign_id: c.id }), listRows('ads', { campaign_id: c.id }), listRows('rules', { campaign_id: c.id }), listRows('actions', { campaign_id: c.id }, { limit: 1000 }), listResults(c.id, since), resultTotals({ campaignId: c.id })]);
    const rule = rules[0], res = { id: c.id, name: c.name, decisions: [] };
    out.campaigns.push(res);
    if (!rule) { res.note = 'This campaign has no rules saved.'; continue; }
    const mt = totalOf(rows.filter(r => r.date >= from && r.date <= to && !r.ad_id)), real = sales && rule.metric !== 'cpl' ? realFor({ sales, campaign: c, tags, from, to, meta: { spend_cents: mt.spend, revenue_cents: mt.revenue, purchases: mt.purchases } }) : null;
    for (const d of decideCampaign({ campaign: c, adsets, ads, rule, rows, lifetime, actions, now, live, real })) {
      const set = adsets.find(a => a.id === d.adset_id), ad = ads.find(a => a.id === d.ad_id);
      let dry = !live, detail = d.detail, after = d.after, kind = d.kind, error = '';
      if (live && d.act) {   // the real change, through the write gate. Look at Meta first: if it is not what Ops last saw, someone changed it there, so leave it alone.
        const seen = await getObject(d.meta);
        if (!seen.ok) { error = seen.error; }
        else if (d.act === 'budget' && Number(seen.daily_budget) !== d.before.daily_budget_cents) { kind = 'hold'; dry = false; detail = `${set.audience_name}: the rules wanted to raise the budget, but Meta shows ${usd(Number(seen.daily_budget))} and Ops last saw ${usd(d.before.daily_budget_cents)}, so someone changed it in Meta. Nothing was changed.`; after = d.before; }
        else if (d.act === 'status' && seen.status === 'PAUSED') { kind = 'hold'; dry = false; detail = `${(ad || set).name || set.audience_name} is already paused in Meta, so there is nothing to do.`; after = d.before; if (ad) await updateRow('ads', ad.id, { status: 'off' }); else await updateRow('adsets', set.id, { status: 'off' }); }
        else {
          const r = d.act === 'budget' ? await setBudget(d.meta, { dailyBudgetCents: d.after.daily_budget_cents }) : await setStatus(d.meta, 'PAUSED');
          if (!r.ok) error = r.error; else if (r.dryRun) dry = true;
          else if (d.act === 'budget') await updateRow('adsets', set.id, { daily_budget_cents: d.after.daily_budget_cents });
          else if (ad) await updateRow('ads', ad.id, { status: 'off' }); else await updateRow('adsets', set.id, { status: 'off' });
        }
        if (error) { dry = true; detail = `The rules meant to do this, but it did not go through (${error}). Nothing was changed. ${d.detail}`; after = { ...d.after, failed: true }; }
      }
      const row = { campaign_id: c.id, adset_id: d.adset_id, ad_id: d.ad_id, at: now.toISOString(), kind, by: 'rules', dry_run: dry, detail, before: d.before, after, ...(d.reverse_to && kind === d.kind ? { reverse_to: d.reverse_to } : {}) };
      const saved = preview ? null : await createRow('actions', row);
      const view = { kind, adset: set?.position, adset_name: set?.audience_name, ad: ad?.name || '', dry_run: dry, applied: !dry && !error && kind !== 'hold', failed: !!error, detail, from: d.before, to: after, id: saved?.id || null };
      res.decisions.push(view);
      if (saved) out.recorded++;
      if (view.applied) out.applied++; else if (kind !== 'hold' && !error) out.would++; else if (error) out.failed++;
    }
  }
  return out;
}

// ---- Reverse: a person presses it. It puts the earlier value back, through the write gate, and says no if the value has been changed again since.
export const REVERSIBLE = ['raise_budget', 'turn_off', 'pause_ad'];
export const canReverse = a => REVERSIBLE.includes(a.kind) && !a.dry_run && !a.after?.failed && !!a.reverse_to && !a.reversed_at;
export async function reverseAction(actionId, who, campaignId) {
  const a = await getRow('actions', actionId);
  if (!a || (campaignId && a.campaign_id !== campaignId)) return { ok: false, status: 404, error: 'No such change.' };
  if (!REVERSIBLE.includes(a.kind) || !a.reverse_to) return { ok: false, status: 409, error: 'That entry is not a change, so there is nothing to reverse.' };
  if (a.dry_run) return { ok: false, status: 409, error: 'That was a dry run: nothing was changed in Meta, so there is nothing to reverse.' };
  if (a.after?.failed) return { ok: false, status: 409, error: 'That change did not go through, so there is nothing to reverse.' };
  if (a.reversed_at) return { ok: true, already: true, message: `Already reversed${a.reversed_by ? ` by ${a.reversed_by}` : ''}. Nothing more was done.` };
  const set = await getRow('adsets', a.adset_id), ad = a.ad_id ? await getRow('ads', a.ad_id) : null, target = ad || set;
  if (!set || !target) return { ok: false, status: 404, error: 'The ad set or ad is no longer here.' };
  const budget = a.kind === 'raise_budget', metaId = ad ? ad.meta_ad_id : set.meta_adset_id;
  // Has it been changed again since? Ops' own record first, then Meta itself when the switch is live.
  const again = (what, now) => ({ ok: false, status: 409, error: `${what} has been changed again since (it is now ${now}), so reversing this one would undo a later change. Nothing was done.` });
  if (budget && set.daily_budget_cents !== a.after.daily_budget_cents) return again('The budget', usd(set.daily_budget_cents));
  if (!budget && target.status !== 'off') return again(ad ? 'The ad' : 'The ad set', 'on');
  if (isLive() && hasToken()) {
    const seen = await getObject(metaId);
    if (!seen.ok) return { ok: false, status: 502, error: `Ops couldn’t check Meta first (${seen.error}). Nothing was done.` };
    if (budget && Number(seen.daily_budget) !== a.after.daily_budget_cents) return again('The budget in Meta', usd(Number(seen.daily_budget)));
    if (!budget && seen.status !== 'PAUSED') return again(ad ? 'The ad in Meta' : 'The ad set in Meta', 'on');
  }
  if (!isLive()) return { ok: true, dryRun: true, message: 'Dry run — nothing was sent to Meta. The safety switch is off, so nothing was changed.' };
  const claimed = await claimReversal(a.id, who);
  if (!claimed) return { ok: true, already: true, message: 'Already reversed. Nothing more was done.' };
  const r = budget ? await setBudget(metaId, { dailyBudgetCents: a.reverse_to.daily_budget_cents }) : await setStatus(metaId, 'ACTIVE');
  if (!r.ok) { await releaseReversal(a.id); return { ok: false, status: 502, error: `Meta said no (${r.error}). Nothing was changed.` }; }
  if (budget) await updateRow('adsets', set.id, { daily_budget_cents: a.reverse_to.daily_budget_cents });
  else if (ad) await updateRow('ads', ad.id, { status: 'live' }); else await updateRow('adsets', set.id, { status: 'live' });
  const what = budget ? `the daily budget is back to ${usd(a.reverse_to.daily_budget_cents)}` : `${ad ? ad.name : 'the ad set'} is back on`;
  await createRow('actions', { campaign_id: a.campaign_id, adset_id: a.adset_id, ad_id: a.ad_id, kind: 'reverse', by: who, dry_run: false, detail: `${who} reversed a change: ${what}.`, before: a.after, after: a.before });
  return { ok: true, message: `Reversed: ${what}.` };
}
