// Ads › What we've learned: reading the HISTORY of the ads already run in the real Meta account, and keeping what it shows. READ ONLY: every Meta call here is one of the client's read functions
// (never the write gate), and nothing is created, changed or paused anywhere. It keeps its own notes in the dashboard's database (ads_history_* tables, made only the first time something is saved).
//
// HOW THE HISTORY IS READ, AND RESUMED. The account's first campaign sets where the history starts (never further back than Meta keeps ad results, about three years). The history is cut into
// whole weeks (Monday to Sunday). Each run reads at most MAX_WEEKS_PER_RUN weeks, newest first, one Meta request (paged) per week, and stops at once when Meta says "too many requests" or the time
// budget is used up. Every finished week is saved before the next one starts, so the next run (the hourly job, or "Read the history now") carries on from the first week not yet done. Failed weeks are tried
// again up to three times. Once everything is read, the most recent four weeks are read again about once a day, because Meta's own numbers for a week keep moving for a while.
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
import { adFeatures, analyse, statusFor, verifyFinding, STATUS_TEXT, RELIABILITY_TEXT, TARGET, ENOUGH, EARLY } from './adslearned.js';

const MAX_WEEKS_PER_RUN = 8, MAX_WEEKS_BACK = 156, RUN_BUDGET_MS = 85000, MAX_TRIES = 3, FRESH_HOURS = 20, RECENT_DAYS = 28, STATE_KEY = 'history_state';
const day10 = v => (v instanceof Date ? v.toISOString() : String(v || '')).slice(0, 10);   // a date column comes back as a Date or as text, depending on the database
const HOUR = 3600e3;
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
const DEFAULT_STATE = { plan: null, structure_at: '', last_run_at: '', read_no: 0, analysed_at: '', analysis: null, phrasing: '', rate_limited_at: '', note: '', problem: '' };
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
async function saveWeek(week, rows) {
  await adsQuery('DELETE FROM ads_history_results WHERE week_start = $1', [week]);
  await bulk('ads_history_results', RES_COLS, rows.map(r => ({ week_start: week, ad_id: r.ad_id, campaign_id: r.campaign_id || '', adset_id: r.adset_id || '', spend_cents: r.spend_cents, impressions: r.impressions, clicks: r.clicks, purchases: Math.round(r.purchases), revenue_cents: r.revenue_cents, leads: Math.round(r.leads) })), 'week_start, ad_id', RES_COLS.slice(2).map(c => c.n));
}
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
async function readStructure(campaigns) {
  const [sets, ads] = [await listAllAdSetsForHistory(), await listAllAdsWithCreatives()];
  if (!ads.ok) return { ok: false, r: ads };
  const notes = [];
  if (!sets.ok) notes.push('The audiences and budgets couldn’t be read this time, so ads are not grouped by them yet.');
  if (ads.truncated) notes.push('This account has more ads than could be read in one go, so the list stops short.');
  return { ok: true, rows: buildAds({ campaigns, adsets: sets.ok ? sets.data : [], ads: ads.data }), notes };
}
// An ad that has results but is not in the account's list any more (it was deleted): kept as a nameless row so its money is still counted, grouped by its campaign
async function addMissingAds(weekRows, camp) {
  const ids = [...new Set(weekRows.map(r => r.ad_id).filter(Boolean))];
  if (!ids.length) return;
  const have = new Set((await adsQuery('SELECT ad_id FROM ads_history_ads WHERE ad_id = ANY($1)', [ids])).map(r => r.ad_id));
  const miss = weekRows.filter(r => r.ad_id && !have.has(r.ad_id)), seen = new Set(), out = [];
  for (const r of miss) { if (seen.has(r.ad_id)) continue; seen.add(r.ad_id); const c = camp.get(r.campaign_id); out.push({ ad_id: r.ad_id, name: 'An ad that is no longer in the account', campaign_id: r.campaign_id || '', campaign_name: c?.name || '', adset_id: r.adset_id || '', adset_name: '', objective: c?.objective || '', features: adFeatures({ ad: {}, campaign: c, firstWeek: r.date }) }); }
  if (out.length) await saveAds(out);
}

// ---- The run
// preview: reads one thing from Meta (the campaign list, to size the history) and says what it would do; keeps nothing and makes no table.
export async function runHistory({ preview = false, maxWeeks = MAX_WEEKS_PER_RUN, now = new Date(), budgetMs = RUN_BUDGET_MS } = {}) {
  const out = { preview, notConnected: false, rate_limited: false, weeks: { read: 0, failed: 0, left: 0, total: 0 }, structure: false, analysed: false, note: '' };
  if (!hasToken() || adsMode() === 'not_connected') return { ...out, notConnected: true, note: NOT_CONNECTED };
  const started = Date.now(), today = nyDate(now), problem = r => { const c = classify(r); out.rate_limited = c === 'rate_limit'; out.note = PROBLEM[c] || PROBLEM.other; return out; };
  const camps = await listAllCampaignsForHistory();
  if (!camps.ok) { problem(camps); if (!preview) await touch({ problem: out.note, ...(out.rate_limited ? { rate_limited_at: now.toISOString() } : {}) }, now); return out; }
  const earliest = camps.data.map(c => String(c.created_time || '').slice(0, 10)).filter(Boolean).sort()[0] || '';
  const plan = planFor(earliest, today);
  if (!plan) return { ...out, note: 'There are no finished weeks of ads to read yet.' };
  const exists = await adsTablesExist().catch(() => false), state = exists ? await readState() : { ...DEFAULT_STATE };
  const known = new Map((exists ? await weeksRows() : []).map(r => [r.week_start, r]));
  const todo = pendingWeeks(plan, [...known.values()], today, now.getTime()), progress = progressOf(plan, [...known.values()]);
  out.weeks = { ...out.weeks, total: plan.total, left: progress.left, done: progress.done };
  if (preview) return { ...out, note: todo.length ? `Would read up to ${Math.min(todo.length, maxWeeks)} of the ${todo.length} weeks that still need it.` : 'Everything is read and fresh.' };

  const camp = new Map(camps.data.map(c => [c.id, c]));
  let changed = false;
  if (todo.length && (!state.structure_at || now.getTime() - Date.parse(state.structure_at) > FRESH_HOURS * HOUR)) {
    const s = await readStructure(camps.data);
    if (!s.ok) { problem(s.r); await touch({ problem: out.note, ...(out.rate_limited ? { rate_limited_at: now.toISOString() } : {}) }, now); return out; }
    await ensureAdsTables(); await saveAds(s.rows);
    state.structure_at = now.toISOString(); state.problem = ''; out.structure = true; state.structure_notes = s.notes;
  }
  for (const { week } of todo.slice(0, maxWeeks)) {
    if (Date.now() - started > budgetMs) break;
    const r = await getAdInsightsForRange({ since: week, until: addDays(week, 6) });
    if (!r.ok) {
      const c = classify(r);
      if (c === 'rate_limit') { out.rate_limited = true; state.rate_limited_at = now.toISOString(); break; }
      await ensureAdsTables(); await markWeek(known, week, { status: 'failed', attempts: (known.get(week)?.attempts || 0) + 1, note: PROBLEM[c] || PROBLEM.other });
      out.weeks.failed++; out.note = PROBLEM[c] || PROBLEM.other;
      if (c === 'permission' || c === 'not_connected') break;
      continue;
    }
    const rows = r.rows.filter(x => x.ad_id && (x.spend_cents > 0 || x.purchases > 0 || x.leads > 0));
    await ensureAdsTables();
    await addMissingAds(rows, camp); await saveWeek(week, rows);
    await markWeek(known, week, { status: 'done', ad_rows: rows.length, spend_cents: rows.reduce((n, x) => n + x.spend_cents, 0), attempts: 0, note: r.truncated ? 'More ads than could be read in one go: this week may be a little short.' : '' });
    out.weeks.read++; changed = true;
  }
  const after = progressOf(plan, [...known.values()]);
  out.weeks.left = after.left; out.weeks.done = after.done;
  if (out.rate_limited) out.note = PROBLEM.rate_limit;
  changed = changed || (out.structure && after.done > 0) || (!state.analysis && after.done > 0);
  state.plan = plan; state.last_run_at = now.toISOString(); if (out.weeks.read) state.rate_limited_at = out.rate_limited ? state.rate_limited_at : '';
  state.note = out.rate_limited ? PROBLEM.rate_limit : out.note;
  // The statements are re-made when something changed. While the first import is still going they are provisional (no "newer / still true" yet); once it is done each re-read counts.
  const importing = after.left > 0;
  if (changed && (!importing || state.read_no === 0)) { const a = await analyseAndSave(state, { importing, plan, now }); out.analysed = true; out.findings = a.findings; out.left_out = a.left_out; }
  if (state.id || out.weeks.read || out.structure) { await ensureAdsTables(); await saveState(state); }
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
  out.coverage = { weeks_done: p.done, weeks_total: p.total, weeks_left: p.left, importing: p.left > 0, from: state.plan?.from || '', to: state.plan ? addDays(state.plan.to, 6) : '', last_read_at: readAt, gave_up: p.gave_up,
    slowed: !!state.rate_limited_at && p.left > 0 && now.getTime() - Date.parse(state.rate_limited_at) < 6 * HOUR, last_run_at: state.last_run_at };
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
