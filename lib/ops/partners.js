// Peer partners for the Sahṛdaya Upāya mentees: Jacob pairs the cohort each month (Settings → Peer partners). Pure helpers, shared by the page
// and the API. The sheet tab "Mentee Partners" holds one row per pair (season | month | email_a | email_b | name_a | name_b | publish);
// the mentee page (lib/mentee/content.js partnerFor) reads it. A group of three is stored as its three pairs, so each of them sees the other two.
export const PARTNER_TAB = 'Mentee Partners';
export const PARTNER_COLUMNS = ['season', 'month', 'email_a', 'email_b', 'name_a', 'name_b', 'publish'];
export const MONTH = /^\d{4}-\d{2}$/;

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const lower = s => String(s ?? '').trim().toLowerCase();
const plain = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
export const monthLabel = ym => MONTH.test(ym || '') ? `${MONTHS[Number(ym.slice(5)) - 1]} ${ym.slice(0, 4)}` : '';
export const monthName = ym => MONTHS[Number(String(ym).slice(5, 7)) - 1] || '';

// The month to open by default: this month, or next month once the 20th has passed (that is when the next month's pairs get planned)
export function defaultMonth(today) { const ms = monthsFrom(today, 2); return Number(today.slice(8, 10)) >= 20 ? ms[1] : ms[0]; }

// The months to choose from: this month and the next eight
export function monthsFrom(today, n = 9) {
  let y = Number(today.slice(0, 4)), m = Number(today.slice(5, 7));
  return Array.from({ length: n }, () => { const ym = `${y}-${String(m).padStart(2, '0')}`; if (++m > 12) { m = 1; y++; } return ym; });
}

const shown = r => !/^(false|no|hide)$/i.test(String(r.publish || '').trim());
// A row is for a month when its month column says "2026-11", "November" or "Nov" (rows typed by hand may use a name)
export const rowIsFor = (r, ym) => { const m = plain(r.month), n = plain(monthName(ym)); return !!m && (m === ym || m === n || m === n.slice(0, 3)); };
export const pairKey = (a, b) => [lower(a), lower(b)].sort().join('|');

// Everything in the tab for one month: [{ row, a, b, hidden }] (row = the sheet row number)
export function monthRows(tabRows, ym, season) {
  return tabRows.filter(x => rowIsFor(x.values, ym) && (!x.values.season || !season || plain(x.values.season) === plain(season)))
    .map(x => ({ row: x.row, a: lower(x.values.email_a), b: lower(x.values.email_b), hidden: !shown(x.values), values: x.values })).filter(x => x.a && x.b);
}

// Pair rows → groups of people (people linked by a pair are one group, so three people stored as three pairs come back as one group of three)
export function groupsFrom(rows) {
  const parent = new Map();
  const find = x => { while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x))); x = parent.get(x); } return x; };
  for (const r of rows) { for (const e of [r.a, r.b]) if (!parent.has(e)) parent.set(e, e); parent.set(find(r.a), find(r.b)); }
  const by = new Map();
  for (const e of parent.keys()) { const k = find(e); (by.get(k) || by.set(k, []).get(k)).push(e); }
  return [...by.values()].map(g => g.sort());
}

// Groups of two or three people → the pairs to store (three people = three pairs). Throws a plain-English message if something is wrong.
export function pairsOf(groups) {
  const seen = new Set(), out = [];
  for (const g of groups) {
    const people = g.map(lower).filter(Boolean);
    if (people.length < 2) continue; // an unfinished group is simply not saved
    if (people.length > 3) throw new Error('A group can have two or three people.');
    if (new Set(people).size !== people.length) throw new Error('A person can’t be paired with themselves.');
    for (const e of people) { if (seen.has(e)) throw new Error('Someone is in more than one group. Each person can have one partner or one group.'); seen.add(e); }
    for (let i = 0; i < people.length; i++) for (let j = i + 1; j < people.length; j++) out.push([people[i], people[j]]);
  }
  return out;
}

// What to change in the sheet so that this month holds exactly the wanted pairs. Nothing is deleted: a pair that is no longer wanted is
// hidden (publish = FALSE), and one that comes back is shown again. → { updates: [{ row, changes, before }], adds: [rowValues] }
export function diffPairs(existing, wanted, { ym, season, nameOf = x => x }) {
  const want = new Map(wanted.map(([a, b]) => [pairKey(a, b), [a, b]]));
  const kept = new Set(), updates = [], adds = [];
  for (const r of existing) {
    const k = pairKey(r.a, r.b);
    if (want.has(k) && !kept.has(k)) {
      kept.add(k);
      if (r.hidden) updates.push({ row: r.row, changes: { publish: '' }, before: { publish: String(r.values.publish ?? '') } });
    } else if (!r.hidden) updates.push({ row: r.row, changes: { publish: 'FALSE' }, before: { publish: String(r.values.publish ?? '') } });
  }
  for (const [k, [a, b]] of want) if (!kept.has(k)) adds.push({ season, month: ym, email_a: a, email_b: b, name_a: nameOf(a), name_b: nameOf(b), publish: '' });
  return { updates, adds };
}

// Suggested groups for the cohort that avoid repeating earlier pairs where they can. history: pair keys from other months. Deterministic for
// a given seed, so "Suggest again" (a new seed) gives another arrangement. An odd cohort makes one group of three.
export function suggestGroups(emails, history = new Set(), seed = 1) {
  const people = [...new Set(emails.map(lower).filter(Boolean))];
  if (people.length < 2) return [];
  let s = (seed * 2654435761) >>> 0 || 1;
  const rnd = () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
  const shuffle = a => { const x = [...a]; for (let i = x.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [x[i], x[j]] = [x[j], x[i]]; } return x; };
  const build = order => { const g = []; for (let i = 0; i + 1 < order.length; i += 2) g.push([order[i], order[i + 1]]); if (order.length % 2) g[g.length - 1].push(order.at(-1)); return g; };
  const cost = g => pairsOf(g).filter(([a, b]) => history.has(pairKey(a, b))).length;
  let best = null, bestCost = Infinity;
  for (let t = 0; t < 300 && bestCost > 0; t++) { const g = build(shuffle(people)); const c = cost(g); if (c < bestCost) { best = g; bestCost = c; } }
  return best.map(g => g.sort());
}
export const repeatsIn = (groups, history) => pairsOf(groups).filter(([a, b]) => history.has(pairKey(a, b))).length;
