// Ads › Outside research: once a week, look OUTSIDE EP for what is NEW and could matter to its paid ads (what Meta changed in the last 60 days, what similar advertisers pay,
// how costs move this season, policy changes in the last 60 days) and show it as a short, sourced note, with EP's own last-30-day cost figures beside the outside ones.
//
// THE RULE: NO CLAIM WITHOUT A SOURCE. The model is given Anthropic's own web search tool and EP-neutral context ONLY: the questions below and one line saying what kind of business EP is.
// It is never given a customer, a campaign, a spend figure or any number from EP's account. What comes back is checked IN CODE, statement by statement (checkStatement):
//   - it must carry at least one citation, and every cited address must be one the search really returned in this very response (an address the model remembered is dropped);
//   - the address must be a web page (http or https) on a site this file's list allows;
//   - every number, percentage and date it quotes must appear in the cited snippet (a quoted number is matched exactly, not rounded; a month name must be in the snippet too);
//   - most of its content words must appear in the snippet (a statement that merely sits next to a source is dropped);
//   - no advice and no cause or reason ("should", "because", "so", "likely"...): the same word list the weekly read uses (reasoningWord);
//   - it must be a whole sentence (ends with a full stop, question or exclamation mark; one that stops at a comma, colon or mid-word is dropped) of a reasonable length;
//   - it must start with the letter of the question it answers, (a) to (d). For (a), (c) and (d), which are about what is NEW, the source must be recent (see recentReason):
//     page_age within 90 days when the search result gives one; otherwise the cited text must itself carry a date in the last year. Nothing is guessed: no date means dropped;
//   - a statement already kept in this look is dropped.
// A statement that fails is DROPPED, never repaired. What is left is kept with its link and the day the page was read. If nothing is left the page says so.
// EP's own figures (cost per 1,000 views, per click, per lead or purchase, last 30 days, from the dashboard's own synced results) are only ever shown on the page beside the outside ones.
// They are computed here in code and are NEVER put in the search request.
// It only informs: it changes no rule and no ad, and it writes nothing outside the dashboard's own database. No key or a failed call: it says so and invents nothing.
import { adsTablesExist, ensureAdsTables, peekRows, createRow, deleteRow, periodTotals } from './adsstore.js';
import { quotedNumbers, reasoningWord, words, mondayOf, dayName } from './insightsverify.js';

// (own small copies of two helpers, so the checking can be tested on its own in node: the app's other copies live in files that load more)
const aiConfigured = () => !!(process.env.ANTHROPIC_API_KEY || '').trim();
const todayET = () => new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })).toLocaleDateString('en-CA');
const MODEL = 'claude-sonnet-5-5';
const base = () => (process.env.ANTHROPIC_BASE || 'https://api.anthropic.com').replace(/\/+$/, '');

// What kind of business EP is, in one line. This and the questions are everything the model is told about EP.
export const BUSINESS = 'online courses in philosophy, mythology and contemplative practice';
// The questions (kept here so they can be changed later; there are no more than the search limit)
export const QUESTIONS = [
  'What has Meta changed in the last 60 days about ad delivery, attribution windows, targeting or optimisation that affects advertisers selling online courses or collecting sign-ups?',
  'What do advertisers pay? Which CPM, CPC, cost-per-lead and conversion benchmarks has a named source published, with the year, for online education or e-learning advertisers on Meta?',
  'How are ad costs moving this season (Black Friday, Cyber Monday and the holidays) for advertisers on Meta?',
  'Which Meta ad policy changes were announced or updated in the last 60 days that affect advertisers of courses, education or sign-ups? Leave out standing policy that has not changed.',
];
const letter = i => String.fromCharCode(97 + i);   // the questions are answered as (a), (b), (c), (d)
const NEWS = ['a', 'c', 'd'];   // the questions about what is new: their sources must be recent. (b), the benchmarks, may be older, but the year is asked for.
export const MAX_SEARCHES = 5;
// The sites a statement may come from: Meta's own pages first, then well-known industry publications on ad costs (an edited list: add a host here only when you are sure it exists). A statement from anywhere else is dropped.
export const ALLOWED_DOMAINS = ['facebook.com', 'transparency.meta.com', 'developers.facebook.com', 'about.fb.com', 'meta.com', 'wordstream.com', 'hubspot.com', 'socialmediaexaminer.com', 'searchenginejournal.com', 'adweek.com',
  'marketingland.com', 'searchengineland.com', 'emarketer.com', 'sproutsocial.com', 'hootsuite.com', 'adespresso.com', 'tinuiti.com', 'databox.com'];
export const RECENT_DAYS = 90, DATED_DAYS = 365, OURS_DAYS = 30;   // how old a source may be (with a page_age / with only a date in its cited text), and the stretch of our own results shown
export const MIN_GAP_MS = 5 * 60 * 1000;   // "Look now" can be pressed again after this long
const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

const SYSTEM = `You are a careful researcher helping a small online school that runs paid ads on Meta. Use the web search tool to look for what the questions ask about. Rules: write each finding as its own short paragraph. It begins with the letter of the question it answers in brackets, like (a), then ONE complete plain sentence of fact that ends with a full stop. Never stop part-way through a sentence. Cite the search result that states it. Say only what a cited page says: copy any number, percentage or date exactly as the page writes it, and never work out, round, add up or guess one. Begin each sentence with who says it ("Meta says...", "WordStream reports..."). Prefer sources dated within the last 60 to 90 days. For questions (a), (c) and (d), say nothing from an older or undated page, and nothing about standing policy that has not changed; only what is new. For question (b), say the year the benchmark covers. Ignore anything about health, weight loss, diet, mental health or financial products. Never give advice, an opinion, a prediction, a reason or a cause. Do not use the words should, must, need, because, so, therefore, likely, probably or recommend. If a search finds nothing useful for a question, say nothing about it. If you find nothing at all, write only: NOTHING_FOUND`;
const userText = today => `Today's date: ${today}.\nThe business: ${BUSINESS}.\nThe questions:\n${QUESTIONS.map((q, i) => `(${letter(i)}) ${q}`).join('\n')}`;

// ---- Asking (the same call pattern as the weekly read: ANTHROPIC_API_KEY, ANTHROPIC_BASE only in tests), with Anthropic's web search tool.
// A long search can stop part-way ("pause_turn"); then the same conversation is sent back once or twice so it can finish.
async function ask(today) {
  if (!aiConfigured()) return { state: 'no_key' };
  const messages = [{ role: 'user', content: userText(today) }], blocks = [], signal = AbortSignal.timeout(100000);
  try {
    for (let round = 0; round < 3; round++) {
      const res = await fetch(`${base()}/v1/messages`, {
        method: 'POST', signal, cache: 'no-store',
        headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY.trim(), 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({ model: MODEL, max_tokens: 3000, system: SYSTEM, messages, tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: MAX_SEARCHES, allowed_domains: ALLOWED_DOMAINS }] }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !Array.isArray(j.content)) return { state: 'failed' };
      blocks.push(...j.content);
      if (j.stop_reason !== 'pause_turn') return { state: 'ok', blocks };
      messages.push({ role: 'assistant', content: j.content });
    }
    return { state: 'ok', blocks };
  } catch { return { state: 'failed' }; }
}

// ---- Reading the answer. The shape follows Anthropic's documented web search response: "server_tool_use" blocks (the searches), "web_search_tool_result" blocks whose content is a list of
// { type: 'web_search_result', url, title, page_age } (or one error object), and "text" blocks whose "citations" are { type: 'web_search_result_location', url, title, cited_text }.
export function readAnswer(blocks) {
  const results = new Map(), cited = [];
  let searches = 0, uncited = 0, searchError = '', buffer = '', last = null;
  for (const b of Array.isArray(blocks) ? blocks : []) {
    if (b?.type === 'server_tool_use' && b.name === 'web_search') searches++;
    else if (b?.type === 'web_search_tool_result') {
      if (Array.isArray(b.content)) for (const r of b.content) { if (r?.type === 'web_search_result' && typeof r.url === 'string' && !results.has(r.url)) results.set(r.url, { url: r.url, title: String(r.title || '').trim(), page_age: String(r.page_age || '').trim() }); }
      else if (b.content?.type === 'web_search_tool_result_error') searchError = String(b.content.error_code || 'error');
    } else if (b?.type === 'text') {
      let text = String(b.text || '');
      if (!(Array.isArray(b.citations) && b.citations.length) && last && !buffer) { const m = text.match(/^\s*[.!?]+["”’)]*/); if (m) { last.text += m[0].trim(); text = text.slice(m[0].length); } }   // the full stop the model wrote just after the cited words ends that sentence
      if (!(Array.isArray(b.citations) && b.citations.length) && text.trim()) last = null;
      if (Array.isArray(b.citations) && b.citations.length) {   // a statement is the sentence this block ends: the last line of the uncited text before it, then the block's own words
        const lines = buffer.split(/\n+/), lead = lines.pop() || '', joined = /^\s*[a-z,;]/.test(text);
        uncited += lines.filter(l => tidy(l).length > 25).length + (joined || tidy(lead).length <= 25 ? 0 : 1);   // sentences written with no source at all
        const tagOnly = /^\s*[(\[]\s*[a-d]\s*[)\]]\s*$/i.test(lead);   // "(a)" on its own, just before the cited words
        cited.push(last = { text: tagOnly ? `${lead} ${text}` : joined ? lead + text : text, citations: b.citations.map(c => ({ url: typeof c?.url === 'string' ? c.url : '', title: String(c?.title || ''), snippet: String(c?.cited_text || '').trim() })) });
        buffer = '';
      } else buffer += text;
    }
  }
  uncited += buffer.split(/\n+/).filter(l => tidy(l).length > 25 && !/NOTHING_FOUND/.test(l)).length;
  return { results, cited, uncited, searches, searchError };
}

// ---- Checking one statement
const tidy = t => String(t || '').replace(/[*_`#>]+/g, ' ').replace(/^\s*(?:[-•]|\d+[.)])\s+/, '').replace(/\s+/g, ' ').trim();
const norm = t => tidy(t).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
// "May" counts as a month only beside a day or a year (it is also a word)
const monthIn = (t, m) => (m === 'may' ? /\b(\d{1,2}(st|nd|rd|th)?\s+may|may\s+\d)/i : new RegExp(`\\b${m}\\b`, 'i')).test(t);
const hostOk = u => { try { const x = new URL(u); return /^https?:$/.test(x.protocol) && ALLOWED_DOMAINS.some(d => x.hostname === d || x.hostname.endsWith(`.${d}`)); } catch { return false; } };
// Returns '' when the statement stands, or the reason it was left out (plain words, for the count on the page).
// topic: the question it answers (a to d); with a topic about what is new, the source must also be recent (today = YYYY-MM-DD).
export function checkStatement(text, citations, results, topic = '', today = todayET()) {
  const t = tidy(text);
  if (!citations?.length) return 'It had no source.';
  if (citations.some(c => !c.url || !results.has(c.url))) return 'Its source was not one the search returned.';
  if (citations.some(c => !hostOk(c.url))) return 'Its source was not on the list of sites we accept.';
  if (citations.some(c => !c.snippet)) return 'Its source gave no text to check it against.';
  if (t.length < 40 || t.length > 400 || t.split(' ').length < 6) return 'Its length was wrong.';
  if (!/[.!?]["”’)\]]*$/.test(t)) return 'It stopped part-way, not as a whole sentence.';
  if (reasoningWord(t)) return 'It gave advice or a reason, instead of only saying what the page says.';
  const snip = citations.map(c => c.snippet).join(' '), have = quotedNumbers(snip), low = snip.toLowerCase();
  for (const n of quotedNumbers(t)) { if (n.unit === 'k' || !have.some(h => h.v === n.v && (n.unit === '' || n.unit === h.unit))) return 'A number or date in it was not in the text of its source.'; }
  for (const m of MONTHS) if (monthIn(t, m) && !monthIn(low, m)) return 'A date in it was not in the text of its source.';
  const mine = [...new Set(words(t))], theirs = new Set(words(snip));
  if (mine.length < 4 || mine.filter(w => theirs.has(w)).length / mine.length < 0.35) return 'Its words did not match the text of its source.';
  if (NEWS.includes(topic)) return recentReason(citations, results, today);
  return '';
}

// ---- Is the source recent? For the questions about what is NEW. Dates are only ever read from what the search returned (the result's page_age, the cited text); none is made up.
const MONTH_RX = 'january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sept|sep|oct|nov|dec';
const monthNo = m => MONTHS.findIndex(x => x.startsWith(m.slice(0, 3).toLowerCase()));
// Every date a text states, as { at (a UTC day number), day (was a day of the month given) }. Forms read: 12 Nov 2026, November 12, 2026, November 2026, 2026-11-12.
export function datesIn(text) {
  const t = String(text || ''), out = [], add = (y, m, d) => { const ms = Date.UTC(+y, m, d || 1); if (m >= 0 && m < 12 && (!d || (d >= 1 && d <= 31))) out.push({ at: Math.floor(ms / 864e5), day: !!d }); };
  for (const m of t.matchAll(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(${MONTH_RX})\\.?,?\\s+(20\\d\\d)\\b`, 'gi'))) add(m[3], monthNo(m[2]), +m[1]);
  for (const m of t.matchAll(new RegExp(`\\b(${MONTH_RX})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(20\\d\\d)\\b`, 'gi'))) add(m[3], monthNo(m[1]), +m[2]);
  for (const m of t.matchAll(new RegExp(`\\b(${MONTH_RX})\\.?,?\\s+(20\\d\\d)\\b`, 'gi'))) add(m[2], monthNo(m[1]), 0);
  for (const m of t.matchAll(/\b(20\d\d)-(\d\d)-(\d\d)\b/g)) add(m[1], +m[2] - 1, +m[3]);
  return out;
}
const dayOf = today => Math.floor(Date.parse(`${today}T12:00:00Z`) / 864e5);
const SAYS_OLD = 'Its source was not recent enough for a question about what is new.';
// A cited source passes when: its page_age (when the search result gives one we can read) is within RECENT_DAYS; otherwise the cited text itself must state a date in the last DATED_DAYS
// (a date a little ahead, such as "from 3 January", counts too). A source with neither is dropped.
function recentReason(citations, results, today) {
  const now = dayOf(today);
  for (const c of citations) {
    const made = datesIn(results.get(c.url)?.page_age)[0];
    if (made) { if (now - made.at > RECENT_DAYS || now - made.at < -7) return SAYS_OLD; continue; }
    if (!datesIn(c.snippet).some(d => now - d.at <= DATED_DAYS && now - d.at >= -180)) return SAYS_OLD;
  }
  return '';
}
// "published 12 Nov 2026": the source's own date, in plain form, when the result gives one we can read (never worked out from anything else)
export function publishedText(pageAge) {
  const d = datesIn(pageAge)[0];
  return d ? new Date(d.at * 864e5).toLocaleDateString('en-GB', { timeZone: 'UTC', ...(d.day ? { day: 'numeric' } : {}), month: 'short', year: 'numeric' }) : '';
}

// All of an answer's statements, checked. kept = what stands; dropped = the reasons.
export function checkAnswer(read, today = todayET()) {
  const kept = [], dropped = [], seen = new Set();
  for (const c of read.cited.slice(0, 40)) {
    const tag = tidy(c.text).match(/^[(\[]\s*([a-d])\s*[)\]]\s*/i), topic = tag ? tag[1].toLowerCase() : '', body = tag ? tidy(c.text).slice(tag[0].length) : c.text;
    let why = topic ? checkStatement(body, c.citations, read.results, topic, today) : 'It did not say which question it answers.';
    const key = norm(body);
    if (!why) { if (seen.has(key)) why = 'It said the same thing as a statement already kept.'; else seen.add(key); }
    if (why) { dropped.push(why); continue; }
    kept.push({ statement: tidy(body), topic, norm: key, sources: c.citations.map(x => ({ url: x.url, title: read.results.get(x.url).title || x.title || x.url, snippet: x.snippet, page_age: read.results.get(x.url).page_age })) });
  }
  for (let i = 0; i < (read.uncited || 0); i++) dropped.push('It had no source.');
  return { kept, dropped };
}

// ---- A look: ask, check, keep. Nothing is made without a key; a failed call keeps nothing and says so.
const sourceKey = s => `${s.sources[0].url}|${norm(s.sources[0].snippet)}`;
let lastStart = 0;
export async function runResearch({ preview = false, manual = false, now = new Date(), today = todayET() } = {}) {
  const week = mondayOf(today), out = { preview, week_start: week, searches_allowed: MAX_SEARCHES, questions: QUESTIONS.length, key: aiConfigured() };
  if (preview) return out;
  if (!out.key) return { ...out, state: 'no_key' };
  if (manual) {   // a person pressed "Look now": once every few minutes, however many instances are running
    const last = (await adsTablesExist()) ? (await peekRows('outside_notes', { kind: 'run' }, { limit: 1 }))[0] : null;
    if (Date.now() - lastStart < MIN_GAP_MS || (last?.read_at && Date.now() - Date.parse(last.read_at) < MIN_GAP_MS)) return { ...out, state: 'too_soon' };
    lastStart = Date.now();   // also when the look then fails: pressing again at once would just be another search run
  }
  const got = await ask(today);
  if (got.state !== 'ok') return { ...out, state: got.state };
  const read = readAnswer(got.blocks);
  if (!read.results.size && read.searchError && !read.cited.length) return { ...out, state: 'failed', searches: read.searches };
  const { kept, dropped } = checkAnswer(read, today);
  if (!kept.length && (await peekRows('outside_notes', { week_start: week, kind: 'note' }, { limit: 1 })).length) return { ...out, state: 'unchanged', searches: read.searches, results: read.results.size, kept: 0, dropped: dropped.length };   // a second look that finds nothing never wipes what this week already has
  await ensureAdsTables();
  const earlier = (await peekRows('outside_notes', { kind: 'note' }, { limit: 2000 })).filter(r => r.week_start !== week), before = new Set(earlier.flatMap(r => [r.norm, r.source_key]));
  for (const r of await peekRows('outside_notes', { week_start: week }, { limit: 500 })) await deleteRow('outside_notes', r.id);   // looking again in the same week replaces that week
  for (const s of kept) await createRow('outside_notes', { week_start: week, kind: 'note', topic: s.topic, statement: s.statement, sources: s.sources, status: before.has(s.norm) || before.has(sourceKey(s)) ? 'Seen before' : 'New', read_at: now.toISOString(), norm: s.norm, source_key: sourceKey(s) });
  const info = { state: kept.length ? 'ok' : 'empty', searches: read.searches, results: read.results.size, asked: read.cited.length + (read.uncited || 0), kept: kept.length, dropped };
  await createRow('outside_notes', { week_start: week, kind: 'run', read_at: now.toISOString(), info });
  return { ...out, state: info.state, searches: read.searches, results: read.results.size, kept: kept.length, dropped: dropped.length };
}

// ---- Our own figures, beside the outside ones. From the dashboard's own synced Meta results (ads_results), the last OURS_DAYS days. Computed here in code; never sent to the search.
// A figure is shown only when it rests on enough: at least 1,000 views (CPM), 30 clicks (CPC), 5 leads or 5 purchases.
const money = v => `$${v.toFixed(2)}`, num = n => n.toLocaleString('en-US');
export function ourFigures(t) {
  const f = [];
  if (!t) return f;
  if (t.impressions >= 1000) f.push({ key: 'cpm', label: 'Cost per 1,000 views (CPM)', per: 'per 1,000 views', v: t.spend_cents * 10 / t.impressions, basis: `${num(t.impressions)} views` });
  if (t.clicks >= 30) f.push({ key: 'cpc', label: 'Cost per click (CPC)', per: 'per click', v: t.spend_cents / 100 / t.clicks, basis: `${num(t.clicks)} clicks` });
  if (t.leads >= 5) f.push({ key: 'cpl', label: 'Cost per lead', per: 'per lead', v: t.spend_cents / 100 / t.leads, basis: `${num(t.leads)} leads` });
  if (t.purchases >= 5) f.push({ key: 'cpp', label: 'Cost per purchase', per: 'per purchase', v: t.spend_cents / 100 / t.purchases, basis: `${num(t.purchases)} purchases` });
  return f;
}
const KINDS = [['cpm', /\bCPM\b|cost per (?:thousand|1,000|mille)|per (?:1,000|thousand) impressions/i], ['cpc', /\bCPC\b|cost per click|per click/i], ['cpl', /\bCPL\b|cost per lead|per lead/i], ['cpp', /\bCPA\b|cost per (?:purchase|acquisition|conversion|sale)|per purchase/i]];
// An outside benchmark statement that names one kind of cost and one dollar figure, set beside ours of the same kind. Two numbers side by side, nothing said about them.
export function compareFor(statement, figures) {
  const hit = KINDS.filter(([, rx]) => rx.test(statement)), amounts = [...new Set((String(statement).match(/\$\s?\d[\d,]*(?:\.\d+)?/g) || []).map(x => x.replace(/[\s$,]/g, '')))];
  const mine = hit.length === 1 && amounts.length === 1 ? figures.find(f => f.key === hit[0][0]) : null;
  return mine ? { label: mine.label, per: mine.per, ours: money(mine.v), outside: money(Number(amounts[0])) } : null;
}
async function ours() {
  const to = todayET(), since = new Date(Date.parse(`${to}T12:00:00Z`) - OURS_DAYS * 864e5).toISOString().slice(0, 10), figures = ourFigures(await periodTotals(since));
  return { days: OURS_DAYS, figures: figures.map(f => ({ key: f.key, label: f.label, per: f.per, value: money(f.v), basis: f.basis })), raw: figures };
}

// ---- What the page shows
const weekText = w => `Week of ${dayName(w)}`;
export async function researchView({ week = '' } = {}) {
  const base0 = { ai: aiConfigured(), questions: QUESTIONS, max_searches: MAX_SEARCHES, this_week: weekText(mondayOf(todayET())) };
  if (!(await adsTablesExist())) return { ...base0, exists: false, weeks: [], week: null, notes: [], ours: { days: OURS_DAYS, figures: [] } };
  const runs = await peekRows('outside_notes', { kind: 'run' }, { limit: 60 });
  const r = (week && runs.find(x => x.week_start === week)) || runs[0] || null;
  const notes = r ? await peekRows('outside_notes', { week_start: r.week_start, kind: 'note' }, { limit: 100 }) : [];
  const { raw, ...mine } = await ours();
  return {
    ...base0, exists: true, made_this_week: runs.some(x => x.week_start === mondayOf(todayET())), ours: mine,
    weeks: runs.map(x => ({ week_start: x.week_start, label: weekText(x.week_start), kept: x.info?.kept || 0 })),
    week: r ? { week_start: r.week_start, label: weekText(r.week_start), read_at: r.read_at, state: r.info?.state || 'empty', searches: r.info?.searches || 0, asked: r.info?.asked || 0, kept: r.info?.kept || 0, dropped: (r.info?.dropped || []).length } : null,
    notes: notes.map(n => ({ id: n.id, statement: n.statement, status: n.status, read_at: n.read_at, sources: (n.sources || []).map(x => ({ ...x, published: publishedText(x.page_age) })), compare: n.topic === 'b' ? compareFor(n.statement, raw) : null })),
  };
}
