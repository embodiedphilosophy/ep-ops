// Ads › Outside research: once a week, look OUTSIDE EP for things that could matter to its paid ads (Meta's policies, features and costs for ads like ours, ad-cost
// benchmarks for similar advertisers, rules that could get an ad rejected) and show them as a short, sourced note.
//
// THE RULE: NO CLAIM WITHOUT A SOURCE. The model is given Anthropic's own web search tool and EP-neutral context ONLY: the questions below and one line saying what kind of business EP is.
// It is never given a customer, a campaign, a spend figure or any number from EP's account. What comes back is checked IN CODE, statement by statement (checkStatement):
//   - it must carry at least one citation, and every cited address must be one the search really returned in this very response (an address the model remembered is dropped);
//   - the address must be a web page (http or https) on a site this file's list allows;
//   - every number, percentage and date it quotes must appear in the cited snippet (a quoted number is matched exactly, not rounded; a month name must be in the snippet too);
//   - most of its content words must appear in the snippet (a statement that merely sits next to a source is dropped);
//   - no advice and no cause or reason ("should", "because", "so", "likely"...): the same word list the weekly read uses (reasoningWord);
//   - a statement already kept in this look is dropped.
// A statement that fails is DROPPED, never repaired. What is left is kept with its link and the day the page was read. If nothing is left the page says so.
// It only informs: it changes no rule and no ad, and it writes nothing outside the dashboard's own database. No key or a failed call: it says so and invents nothing.
import { adsTablesExist, ensureAdsTables, peekRows, createRow, deleteRow } from './adsstore.js';
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
  'What changes has Meta announced in the last few months to its advertising policies that affect ads for online courses, education or wellness?',
  'What changes has Meta announced to its ad features, ad formats or targeting options that affect advertisers who sell online courses or collect sign-ups?',
  'What changes has Meta announced to what advertisers pay, or to how ad costs are measured and reported?',
  'What average cost per click, cost per lead or conversion rate has a named source published for education, e-learning or wellness advertisers on Meta?',
  'Which Meta ad-policy rules about health, wellness, personal attributes or before-and-after claims could get ads for a meditation or philosophy course rejected?',
];
export const MAX_SEARCHES = 5;
// The sites a statement may come from: Meta's own pages first, then a few well-known industry publications. A statement from anywhere else is dropped.
export const ALLOWED_DOMAINS = ['facebook.com', 'transparency.meta.com', 'developers.facebook.com', 'about.fb.com', 'meta.com', 'wordstream.com', 'hubspot.com', 'socialmediaexaminer.com', 'searchenginejournal.com', 'adweek.com'];
export const MIN_GAP_MS = 5 * 60 * 1000;   // "Look now" can be pressed again after this long
const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

const SYSTEM = `You are a careful researcher helping a small online school that runs paid ads on Meta. Use the web search tool to look for what the questions ask about. Rules: write each finding as its own short paragraph of ONE plain sentence of fact, and cite the search result that states it. Say only what a cited page says: copy any number, percentage or date exactly as the page writes it, and never work out, round, add up or guess one. Begin each sentence with who says it ("Meta says...", "WordStream reports..."). Never give advice, an opinion, a prediction, a reason or a cause. Do not use the words should, must, need, because, so, therefore, likely, probably or recommend. If a search finds nothing useful for a question, say nothing about it. If you find nothing at all, write only: NOTHING_FOUND`;
const userText = () => `The business: ${BUSINESS}.\nThe questions:\n${QUESTIONS.map((q, i) => `${i + 1}. ${q}`).join('\n')}`;

// ---- Asking (the same call pattern as the weekly read: ANTHROPIC_API_KEY, ANTHROPIC_BASE only in tests), with Anthropic's web search tool.
// A long search can stop part-way ("pause_turn"); then the same conversation is sent back once or twice so it can finish.
async function ask() {
  if (!aiConfigured()) return { state: 'no_key' };
  const messages = [{ role: 'user', content: userText() }], blocks = [], signal = AbortSignal.timeout(100000);
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
  let searches = 0, uncited = 0, searchError = '', buffer = '';
  for (const b of Array.isArray(blocks) ? blocks : []) {
    if (b?.type === 'server_tool_use' && b.name === 'web_search') searches++;
    else if (b?.type === 'web_search_tool_result') {
      if (Array.isArray(b.content)) for (const r of b.content) { if (r?.type === 'web_search_result' && typeof r.url === 'string' && !results.has(r.url)) results.set(r.url, { url: r.url, title: String(r.title || '').trim(), page_age: String(r.page_age || '').trim() }); }
      else if (b.content?.type === 'web_search_tool_result_error') searchError = String(b.content.error_code || 'error');
    } else if (b?.type === 'text') {
      const text = String(b.text || '');
      if (Array.isArray(b.citations) && b.citations.length) {   // a statement is the sentence this block ends: the last line of the uncited text before it, then the block's own words
        const lines = buffer.split(/\n+/), lead = lines.pop() || '', joined = /^\s*[a-z,;]/.test(text);
        uncited += lines.filter(l => tidy(l).length > 25).length + (joined || tidy(lead).length <= 25 ? 0 : 1);   // sentences written with no source at all
        cited.push({ text: joined ? lead + text : text, citations: b.citations.map(c => ({ url: typeof c?.url === 'string' ? c.url : '', title: String(c?.title || ''), snippet: String(c?.cited_text || '').trim() })) });
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
export function checkStatement(text, citations, results) {
  const t = tidy(text);
  if (!citations?.length) return 'It had no source.';
  if (citations.some(c => !c.url || !results.has(c.url))) return 'Its source was not one the search returned.';
  if (citations.some(c => !hostOk(c.url))) return 'Its source was not on the list of sites we accept.';
  if (citations.some(c => !c.snippet)) return 'Its source gave no text to check it against.';
  if (t.length < 25 || t.length > 400) return 'Its length was wrong.';
  if (reasoningWord(t)) return 'It gave advice or a reason, instead of only saying what the page says.';
  const snip = citations.map(c => c.snippet).join(' '), have = quotedNumbers(snip), low = snip.toLowerCase();
  for (const n of quotedNumbers(t)) { if (n.unit === 'k' || !have.some(h => h.v === n.v && (n.unit === '' || n.unit === h.unit))) return 'A number or date in it was not in the text of its source.'; }
  for (const m of MONTHS) if (monthIn(t, m) && !monthIn(low, m)) return 'A date in it was not in the text of its source.';
  const mine = [...new Set(words(t))], theirs = new Set(words(snip));
  if (mine.length < 4 || mine.filter(w => theirs.has(w)).length / mine.length < 0.35) return 'Its words did not match the text of its source.';
  return '';
}

// All of an answer's statements, checked. kept = what stands; dropped = the reasons.
export function checkAnswer(read) {
  const kept = [], dropped = [], seen = new Set();
  for (const c of read.cited.slice(0, 40)) {
    let why = checkStatement(c.text, c.citations, read.results);
    const key = norm(c.text);
    if (!why) { if (seen.has(key)) why = 'It said the same thing as a statement already kept.'; else seen.add(key); }
    if (why) { dropped.push(why); continue; }
    kept.push({ statement: tidy(c.text), norm: key, sources: c.citations.map(x => ({ url: x.url, title: read.results.get(x.url).title || x.title || x.url, snippet: x.snippet, page_age: read.results.get(x.url).page_age })) });
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
  const got = await ask();
  if (got.state !== 'ok') return { ...out, state: got.state };
  const read = readAnswer(got.blocks);
  if (!read.results.size && read.searchError && !read.cited.length) return { ...out, state: 'failed', searches: read.searches };
  const { kept, dropped } = checkAnswer(read);
  if (!kept.length && (await peekRows('outside_notes', { week_start: week, kind: 'note' }, { limit: 1 })).length) return { ...out, state: 'unchanged', searches: read.searches, results: read.results.size, kept: 0, dropped: dropped.length };   // a second look that finds nothing never wipes what this week already has
  await ensureAdsTables();
  const earlier = (await peekRows('outside_notes', { kind: 'note' }, { limit: 2000 })).filter(r => r.week_start !== week), before = new Set(earlier.flatMap(r => [r.norm, r.source_key]));
  for (const r of await peekRows('outside_notes', { week_start: week }, { limit: 500 })) await deleteRow('outside_notes', r.id);   // looking again in the same week replaces that week
  for (const s of kept) await createRow('outside_notes', { week_start: week, kind: 'note', statement: s.statement, sources: s.sources, status: before.has(s.norm) || before.has(sourceKey(s)) ? 'Seen before' : 'New', read_at: now.toISOString(), norm: s.norm, source_key: sourceKey(s) });
  const info = { state: kept.length ? 'ok' : 'empty', searches: read.searches, results: read.results.size, asked: read.cited.length + (read.uncited || 0), kept: kept.length, dropped };
  await createRow('outside_notes', { week_start: week, kind: 'run', read_at: now.toISOString(), info });
  return { ...out, state: info.state, searches: read.searches, results: read.results.size, kept: kept.length, dropped: dropped.length };
}

// ---- What the page shows
const weekText = w => `Week of ${dayName(w)}`;
export async function researchView({ week = '' } = {}) {
  const base0 = { ai: aiConfigured(), questions: QUESTIONS, max_searches: MAX_SEARCHES, this_week: weekText(mondayOf(todayET())) };
  if (!(await adsTablesExist())) return { ...base0, exists: false, weeks: [], week: null, notes: [] };
  const runs = await peekRows('outside_notes', { kind: 'run' }, { limit: 60 });
  const r = (week && runs.find(x => x.week_start === week)) || runs[0] || null;
  const notes = r ? await peekRows('outside_notes', { week_start: r.week_start, kind: 'note' }, { limit: 100 }) : [];
  return {
    ...base0, exists: true, made_this_week: runs.some(x => x.week_start === mondayOf(todayET())),
    weeks: runs.map(x => ({ week_start: x.week_start, label: weekText(x.week_start), kept: x.info?.kept || 0 })),
    week: r ? { week_start: r.week_start, label: weekText(r.week_start), read_at: r.read_at, state: r.info?.state || 'empty', searches: r.info?.searches || 0, asked: r.info?.asked || 0, kept: r.info?.kept || 0, dropped: (r.info?.dropped || []).length } : null,
    notes: notes.map(n => ({ id: n.id, statement: n.statement, status: n.status, read_at: n.read_at, sources: n.sources })),
  };
}
