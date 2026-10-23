// What staff write for the Sahṛdaya Upāya "This week" page. Four tabs on EP-Programming-Calendar, edited in
// the Ops dashboard (ep-ops → Settings → Sahṛdaya Upāya). Read privately with the site's Google service
// account through the same 5-minute cache as the other tabs, so a staff edit shows within minutes.
//   Mentee Readings     season | week | sanskrit | translation | citation | reading_url | workbook_url | publish
//   Mentee Assignments  season | week | title | where | url | due | audience | type | brief | hours_component | hours | publish
//                       (type: read | handin; brief shows in the hand-in form; hours_component + hours offer "also log hours")
//   Mentee Feedback     email | date | notes | publish           (Jacob's teaching notes, one mentee each)
//   Mentee Launches     title | line | date | audience | url | publish
//   Mentee Polls        poll | title | note | start | closes | final | link | publish   ("which time works?"; see lib/mentee/polls.js)
//   Mentee Books        month | starts | theme | kind | title | author | audio | note | search | asin | publish   (reading list; see lib/mentee/books.js)
//   Mentee Partners     season | month | email_a | email_b | name_a | name_b | publish   (name_* optional; month is "November" or 2026-11)
// A missing tab simply reads as empty; the page then shows a quiet "nothing yet".
import crypto from 'crypto';
import { readRange, googleConfigured } from '../google';

export const TABS = { readings: 'Mentee Readings', assignments: 'Mentee Assignments', feedback: 'Mentee Feedback', launches: 'Mentee Launches', partners: 'Mentee Partners', polls: 'Mentee Polls', books: 'Mentee Books' };

const objects = values => {
  const [head, ...body] = (values || []).filter(r => r.some(c => String(c ?? '').trim()));
  if (!head) return [];
  const keys = head.map(h => String(h).trim().toLowerCase());
  return body.map(r => Object.fromEntries(keys.map((k, i) => [k, String(r[i] ?? '').trim()])));
};

export async function readTab(name) {
  if (!process.env.CALENDAR_SHEET_ID || !googleConfigured()) return [];
  try { return objects(await readRange(process.env.CALENDAR_SHEET_ID, `'${name}'!A1:L500`)); }
  catch (e) {
    if (!/\(400\)|: 400/.test(e.message)) console.error(`Tab "${name}" failed`, e.message); // 400 = the tab isn't made yet
    return [];
  }
}

const shown = r => !/^(false|no|hide)$/i.test(r.publish || '');
const plain = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const DAY = /^\d{4}-\d{2}-\d{2}$/;

// Pure shapers (tested in scripts/member-test/mentee.mjs) -------------------------------------------------

export function readingFor(rows, season, week) {
  const r = rows.filter(shown).find(x => plain(x.season) === plain(season) && Number(x.week) === week);
  if (!r) return null;
  return { sanskrit: r.sanskrit, translation: r.translation, citation: r.citation, url: r.reading_url, workbookUrl: r.workbook_url };
}

// A stable id for ticking: the same assignment keeps its ticks when staff fix a date or a link. Renaming the
// title makes it a new assignment (its old ticks no longer count).
export const assignmentId = (season, week, title) => 'a' + crypto.createHash('sha1').update([plain(season), week, plain(title)].join('|')).digest('hex').slice(0, 12);

export function assignmentsFor(rows, season, week) {
  return rows.filter(shown)
    .filter(r => plain(r.season) === plain(season) && Number(r.week) === week && r.title && /^(all|mentee|sahrdaya)|^$/.test(plain(r.audience)))
    .map(r => ({ id: assignmentId(season, week, r.title), title: r.title, where: r.where, url: r.url, due: DAY.test(r.due) ? r.due : '', type: plain(r.type) === 'handin' ? 'handin' : 'read', brief: r.brief || '', hoursComponent: r.hours_component || '', hours: Number(r.hours) > 0 ? Number(r.hours) : 0 }));
}

export function feedbackFor(rows, email, limit = 2) {
  const e = String(email || '').trim().toLowerCase();
  return rows.filter(shown).filter(r => String(r.email || '').trim().toLowerCase() === e && r.notes)
    .sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, limit).map(r => ({ date: r.date, notes: r.notes }));
}

// audience: blank = everyone; otherwise it must name the mentees (or "all")
export function launchesFor(rows, today, limit = 4) {
  return rows.filter(shown).filter(r => r.title && (!r.audience || /all|mentee|sahrdaya/.test(plain(r.audience))))
    .filter(r => !DAY.test(r.date) || r.date >= today)
    .sort((a, b) => (DAY.test(a.date) ? a.date : '9999').localeCompare(DAY.test(b.date) ? b.date : '9999')).slice(0, limit)
    .map(r => ({ title: r.title, line: r.line, date: r.date, url: r.url }));
}

// This month's peer partner for a mentee, or null (the card is then hidden). Names are optional columns; without one we show the email.
const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
export function partnerFor(rows, email, season, today) {
  const e = String(email || '').trim().toLowerCase(), ym = String(today || '').slice(0, 7), month = MONTHS[Number(ym.slice(5, 7)) - 1] || '';
  const partners = [];
  for (const r of rows.filter(shown)) {
    if (r.season && plain(r.season) !== plain(season)) continue;
    const m = plain(r.month);
    if (m !== month && m !== ym && m !== month.slice(0, 3)) continue;
    const a = String(r.email_a || '').trim().toLowerCase(), b = String(r.email_b || '').trim().toLowerCase();
    if (e && e === a && b && !partners.some(p => p.email === b)) partners.push({ name: r.name_b || b, email: b });
    else if (e && e === b && a && !partners.some(p => p.email === a)) partners.push({ name: r.name_a || a, email: a });
  }
  if (!partners.length) return null;
  // a group of three is stored as three pairs, so there can be two partners: "Bo and Cy"
  return { month, name: partners.map(p => p.name).join(' and '), email: partners[0].email, partners };
}
