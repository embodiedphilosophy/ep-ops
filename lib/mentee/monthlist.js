// One list per month of what a Sahṛdaya Upāya mentee does that month, the same everywhere: their page in Circle ("This month"), Ops → Mentee year
// (where staff edit it) and /school/mentee-year. Built from the real sources, so an edit in one place shows in all three:
//   immersions and one-to-one windows   data/mentee.json, with dates, names and links changed from Ops (the Mentee Month Rows tab, see withOverrides)
//   books                               the Mentee Books tab (Ops edits those rows directly)
//   buddy (articulation)                data/mentee.json rotations; pairs are set in Ops → Settings → Peer partners
//   reflection                          due date from Mentee Months `reflection_due` (else the month's last Monday, as the page has always done)
//   hand-ins                            Mentee Assignments rows of type handin due that month
//   tasks                               Mentee Schedule rows of kind task (lib/mentee/year.js)
// A month with no immersion or no book falls back to the matching line of data/mentee-year.json (e.g. July's retreat practicum).
// Every row has a stable key; a Mentee Month Rows row (month | row | title | line | date | end | link | publish) changes its words, its dates or hides it.
// Pure (no network): scripts/member-test/monthlist.mjs (ep-website) and scripts/ops-test/monthlist.mjs (ep-ops). Identical in both repos.
import yearData from '../../data/mentee-year.json';

export const ROWS_TAB = 'Mentee Month Rows';
export const ROWS_HEAD = ['month', 'row', 'title', 'line', 'date', 'end', 'link', 'publish', 'updated_by', 'updated_at', 'sat_link', 'sun_link'];
// Immersion rows also carry the two live links: sat_link (the Saturday Open Session, the whole school) and sun_link (the Sunday Practicum, mentees only)
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const hidden = v => /^(false|no|hide)$/i.test(String(v || '').trim());
const slug = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
export const bookKey = title => `book-${slug(title)}`;
export function lastMonday(ym) {
  const [y, m] = ym.split('-').map(Number), d = new Date(Date.UTC(y, m, 0));
  while (d.getUTCDay() !== 1) d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}
const monthName = ym => new Date(`${ym}-15T12:00:00Z`).toLocaleDateString('en-GB', { month: 'long', timeZone: 'UTC' });

const url = v => (/^https:\/\/\S+$/.test(String(v || '').trim()) ? String(v).trim() : '');
// Mentee Month Rows → { 'YYYY-MM|row': { title, line, date, end, link, hide } } (blank cells mean "as it was")
export function overridesFrom(rows) {
  const out = {};
  for (const r of rows || []) {
    const month = String(r.month || '').trim(), row = String(r.row || '').trim();
    if (!/^\d{4}-\d{2}$/.test(month) || !row || row === '_order') continue;
    out[`${month}|${row}`] = { title: String(r.title || '').trim(), line: String(r.line || '').trim(), date: DAY.test(String(r.date || '').trim()) ? String(r.date).trim() : '', end: DAY.test(String(r.end || '').trim()) ? String(r.end).trim() : '', link: url(r.link), satLink: url(r.sat_link), sunLink: url(r.sun_link), hide: hidden(r.publish) };
  }
  return out;
}
// This month's overrides for the mentee page: { row: { title, line, hide } }
// The order staff set for a month in Ops (a Mentee Month Rows row with row = _order and the row keys, comma-separated, in line)
export const ORDER_ROW = '_order';
export function monthOrder(rows, ym) {
  const r = (rows || []).find(x => String(x.month || '').trim() === ym && String(x.row || '').trim() === ORDER_ROW);
  return r ? String(r.line || '').split(',').map(k => k.trim()).filter(Boolean) : [];
}
// rows in the staff's order: the keys they placed first, in that order, then any others in their usual order
export function inOrder(list, order, keyOf = r => r.key) {
  if (!order || !order.length) return list;
  const at = new Map(order.map((k, i) => [k, i]));
  return list.map((r, i) => [r, i]).sort((a, b) => (at.has(keyOf(a[0])) ? at.get(keyOf(a[0])) : 1e6 + a[1]) - (at.has(keyOf(b[0])) ? at.get(keyOf(b[0])) : 1e6 + b[1])).map(x => x[0]);
}
export function monthOverrides(rows, ym) {
  const o = overridesFrom(rows), out = {};
  for (const [k, v] of Object.entries(o)) if (k.startsWith(`${ym}|`)) out[k.slice(8)] = { title: v.title, line: v.line, hide: v.hide };
  return out;
}

// data/mentee.json with the immersion and one-to-one changes from Ops laid over it (names, dates, the Prepare link). Rows are found by the month
// they were in originally (immersion-<n> by its number; one-to-one by the month of its window), so moving a date never loses the row.
export function withOverrides(config, rows) {
  const o = overridesFrom(rows), out = { ...config };
  out.immersions = (config.immersions || []).map(im => {
    const v = o[`${String(im.sat).slice(0, 7)}|immersion-${im.n}`];
    if (!v) return im;
    return { ...im, ...(v.title ? { title: v.title } : {}), ...(v.date ? { sat: v.date } : {}), ...(v.end ? { sun: v.end } : {}), ...(v.link ? { prepare_link: v.link } : {}), ...(v.satLink ? { sat_link: v.satLink } : {}), ...(v.sunLink ? { sun_link: v.sunLink } : {}), ...(v.line ? { line: v.line } : {}) };
  });
  out.windows = (config.windows || []).map(w => {
    const v = o[`${String(w.from).slice(0, 7)}|one-to-one`];
    return v && (v.date || v.end) ? { ...w, from: v.date || w.from, to: v.end || w.to } : w;
  });
  return out;
}

// The data/mentee-year.json bullet for a group in a month ('immersion' | 'book' | 'buddy' | 'one-to-one'), split into its bold lead and the rest
const GROUPS = { immersion: /^\*\*(Immersion|No immersion|Retreat)/i, book: /^\*\*(Read|No new book)/i, buddy: /^\*\*Articulation/i, 'one-to-one': /^\*\*One-to-one/i };
export function jsonLines(ym, group) {
  const m = yearData.months.find(x => x.id === ym);
  return (m ? m.items : []).filter(t => GROUPS[group].test(t)).map(t => { const x = /^\*\*(.+?)\*\*\s*(.*)$/.exec(t) || [, t, '']; return { lead: x[1].replace(/\.$/, ''), rest: x[2].replace(/^[,.:;]\s*/, '') }; });
}

/**
 * The rows for one month, in the order they happen. Each: { key, kind, title, line, date, end, link, hidden, edit } where kind is
 * immersion | note | book | suggested | buddy | one-to-one | reflection | handin | task, and `edit` says what an edit changes (for Ops).
 * line may hold the mentee-year text marks (**bold**, _italic_, ~quiet~). Hidden rows are kept (Ops shows them greyed); pages drop them.
 */
export function monthList({ ym, config, bookRows = [], monthRows = [], rowRows = [], assignmentRows = [], tasks = [] }) {
  const o = overridesFrom(rowRows), cfg = withOverrides(config, rowRows), out = [];
  const put = (r, sortDate) => { const v = r.kind === 'immersion' ? { hide: (o[`${ym}|${r.key}`] || {}).hide } : o[`${ym}|${r.key}`] || {}; /* an immersion's changes are already in cfg */ out.push({ ...r, title: v.title || r.title, line: v.line || r.line, link: v.link || r.link || '', hidden: !!v.hide, sort: sortDate || `1-${r.date || `${ym}-15`}` }); };

  const dm = d => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  // The order is the page's own: books ('0-a'), the buddy ('0-b'), then everything dated, by date ('1-<date>'). circle: false = only on the Your Year page.

  // books, as the page shows them at the start of the month: the book being read ("Now"), and the next one if it starts this month ("From 16 Nov")
  const groups = new Map();
  for (const b of bookRows.filter(r => !hidden(r.publish) && String(r.title || '').trim() && DAY.test(String(r.starts || '').trim()))) {
    const k = String(b.month || b.starts); const g = groups.get(k) || groups.set(k, { starts: b.starts, books: [] }).get(k);
    if (b.starts < g.starts) g.starts = b.starts; g.books.push(b);
  }
  const gs = [...groups.values()].sort((a, b) => a.starts.localeCompare(b.starts)), first = `${ym}-01`;
  const cur = [...gs].reverse().find(g => g.starts <= first), next = gs.find(g => g.starts > first && g.starts.slice(0, 7) === ym);
  const bookRow = (b, g, isCur, order) => {
    const sugg = /^sugg/i.test(b.kind || '');
    put({ key: bookKey(b.title), kind: sugg ? 'suggested' : 'book', circle: !sugg, when: sugg ? '' : isCur ? (next ? 'Now' : 'All month') : `From ${dm(g.starts)}`, title: `${sugg ? 'Suggested: ' : 'Read '}${b.title}`,
      line: [b.author ? `${b.author}.` : '', b.note || '', isCur && !sugg ? 'About 30 minutes most days.' : ''].filter(Boolean).join(' '), date: isCur ? '' : g.starts, link: '', edit: 'book',
      book: { month: String(b.month || ''), starts: b.starts, title: b.title, author: b.author || '', note: b.note || '', kind: sugg ? 'suggested' : 'required' } }, order);
  };
  if (cur) cur.books.forEach((b, i) => bookRow(b, cur, true, `0-a${i}`));
  if (next) next.books.forEach((b, i) => bookRow(b, next, false, `0-b0${i}`));
  if (!cur && !next) for (const [i, j] of jsonLines(ym, 'book').entries()) put({ key: `note-book-${i + 1}`, kind: 'note', circle: false, title: j.lead === 'Read' ? `Read ${j.rest.replace(/\s*~.*?~\s*/g, ' ').replace(/Reflection due.*$/, '').trim()}` : j.lead, line: j.lead === 'Read' ? '' : j.rest, date: '', edit: 'words', hint: j.lead === 'Read' ? 'not on the reading list yet: add it with “+ Add a book” to give mentees a “The book” button' : '' }, `0-a${i}`);

  // articulation buddy (each mentee sees their own buddy's name; before pairs are set, "Your buddy is on the way")
  const rot = (cfg.rotations || []).find(r => DAY.test(r.from || '') && r.from.slice(0, 7) <= ym && String(r.to || '').slice(0, 7) >= ym);
  put({ key: 'buddy', kind: 'buddy', circle: true, when: 'Any time', title: 'Meet your buddy', line: 'An hour together: each of you explains one idea until the other could explain it too.', date: '', edit: 'words', hint: rot ? `Rotation ${rot.n}${rot.label ? ` (${rot.label})` : ''}${rot.from.slice(0, 7) === ym ? ': new pairs this month' : ': the same buddy as last month'}. Mentees see their buddy’s name; before pairs are set they see “Your buddy is on the way”.` : '' }, '0-c');

  // immersions (by the month they were in, so a moved date keeps its row)
  const ims = (cfg.immersions || []).filter(im => String((config.immersions || []).find(x => x.n === im.n)?.sat || im.sat).slice(0, 7) === ym);
  for (const im of ims) put({ key: `immersion-${im.n}`, kind: 'immersion', circle: true, title: `Immersion ${im.n} · ${im.title}`, line: im.line || `${im.n === 1 ? 'Your first weekend together: the Open Session' : 'The Open Session'} with the whole school on Saturday, and the Practicum on Sunday. Before then, one short Prepare lesson.`, date: im.sat, end: im.sun, link: im.prepare_link || '', satLink: im.sat_link || '', sunLink: im.sun_link || '', edit: 'immersion', n: im.n, name: im.title }, `1-${im.sat}`);
  if (!ims.length) for (const [i, j] of jsonLines(ym, 'immersion').entries()) put({ key: `note-immersion-${i + 1}`, kind: 'note', circle: false, title: j.lead, line: j.rest, date: '', edit: 'words' }, `1-${ym}-0${i}`);

  // the one-to-one window
  const win = (cfg.windows || []).find((w, i) => String((config.windows || [])[i]?.from || w.from).slice(0, 7) === ym);
  put({ key: 'one-to-one', kind: 'one-to-one', circle: true, title: 'One-to-one with Jacob', line: '45 minutes. When you book, add a few lines on what you’d like to talk about.', date: win ? win.from : '', end: win ? win.to : '', when: win ? '' : 'Next window', edit: 'window' }, `1-${win ? win.from : `${ym}-99`}`);

  // the monthly reflection ("Write your first reflection" in the first month of the formation)
  const mr = (monthRows || []).find(r => r.month === ym), due = mr && DAY.test(mr.reflection_due || '') ? mr.reflection_due : lastMonday(ym);
  const firstMonth = String((config.immersions || []).map(i => i.sat).filter(Boolean).sort()[0] || '').slice(0, 7);
  put({ key: 'reflection', kind: 'reflection', circle: true, title: ym === firstMonth ? 'Write your first reflection' : `Write your ${monthName(ym)} reflection`, line: 'Choose one or a few things from the assigned books that shifted your understanding, and deepen that shift with your reflection. Share it with the cohort when you’re ready.', date: due, edit: 'reflection' }, `1-${due}`);

  // hand-ins due this month
  for (const a of assignmentRows.filter(r => !hidden(r.publish) && /^handin$/i.test(String(r.type || '').replace(/[-\s]/g, '')) && DAY.test(r.due || '') && r.due.slice(0, 7) === ym))
    put({ key: `handin-${slug(a.title)}`, kind: 'handin', circle: true, title: `Hand in: ${a.title}`, line: a.where || '', date: a.due, edit: 'settings' }, `1-${a.due}`);

  // tasks added in Ops
  for (const t of tasks.filter(t => t.month === ym)) out.push({ key: t.id, kind: 'task', circle: true, title: t.title, line: t.detail, date: t.date, link: t.link, hidden: false, edit: 'task', sort: `1-${t.date}`, task: t });

  return inOrder(out.sort((a, b) => String(a.sort).localeCompare(String(b.sort))), monthOrder(rowRows, ym));
}
