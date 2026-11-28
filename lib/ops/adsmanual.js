// Ads › Campaigns › "In your Meta account": the hands-on buttons for campaigns that were NOT made in Ops (made in Ads Manager or by Make's Ad Agent).
// Pause, Resume, "+20%" and an exact daily budget, and Reverse. A person presses; nothing here runs by itself and there are NO automatic rules for these campaigns.
//
// Every change goes through the one write gate in meta-ads.js (setStatus / setBudget): without META_ADS_LIVE=live the press is only RECORDED and Meta is not changed.
// Before acting, Meta is read again. If the campaign is not as the page showed it (paused or started, a budget moved) nothing is done and the person is told why.
// Where the budget lives is decided from Meta's own answer (budgetPlan in adsaccountmath.js): on the campaign when it has a daily budget of its own, otherwise on its
// running ad sets (each one changes, and the page says so); a lifetime budget or no daily budget means Pause and Resume only. A budget is never raised above the
// $60 a day ceiling Ops uses for one ad set; lowering is always allowed. Copy, audiences and creative are never touched.
//
// History: one row in ads_actions per press (kind meta_pause, meta_resume, meta_budget), keyed by the campaign's Meta id (it has no row in ads_campaigns), with what it
// changed FROM and TO and what Reverse puts back. Reverse is the same mechanism as the morning rules' (claimReversal), and it refuses if Meta has changed again since.
import { hasToken, isLive, setStatus, setBudget, getCampaignNow, listCampaignAdSets } from './meta-ads.js';
import { peekRows, createRow, getRow, claimReversal, releaseReversal, peekMetaActions } from './adsstore.js';
import { budgetPlan, raised, shareOut, totalOf, overCeiling, underMinimum, parseDollars, dollars, RAISE_PCT, SET_CEILING_CENTS, MIN_DAILY_CENTS } from './adsaccountmath.js';
import { noteChange } from './adsaccount.js';

const KINDS = { pause: 'meta_pause', resume: 'meta_resume', raise: 'meta_budget', set: 'meta_budget' };
const fail = (status, error) => ({ ok: false, status, error });
const ID = /^[A-Za-z0-9_]{3,40}$/;   // a Meta id: nothing that could change the address it is put in
const HOLD = 'Nothing was changed.';
const same = (a, b) => a.length === b.length && a.every(x => b.some(y => y.id === x.id && y.cents === x.cents));
const word = s => ({ ACTIVE: 'running', PAUSED: 'paused', ARCHIVED: 'archived', DELETED: 'deleted' }[s] || String(s || 'unknown').toLowerCase());

// The campaign as Meta has it right now: its status and where its budget is. Refuses anything that is not a campaign in this ad account, or that Ops made itself.
async function lookNow(id) {
  if (!hasToken()) return fail(503, 'Meta isn’t connected yet, so nothing can be changed. ' + HOLD);
  if (!ID.test(String(id || ''))) return fail(400, 'That doesn’t look like a campaign.');
  const c = await getCampaignNow(id);
  if (!c.ok) return fail(502, `Ops couldn’t check Meta first (${c.error}). ${HOLD}`);
  const acct = (process.env.META_AD_ACCOUNT_ID || '').trim().replace(/^act_/, '');
  if (!c.objective || !acct || String(c.account_id || '') !== acct) return fail(404, 'That isn’t a campaign in your ad account. ' + HOLD);
  let made = [];
  try { made = await peekRows('campaigns', { meta_campaign_id: String(id) }, { limit: 1 }); } catch { /* no Ads database yet: nothing was made in Ops */ }
  if (made.length) return fail(409, `“${c.name}” was made in Ops, so it is paused, started and changed from its own page (Ads, then Campaigns). ${HOLD}`);
  const sets = await listCampaignAdSets(id);
  const plan = budgetPlan(c, sets.ok ? sets.data || [] : null);
  return { ok: true, c, plan, name: c.name || 'the campaign', status: c.status };
}

const unitsOf = plan => plan.units.map(u => ({ id: u.id, cents: u.cents }));
// Is it still as the page showed it? (status for Pause and Resume; the budgets too for a budget change)
function conflict(now, seen, budget) {
  if (!seen || typeof seen !== 'object') return fail(409, `Ops can’t tell what ${now.name} looked like when you opened the page, so it won’t guess. Press Refresh and try again. ${HOLD}`);
  if (seen.status !== now.status) return fail(409, `“${now.name}” has been changed in Meta since you opened this page (it is now ${word(now.status)}). Press Refresh to see it as it is, then try again. ${HOLD}`);
  if (budget && !same(unitsOf(now.plan), Array.isArray(seen.units) ? seen.units.map(u => ({ id: String(u.id), cents: Number(u.cents) })) : [])) return fail(409, `The daily budget of “${now.name}” has been changed in Meta since you opened this page (it is now ${dollars(totalOf(now.plan.units))} a day). Press Refresh to see it as it is, then try again. ${HOLD}`);
  return null;
}

// One press. what: 'pause' | 'resume' | 'raise' | 'set' (dollars is the exact amount for 'set'); seen is what the page showed. who = the person's name.
export async function actOnCampaign({ id, what, dollars: typed, seen, who }) {
  if (!KINDS[what]) return fail(400, 'Unknown request');
  const now = await lookNow(id); if (!now.ok) return now;
  const budget = what === 'raise' || what === 'set', name = `“${now.name}”`;
  if (['ARCHIVED', 'DELETED'].includes(now.status)) return fail(409, `${name} is ${word(now.status)} in Meta, so there is nothing to change. ${HOLD}`);
  const clash = conflict(now, seen, budget); if (clash) return clash;
  if (what === 'pause' && now.status !== 'ACTIVE') return fail(409, `${name} isn’t running (it is ${word(now.status)}), so there is nothing to pause. ${HOLD}`);
  if (what === 'resume' && now.status !== 'PAUSED') return fail(409, `${name} isn’t paused (it is ${word(now.status)}), so there is nothing to resume. ${HOLD}`);

  let units = [], from, to, sentence, done;
  if (budget) {
    if (now.plan.mode === 'none') return fail(409, `${now.plan.why} ${HOLD}`);
    if (what === 'raise') units = raised(now.plan.units);
    else {
      const cents = parseDollars(typed);
      if (cents == null) return fail(400, 'Enter the new daily budget in dollars, like 40 or 40.50.');
      if (cents < MIN_DAILY_CENTS) return fail(400, `The smallest daily budget is ${dollars(MIN_DAILY_CENTS)}.`);
      if (cents === totalOf(now.plan.units)) return fail(409, `${name} already has a daily budget of ${dollars(cents)}. ${HOLD}`);
      units = shareOut(now.plan.units, cents);
    }
    const low = underMinimum(units); if (low) return fail(400, `That would leave ${low.name} with less than ${dollars(MIN_DAILY_CENTS)} a day. ${HOLD}`);
    const over = overCeiling(units);
    if (over) return fail(409, `${now.plan.mode === 'adsets' ? `${over.name} would go from ${dollars(over.cents)} to ${dollars(over.to)} a day` : `${name} would go from ${dollars(over.cents)} to ${dollars(over.to)} a day`}, which is above the ${dollars(SET_CEILING_CENTS)} a day ceiling Ops keeps for one budget. ${HOLD}`);
    if (what === 'raise' && units.every(u => u.to === u.cents)) return fail(409, `${RAISE_PCT}% more would not change ${name}’s budget. ${HOLD}`);
    from = { daily: now.plan.units.map(u => ({ id: u.id, name: u.name, cents: u.cents })), where: now.plan.mode };
    to = { daily: units.map(u => ({ id: u.id, name: u.name, cents: u.to })), where: now.plan.mode };
    const t0 = totalOf(now.plan.units), t1 = totalOf(units.map(u => ({ cents: u.to })));
    const spread = now.plan.mode === 'adsets' ? ` on its ${units.length} running ad set${units.length === 1 ? '' : 's'}` : '';
    sentence = `the daily budget of ${name}${spread} ${what === 'raise' ? `goes up ${RAISE_PCT}%` : 'is set'}: ${dollars(t0)} → ${dollars(t1)} a day`;
    done = `${what === 'raise' ? `Raised ${RAISE_PCT}%` : 'Set'}: the daily budget of ${name}${spread} is now ${dollars(t1)} a day (it was ${dollars(t0)}).`;
  } else {
    from = { status: now.status }; to = { status: what === 'pause' ? 'PAUSED' : 'ACTIVE' };
    sentence = what === 'pause' ? `${name} is paused` : `${name} is started again`;
    done = what === 'pause' ? `Paused ${name}. Meta will stop spending on it; nothing else about it was touched.` : `Resumed ${name}. Meta will start spending on it again; nothing else about it was touched.`;
  }

  // The change itself, through the write gate. A budget on several ad sets goes one at a time; if one is refused the ones already done are put back.
  const applied = [];
  let dry = false, problem = '';
  for (const u of budget ? units : [null]) {
    const r = budget ? await setBudget(u.id, { dailyBudgetCents: u.to }) : await setStatus(id, to.status);
    if (!r.ok) { problem = r.error; break; }
    if (r.dryRun) dry = true; else applied.push(u);
  }
  if (problem) {
    for (const u of applied) await setBudget(u.id, { dailyBudgetCents: u.cents });
    await record({ id, kind: KINDS[what], who, dry: true, detail: `Tried to ${what === 'pause' ? 'pause' : what === 'resume' ? 'resume' : 'change the budget of'} ${name}, but Meta said no (${problem}). ${HOLD}`, from, to: { ...to, failed: true }, reverse: null }).catch(() => {});
    return fail(502, `Meta said no (${problem}). ${applied.length ? 'What had already changed was put back. ' : ''}${HOLD}`);
  }
  const detail = dry ? `Recorded only (live changes are off): ${sentence}.` : `${sentence[0].toUpperCase()}${sentence.slice(1)}.`;
  let saved = null;
  try { saved = await record({ id, kind: KINDS[what], who, dry, detail, from, to, reverse: dry ? null : from }); }
  catch (e) {
    console.error('Ads: could not record a change to a campaign made in Meta', String(e.message || e).slice(0, 120));
    if (dry) return fail(502, `Ops couldn’t write this down, so it did nothing. Try again in a moment. ${HOLD}`);
  }
  if (!dry) noteChange(id, budget ? { units } : { status: to.status });
  return dry
    ? { ok: true, dryRun: true, message: `Recorded only: Meta wasn’t changed because live changes are off. With live changes on, ${sentence}.` }
    : { ok: true, dryRun: false, message: saved ? done : `${done} (It could not be written to the list of changes, so it has no Reverse button. Tell Jacob.)`, action_id: saved?.id || null };
}

const record = ({ id, kind, who, dry, detail, from, to, reverse }) =>
  createRow('actions', { campaign_id: id, kind, by: who, dry_run: dry, detail, before: from, after: to, ...(reverse ? { reverse_to: reverse } : {}) });

// ---- What the page shows under the table: the changes made with these buttons in the last two weeks
const canReverseMeta = a => ['meta_pause', 'meta_resume', 'meta_budget'].includes(a.kind) && !a.dry_run && !a.after?.failed && !!a.reverse_to && !a.reversed_at;
export async function listChanges(now = new Date()) {
  const rows = await peekMetaActions(new Date(now - 14 * 86400e3).toISOString(), 40);
  return rows.map(a => ({ id: a.id, at: a.at, by: a.by, kind: a.kind, detail: a.detail, dry_run: !!a.dry_run, failed: !!a.after?.failed, reversed: !!a.reversed_at, reversed_by: a.reversed_by || '', can_reverse: canReverseMeta(a) }));
}

// ---- Reverse: puts the earlier value back, through the write gate, and says no if Meta has changed again since
export async function reverseChange({ actionId, who }) {
  const a = await getRow('actions', String(actionId || '')).catch(() => null);
  if (!a || String(a.campaign_id).startsWith('cmp_') || !['meta_pause', 'meta_resume', 'meta_budget'].includes(a.kind)) return fail(404, 'No such change.');
  if (a.dry_run) return fail(409, 'That was only recorded: nothing was changed in Meta, so there is nothing to reverse.');
  if (a.after?.failed || !a.reverse_to) return fail(409, 'That change did not go through, so there is nothing to reverse.');
  if (a.reversed_at) return { ok: true, already: true, message: `Already reversed${a.reversed_by ? ` by ${a.reversed_by}` : ''}. Nothing more was done.` };
  const now = await lookNow(a.campaign_id); if (!now.ok) return now;
  const status = !!a.after.status, again = what => fail(409, `${what} has been changed again since (it is now ${status ? word(now.status) : dollars(totalOf(now.plan.units)) + ' a day'}), so reversing this one would undo a later change. ${HOLD}`);
  if (status ? now.status !== a.after.status : !same(unitsOf(now.plan), (a.after.daily || []).map(u => ({ id: u.id, cents: u.cents })))) return again(status ? `“${now.name}”` : `The budget of “${now.name}”`);
  if (!isLive()) return { ok: true, dryRun: true, message: 'Recorded only: Meta wasn’t changed because live changes are off.' };
  const claimed = await claimReversal(a.id, who);
  if (!claimed) return { ok: true, already: true, message: 'Already reversed. Nothing more was done.' };
  const back = status ? [null] : a.reverse_to.daily, done = [];
  for (const u of back) {
    const r = status ? await setStatus(a.campaign_id, a.reverse_to.status) : await setBudget(u.id, { dailyBudgetCents: u.cents });
    if (!r.ok) {
      for (const d of done) await setBudget(d.id, { dailyBudgetCents: a.after.daily.find(x => x.id === d.id).cents });
      await releaseReversal(a.id);
      return fail(502, `Meta said no (${r.error}). ${HOLD}`);
    }
    done.push(u);
  }
  const text = status ? `“${now.name}” is ${a.reverse_to.status === 'ACTIVE' ? 'running again' : 'paused again'}` : `the daily budget of “${now.name}” is back to ${dollars(totalOf(a.reverse_to.daily))} a day`;
  await createRow('actions', { campaign_id: a.campaign_id, kind: 'reverse', by: who, dry_run: false, detail: `${who} reversed a change: ${text}.`, before: a.after, after: a.before }).catch(() => {});
  noteChange(a.campaign_id, status ? { status: a.reverse_to.status } : { units: a.reverse_to.daily.map(u => ({ id: u.id, to: u.cents })) });
  return { ok: true, message: `Reversed: ${text}.` };
}
