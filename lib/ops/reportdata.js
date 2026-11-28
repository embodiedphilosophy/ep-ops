// The Practice Report link (Ads PR 4): the ONLY file that talks to the quiz's database.
//
// What it is: a READ-ONLY login on the Practice Report quiz's Neon database (REPORT_DATABASE_URL). Only ANONYMOUS TOTALS come out of here: how many people got each
// archetype, how many gave each answer, and how many arrived from each ad campaign (by the tags on the link). Nothing in this file selects, returns, logs or stores a name,
// an email or any row about one person; every function returns counts and nothing else. The address of the database is never printed or logged.
//
// THE QUIZ'S TABLE AND COLUMN NAMES ARE NOT KNOWN YET. Every name this file uses is in REPORT_SCHEMA just below, and nowhere else. When the real names arrive, change that
// one object and nothing else. The contract (what each function returns) is in docs/ops-handoff.md, "Ads, PR 4".
//
// Test only, inert unless set: REPORT_TEST_DB=pglite runs the same queries on an in-process Postgres (PGlite) holding a small SYNTHETIC quiz (REPORT_SCHEMA's shape, with
// made-up people in it, so the tests can prove no personal value ever comes out). With it set, the real database is never used, whatever REPORT_DATABASE_URL says.
import { neon } from '@neondatabase/serverless';

// ADJUST to the real names. Plain identifiers only (letters, digits, underscores); they are checked and quoted before they reach a query.
export const REPORT_SCHEMA = {
  table: 'quiz_results',            // one row per completed quiz
  archetype: 'archetype',           // the result the person was given (the "type")
  takenAt: 'created_at',            // when the quiz was finished (a timestamp)
  utmSource: 'utm_source',          // the tags on the link they arrived from (empty for people who did not come from an ad)
  utmMedium: 'utm_medium',
  utmCampaign: 'utm_campaign',
  utmContent: 'utm_content',        // optional: an ad set or ad, if the links carry one. Leave '' if the quiz has no such column
  // The quiz's own questions, by the name EP uses for them: a column holding the answer each person gave (a short category, never free text)
  categories: {
    practice_stage: { column: 'practice_stage', label: 'Where they are in practice' },
    stuck: { column: 'stuck_on', label: 'What they get stuck on' },
    familiarity: { column: 'tradition_familiarity', label: 'How well they know the tradition' },
    draws: { column: 'what_draws_them', label: 'What draws them' },       // Ads PR 5: the handoff names five questions; these two are placeholders like the rest until the real names arrive
    roles: { column: 'their_role', label: 'Their role' },
  },
};

// Columns that hold personal details. Nothing in REPORT_SCHEMA may point at one of these, and the test asserts no query mentions them.
export const PERSONAL = /^name$|(^|_)(first|last|full|surname|username|email|mail|phone|ip|address|subscriber|contact|ssn|dob|birth)(_|$)/i;

const NOT_CONNECTED = {
  connected: false,
  reason: 'The Practice Report isn’t connected yet.',
  todo: 'To connect it: create a read-only login on the quiz’s database and add its address in Vercel as REPORT_DATABASE_URL (Production, marked Sensitive). Never paste it anywhere else.',
};
const url = () => (process.env.REPORT_DATABASE_URL || '').trim();
const testDb = () => process.env.REPORT_TEST_DB === 'pglite';
export const reportConfigured = () => testDb() || !!url();

// ---- Read only: one door, and only SELECT goes through it
let neonFn = null, test = null;
const queryLog = [];
export const reportQueryLog = () => queryLog.slice();   // the text of every query run while the test switch is set (never values)

const VERBS = /\b(insert|update|delete|drop|alter|create|truncate|grant|revoke|copy|call|do|merge|vacuum|set|commit|begin|lock|comment)\b/i;
export function assertReadOnly(text) {
  const t = String(text).trim();
  if (!/^select\s/i.test(t) || t.includes(';') || VERBS.test(t.replace(/'[^']*'/g, ''))) throw new Error('The Practice Report link only reads: that is not a plain SELECT.');
  return t;
}
async function run(text, params = []) {
  const t = assertReadOnly(text);
  if (testDb()) {
    queryLog.push(t);
    test ||= await syntheticQuiz();
    return (await test.query(t, params)).rows;
  }
  neonFn ||= neon(url());
  return neonFn.query(t, params);
}

// An identifier from REPORT_SCHEMA: letters, digits and underscores only, never a personal column, quoted
function id(name) {
  if (!/^[a-z_][a-z0-9_]*$/i.test(String(name))) throw new Error('The Practice Report mapping has a name that is not a plain column name.');
  if (PERSONAL.test(name)) throw new Error('The Practice Report mapping points at a personal column. Only anonymous answers may be used.');
  return `"${name}"`;
}
const S = () => REPORT_SCHEMA;
const period = ({ since, until } = {}, params, col) => {
  const w = [];
  if (since) { params.push(since); w.push(`${col} >= $${params.length}`); }
  if (until) { params.push(until); w.push(`${col} < $${params.length}`); }
  return w;
};
const fail = e => ({ connected: true, ok: false, error: 'The Practice Report couldn’t be read just now.', detail: String(e?.message || e).replace(/postgres(ql)?:\/\/\S+/gi, '').slice(0, 120) });

// What this link can say about itself, with no query: is it set up
export const reportStatus = () => (reportConfigured() ? { connected: true, source: 'The Practice Report (the quiz’s database), anonymous counts only' } : NOT_CONNECTED);

// → { connected, ok, total, archetypes: [{ archetype, count }] }   (biggest first; people with no result are not counted)
export async function archetypeCounts(range = {}) {
  if (!reportConfigured()) return NOT_CONNECTED;
  try {
    const params = [], w = [`${id(S().archetype)} IS NOT NULL`, ...period(range, params, id(S().takenAt))];
    const rows = await run(`SELECT ${id(S().archetype)} AS archetype, COUNT(*)::int AS count FROM ${id(S().table)} WHERE ${w.join(' AND ')} GROUP BY ${id(S().archetype)} ORDER BY count DESC, archetype`, params);
    const archetypes = rows.map(r => ({ archetype: String(r.archetype), count: Number(r.count) }));
    return { connected: true, ok: true, total: archetypes.reduce((n, a) => n + a.count, 0), archetypes, range };
  } catch (e) { return fail(e); }
}

// → { connected, ok, categories: [{ key, label }] }   (what answer breakdowns exist)
export const answerCategories = () => (reportConfigured() ? { connected: true, ok: true, categories: Object.entries(S().categories).map(([key, c]) => ({ key, label: c.label })) } : NOT_CONNECTED);

// → { connected, ok, category, label, total, answers: [{ answer, count }] }   (one of the quiz's own questions)
export async function answerCounts(category, range = {}) {
  if (!reportConfigured()) return NOT_CONNECTED;
  const c = S().categories[category];
  if (!c) return { connected: true, ok: false, error: 'The quiz has no question called that.' };
  try {
    const params = [], w = [`${id(c.column)} IS NOT NULL`, ...period(range, params, id(S().takenAt))];
    const rows = await run(`SELECT ${id(c.column)} AS answer, COUNT(*)::int AS count FROM ${id(S().table)} WHERE ${w.join(' AND ')} GROUP BY ${id(c.column)} ORDER BY count DESC, answer`, params);
    const answers = rows.map(r => ({ answer: String(r.answer), count: Number(r.count) }));
    return { connected: true, ok: true, category, label: c.label, total: answers.reduce((n, a) => n + a.count, 0), answers, range };
  } catch (e) { return fail(e); }
}

// People who arrived from an ad, by the tags on their link, with the archetype they got: how many of each. utm_source = meta by default.
// → { connected, ok, hasContent, rows: [{ campaign, content, archetype, count }] }   (campaign = the utm_campaign tag; content = utm_content or '')
export async function archetypesByAd(range = {}, { source = 'meta' } = {}) {
  if (!reportConfigured()) return NOT_CONNECTED;
  try {
    const params = [], content = S().utmContent ? id(S().utmContent) : null;
    const w = [`${id(S().archetype)} IS NOT NULL`, `${id(S().utmCampaign)} IS NOT NULL`, `${id(S().utmCampaign)} <> ''`, ...period(range, params, id(S().takenAt))];
    if (source) { params.push(source); w.push(`LOWER(${id(S().utmSource)}) = $${params.length}`); }
    const cols = [`${id(S().utmCampaign)} AS campaign`, content ? `COALESCE(${content}, '') AS content` : `'' AS content`, `${id(S().archetype)} AS archetype`];
    const rows = await run(`SELECT ${cols.join(', ')}, COUNT(*)::int AS count FROM ${id(S().table)} WHERE ${w.join(' AND ')} GROUP BY 1, 2, 3 ORDER BY count DESC`, params);
    return { connected: true, ok: true, hasContent: !!content, rows: rows.map(r => ({ campaign: String(r.campaign), content: String(r.content || ''), archetype: String(r.archetype), count: Number(r.count) })), range };
  } catch (e) { return fail(e); }
}

// ---- Test only: a synthetic quiz in an in-process Postgres. The made-up people are there so a test can prove none of their details ever leave.
async function syntheticQuiz() {
  const pkg = '@electric-sql/pglite';   // a name held in a variable, so the build neither bundles nor traces it (as the Ads database door does)
  const { PGlite } = await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ pkg);
  const db = new PGlite(), S0 = S();
  await db.query(`CREATE TABLE ${S0.table} (id serial PRIMARY KEY, full_name text, email text, ${S0.archetype} text, ${S0.takenAt} timestamptz, ${S0.utmSource} text, ${S0.utmMedium} text, ${S0.utmCampaign} text, ${S0.utmContent} text, ${Object.values(S0.categories).map(c => `${c.column} text`).join(', ')})`);
  const T = ['The Contemplative', 'The Devotee', 'The Scholar', 'The Householder'], ST = ['beginner', 'steady', 'deep'], STK = ['time', 'doubt', 'isolation'], FAM = ['new', 'some', 'well'], DRAW = ['stillness', 'philosophy', 'community'], ROLE = ['practitioner', 'teacher', 'student'];
  const now = Date.now(), cats = Object.values(S0.categories).map(c => c.column);
  for (let i = 0; i < 60; i++) {
    const ad = i % 3 === 0;   // every third person came from the Kali Winter 2027 ad campaign
    const answers = { practice_stage: ST[i % 3], stuck_on: STK[i % 3 === 0 ? 0 : (i % 2) + 1], tradition_familiarity: FAM[i % 3], what_draws_them: DRAW[(i + 1) % 3], their_role: ROLE[(i + 2) % 3] };
    const vals = [`Synthetic Person ${i}`, `synthetic.person.${i}@example.invalid`, T[i % 2 === 0 ? 0 : i % 4], new Date(now - (i % 40) * 86400e3).toISOString(), ad ? 'meta' : 'newsletter', ad ? 'paid_social' : 'email', ad ? 'kali-winter-2027' : 'weekly', '', ...cats.map(c => answers[c])];
    await db.query(`INSERT INTO ${S0.table} (full_name, email, ${S0.archetype}, ${S0.takenAt}, ${S0.utmSource}, ${S0.utmMedium}, ${S0.utmCampaign}, ${S0.utmContent}, ${cats.join(', ')}) VALUES (${vals.map((_, k) => `$${k + 1}`).join(', ')})`, vals);
  }
  return db;
}
