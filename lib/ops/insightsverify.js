// The pure part of Ads › Audience insights (Ads PR 5): dates, topic names, the numbers' text, and the CHECK that every claim a model writes rests on real numbers.
// No imports: the tests load this file on its own. See lib/ops/adsinsights.js for how it is used.
const todayET = () => new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })).toLocaleDateString('en-CA');
// ---- Dates (New York days: a week starts and ends at midnight in New York, and a Kit or Circle purchase is counted on the New York day it happened)
export const addDays = (d, n) => { const x = new Date(`${d}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
export const mondayOf = d => addDays(d, -((new Date(`${d}T12:00:00Z`).getUTCDay() + 6) % 7));
// The read covers the 7 days that ended yesterday, and is kept under the Monday of the week it was made in. The week before it is the comparison.
export function windowFor(today = todayET()) {
  const to = addDays(today, -1), from = addDays(to, -6);
  return { week_start: mondayOf(today), from, to, prev: { from: addDays(from, -7), to: addDays(to, -7) }, d90: { from: addDays(to, -89), to } };
}
// The moment a New York day begins, as an ISO time (the offset is 4 or 5 hours depending on the season)
const etStart = d => { for (const h of ['04', '05']) { const t = new Date(`${d}T${h}:00:00.000Z`), f = t.toLocaleString('en-CA', { timeZone: 'America/New_York', hour12: false }); if (f.startsWith(d) && /, 0?0:00/.test(f)) return t.toISOString(); } return `${d}T05:00:00.000Z`; };
export const bounds = r => [etStart(r.from), etStart(addDays(r.to, 1))];
export const dayName = d => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
export const periodText = r => `${dayName(r.from)} to ${dayName(r.to)}`;

// ---- Topics: EP's own names. A campaign, a course and a product all reduce to the same short topic ("Kali Winter 2027", "Kali: the dark mother" → kali).
const SEASON = /\b(winter|spring|summer|fall|autumn|january|february|march|april|may|june|july|august|september|october|november|december|20\d\d|wk\s*\d+|week\s*\d+|session\s*\d+|promo\s*#?\d*|enrol(l)?ment|launch|campaign|test)\b/gi;
export const fold = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '');
export function topicName(raw) {
  const first = String(raw || '').replace(/\[[^\]]*\]/g, ' ').split(/\s[—–|-]\s|[:(|]/)[0];
  return first.replace(SEASON, ' ').replace(/[^\p{L}\p{N}\s'’-]/gu, ' ').replace(/\s+/g, ' ').trim();
}
export const words = s => fold(s).toLowerCase().split(/[^a-z]+/).filter(w => w.length > 2);
export const topicKey = raw => [...new Set(words(topicName(raw)))].sort().join(' ');
export const sameWords = (a, b) => { const x = new Set(a.split(' ').filter(Boolean)), y = new Set(b.split(' ').filter(Boolean)); if (!x.size || !y.size) return false; const both = [...x].filter(w => y.has(w)).length; return both / (x.size + y.size - both) >= 0.6 || both === Math.min(x.size, y.size); };
// Two topic keys are the same topic when their words (nearly) agree: used to match a Circle product to an ad campaign and to never suggest a dismissed topic again
export const sameTopic = (a, b) => !!a && !!b && (a === b || sameWords(a, b));

// ---- Numbers the page and the read are built from. Each has an id; code makes them, the model only cites them.
export const money = c => { const d = c / 100; return d >= 100 ? `$${Math.round(d).toLocaleString('en-US')}` : `$${d.toFixed(2)}`; };
export function show(m) {
  const v = m.value;
  if (m.unit === 'usd') return money(Math.round(v * 100));
  if (m.unit === 'pct') return `${Math.abs(v) < 10 && v % 1 ? v.toFixed(1) : Math.round(v)}%`;
  if (m.unit === 'ratio') return `${v.toFixed(1)}×`;
  return Math.round(v).toLocaleString('en-US');
}
export class Metrics {
  constructor() { this.list = []; }
  add(o) { const m = { id: `m${this.list.length + 1}`, ...o }; if (m.value == null || !Number.isFinite(m.value)) return null; m.text = show(m); this.list.push(m); return m; }
}
export const pctChange = (now, was) => was > 0 ? ((now - was) / was) * 100 : null;
export const pct = (a, b) => b > 0 ? (a / b) * 100 : null;


// ---- Checking what the model said
const WORDNUM = { two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12 };
export function quotedNumbers(text) {
  const t = String(text || ''), out = [];
  for (const m of t.matchAll(/(\$)?\s?(\d{1,3}(?:,\d{3})+|\d+)(\.\d+)?\s?(%|×|x\b|k\b)?/gi)) out.push({ v: Number(m[2].replace(/,/g, '') + (m[3] || '')), d: (m[3] || '.').length - 1, unit: m[1] ? 'usd' : m[4] === '%' ? 'pct' : /^[x×]$/i.test(m[4] || '') ? 'ratio' : m[4] ? 'k' : '' });
  for (const m of t.matchAll(/\b(two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\b/gi)) out.push({ v: WORDNUM[m[1].toLowerCase()], d: 0, unit: '' });
  return out;
}
export const close = (said, value, d) => Math.abs(said - Math.abs(value)) <= 0.5 * 10 ** -d + 1e-9;
function numberOk(n, cited) {
  if (n.unit === 'k') return false;
  return cited.some(m => (n.unit === '' || n.unit === m.unit) && close(n.v, m.value, n.d));
}
// Text with the names of the cited metrics and EP's topic names taken out (a year inside "Kali Winter 2027" is a name, not a quoted number)
export const stripNames = (text, names) => names.reduce((t, n) => (n && /\d/.test(n) ? t.split(n).join(' ') : t), text);
export function verifyText(text, ids, byId, names = []) {
  if (!Array.isArray(ids) || !ids.length) return 'It cites no numbers.';
  const cited = [];
  for (const id of ids) { const m = byId.get(String(id)); if (!m) return 'It cites a number that doesn’t exist.'; cited.push(m); }
  const t = String(text || '').trim();
  if (t.length < 8 || t.length > 420) return 'Its length is wrong.';
  for (const n of quotedNumbers(stripNames(t, [...names, ...cited.map(m => m.label), ...cited.map(m => m.topic)]))) if (!numberOk(n, cited)) return 'A number in it doesn’t match the numbers it cites.';
  return '';
}

// ---- Words EP already uses
const STOP = new Set('the and for with from that this these those what when where which who whom how are was were been being have has had not but can will would could should about into over under than then them they their there here also more most some such only very just like your you our out off all any each other its his her she him one new per via get got let may might must shall does did doing done make made week weeks year years people person many much few less least best better good great high low lot lots topic topics idea ideas course courses class classes series program programs school seminar workshop intensive pathway learn learning study studies practice practices students student their audience audiences ad ads sales sale buy buys bought convert converts converting converted interest interested'.split(/\s+/));
export function vocabulary(parts) {
  const v = new Set();
  for (const p of parts) for (const w of words(p)) v.add(w);
  return v;
}
export const checkTopicWords = (text, vocab, { capitalsOnly = false } = {}) => {
  const bad = [];
  const source = capitalsOnly ? String(text).split(/(?<=[.!?])\s+/).flatMap(s => s.split(/\s+/).slice(1).filter(w => /^[A-ZĀĪŪṚŚṢṆṬḌ]/.test(w.replace(/^[“"(]+/, '')))).join(' ') : text;
  for (const w of words(source)) if (!STOP.has(w) && !vocab.has(w)) bad.push(w);
  return bad;
};

// ---- Formats that exist (Track Defaults tracks and the Programs index's own groups)
export const FORMATS = [
  { key: 'sadhana', label: 'Sādhana School', track: 'SS', parent: 'Sādhana School' },
  { key: 'wisdom', label: 'Wisdom School', track: 'WSML', parent: 'Wisdom School' },
  { key: 'meditation', label: 'Meditation Pass', track: 'MM', parent: 'Meditation Mondays' },
  { key: 'sahridaya', label: 'Sahṛdaya Upāya', track: '', parent: 'Sahṛdaya Upāya' },
  { key: 'course', label: 'A standalone course', track: 'EVENT', parent: '' },
];
export const formatOf = key => FORMATS.find(f => f.key === key) || null;


export const MIN_PURCHASES = 5, MIN_LEADS = 10, MIN_SPEND_CENTS = 5000, MIN_QUIZ = 20;   // below these, a number is shown but flagged "too few to read a trend into"
export const SOURCES = [['report', 'Practice Report'], ['meta', 'Meta ads'], ['circle', 'Circle purchases'], ['kit_purchases', 'Kit purchases'], ['kit_email', 'Kit emails']];
export const SOURCE_LABEL = { report: 'Practice Report', meta: 'Meta', circle: 'Circle', kit_purchases: 'Kit purchases', kit_email: 'Kit email' };
export const cap = s => s.slice(0, 1).toUpperCase() + s.slice(1);
