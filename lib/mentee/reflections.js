// Monthly reflections for the Sahṛdaya Upāya mentees: write, share with the cohort, revise from their feedback, then post the final version to
// Sādhana School (the Kula Commentary space). Pure helpers; the store is lib/mentee/reflectionstore.js. Tested by scripts/member-test/reflections.mjs.
export const COUNT_TARGET = 9;   // reflections that count toward the formation (Jacob, 1 Nov 2026): 9, each counted only once posted to Sādhana School
export const HOURS_TARGET = 6;   // the component's hours, shared across the 9 (see hoursEach)
export const KINDS = ['landed', 'question', 'suggestion'];
const DAY = /^\d{4}-\d{2}-\d{2}$/;

export const hoursEach = (target = HOURS_TARGET, count = COUNT_TARGET) => Math.round((target / count) * 100) / 100;
export const monthOf = day => (DAY.test(day || '') ? day.slice(0, 7) : '');

// The paragraphs of a body (a blank line or a line break starts a new one)
export const paragraphs = body => String(body ?? '').split(/\n+/).map(p => p.trim()).filter(Boolean);

// Which paragraphs of `cur` are new or changed since `prev` (a simple paragraph-level comparison), for the highlight in the reader
export function changedParagraphs(prev, cur) {
  const had = new Set(paragraphs(prev));
  return paragraphs(cur).map(p => ({ text: p, changed: !!prev && !had.has(p) }));
}

export function cleanReflection(b) {
  const body = String(b?.body ?? '').replace(/\r/g, '').replace(/[ \t]+\n/g, '\n').trim();
  if (!body) throw new Error('Write something first');
  if (body.length > 20000) throw new Error('Keep it under 20,000 characters');
  const title = String(b?.title ?? '').replace(/\s+/g, ' ').trim().slice(0, 120) || firstWords(body, 7);
  return { title, body };
}
export function firstWords(text, n = 7) { const w = String(text).replace(/\s+/g, ' ').trim().split(' ').slice(0, n).join(' '); return w.length > 60 ? w.slice(0, 57).replace(/\s+\S*$/, '') + '…' : w; }

// The four steps shown in the strip: 1 Draft (only you) · 2 Shared · 3 Revised (a later version is shared) · 4 Posted to Sādhana School
export function stepOf(r) {
  if (r.status === 'posted') return 4;
  if (r.status === 'shared') return (r.sharedVersions || 1) > 1 ? 3 : 2;
  return 1;
}
export const STEPS = [['Draft', 'Only you'], ['Shared', 'The cohort reads and comments'], ['Revised', 'New versions; earlier ones kept'], ['Posted to SS', 'The final version, in Sādhana School']];

// The title and body of the post in Sādhana School: the final version, with the cohort's note
export function postContent(title, body) {
  return { title: String(title).slice(0, 120), body: `${String(body).trim()}\n\nFrom the Sahṛdaya Upāya cohort` };
}

// A reflection counts toward the 9 once it is posted to Sādhana School: one line in the formation record, as an automatic entry (never stored)
export function reflectionRows(posted, since) {
  return (posted || []).filter(r => r.day && (!since || r.day >= since)).map(r => ({ id: `auto-reflection-${r.id}`, component: 'reflections', hours: hoursEach(), day: r.day, note: `Posted to Sādhana School: ${r.title}`.slice(0, 200), status: 'credited', auto: true }));
}

// What the evergreen card says about this month's reflection
export function cardLine(mine, comments) {
  if (!mine) return '';
  const bits = [`Version ${mine.version}`];
  if (mine.status !== 'draft') bits.push(comments ? `${comments} comment${comments === 1 ? '' : 's'} from the cohort` : 'no comments yet');
  bits.push(mine.status === 'posted' ? 'posted to Sādhana School' : mine.status === 'shared' ? 'ready when you are' : 'a draft, only you can see it');
  return bits.join(' · ');
}
