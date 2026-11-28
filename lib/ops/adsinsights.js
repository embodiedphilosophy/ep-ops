// Ads › Audience insights (Ads PR 5): the weekly read, the quiz breakdowns, which topics convert, and suggested course topics.
//
// THE RULE: NO CLAIM WITHOUT A SOURCE. Code works out every number first and gives each a stable id (m1, m2 ...). The model (if there is a key) is sent ONLY those aggregate
// numbers with EP's own topic names and asked for JSON: claims, each with the metric ids it rests on. Code then VERIFIES every claim: it must cite metrics that exist, and every
// number quoted in its text must equal one of the cited metrics (rounded). A claim that fails is DROPPED, never repaired. No key, or nothing left: the numbers are shown without prose.
// Topic suggestions follow the same rule and may only use words EP already uses (its programs, courses, tags, quiz answers) and formats that exist.
//
// PRIVACY: five sources, each optional and each reported as connected or not. Only anonymous aggregates are ever read, kept or sent to the model: no name, no email, no id of a person.
// Nothing here writes to Meta, Circle, Kit, the quiz or any sheet; it reads, and keeps its own notes in the dashboard's database (ads_weekly_reads, ads_topic_ideas).
import { adsTablesExist, listRows, peekRows, createRow, updateRow, getRow, resultTotals } from './adsstore.js';
import { archetypeCounts, answerCategories, answerCounts, reportStatus } from './reportdata.js';
import { kitConfigured, kitPurchaseTotals, kitBroadcastStats } from '../kit.js';
import { circlePurchaseTotals } from './circlepurchases.js';
import { aiConfigured } from './adscopy.js';
import { ask } from './adsask.js';
import { loadCalendar } from '../calendar.js';
import { readPlain } from './store';
import { readRange, toObjects } from '../google';
import { todayET } from '../events';
import { windowFor, periodText, bounds, addDays, dayName, topicName, topicKey, sameTopic, show, Metrics, pctChange, pct, MIN_PURCHASES, MIN_LEADS, MIN_SPEND_CENTS, MIN_QUIZ, verifyText, verifyClaim, claimKey, readProblem, checkTopicWords, vocabulary, FORMATS, formatOf, SOURCES, SOURCE_LABEL, cap } from './insightsverify.js';



// ---- Collect the five sources. Each one answers { connected, ok, note, ... } and never throws.
async function collectReport(win) {
  const st = reportStatus();
  if (!st.connected) return { connected: false, ok: false, note: st.reason, todo: st.todo };
  const [now, prev, d90] = await Promise.all([archetypeCounts({ since: win.from, until: addDays(win.to, 1) }), archetypeCounts({ since: win.prev.from, until: addDays(win.prev.to, 1) }), archetypeCounts({ since: win.d90.from, until: addDays(win.d90.to, 1) })]);
  if (!now.ok) return { connected: true, ok: false, note: now.error || 'The Practice Report couldn’t be read just now.' };
  const cats = answerCategories().categories || [], breakdowns = [];
  for (const c of cats) { const a = await answerCounts(c.key, { since: win.d90.from, until: addDays(win.d90.to, 1) }); if (a.ok) breakdowns.push({ key: c.key, label: c.label, total: a.total, answers: a.answers }); }
  return { connected: true, ok: true, note: '', now, prev: prev.ok ? prev : null, d90: d90.ok ? d90 : null, breakdowns };
}

async function collectMeta(win, cal, pages) {
  if (!(await adsTablesExist().catch(() => false))) return { connected: false, ok: false, note: 'No campaign has run in Meta yet, so there are no ad results to read.' };
  const camps = (await listRows('campaigns')).filter(c => c.status !== 'draft' && c.meta_campaign_id && !String(c.meta_campaign_id).startsWith('dryrun-'));
  if (!camps.length) return { connected: false, ok: false, note: 'No campaign has run in Meta yet, so there are no ad results to read.' };
  const sum = async r => { const t = await resultTotals({ since: r.from, until: r.to }), by = new Map(); for (const x of t) { const o = by.get(x.campaign_id) || { spend: 0, revenue: 0, purchases: 0, leads: 0 }; o.spend += x.spend_cents; o.revenue += x.revenue_cents; o.purchases += x.purchases; o.leads += x.leads; by.set(x.campaign_id, o); } return by; };
  const [now, prev] = [await sum(win), await sum(win.prev)];
  const rows = camps.map(c => {
    const ev = cal.find(e => c.program_id && String(e.sched_id || e.id).toUpperCase() === String(c.program_id).toUpperCase()), page = pages.find(p => c.program_id && String(p.offering).toUpperCase() === String(c.program_id).toUpperCase());
    const name = topicName(page?.title || ev?.program_name || c.name) || c.name;
    return { campaign_id: c.id, goal: c.goal, topic: name, key: topicKey(name), now: now.get(c.id) || { spend: 0, revenue: 0, purchases: 0, leads: 0 }, prev: prev.get(c.id) || { spend: 0, revenue: 0, purchases: 0, leads: 0 } };
  });
  return { connected: true, ok: true, note: '', rows };
}

async function collectCircle(win) {
  const [since, until] = [bounds(win.prev)[0], bounds(win)[1]];
  const r = await circlePurchaseTotals(since, until);
  return r.connected && r.ok ? { connected: true, ok: true, note: '', rows: r.rows } : { connected: r.connected, ok: false, note: r.note, rows: [] };
}
async function collectKitPurchases(win) {
  if (!kitConfigured()) return { connected: false, ok: false, note: 'Kit isn’t connected (KIT_API_KEY).', rows: [] };
  try { return { connected: true, ok: true, note: '', rows: await kitPurchaseTotals(bounds(win.prev)[0], bounds(win)[1]) }; }
  catch (e) { return { connected: true, ok: false, note: readProblem('Kit', 'purchases', e), rows: [] }; }
}
async function collectKitEmail(win) {
  if (!kitConfigured()) return { connected: false, ok: false, note: 'Kit isn’t connected (KIT_API_KEY).', rows: [] };
  try { return { connected: true, ok: true, note: '', rows: await kitBroadcastStats(bounds(win.prev)[0], bounds(win)[1]) }; }
  catch { return { connected: true, ok: false, note: 'Kit couldn’t be read just now (email opens and clicks). The other sources still work.', rows: [] }; }
}

// ---- The numbers
const inWin = (day, r) => day >= r.from && day <= r.to;
const sumRows = (rows, r, pick = () => true) => rows.filter(x => inWin(x.day, r) && pick(x)).reduce((s, x) => ({ count: s.count + x.count, cents: s.cents + x.cents }), { count: 0, cents: 0 });
// A topic table row per topic, from every source that mentions it
function topicTable(src) {
  const topics = [];
  const find = (raw, key = topicKey(raw)) => {
    let t = topics.find(x => sameTopic(x.key, key));
    if (!t) { t = { key, topic: topicName(raw), meta: null, circle: null, kit: null, mail: null }; topics.push(t); }
    return t;
  };
  for (const r of src.meta?.rows || []) { const t = find(r.topic, r.key); t.meta ||= { spend: 0, revenue: 0, purchases: 0, leads: 0, p_spend: 0, p_revenue: 0, goals: [] }; for (const k of ['spend', 'revenue', 'purchases', 'leads']) t.meta[k] += r.now[k]; t.meta.p_spend += r.prev.spend; t.meta.p_revenue += r.prev.revenue; t.meta.goals.push(r.goal); }
  for (const [k, s] of [['circle', src.circle], ['kit', src.kit_purchases]]) {
    if (!s?.ok) continue;
    const seen = new Map();
    for (const r of s.rows) { const t = find(r.product), o = seen.get(t) || { rows: [] }; o.rows.push(r); seen.set(t, o); }
    for (const [t, o] of seen) t[k] = { rows: [...(t[k]?.rows || []), ...o.rows] };
  }
  if (src.kit_email?.ok) for (const b of src.kit_email.rows) { const id = (String(b.subject).match(/\[(E\d{3,})\]/i) || [])[1]; if (!id) continue; const ev = (src.cal || []).find(e => String(e.sched_id || e.id).toUpperCase() === id.toUpperCase()); if (!ev) continue; const t = find(ev.program_name || ev.title); (t.mailRows ||= []).push(b); }
  return topics;
}

export function buildMetrics(src, win) {
  const M = new Metrics(), per = r => periodText(r), W = { from: win.from, to: win.to, text: per(win) }, P = { from: win.prev.from, to: win.prev.to, text: per(win.prev) }, D = { from: win.d90.from, to: win.d90.to, text: `the 90 days to ${dayName(win.to)}` };
  const low = {};
  // Practice Report
  if (src.report?.ok) {
    const n = src.report.now.total, p = src.report.prev?.total;
    M.add({ label: 'People who finished the Practice Report this week', value: n, unit: 'count', source: 'report', period: W, low: n < MIN_QUIZ });
    if (p != null) { M.add({ label: 'People who finished the Practice Report the week before', value: p, unit: 'count', source: 'report', period: P, low: p < MIN_QUIZ }); const ch = pctChange(n, p); if (ch != null) M.add({ label: 'Change in Practice Report finishes from the week before', value: ch, unit: 'pct', source: 'report', period: W, low: Math.min(n, p) < MIN_QUIZ }); }
    for (const a of src.report.now.archetypes.slice(0, 3)) M.add({ label: `People who got “${a.archetype}” this week`, value: a.count, unit: 'count', source: 'report', period: W, low: a.count < MIN_QUIZ });
    for (const b of src.report.breakdowns || []) { const top = b.answers[0]; if (top && b.total) M.add({ label: `Share who answered “${top.answer}” to “${b.label}”`, value: pct(top.count, b.total), unit: 'pct', source: 'report', period: D, low: b.total < MIN_QUIZ }); }
  }
  // Topics (Meta, Circle, Kit)
  const topics = topicTable(src);
  const pack = [];
  if (src.meta?.ok) {
    const tot = { spend: 0, revenue: 0, purchases: 0, leads: 0, p_spend: 0, p_revenue: 0 };
    for (const r of src.meta.rows) { for (const k of ['spend', 'revenue', 'purchases', 'leads']) tot[k] += r.now[k]; tot.p_spend += r.prev.spend; tot.p_revenue += r.prev.revenue; }
    M.add({ label: 'Ad spend this week', value: tot.spend / 100, unit: 'usd', source: 'meta', period: W });
    M.add({ label: 'Purchases from ads this week', value: tot.purchases, unit: 'count', source: 'meta', period: W, low: tot.purchases < MIN_PURCHASES });
    M.add({ label: 'Sales from ads this week', value: tot.revenue / 100, unit: 'usd', source: 'meta', period: W });
    M.add({ label: 'Sign-ups from ads this week', value: tot.leads, unit: 'count', source: 'meta', period: W, low: tot.leads < MIN_LEADS });
    const roas = tot.spend ? tot.revenue / tot.spend : null, proas = tot.p_spend ? tot.p_revenue / tot.p_spend : null;
    if (roas != null) M.add({ label: 'Return on ad spend this week', value: roas, unit: 'ratio', source: 'meta', period: W, low: tot.purchases < MIN_PURCHASES || tot.spend < MIN_SPEND_CENTS });
    if (proas != null) M.add({ label: 'Return on ad spend the week before', value: proas, unit: 'ratio', source: 'meta', period: P });
    const ch = pctChange(tot.spend, tot.p_spend); if (ch != null) M.add({ label: 'Change in ad spend from the week before', value: ch, unit: 'pct', source: 'meta', period: W });
  }
  for (const [k, s, label] of [['circle', src.circle, 'Circle'], ['kit_purchases', src.kit_purchases, 'Kit']]) {
    if (!s?.ok) continue;
    const a = sumRows(s.rows, win), b = sumRows(s.rows, win.prev), ad = sumRows(s.rows, win, x => !!x.utm_campaign);
    M.add({ label: `${label} purchases this week`, value: a.count, unit: 'count', source: k, period: W, low: a.count < MIN_PURCHASES });
    M.add({ label: `${label} sales this week`, value: a.cents / 100, unit: 'usd', source: k, period: W, low: a.count < MIN_PURCHASES });
    M.add({ label: `${label} purchases the week before`, value: b.count, unit: 'count', source: k, period: P, low: b.count < MIN_PURCHASES });
    const ch = pctChange(a.count, b.count); if (ch != null) M.add({ label: `Change in ${label} purchases from the week before`, value: ch, unit: 'pct', source: k, period: W, low: Math.min(a.count, b.count) < MIN_PURCHASES });
    if (ad.count) M.add({ label: `${label} purchases that came with an ad campaign tag this week`, value: ad.count, unit: 'count', source: k, period: W, low: ad.count < MIN_PURCHASES });
  }
  if (src.kit_email?.ok) {
    const now = src.kit_email.rows.filter(b => inWin(b.day, win)), was = src.kit_email.rows.filter(b => inWin(b.day, win.prev));
    const rate = (rows, f) => { const r = rows.reduce((s, b) => s + b.recipients, 0); return r ? pct(rows.reduce((s, b) => s + b[f], 0), r) : null; };
    M.add({ label: 'Emails sent this week', value: now.length, unit: 'count', source: 'kit_email', period: W, low: now.length < 2 });
    const o = rate(now, 'opens'), c = rate(now, 'clicks'), po = rate(was, 'opens');
    if (o != null) M.add({ label: 'Share of recipients who opened this week’s emails', value: o, unit: 'pct', source: 'kit_email', period: W, low: now.length < 2 });
    if (c != null) M.add({ label: 'Share of recipients who clicked this week’s emails', value: c, unit: 'pct', source: 'kit_email', period: W, low: now.length < 2 });
    if (po != null) M.add({ label: 'Share of recipients who opened the week before’s emails', value: po, unit: 'pct', source: 'kit_email', period: P, low: was.length < 2 });
  }
  // Per topic
  const rows = [];
  for (const t of topics) {
    const row = { key: t.key, topic: t.topic, meta: null, circle: null, kit: null, mail: null, ids: {} };
    if (t.meta && (t.meta.spend || t.meta.purchases || t.meta.leads)) {
      const m = t.meta, purchase = m.goals.some(g => g === 'Purchase'), lead = m.goals.some(g => g === 'Lead');
      const lowRead = (purchase && m.purchases < MIN_PURCHASES) || (!purchase && lead && m.leads < MIN_LEADS) || m.spend < MIN_SPEND_CENTS;
      row.meta = { spend_cents: m.spend, purchases: m.purchases, revenue_cents: m.revenue, leads: m.leads, roas: m.spend ? m.revenue / m.spend : null, cpl_cents: m.leads ? Math.round(m.spend / m.leads) : null, goals: [...new Set(m.goals)], low: lowRead };
      const ids = row.ids; const tl = t.topic;
      ids.spend = M.add({ label: `${tl}: ad spend this week`, value: m.spend / 100, unit: 'usd', source: 'meta', period: W, topic: tl, low: lowRead })?.id;
      if (purchase) {
        ids.purchases = M.add({ label: `${tl}: purchases from ads this week`, value: m.purchases, unit: 'count', source: 'meta', period: W, topic: tl, low: lowRead })?.id;
        if (m.spend) ids.roas = M.add({ label: `${tl}: return on ad spend this week`, value: m.revenue / m.spend, unit: 'ratio', source: 'meta', period: W, topic: tl, low: lowRead })?.id;
      }
      if (lead && m.leads) { ids.leads = M.add({ label: `${tl}: sign-ups from ads this week`, value: m.leads, unit: 'count', source: 'meta', period: W, topic: tl, low: lowRead })?.id; ids.cpl = M.add({ label: `${tl}: cost per sign-up this week`, value: m.spend / m.leads / 100, unit: 'usd', source: 'meta', period: W, topic: tl, low: lowRead })?.id; }
    }
    for (const [k, s, label] of [['circle', t.circle, 'Circle'], ['kit', t.kit, 'Kit']]) {
      if (!s) continue;
      const a = sumRows(s.rows, win);
      if (!a.count) continue;
      const src_ = k === 'kit' ? 'kit_purchases' : 'circle', lowP = a.count < MIN_PURCHASES;
      row[k] = { count: a.count, cents: a.cents, low: lowP };
      row.ids[`${k}_count`] = M.add({ label: `${t.topic}: ${label} purchases this week`, value: a.count, unit: 'count', source: src_, period: W, topic: t.topic, low: lowP })?.id;
      row.ids[`${k}_cents`] = M.add({ label: `${t.topic}: ${label} sales this week`, value: a.cents / 100, unit: 'usd', source: src_, period: W, topic: t.topic, low: lowP })?.id;
    }
    if (t.mailRows) {
      const mine = t.mailRows.filter(b => inWin(b.day, win)), r = mine.reduce((s, b) => s + b.recipients, 0);
      if (r) { row.mail = { opens: mine.reduce((s, b) => s + b.opens, 0), clicks: mine.reduce((s, b) => s + b.clicks, 0), recipients: r }; row.ids.open_rate = M.add({ label: `${t.topic}: share who opened its emails this week`, value: pct(row.mail.opens, r), unit: 'pct', source: 'kit_email', period: W, topic: t.topic, low: mine.length < 2 })?.id; }
    }
    if (row.meta || row.circle || row.kit || row.mail) rows.push(row);
  }
  const overlapNote = src.circle?.ok && src.kit_purchases?.ok ? 'Circle and Kit are counted separately and not added together: a person who bought through both can’t be told apart in counts, so a total would count them twice.' : '';
  return { metrics: M.list, topics: rows, overlapNote, low };
}

const SYSTEM_READ = `You write the weekly read for Embodied Philosophy's ad team: a few short, plain, warm sentences about the week. You are given NUMBERS, each with an id, a label, a value, a unit, its source and its period, and EP's own topic names. Rules: use ONLY these numbers; every claim must list the ids it rests on in "metric_ids"; every number you write must be copied exactly from one of the metrics you cite (use the "text" given) and must not be added up, averaged or turned into anything else; never write a date or a number that is not in a cited metric; do not name or guess at any person; where a metric is flagged "low" there are too few to read a trend into, so say that plainly instead of calling it a trend; no promises, no advice to spend, no hype. Each statement may ONLY restate the cited numbers and compare them (\"X is up from Y\", \"X is lower than the week before\"). Never draw a conclusion, give a reason or a cause, or give advice: do not use \"because\", \"so\", \"therefore\", \"which means\" or \"should\". Never say the same thing twice: one statement per figure. Answer with JSON only: {"claims":[{"text":"…","metric_ids":["m1","m4"]}]} with 3 to 6 claims.`;
const SYSTEM_IDEAS = `You suggest ideas for new EP courses. You are given NUMBERS (each with an id), the FORMATS EP already runs (by key), the AUDIENCES that exist (library audiences and quiz archetypes, by name), the topics EP has already suggested or dismissed (never suggest those), and the WORDS EP already uses. Rules: an idea is a short title made ONLY of words from EP's words, a one-sentence summary that only restates cited numbers (copy each number exactly from a cited metric's "text"; never add or round differently), one format key from the list, one audience name exactly as given, and "metric_ids" of the numbers behind it. Do not invent a topic EP does not already teach or write about. Where a metric is flagged "low" say there is not much to go on. Answer with JSON only: {"ideas":[{"title":"…","summary":"…","format":"sadhana","audience":"…","metric_ids":["m2"]}]} with up to 4 ideas.`;
const forModel = m => ({ id: m.id, label: m.label, text: m.text, value: Math.round(m.value * 100) / 100, unit: m.unit, source: SOURCE_LABEL[m.source], period: m.period.text, ...(m.topic ? { topic: m.topic } : {}), ...(m.low ? { low: true } : {}) });

export async function writeRead(metrics, names) {
  const byId = new Map(metrics.map(m => [m.id, m]));
  if (!metrics.length) return { state: 'no_data', claims: [], dropped: [] };
  const r = await ask(SYSTEM_READ, { kind: 'weekly_read', metrics: metrics.map(forModel), topics: names });
  if (r.state !== 'ok') return { state: r.state, claims: [], dropped: [] };
  const claims = [], dropped = [], seen = new Set();
  for (const c of (Array.isArray(r.json?.claims) ? r.json.claims : []).slice(0, 16)) {
    let why = verifyClaim(c?.text, c?.metric_ids, byId, names);
    if (!why) { const k = claimKey(c.text, c.metric_ids); if (seen.has(k)) why = 'It says the same thing as a statement already kept.'; else seen.add(k); }
    if (why) dropped.push({ reason: why }); else claims.push({ text: String(c.text).trim(), metric_ids: [...new Set(c.metric_ids.map(String))] });
  }
  return { state: claims.length ? 'ok' : 'all_dropped', claims: claims.slice(0, 6), dropped };
}

export async function suggestIdeas({ metrics, formats, audiences, avoid, vocab, names }) {
  const byId = new Map(metrics.map(m => [m.id, m])), used = metrics.filter(m => m.topic);
  if (!used.length || !formats.length) return { state: 'no_data', ideas: [], dropped: [] };
  const r = await ask(SYSTEM_IDEAS, { kind: 'topic_ideas', metrics: used.map(forModel), formats: formats.map(f => ({ key: f.key, label: f.label })), audiences: audiences.map(a => a.label), already_suggested_or_dismissed: avoid, words: [...vocab].sort() });
  if (r.state !== 'ok') return { state: r.state, ideas: [], dropped: [] };
  const ideas = [], dropped = [];
  for (const i of (Array.isArray(r.json?.ideas) ? r.json.ideas : []).slice(0, 8)) {
    const title = String(i?.title || '').trim(), summary = String(i?.summary || '').trim(), f = formats.find(x => x.key === i?.format), a = audiences.find(x => x.label.toLowerCase() === String(i?.audience || '').trim().toLowerCase());
    let why = '';
    if (title.length < 3 || title.length > 70) why = 'Its title is the wrong length.';
    else if (!f) why = 'It uses a format EP doesn’t run.';
    else if (!a) why = 'Its audience isn’t one EP has.';
    else if (checkTopicWords(title, vocab).length) why = 'Its title uses a word EP doesn’t use.';
    else if (checkTopicWords(summary, vocab, { capitalsOnly: true }).length) why = 'Its summary uses a name EP doesn’t use.';
    else why = verifyText(summary, i?.metric_ids, byId, names);
    if (why) { dropped.push({ reason: why }); continue; }
    ideas.push({ title: cap(title), summary, format: f.key, audience: a.label, metric_ids: [...new Set(i.metric_ids.map(String))] });
  }
  return { state: ideas.length ? 'ok' : 'all_dropped', ideas, dropped };
}

// ---- Run the whole thing. preview = work it out and say what it would do; keep nothing, call no model, create no table.
export async function runInsights({ preview = false, now = new Date(), today = todayET() } = {}) {
  const win = windowFor(today), out = { preview, week_start: win.week_start, period: periodText(win), sources: [], metrics: 0, read: null, ideas: { added: 0, skipped: 0 } };
  const [cal, pages] = await Promise.all([loadCalendar().catch(() => []), readPlain('Course Pages', { light: true }).then(r => r.rows.map(x => x.values)).catch(() => [])]);
  const src = { cal };
  const [report, meta, circle, kitP, kitE] = await Promise.all([collectReport(win), collectMeta(win, cal, pages), collectCircle(win), collectKitPurchases(win), collectKitEmail(win)]);
  Object.assign(src, { report, meta, circle, kit_purchases: kitP, kit_email: kitE });
  const sources = SOURCES.map(([key, label]) => ({ key, label, connected: !!src[key].connected, ok: !!src[key].ok, note: src[key].note || '', ...(src[key].todo ? { todo: src[key].todo } : {}) }));
  const built = buildMetrics(src, win), { metrics, topics } = built;
  Object.assign(out, { sources, metrics: metrics.length, topics: topics.length, overlap_note: built.overlapNote });
  if (preview) return out;

  const names = [...new Set([...topics.map(t => t.topic), ...(src.meta?.rows || []).map(r => r.topic)])];
  const read = await writeRead(metrics, names);
  out.read = { state: read.state, claims: read.claims.length, dropped: read.dropped.length };
  const breakdowns = (report.breakdowns || []).map(b => ({ key: b.key, label: b.label, total: b.total, answers: b.answers.slice(0, 8).map(a => ({ ...a, pct: pct(a.count, b.total) })), period: periodText(win.d90) }));
  const rec = { body: '', claims: read.claims, numbers: { metrics, period: { from: win.from, to: win.to, text: periodText(win) }, prev: { from: win.prev.from, to: win.prev.to, text: periodText(win.prev) }, overlap_note: built.overlapNote, thresholds: { MIN_PURCHASES, MIN_LEADS, MIN_SPEND_CENTS, MIN_QUIZ }, verification: { asked: read.claims.length + read.dropped.length, kept: read.claims.length, dropped: read.dropped } },
    sources, generated_at: now.toISOString(), breakdowns, topics, read_state: read.state };
  const have = (await peekRows('weekly_reads', { week_start: win.week_start }))[0];
  if (have) await updateRow('weekly_reads', have.id, rec); else await createRow('weekly_reads', { week_start: win.week_start, ...rec });

  // Topic ideas: only with a key, never one already suggested, sent or dismissed (same topic words = the same topic)
  const existing = await peekRows('topic_ideas', {}, { limit: 1000 });
  const tracks = await trackList();
  const formats = FORMATS.filter(f => !f.track || !tracks || tracks.includes(f.track));
  const lib = await peekRows('audiences'), audiences = [...lib.filter(a => a.standing !== 'Retired').map(a => ({ label: a.name, kind: 'audience' })), ...(report.ok ? report.now.archetypes.map(a => ({ label: a.archetype, kind: 'archetype' })) : [])];
  const vocab = vocabulary([...cal.flatMap(e => [e.title, e.program_name, e.public_title, e.series]), ...pages.flatMap(p => [p.title, p.subtitle]), ...names, ...lib.flatMap(a => [a.name, ...(a.tags || [])]),
    ...(report.breakdowns || []).flatMap(b => [b.label, ...b.answers.map(a => a.answer)]), ...(report.ok ? report.now.archetypes.map(a => a.archetype) : []), ...formats.map(f => f.label), ...(src.meta?.rows || []).map(r => r.topic), ...topics.map(t => t.topic)]);
  const idea = await suggestIdeas({ metrics, formats, audiences, avoid: existing.map(i => i.title), vocab, names });
  out.ideas.state = idea.state; out.ideas.dropped = idea.dropped.length;
  for (const i of idea.ideas) {
    const key = topicKey(i.title);
    if (existing.some(e => sameTopic(e.topic_key, key))) { out.ideas.skipped++; continue; }
    const f = formatOf(i.format);
    const evidence = i.metric_ids.map(id => metrics.find(m => m.id === id)).filter(Boolean).map(m => ({ id: m.id, label: m.label, text: m.text, source: SOURCE_LABEL[m.source], period: m.period.text, low: !!m.low }));
    const row = await createRow('topic_ideas', { topic_key: key, title: i.title, summary: i.summary, format: f.key, audience_hint: i.audience, evidence, status: 'new', week_start: win.week_start, track: f.track, parent: f.parent });
    existing.push(row); out.ideas.added++;
  }
  return out;
}
async function trackList() {
  try { const t = toObjects(await readRange(process.env.CALENDAR_SHEET_ID, "'Track Defaults'!A1:A50")).map(r => String(r.track).toUpperCase()).filter(Boolean); return t.length ? t : null; } catch { return null; }
}

// ---- What the page shows
const explain = (c, byId) => ({ ...c, metrics: c.metric_ids.map(id => byId.get(id)).filter(Boolean).map(m => ({ id: m.id, label: m.label, text: m.text, source: SOURCE_LABEL[m.source], period: m.period.text, low: !!m.low })) });
export async function insightsView({ week = '' } = {}) {
  if (!(await adsTablesExist())) return { exists: false, week: null, weeks: [], breakdowns: [], topics: [], ideas: { new: [], sent: [], dismissed: [] }, ai: aiConfigured(), sources: SOURCES.map(([key, label]) => ({ key, label, connected: null })) };
  const weeks = await peekRows('weekly_reads', {}, { limit: 60 });
  const r = (week && weeks.find(w => w.week_start === week)) || weeks[0] || null, byId = new Map((r?.numbers?.metrics || []).map(m => [m.id, m]));
  const ideas = await peekRows('topic_ideas', {}, { limit: 500 });
  const shape = i => ({ id: i.id, title: i.title, summary: i.summary, format: formatOf(i.format)?.label || i.format, format_key: i.format, audience: i.audience_hint, evidence: i.evidence, status: i.status, week_start: i.week_start, sent_by: i.sent_by, sent_at: i.sent_at, dismissed_by: i.dismissed_by, dismissed_at: i.dismissed_at });
  return {
    exists: true, ai: aiConfigured(), generated_at: r?.generated_at || '', weeks: weeks.map(w => ({ week_start: w.week_start, period: w.numbers?.period?.text || '', claims: (w.claims || []).length })),
    week: r ? { week_start: r.week_start, period: r.numbers?.period?.text || '', prev: r.numbers?.prev?.text || '', state: r.read_state, claims: (r.claims || []).map(c => explain(c, byId)), metrics: r.numbers?.metrics || [], overlap_note: r.numbers?.overlap_note || '',
      verification: { asked: r.numbers?.verification?.asked || 0, kept: r.numbers?.verification?.kept || 0, dropped: (r.numbers?.verification?.dropped || []).length }, thresholds: r.numbers?.thresholds || {} } : null,
    sources: r?.sources || SOURCES.map(([key, label]) => ({ key, label, connected: null })), breakdowns: r?.breakdowns || [], topics: r?.topics || [],
    ideas: { new: ideas.filter(i => i.status === 'new').map(shape), sent: ideas.filter(i => i.status === 'sent').map(shape), dismissed: ideas.filter(i => i.status === 'dismissed').map(shape) },
  };
}
// Ideas a person has sent to Programs (the Programs index's "Ideas from Ads" strip reads only these)
export async function sentIdeas() {
  if (!(await adsTablesExist().catch(() => false))) return [];
  return (await peekRows('topic_ideas', { status: 'sent' })).map(i => ({ id: i.id, title: i.title, summary: i.summary, format: formatOf(i.format)?.label || i.format, track: i.track, parent: i.parent, audience: i.audience_hint, evidence: i.evidence, sent_by: i.sent_by, sent_at: i.sent_at }));
}

// A person's decisions on an idea. Never writes outside the dashboard's own database.
export async function decideIdea(id, action, who, now = new Date()) {
  const i = await getRow('topic_ideas', id);
  if (!i) return { ok: false, status: 404, error: 'No such idea.' };
  if (action === 'send') {
    if (i.status === 'sent') return { ok: true, idea: i, message: 'It was already sent to Programs.' };
    if (i.status !== 'new') return { ok: false, status: 409, error: 'A dismissed idea can’t be sent. Bring it back first.' };
    return { ok: true, idea: await updateRow('topic_ideas', id, { status: 'sent', sent_by: who, sent_at: now.toISOString() }), message: 'It’s on the Programs page now as a draft idea. Nothing was added to the calendar or the website.' };
  }
  if (action === 'dismiss') {
    if (i.status === 'dismissed') return { ok: true, idea: i };
    return { ok: true, idea: await updateRow('topic_ideas', id, { status: 'dismissed', dismissed_by: who, dismissed_at: now.toISOString() }), message: 'Dismissed. It won’t be suggested again.' };
  }
  if (action === 'undismiss') {
    if (i.status !== 'dismissed') return { ok: true, idea: i };
    return { ok: true, idea: await updateRow('topic_ideas', id, { status: 'new', dismissed_by: '', dismissed_at: null }), message: 'Brought back.' };
  }
  return { ok: false, status: 400, error: 'Unknown request.' };
}
