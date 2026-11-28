// The Practice Report link (Ads PR 4): the ONLY file that talks to the quiz's database.
//
// What it is: a READ-ONLY login (ops_reader) on the Practice Report quiz's Neon database (REPORT_DATABASE_URL). Only ANONYMOUS TOTALS come out of here: how many people got each
// archetype, how many gave each answer, and how many arrived from each ad campaign (by the tags on the link). Nothing in this file selects, returns, logs or stores a name,
// an email or any row about one person; every function returns counts and nothing else. The address of the database is never printed or logged.
//
// WHAT IT READS: only the safe summary view public.report_stats (one row per finished quiz, answers and link tags, no names or emails). The quiz's raw table holds each person's
// name and email inside one stored document, so the login is closed to it and this file never names it. The SQL that creates the view is in docs/ops-handoff.md ("Practice Report:
// one-time setup"). Every column name this file uses is in REPORT_SCHEMA just below, and nowhere else. The contract (what each function returns) is in docs/ops-handoff.md, "Ads, PR 4".
// Neither the visitor id nor the country is ever selected: nothing here needs them.
//
// Test only, inert unless set: REPORT_TEST_DB=pglite runs the same queries on an in-process Postgres (PGlite) holding a small SYNTHETIC copy of the quiz's database (lib/ops/reportfixture.js:
// the raw table with made-up names and emails, the view, and a read-only login that can read only the view), so the tests can prove no personal value ever comes out. With it set,
// the real database is never used, whatever REPORT_DATABASE_URL says.
import { neon } from '@neondatabase/serverless';

// The real names, from the safe view. Plain identifiers only (letters, digits, underscores); they are checked and quoted before they reach a query.
// kind: 'one' = a text column holding one answer; 'many' = a jsonb column holding either one answer (a string) or several (an array). Each person counts once per value they chose.
export const REPORT_SCHEMA = {
  table: 'report_stats',            // the view, in the public schema
  archetype: 'archetype',           // the result the person was given
  takenAt: 'created_at',            // when the quiz was finished (a timestamp)
  utmSource: 'utm_source',          // the tags on the link they arrived from (empty for people who did not come from an ad)
  utmMedium: 'utm_medium',
  utmCampaign: 'utm_campaign',
  utmContent: 'utm_content',        // an ad set or ad, if the links carry one
  // The quiz's own questions: the column that holds the answer each person gave, and the plain-English name of the question
  categories: {
    stage: { column: 'stage', kind: 'one', label: 'Where they are in practice' },
    draw: { column: 'draw', kind: 'many', label: 'What draws them' },
    edge: { column: 'edge', kind: 'many', label: 'Where they get stuck' },
    fam: { column: 'fam', kind: 'one', label: 'How well they know the tradition' },
    roles: { column: 'roles', kind: 'many', label: 'Their role' },
  },
};

// Plain-English names for the quiz's answer keys (from the quiz's own content). One place; a key not listed here is shown as it is, title-cased.
export const ANSWER_LABELS = {
  stage: { new: 'No practice yet', intermittent: 'Practices on and off', daily_short: 'Once a day, under 20 minutes', daily_long: 'Once a day, 20 minutes or more', twice_daily: 'Twice a day, 20 minutes or more', mature: 'Daily for years' },
  draw: { stillness: 'Stillness and clarity', devotion: 'Devotion and the sacred', meaning: 'Finding meaning in life', emotion: 'Working with emotions and suffering', study: 'Understanding the texts and the philosophy', energy: 'Energy and the body', creativity: 'Creativity and feeling alive' },
  edge: { boredom: 'Nothing seems to happen, so interest fades', doubt: 'Doubting it is working', skeptic: 'Not sure it is for them', restlessness: 'Body or mind will not settle', unsafe: 'Slowing down does not feel safe', seeking: 'Chasing the next technique', consistency: 'Starting strong, then life gets busy' },
  fam: { new: 'New to it', read: 'Has read a little', studied: 'Has studied it', teacher: 'Studied with a teacher or in a program' },
  roles: { yoga_teacher: 'Yoga teacher', meditation_teacher: 'Meditation teacher', therapist: 'Therapist or counselor', somatic: 'Bodyworker or healer', health: 'Healthcare professional', academic: 'Academic or educator', student: 'Student', creative: 'Artist or writer', coach: 'Coach or facilitator', clergy: 'Clergy or chaplain', seeker: 'Spiritual seeker', other: 'Something else' },
  archetype: { shringara: 'The Longing Seeker', hasya: 'The Playful Skeptic', karuna: 'The Heavy Heart', raudra: 'The Inner Fighter', vira: 'The Restless Mind', bhayanaka: 'The Guarded One', bibhatsa: 'The Resistant One', adbhuta: 'The Disenchanted Seeker' },
};
const titleCase = k => String(k).replace(/_/g, ' ').replace(/(^|\s)(\p{L})/gu, (m, a, b) => a + b.toUpperCase());
export const answerLabel = (category, key) => ANSWER_LABELS[category]?.[key] || titleCase(key);
// Columns that hold personal details (or the whole stored document, which has them inside). Nothing in REPORT_SCHEMA may point at one of these, and the test asserts no query mentions them.
export const PERSONAL = /^name$|^data$|^firstname$|(^|_)(first|last|full|surname|username|email|mail|phone|ip|address|subscriber|contact|ssn|dob|birth)(_|$)/i;

const SETUP = 'The safe summary view (report_stats) must exist in the quiz’s database: run the SQL under “Practice Report: one-time setup” in docs/ops-handoff.md once.';
const NOT_CONNECTED = {
  connected: false,
  reason: 'The Practice Report isn’t connected yet.',
  todo: `To connect it: create a read-only login on the quiz’s database and add its address in Vercel as REPORT_DATABASE_URL (Production, marked Sensitive). Never paste it anywhere else. ${SETUP}`,
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
// Test only: runs a plain SELECT on the synthetic quiz as its read-only login (to prove the raw table is closed to it). Refuses unless the test switch is set.
export async function reportTestSelect(text, params = []) {
  if (!testDb()) throw new Error('Test only.');
  test ||= await syntheticQuiz();
  return (await test.query(assertReadOnly(text), params)).rows;
}

// An identifier from REPORT_SCHEMA: letters, digits and underscores only, never a personal column, quoted
function id(name) {
  if (!/^[a-z_][a-z0-9_]*$/i.test(String(name))) throw new Error('The Practice Report mapping has a name that is not a plain column name.');
  if (PERSONAL.test(name)) throw new Error('The Practice Report mapping points at a personal column. Only anonymous answers may be used.');
  return `"${name}"`;
}
const S = () => REPORT_SCHEMA;
const view = () => `public.${id(S().table)}`;
const period = ({ since, until } = {}, params, col) => {
  const w = [];
  if (since) { params.push(since); w.push(`${col} >= $${params.length}`); }
  if (until) { params.push(until); w.push(`${col} < $${params.length}`); }
  return w;
};
// Say what went wrong in plain words (never the connection string); the missing view and a closed door are the two a person can fix
const fail = e => {
  const m = String(e?.message || e), detail = m.replace(/postgres(ql)?:\/\/\S+/gi, '').slice(0, 120);
  if (/relation .*does not exist/i.test(m)) return { connected: true, ok: false, error: 'The Practice Report’s safe summary view doesn’t exist in the quiz’s database yet.', todo: SETUP, detail };
  if (/column .*does not exist/i.test(m)) return { connected: true, ok: false, error: 'The Practice Report’s safe summary view is missing a field the quiz now stores.', todo: 'Re-create the view report_stats with the SQL under “Practice Report: one-time setup” in docs/ops-handoff.md.', detail };
  if (/permission denied/i.test(m)) return { connected: true, ok: false, error: 'The Practice Report login isn’t allowed to read the safe summary view.', todo: 'Run the last lines of the one-time SQL (GRANT SELECT on report_stats to ops_reader), under “Practice Report: one-time setup” in docs/ops-handoff.md.', detail };
  return { connected: true, ok: false, error: 'The Practice Report couldn’t be read just now.', detail };
};

// What this link can say about itself, with no query: is it set up
export const reportStatus = () => (reportConfigured() ? { connected: true, source: 'The Practice Report (the quiz’s database), anonymous counts only' } : NOT_CONNECTED);

// → { connected, ok, total, archetypes: [{ key, archetype, count }] }   (biggest first; people with no result are not counted; archetype = the plain name, key = what the quiz stores)
export async function archetypeCounts(range = {}) {
  if (!reportConfigured()) return NOT_CONNECTED;
  try {
    const params = [], w = [`${id(S().archetype)} IS NOT NULL`, ...period(range, params, id(S().takenAt))];
    const rows = await run(`SELECT ${id(S().archetype)} AS archetype, COUNT(*)::int AS count FROM ${view()} WHERE ${w.join(' AND ')} GROUP BY ${id(S().archetype)} ORDER BY count DESC, archetype`, params);
    const archetypes = rows.map(r => ({ key: String(r.archetype), archetype: answerLabel('archetype', r.archetype), count: Number(r.count) }));
    return { connected: true, ok: true, total: archetypes.reduce((n, a) => n + a.count, 0), archetypes, range };
  } catch (e) { return fail(e); }
}

// → { connected, ok, categories: [{ key, label }] }   (what answer breakdowns exist: the quiz's five questions)
export const answerCategories = () => (reportConfigured() ? { connected: true, ok: true, categories: Object.entries(S().categories).map(([key, c]) => ({ key, label: c.label })) } : NOT_CONNECTED);

// → { connected, ok, category, label, multi, total, answers: [{ key, answer, count }] }   (one of the quiz's own questions)
// total = the people who answered. A question that lets people choose several (draw, edge, roles) counts each person once per value they chose, so its counts can add up to more than total.
export async function answerCounts(category, range = {}) {
  if (!reportConfigured()) return NOT_CONNECTED;
  const c = S().categories[category];
  if (!c) return { connected: true, ok: false, error: 'The quiz has no question called that.' };
  try {
    const col = id(c.column), params = [], multi = c.kind === 'many';
    const w = [`${col} IS NOT NULL`, ...period(range, params, id(S().takenAt))];
    let rows, total;
    if (!multi) {
      rows = await run(`SELECT ${col} AS answer, COUNT(*)::int AS count FROM ${view()} WHERE ${w.join(' AND ')} AND ${col} <> '' GROUP BY ${col} ORDER BY count DESC, answer`, params);
      total = rows.reduce((n, r) => n + Number(r.count), 0);
    } else {
      // One person, one value: a string counts as one value, an array as each of its values (a repeated value still counts once). rn only tells people apart; it is never returned.
      const each = `SELECT t.rn, e.v FROM (SELECT row_number() OVER () AS rn, ${col} AS j FROM ${view()} WHERE ${w.join(' AND ')}) t CROSS JOIN LATERAL jsonb_array_elements_text(CASE jsonb_typeof(t.j) WHEN 'array' THEN t.j WHEN 'string' THEN jsonb_build_array(t.j #>> '{}') ELSE '[]'::jsonb END) AS e(v) WHERE e.v <> '' GROUP BY t.rn, e.v`;
      rows = await run(`SELECT x.v AS answer, COUNT(*)::int AS count FROM (${each}) x GROUP BY x.v ORDER BY count DESC, answer`, params);
      total = Number((await run(`SELECT COUNT(DISTINCT x.rn)::int AS count FROM (${each}) x`, params))[0]?.count || 0);
    }
    const answers = rows.map(r => ({ key: String(r.answer), answer: answerLabel(category, r.answer), count: Number(r.count) }));
    return { connected: true, ok: true, category, label: c.label, multi, total, answers, range };
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
    const rows = await run(`SELECT ${cols.join(', ')}, COUNT(*)::int AS count FROM ${view()} WHERE ${w.join(' AND ')} GROUP BY 1, 2, 3 ORDER BY count DESC`, params);
    return { connected: true, ok: true, hasContent: !!content, rows: rows.map(r => ({ campaign: String(r.campaign), content: String(r.content || ''), archetype: answerLabel('archetype', r.archetype), count: Number(r.count) })), range };
  } catch (e) { return fail(e); }
}

// ---- Test only: the synthetic copy of the quiz's database lives in its own file, so nothing about the quiz's raw table is in this one
async function syntheticQuiz() {
  const { buildSyntheticQuiz } = await import('./reportfixture.js');
  return buildSyntheticQuiz();
}
