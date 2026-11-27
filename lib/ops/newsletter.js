// The Weekly Scaffolding newsletter (Teachers & Email, phase 3). The issues live on the "Weekly Scaffolding" tab
// (lib/scaffolding.js builds the Kit draft from them); this adds the numbering rule, the Skipped state and the editor's data.
//   Numbers count only issues that went out (Kit says sent): the first is No. 1, the next unsent one is the next number,
//   and an issue whose date passed without going out is Skipped, not numbered.
import { loadIssues, weekEvents, addDays } from '../scaffolding';
import { readPlain, addPlain } from './store';
import { kitSnapshot } from './emailkit';
import { todayET } from '../events';

export const FIELDS = { subject: 'Subject', preview_text: 'Preview Text', events_intro: 'Events Intro', reflection_headline: 'Reflection Headline', reflection_body: 'Reflection Body', reflection_url: 'Reflection URL', ps: 'PS', notes: 'Notes',
  featured_offer_title: 'Featured Offer Title', featured_offer_text: 'Featured Offer Text', featured_offer_url: 'Featured Offer URL', featured_offer_button: 'Featured Offer Button',
  // The sections every sent issue has carried (lib/scaffolding.js and lib/scaffoldtree.js already render them)
  pilgrimage_title: 'Pilgrimage Title', pilgrimage_body: 'Pilgrimage Body', pilgrimage_url: 'Pilgrimage URL', pilgrimage_button: 'Pilgrimage Button',
  video_title: 'Video Title', video_meta: 'Video Meta', video_caption: 'Video Caption', video_url: 'Video URL', video_thumbnail: 'Video Thumbnail',
  tarka_issue: 'Tarka Issue', tarka_title: 'Tarka Title', tarka_author: 'Tarka Author', tarka_teaser: 'Tarka Teaser', tarka_url: 'Tarka URL' };
export const OFFER_COLS = ['Featured Offer Title', 'Featured Offer Text', 'Featured Offer URL', 'Featured Offer Button'];
export const VERSE = { sanskrit_devanagari: 'Sanskrit Devanagari', sanskrit_iast: 'Sanskrit IAST', sanskrit_translation: 'Sanskrit Translation', sanskrit_source: 'Sanskrit Source' };
export const DEFAULT_INTRO = 'Here is what is on at Embodied Philosophy this week.';
const kitIdOf = url => (String(url || '').match(/campaigns\/(\d+)/) || [])[1] || '';

// → [{ send_date, number, state, subject, kit_url, _row }] oldest first
export function numberIssues(issues, snap, today = todayET()) {
  const by = Object.fromEntries((snap.broadcasts || []).map(b => [String(b.id), b]));
  let n = 0, nextGiven = false;
  return [...issues].sort((a, b) => a.send_date.localeCompare(b.send_date)).map(i => {
    const kit = by[kitIdOf(i.kit_draft)], skip = /^skip$/i.test(i.status);
    const out = !skip && (kit ? !!kit.published_at : /^sent$/i.test(i.status));
    let number = null, state;
    if (out) { number = ++n; state = 'Sent'; }
    else if (skip || i.send_date < today) state = 'Skipped';
    else { state = kit?.send_at ? 'Scheduled' : kit ? 'In Kit' : 'Draft'; if (!nextGiven) { number = n + 1; nextGiven = true; } }
    return { send_date: i.send_date, number, state, subject: i.subject || '', kit_url: kitIdOf(i.kit_draft) ? `https://app.kit.com/campaigns/${kitIdOf(i.kit_draft)}/draft` : '', kit_id: kitIdOf(i.kit_draft), _row: i._row, raw: i };
  });
}
export async function issueList({ fresh = false } = {}) {
  const [issues, snap] = await Promise.all([loadIssues({ fresh }), kitSnapshot({ fresh })]);
  return { list: numberIssues(issues, snap), snap, issues };
}

// The row for a Sunday, made if it isn't there yet (Send Date, status, number, and the auto-filled events line)
export async function ensureIssue(date, who = 'Weekly Scaffolding') {
  const { list, issues } = await issueList({ fresh: true });
  if (issues.some(i => i.send_date === date)) return false;
  const sent = list.filter(i => i.state === 'Sent').length;
  await addPlain('Weekly Scaffolding', { 'Send Date': date, Status: 'Draft', 'Issue No': String(sent + 1), 'Events Intro': DEFAULT_INTRO }, { who });
  return true;
}

// What "This week at EP" will list for an issue. The Master Schedule's Newsletter column decides: show, enrolled_only (only
// enrolled students see it) or hide (left out, e.g. Sādhana School's internal weekly sessions).
export async function weekLists(date) {
  const { loadCalendar } = await import('../calendar');
  const end = addDays(date, 6), shown = await weekEvents(date), ids = new Set(shown.map(e => e.sched_id || e.id));
  const pick = e => ({ id: e.sched_id || e.id, title: e.title, date: e.date, time: e.time || '', track: e.track, enrolled_only: e.newsletter === 'enrolled_only' });
  const hidden = (await loadCalendar()).filter(e => e.date >= date && e.date <= end && !ids.has(e.sched_id || e.id) && !/cancel/i.test(e.status) && e.newsletter === 'hide');
  return { events: shown.map(pick), left_out: hidden.map(pick) };
}
// Verified Sanskrit from the Quote Library, diacritics exactly as stored
export async function verses() {
  const t = await readPlain('Quote Library', { sheet: 'social', light: true }).catch(() => null);
  return (t?.rows || []).map(r => r.values).filter(v => String(v.verified).toUpperCase() === 'TRUE' && String(v.devanagari || '').trim())
    .map(v => ({ quote_id: v.quote_id, iast: v.quote, devanagari: v.devanagari, translation: v.translation || '', source: [v.author, v.work].filter(Boolean).join(', ') }));
}
export const addDaysET = addDays;
