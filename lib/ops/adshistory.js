// Ads › What we've learned: reading the HISTORY of the ads already run in the real Meta account, and keeping what it shows. READ ONLY: every Meta call here is one of the client's read functions
// (never the write gate), and nothing is created, changed or paused anywhere. It keeps its own notes in the dashboard's database (ads_history_* tables, made only the first time something is saved).
//
// HOW THE HISTORY IS READ, AND RESUMED. The account's first campaign sets where the history starts (never further back than Meta keeps ad results, about three years). The history is cut into
// whole weeks (Monday to Sunday). Each run reads at most MAX_WEEKS_PER_RUN weeks, newest first, one Meta request (paged) per week, and stops at once when Meta says "too many requests" or the time
// budget is used up. Every finished week is saved before the next one starts, so the next run (the hourly job, or "Read the history now") carries on from the first week not yet done. Failed weeks are tried
// again up to three times. Once everything is read, the most recent four weeks are read again about once a day, because Meta's own numbers for a week keep moving for a while.
//
// IT ALWAYS MAKES PROGRESS, EVEN ON A VERY BIG ACCOUNT. A run has one overall deadline (80 seconds, well inside the 120 the server allows) and every step respects what is left of it: the campaign list, the ad sets, the ads and
// each week's results. Nothing waits until everything is read: the ads are read in small chunks (a page or two) and each chunk is saved at once, with the place to carry on from (Meta's `after` cursor) kept in the notes,
// so a run that is cut off loses at most one chunk and the next run (the hourly job or the button) picks up exactly there. Order: the ad sets first (only the kind of audience and the daily budget of each is kept,
// in ads_history_adsets: thousands of rows do not belong in the one-row notes), then the ads; while that is unfinished a run still gives the weeks about 40% of its time. A week is read page by page the same way: its
// pages are saved as they come but the week is only marked done when its last page is in; a week that did not finish is "partly read" and the next run carries on from its cursor.
//
// WHAT IS KEPT: per ad and week, spend, results, clicks and impressions; per ad, its name, its campaign's and ad set's names, and MEASURES of its creative (picture or video, how long its words were, the kind of
// headline, the button, the season it began, its budget size, the kind of audience). Never a person, never the words of an ad.
import { hasToken, adsMode, listAllCampaignsForHistory, listAllAdSetsForHistory, listAllAdsWithCreatives, getAdInsightsForRange, managerUrl, RATE_LIMIT_CODES } from './meta-ads.js';
import { adsQuery } from './adsdb.js';
import { ensureAdsTables, adsTablesExist, peekRows, createRow, updateRow, deleteRow } from './adsstore.js';
import { ask, keyIsSet } from './adsask.js';
import { classify } from './adsaccount.js';
import { nyDate, addDays } from './adssync.js';
import { mondayOf, quotedNumbers } from './insightsverify.js';
import { adFeatures, audienceKind, analyse, statusFor, verifyFinding, STATUS_TEXT, RELIABILITY_TEXT, TARGET, ENOUGH, EARLY } from './adslearned.js';

const MAX_WEEKS_PER_RUN = 8, MAX_WEEKS_BACK = 156, RUN_BUDGET_MS = 80000, GUARD_MS = 105000, STRUCTURE_SHARE = 0.6, CHUNK_PAGES = 2, ADS_PER_PAGE = 100, MAX_TRIES = 3, FRESH_HOURS = 20, RECENT_DAYS = 28, STATE_KEY = 'history_state';
const day10 = v => (v instanceof Date ? v.toISOString() : String(v || '')).slice(0, 10);   // a date column comes back as a Date or as text, depending on the database
const HOUR = 3600e3;
// The time one run may use, and the moment the server stops waiting for it and answers anyway. Tests shorten both with ADS_HISTORY_BUDGET_MS / ADS_HISTORY_GUARD_MS (never set in production).
export const runBudgetMs = () => Number(process.env.ADS_HISTORY_BUDGET_MS) || RUN_BUDGET_MS;
export const guardMs = () => Number(process.env.ADS_HISTORY_GUARD_MS) || GUARD_MS;
// Why something failed, in words staff can pass on: the first part of what went wrong, with anything that looks like a key, token or address taken out.
export const reasonOf = e => String(e?.message || e || '').replace(/https?:\/\/\S+/g, '(address)').replace(/\b[A-Za-z0-9_\-]{24,}\b/g, '(code)').replace(/\s+/g, ' ').trim().slice(0, 140);
const num = n => Number(n || 0).toLocaleString('en-US');
const monthYear = d => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' });
const NOT_CONNECTED = 'Meta isn’t connected yet: add the ads access key (META_ADS_TOKEN) and the ad account in Vercel. Settings › Connections and jobs shows what is missing.';
const PROBLEM = {
  rate_limit: 'Meta asked us to slow down (too many requests). The rest is read automatically in the next hour or so.',
  permission: 'Meta didn’t accept the ads access key. It may have expired, or it may not be allowed to read ads.',
  timeout: 'Meta took too long to answer. The next run will try again.',
  network: 'Couldn’t reach Meta (a network problem). The next run will try again.',
  other: 'Meta answered with an error. The next run will try again.',
};

// ---- The weeks (pure)
export function weekList(from, to) { const out = []; for (let w = from; w <= to; w = addDays(w, 7)) out.push(w); return out; }
// The weeks to read: from the Monday of the account's first campaign (not before MAX_WEEKS_BACK weeks ago) to the last whole week.
export function planFor(earliest, today) {
  if (!earliest) return null;
  const lastMonday = mondayOf(today), to = addDays(lastMonday, -7), floor = addDays(lastMonday, -7 * MAX_WEEKS_BACK), from = mondayOf(earliest) > floor ? mondayOf(earliest) : floor;
  return from > to ? null : { from, to, total: weekList(from, to).length };
}
// Which weeks still need reading: never read, failed fewer than MAX_TRIES times, or (done, recent, and not read for FRESH_HOURS). newest first
export function pendingWeeks(plan, rows, today, nowMs) {
  const by = new Map(rows.map(r => [r.week_start, r])), todo = [];
  for (const w of weekList(plan.from, plan.to).reverse()) {
    const r = by.get(w);
    if (!r) todo.push({ week: w, fresh: true });
    else if (r.status === 'failed' && r.attempts < MAX_TRIES) todo.push({ week: w, fresh: true });
    else if (r.status === 'done' && addDays(w, 6) >= addDays(today, -RECENT_DAYS) && nowMs - Date.parse(r.read_at || 0) > FRESH_HOURS * HOUR) todo.push({ week: w, fresh: false });
  }
  return todo;
}
// How many weeks are finished (read, or given up after MAX_TRIES) out of the plan
export function progressOf(plan, rows) {
  if (!plan) return { done: 0, total: 0, gave_up: 0, left: 0 };
  const inPlan = new Set(weekList(plan.from, plan.to)), done = rows.filter(r => inPlan.has(r.week_start) && r.status === 'done').length, gave = rows.filter(r => inPlan.has(r.week_start) && r.status === 'failed' && r.attempts >= MAX_TRIES).length;
  return { done, total: plan.total, gave_up: gave, left: plan.total - done - gave };
}

// ---- The notes this feature keeps
// structure: while the ad sets and ads are being read, where it got to ({ stage: 'adsets' | 'ads', after: Meta's cursor, sets, ads, limit }); null when it is not part-way. partial: the week that is part-way ({ week, after, rows }).
// earliest: the first campaign's date, known once the whole campaign list has been read. ads_total: how many ads the last complete read found. dirty: something new was read that the statements have not been made from yet.
const DEFAULT_STATE = { plan: null, structure_at: '', structure: null, partial: null, earliest: '', ads_total: 0, dirty: false, last_run_at: '', read_no: 0, analysed_at: '', analysis: null, phrasing: '', rate_limited_at: '', note: '', problem: '' };
async function readState() {
  try { const r = (await peekRows('settings', { key: STATE_KEY }, { limit: 1 }))[0]; return r ? { id: r.id, ...DEFAULT_STATE, ...r.value } : { ...DEFAULT_STATE }; } catch { return { ...DEFAULT_STATE }; }
}
async function saveState(st) {
  const { id, ...value } = st;
  if (id) await updateRow('settings', id, { value }); else { const r = await createRow('settings', { key: STATE_KEY, value, updated_by: 'history' }); st.id = r.id; }
}
const weeksRows = () => peekRows('history_weeks', {}, { limit: 2000 });

// ---- Saving (bulk SQL; the tables are made by ensureAdsTables, which only runs when something is about to be saved)
const uid = p => `${p}_${globalThis.crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
async function bulk(table, cols, rows, conflict, update) {
  for (let i = 0; i < rows.length; i += 100) {
    const part = rows.slice(i, i + 100), params = [];
    const values = part.map(r => { const p = [uid('h'), ...cols.map(c => r[c.n])]; const at = params.length; params.push(...p); return `(${p.map((_, k) => `$${at + k + 1}${k > 0 && cols[k - 1].json ? '::jsonb' : ''}`).join(', ')})`; });
    await adsQuery(`INSERT INTO ${table} (id, ${cols.map(c => `"${c.n}"`).join(', ')}) VALUES ${values.join(', ')} ON CONFLICT (${conflict}) DO UPDATE SET ${update.map(c => `"${c}" = EXCLUDED."${c}"`).join(', ')}, updated_at = now()`, params);
  }
}
const AD_COLS = [{ n: 'ad_id' }, { n: 'name' }, { n: 'campaign_id' }, { n: 'campaign_name' }, { n: 'adset_id' }, { n: 'adset_name' }, { n: 'objective' }, { n: 'features', json: true }];
const saveAds = rows => bulk('ads_history_ads', AD_COLS, rows.map(r => ({ ...r, features: JSON.stringify(r.features) })), 'ad_id', AD_COLS.slice(1).map(c => c.n));
const RES_COLS = ['week_start', 'ad_id', 'campaign_id', 'adset_id', 'spend_cents', 'impressions', 'clicks', 'purchases', 'revenue_cents', 'leads'].map(n => ({ n }));
// Pages of a week are saved as they come (the same ad twice is the same row, so reading a page again is harmless)
const saveWeekRows = (week, rows) => bulk('ads_history_results', RES_COLS, rows.map(r => ({ week_start: week, ad_id: r.ad_id, campaign_id: r.campaign_id || '', adset_id: r.adset_id || '', spend_cents: r.spend_cents, impressions: r.impressions, clicks: r.clicks, purchases: Math.round(r.purchases), revenue_cents: r.revenue_cents, leads: Math.round(r.leads) })), 'week_start, ad_id', RES_COLS.slice(2).map(c => c.n));
const clearWeek = week => adsQuery('DELETE FROM ads_history_results WHERE week_start = $1', [week]);
async function saveWeek(week, rows) { await clearWeek(week); await saveWeekRows(week, rows); }
const SET_COLS = [{ n: 'adset_id' }, { n: 'name' }, { n: 'campaign_id' }, { n: 'audience' }, { n: 'daily_cents' }];
const saveAdSets = sets => bulk('ads_history_adsets', SET_COLS, sets.map(a => ({ adset_id: a.id, name: a.name || '', campaign_id: a.campaign_id || '', audience: audienceKind(a.targeting, a.name), daily_cents: Number(a.daily_budget) || 0 })), 'adset_id', SET_COLS.slice(1).map(c => c.n));
async function markWeek(known, week, patch) {
  const r = known.get(week), data = { status: 'done', ad_rows: 0, spend_cents: 0, note: '', ...patch, read_at: new Date().toISOString() };
  if (r) { const row = await updateRow('history_weeks', r.id, data); known.set(week, row); } else known.set(week, await createRow('history_weeks', { week_start: week, ...data }));
}

// ---- What Meta says about the ads: the ads themselves, with the kind of audience, budget and creative each one had
export function buildAds({ campaigns, adsets, ads }) {
  const camp = new Map(campaigns.map(c => [c.id, c])), set = new Map(adsets.map(a => [a.id, a]));
  return ads.map(a => {
    const c = camp.get(a.campaign_id), s = set.get(a.adset_id);
    return { ad_id: a.id, name: a.name || 'Unnamed ad', campaign_id: a.campaign_id || '', campaign_name: c?.name || '', adset_id: a.adset_id || '', adset_name: s?.name || '', objective: c?.objective || '', features: adFeatures({ ad: a, adset: s, campaign: c }) };
  });
}
// Reads the ad sets and then the ads, a chunk (a page or two) at a time, saving each chunk and the cursor at once. Stops when the clock reaches `deadline` or Meta refuses; the next call carries on from state.structure.
// Answers { done } when everything has been read, or { problem } (a failed Meta answer) when it had to stop.
const shrink = (st, r) => { if (!(r.timeout || r.code === 1) || st.limit <= 10) return false; st.limit = Math.max(10, Math.floor(st.limit / 2)); return true; };   // a page that is too heavy for Meta: ask for fewer at a time
const SETS_FAILED = 'The audiences and budgets couldn’t be read this time, so ads are not grouped by them yet.';
async function readStructure(state, camp, { deadline, now }) {
  const st = state.structure ||= { stage: 'adsets', after: '', sets: 0, ads: 0, limit: ADS_PER_PAGE, sets_failed: false }, res = { done: false, problem: null }, campaigns = [...camp.values()];
  await ensureAdsTables();
  let tries = 0, restarted = false;
  while (deadline - Date.now() > 300) {
    const stage = st.stage, r = stage === 'adsets'
      ? await listAllAdSetsForHistory({ deadline, after: st.after || undefined, pages: CHUNK_PAGES, limit: st.limit })
      : await listAllAdsWithCreatives({ deadline, after: st.after || undefined, pages: CHUNK_PAGES, limit: st.limit });
    if (!r.ok) {
      if (shrink(st, r) && ++tries < 4) continue;
      const c = classify(r);
      if (st.after && !restarted && c !== 'rate_limit' && c !== 'permission') { restarted = true; st.after = ''; if (stage === 'adsets') st.sets = 0; else st.ads = 0; await saveState(state); continue; }   // the saved place may have gone stale: read this list again from its start (saving it again is harmless)
      if (stage === 'adsets' && c !== 'rate_limit' && c !== 'permission') { st.sets_failed = true; st.stage = 'ads'; st.after = ''; await saveState(state); continue; }   // without the audiences the ads can still be read
      res.problem = r; break;
    }
    tries = 0;
    if (stage === 'adsets') { if (r.data.length) await saveAdSets(r.data); st.sets += r.data.length; }
    else {
      const ids = [...new Set(r.data.map(a => a.adset_id).filter(Boolean))];
      const have = ids.length ? await adsQuery('SELECT adset_id AS id, name, audience, daily_cents AS daily_budget FROM ads_history_adsets WHERE adset_id = ANY($1)', [ids]) : [];
      if (r.data.length) await saveAds(buildAds({ campaigns, adsets: have, ads: r.data }));
      st.ads += r.data.length;
    }
    st.after = r.more ? r.after || '' : '';
    if (!r.more) { if (stage === 'adsets') st.stage = 'ads'; else { state.structure_at = now.toISOString(); state.ads_total = st.ads; state.structure_notes = st.sets_failed ? [SETS_FAILED] : []; state.structure = null; state.problem = ''; res.done = true; } }
    await saveState(state);
    if (res.done) break;
  }
  return res;
}
// What the page and the run say about the ads read so far, in plain words
const structureNote = (st, total) => st.stage === 'ads' ? `Read ${num(st.ads)}${total ? ` of about ${num(total)}` : ''} ads so far; the next hourly run continues.` : `Read ${num(st.sets)} ad sets so far (the ads come next); the next hourly run continues.`;
// An ad that has results but is not in the account's list any more (it was deleted): kept as a nameless row so its money is still counted, grouped by its campaign
async function addMissingAds(weekRows, camp) {
  const ids = [...new Set(weekRows.map(r => r.ad_id).filter(Boolean))];
  if (!ids.length) return;
  const have = new Set((await adsQuery('SELECT ad_id FROM ads_history_ads WHERE ad_id = ANY($1)', [ids])).map(r => r.ad_id));
  const miss = weekRows.filter(r => r.ad_id && !have.has(r.ad_id)), seen = new Set(), out = [];
  for (const r of miss) { if (seen.has(r.ad_id)) continue; seen.add(r.ad_id); const c = camp.get(r.campaign_id); out.push({ ad_id: r.ad_id, name: 'An ad that is no longer in the account', campaign_id: r.campaign_id || '', campaign_name: c?.name || '', adset_id: r.adset_id || '', adset_name: '', objective: c?.objective || '', features: adFeatures({ ad: {}, campaign: c, firstWeek: r.date }) }); }
  if (out.length) await saveAds(out);
}

// Ads that have results but are not in the saved list at all: once the whole ads list has been read these are the ones that no longer exist
const orphanRows = async () => (await adsQuery('SELECT r.ad_id, MIN(r.campaign_id) AS campaign_id, MIN(r.adset_id) AS adset_id, MIN(r.week_start) AS week_start FROM ads_history_results r LEFT JOIN ads_history_ads a ON a.ad_id = r.ad_id WHERE a.ad_id IS NULL GROUP BY r.ad_id')).map(r => ({ ...r, date: day10(r.week_start) }));

// ---- The run
// preview: reads one thing from Meta (the campaign list, to size the history) and says what it would do; keeps nothing and makes no table.
// live: an object the run fills in as it goes, so a caller that has to stop waiting (the route's time guard) can still say what was done so far.
const weekText = w => new Date(`${w}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
export async function runHistory({ preview = false, maxWeeks = MAX_WEEKS_PER_RUN, now = new Date(), budgetMs = runBudgetMs(), live = {} } = {}) {
  const out = Object.assign(live, { preview, notConnected: false, rate_limited: false, weeks: { read: 0, failed: 0, left: 0, total: 0 }, structure: false, structure_progress: null, partial: false, analysed: false, note: '', progress: '' });
  if (!hasToken() || adsMode() === 'not_connected') return { ...out, notConnected: true, note: NOT_CONNECTED };
  const started = Date.now(), deadline = started + budgetMs, left = () => deadline - Date.now(), today = nyDate(now), problem = r => { const c = classify(r); out.rate_limited = c === 'rate_limit'; out.note = PROBLEM[c] || PROBLEM.other; return out; };
  const camps = await listAllCampaignsForHistory({ deadline });
  if (!camps.ok) { problem(camps); if (!preview) await touch({ problem: out.note, ...(out.rate_limited ? { rate_limited_at: now.toISOString() } : {}) }, now); return out; }
  const exists = await adsTablesExist().catch(() => false), state = exists ? await readState() : { ...DEFAULT_STATE };
  // Only a complete campaign list says when the account's first campaign was; a part-read one can only make that earlier, never settle it
  const seen = camps.data.map(c => String(c.created_time || '').slice(0, 10)).filter(Boolean).sort()[0] || '', whole = !camps.more;
  const earliest = whole ? seen : state.earliest && seen ? (seen < state.earliest ? seen : state.earliest) : state.earliest;
  const plan = planFor(earliest, today);
  if (!plan) return { ...out, note: whole ? 'There are no finished weeks of ads to read yet.' : 'The list of campaigns is long and wasn’t all read this time; the next run tries again.' };
  const known = new Map((exists ? await weeksRows() : []).map(r => [r.week_start, r]));
  const todo = pendingWeeks(plan, [...known.values()], today, now.getTime()), progress = progressOf(plan, [...known.values()]);
  out.weeks = { ...out.weeks, total: plan.total, left: progress.left, done: progress.done };
  if (preview) return { ...out, note: todo.length ? `Would read up to ${Math.min(todo.length, maxWeeks)} of the ${todo.length} weeks that still need it.` : 'Everything is read and fresh.' };

  const camp = new Map(camps.data.map(c => [c.id, c])), parts = [], save = async () => { await ensureAdsTables(); await saveState(state); };
  let changed = false, halt = false;
  if (whole && state.earliest !== earliest) { state.earliest = earliest; }
  // 1. The ads and their ad sets, a chunk at a time. While this is unfinished it takes at most 60% of what is left, so the weeks get a share too.
  const stale = !state.structure_at || now.getTime() - Date.parse(state.structure_at) > FRESH_HOURS * HOUR;
  if (whole && (state.structure || (todo.length && stale))) {
    const s = await readStructure(state, camp, { deadline: todo.length ? Date.now() + left() * STRUCTURE_SHARE : deadline, now });
    if (s.done) { out.structure = true; changed = true; await addMissingAds(await orphanRows(), camp); }
    if (s.problem) {
      problem(s.problem); state.problem = out.note; if (out.rate_limited) state.rate_limited_at = now.toISOString();
      halt = out.rate_limited || classify(s.problem) === 'permission';   // a key that may not read, or "too many requests": the weeks would fail the same way
    }
    if (state.structure) { out.structure_progress = { stage: state.structure.stage, sets: state.structure.sets, ads: state.structure.ads, total: state.ads_total || 0 }; parts.push(structureNote(state.structure, state.ads_total)); }
  }
  // 2. The weeks, newest first. A week's pages are saved as they come; it is only marked done when its last page is in.
  const minWeek = Math.min(3000, budgetMs * 0.2);
  for (const { week, fresh } of todo.slice(0, maxWeeks)) {
    if (halt || left() < minWeek) break;
    const until = addDays(week, 6), resume = fresh && state.partial?.week === week ? state.partial : null;
    let after = resume?.after || '', got = resume?.rows || 0, more = false, fail = null, progressed = false; const acc = [];
    if (fresh && !resume) { await ensureAdsTables(); await clearWeek(week); }
    do {
      const r = await getAdInsightsForRange({ since: week, until, deadline, after: after || undefined, pages: CHUNK_PAGES });
      if (!r.ok) { fail = r; break; }
      const rows = r.rows.filter(x => x.ad_id && (x.spend_cents > 0 || x.purchases > 0 || x.leads > 0));
      if (fresh) { await ensureAdsTables(); if (!state.structure) await addMissingAds(rows, camp); await saveWeekRows(week, rows); } else acc.push(...rows);   // (while the ads are still being read, the ones not listed yet are not "missing": the orphans are sorted out when the list is complete)
      got += rows.length; after = r.after; more = r.more; progressed = true;
      if (fresh && more) { state.partial = { week, after, rows: got }; await save(); }
    } while (more && left() > 300);
    if (fail) {
      const c = classify(fail);
      if (c === 'rate_limit') { out.rate_limited = true; state.rate_limited_at = now.toISOString(); break; }
      if (resume && !progressed && c !== 'permission' && c !== 'not_connected') { state.partial = null; out.note = PROBLEM[c] || PROBLEM.other; break; }   // the saved place may have gone stale: the next run starts this week over
      state.partial = null;
      await ensureAdsTables(); await markWeek(known, week, { status: 'failed', attempts: (known.get(week)?.attempts || 0) + 1, note: PROBLEM[c] || PROBLEM.other });
      out.weeks.failed++; out.note = PROBLEM[c] || PROBLEM.other;
      if (c === 'permission' || c === 'not_connected') break;
      continue;
    }
    if (more) {   // the clock ran out part-way through this week
      out.partial = true;
      parts.push(fresh ? `Week ${weekList(plan.from, week).length} of ${plan.total} (from ${weekText(week)}) is partly read (${num(got)} ads so far); the next run continues it.` : `Refreshing the week from ${weekText(week)} didn’t finish this time; its earlier numbers stay.`);
      break;
    }
    let count = acc.length, spend = acc.reduce((n, x) => n + x.spend_cents, 0);
    await ensureAdsTables();
    if (fresh) { const t = (await adsQuery('SELECT COUNT(*) AS n, COALESCE(SUM(spend_cents), 0) AS s FROM ads_history_results WHERE week_start = $1', [week]))[0]; count = Number(t.n); spend = Number(t.s); }
    else { if (!state.structure) await addMissingAds(acc, camp); await saveWeek(week, acc); }
    state.partial = null;
    await markWeek(known, week, { status: 'done', ad_rows: count, spend_cents: spend, attempts: 0, note: '' });
    out.weeks.read++; changed = true;
  }
  const after = progressOf(plan, [...known.values()]);
  out.weeks.left = after.left; out.weeks.done = after.done;
  if (out.rate_limited) out.note = PROBLEM.rate_limit;
  out.progress = parts.join(' ');
  if (!out.note && out.progress) out.note = out.progress;
  if (changed || (!state.analysis && after.done > 0 && state.structure_at)) state.dirty = true;
  state.plan = plan; state.last_run_at = now.toISOString(); if (out.weeks.read) state.rate_limited_at = out.rate_limited ? state.rate_limited_at : '';
  state.note = out.rate_limited ? PROBLEM.rate_limit : out.note;
  await save();
  // The statements are re-made when something changed (and the ads are all known). While the first import is still going they are provisional (no "newer / still true" yet); once it is done each re-read counts.
  const importing = after.left > 0;
  if (state.dirty && state.structure_at && after.done > 0 && (!importing || state.read_no === 0)) { const a = await analyseAndSave(state, { importing, plan, now }); state.dirty = false; out.analysed = true; out.findings = a.findings; out.left_out = a.left_out; await save(); }
  return out;
}
// Something went wrong before any week was read: only noted if the notes already exist (nothing is made just to say "it failed")
async function touch(patch, now) {
  if (!(await adsTablesExist().catch(() => false))) return;
  const st = await readState(); await saveState({ ...st, ...patch, last_run_at: now.toISOString() });
}

// ---- Reading what is kept, studying it, saving the statements
async function loadAds() {
  const rows = await adsQuery(`SELECT a.ad_id, a.name, a.campaign_id, a.campaign_name, a.adset_name, a.features,
      COALESCE(SUM(r.spend_cents),0)::bigint AS spend_cents, COALESCE(SUM(r.revenue_cents),0)::bigint AS revenue_cents, COALESCE(SUM(r.purchases),0)::bigint AS purchases, COALESCE(SUM(r.leads),0)::bigint AS leads,
      MIN(r.week_start) AS first_week, MAX(r.week_start) AS last_week
    FROM ads_history_ads a LEFT JOIN ads_history_results r ON r.ad_id = a.ad_id GROUP BY a.ad_id, a.name, a.campaign_id, a.campaign_name, a.adset_name, a.features`);
  return rows.map(r => ({ ad_id: r.ad_id, name: r.name, campaign_id: r.campaign_id, campaign_name: r.campaign_name, adset_name: r.adset_name, f: typeof r.features === 'string' ? JSON.parse(r.features) : r.features || {},
    spend_cents: Number(r.spend_cents), revenue_cents: Number(r.revenue_cents), purchases: Number(r.purchases), leads: Number(r.leads), first_week: day10(r.first_week), last_week: day10(r.last_week) }));
}
const SYSTEM = `You phrase findings about past Meta ads for a small team. Each finding is about one group of ads, with numbers that already have ids. Write ONE plain sentence per finding that begins with the group's name exactly as given and restates the numbers: what the group returned (or cost per sign-up), what was spent, and how many ads and campaigns. Use only the numbers given, written the way they are given. Say "ahead of" or "behind" the 1.5× line (for purchases) or "lower" or "higher" than all sign-up ads. These ads were not controlled tests: describe what happened, never why. No reasons, no causes, no advice, no "because", "so", "should" or "likely". Reply with JSON only: {"findings":[{"id":"f1","text":"...","metric_ids":["m1","m2"]}]}, citing the ids of the numbers you used.`;
// The model only phrases: it sees group names and aggregate numbers (never an ad, a campaign, a person or any words of an ad). Anything it writes that fails the check is dropped and the plain statement code wrote stays.
async function phrase(findings, metrics) {
  if (!findings.length) return { state: 'none', dropped: 0, used: 0 };
  if (!keyIsSet()) return { state: 'no_key', dropped: 0, used: 0 };
  const byId = new Map(metrics.map(m => [m.id, m])), top = findings.slice(0, 12);
  const payload = { kind: 'history_findings', line: `${TARGET}×`, findings: top.map((f, i) => ({ id: `f${i + 1}`, group: f.label, side: f.side, metrics: f.ids.map(id => byId.get(id)).map(m => ({ id: m.id, label: m.label, value: m.value, unit: m.unit, text: m.text })) })) };
  const r = await ask(SYSTEM, payload);
  if (r.state !== 'ok' || !Array.isArray(r.json?.findings)) return { state: r.state === 'no_key' ? 'no_key' : 'failed', dropped: 0, used: 0 };
  let used = 0, dropped = 0;
  for (const a of r.json.findings) {
    const f = top[Number(String(a?.id || '').replace(/^f/, '')) - 1];
    const ids = Array.isArray(a?.metric_ids) ? a.metric_ids.map(String) : [];
    const ok = f && ids.length && ids.every(id => f.ids.includes(id)) && quotedNumbers(a.text).length >= 2 && !verifyFinding({ ...f, text: String(a.text || ''), ids }, byId) && !f.by;
    if (ok) { f.text = String(a.text).trim(); f.ids = ids; f.by = 'model'; used++; } else dropped++;
  }
  return { state: used ? 'model' : 'all_dropped', dropped, used };
}
async function analyseAndSave(state, { importing, plan, now }) {
  const ads = await loadAds(), weeks = ads.flatMap(a => [a.first_week, a.last_week]).filter(Boolean).sort();
  const period = { from: plan.from, to: addDays(plan.to, 6), text: `${monthYear(plan.from)} to ${monthYear(addDays(plan.to, 6))}` };
  const a = analyse(ads, { urlFor: managerUrl, period });
  const p = await phrase(a.findings, a.metrics), byId = new Map(a.metrics.map(m => [m.id, m]));
  const today = nyDate(now), readNo = importing ? 0 : state.read_no + 1;
  const saved = await peekRows('history_findings', {}, { limit: 2000 }), had = new Map(saved.map(s => [s.key, s]));
  const { now: current, gone } = statusFor(a.findings, state.read_no > 0 ? saved : [], readNo);
  await ensureAdsTables();
  for (const f of current) {
    const row = { kind: f.kind, dim: f.dim, label: f.label, side: f.side, reliability: f.reliability, text: f.text, by: f.by || 'code', metrics: f.ids.map(id => { const m = byId.get(id); return { id, label: m.label, text: m.text, unit: m.unit, value: m.value }; }),
      sources: f.sources, more: f.more, ads: f.ads, campaigns: f.campaigns, spend_cents: f.spend_cents, period: period.text, last_seen: today, first_read: f.first_read, last_read: f.last_read, status: f.status };
    const old = had.get(f.key);
    if (old) await updateRow('history_findings', old.id, row); else await createRow('history_findings', { key: f.key, first_seen: today, ...row });
  }
  const keys = new Set(current.map(f => f.key));
  for (const s of saved.filter(x => !keys.has(x.key))) { if (importing && state.read_no === 0) await deleteRow('history_findings', s.id); else if (s.status !== 'no_longer_true') await updateRow('history_findings', s.id, { status: 'no_longer_true' }); }
  state.analysis = { period, totals: a.totals, not_enough: a.notEnough, even: a.even, left_out: a.left_out.length, groups: a.group_count, findings: current.length, gone: gone.length, first: weeks[0] || '', last: weeks[weeks.length - 1] || '' };
  state.phrasing = p.state; state.analysis.phrase = { state: p.state, used: p.used, dropped: p.dropped }; state.analysed_at = now.toISOString(); if (!importing) state.read_no = readNo;
  return { findings: current.length, left_out: a.left_out.length };
}

// ---- What the page shows
const asFinding = (r, readNo) => ({ key: r.key, kind: r.kind, label: r.label, side: r.side, reliability: r.reliability, reliability_text: RELIABILITY_TEXT[r.reliability] || '', text: r.text, by: r.by,
  status: readNo > 0 ? r.status : '', status_text: readNo > 0 ? STATUS_TEXT[r.status] || '' : '', first_seen: r.first_seen, last_seen: r.last_seen, period: r.period, metrics: r.metrics || [], sources: r.sources || [], more: r.more, ads: r.ads, campaigns: r.campaigns, spend_cents: r.spend_cents });
export async function historyView({ now = new Date() } = {}) {
  const mode = adsMode(), out = { meta: { connected: mode !== 'not_connected', text: mode === 'not_connected' ? NOT_CONNECTED : '' }, exists: false, ai: keyIsSet(), thresholds: { target: TARGET, enough: ENOUGH, early: EARLY },
    coverage: null, totals: null, working: [], not_working: [], not_enough: [], gone: [], notes: [], phrasing: '', read_no: 0 };
  let exists = false;
  try { exists = await adsTablesExist(); } catch { out.db = false; return out; }
  if (!exists) return out;
  const state = await readState(), weeks = await weeksRows();
  if (!weeks.length && !state.analysis && !state.plan) return out;
  out.exists = true;
  const p = progressOf(state.plan, weeks), readAt = weeks.map(w => w.read_at).filter(Boolean).sort().pop() || '';
  out.coverage = { weeks_done: p.done, weeks_total: p.total, weeks_left: p.left, importing: p.left > 0 || (!!state.structure && !state.structure_at), from: state.plan?.from || '', to: state.plan ? addDays(state.plan.to, 6) : '', last_read_at: readAt, gave_up: p.gave_up,
    slowed: !!state.rate_limited_at && p.left > 0 && now.getTime() - Date.parse(state.rate_limited_at) < 6 * HOUR, last_run_at: state.last_run_at,
    structure: state.structure ? { stage: state.structure.stage, sets: state.structure.sets, ads: state.structure.ads, total: state.ads_total || 0 } : null,   // the ads are being read: how far
    partial_week: state.partial ? { week: state.partial.week, rows: state.partial.rows } : null };
  out.notes = [state.problem, ...(state.structure_notes || []), ...weeks.filter(w => w.note && w.status === 'done').slice(0, 3).map(w => w.note)].filter(Boolean).filter((x, i, a) => a.indexOf(x) === i);
  out.phrasing = state.phrasing; out.read_no = state.read_no; out.phrase = state.analysis?.phrase || null;
  if (state.analysis) { out.totals = state.analysis.totals; out.not_enough = state.analysis.not_enough; out.left_out = state.analysis.left_out; out.even = state.analysis.even; out.period = state.analysis.period?.text || ''; }
  const rows = (await peekRows('history_findings', {}, { limit: 2000 })).map(r => asFinding(r, state.read_no));
  const rank = (a, b) => (a.reliability === b.reliability ? 0 : a.reliability === 'enough' ? -1 : 1) || b.spend_cents - a.spend_cents;
  out.working = rows.filter(r => r.side === 'ahead' && r.status !== 'no_longer_true').sort(rank);
  out.not_working = rows.filter(r => r.side === 'behind' && r.status !== 'no_longer_true').sort(rank);
  out.gone = rows.filter(r => r.status === 'no_longer_true').sort(rank);
  return out;
}
