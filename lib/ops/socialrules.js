// Content v2 rules that both the screens and the server use (plain functions, no network).
// Sign-offs are FLAGS, never locks: anyone who schedules can approve a flagged post by giving a reason.
// Only missing facts BLOCK a post.
import { isFeed, timeKey, isPastDue } from './socialengine';

// Settings live on the Rules tab (setting, value, notes). Names are matched ignoring case, spaces and underscores.
const key = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
export const DEFAULT_RULES = { feed_posts_per_week: 7, plan_ahead_days: 7, max_text_heavy_run: 2, max_promo_run: 1 };
export function readRules(rows = []) {
  const by = Object.fromEntries(rows.map(r => [key(r.values?.setting ?? r.setting), r.values?.value ?? r.value]));
  const num = (name, alt = []) => { for (const n of [name, ...alt]) { const v = Number(String(by[key(n)] ?? '').trim()); if (by[key(n)] !== undefined && Number.isFinite(v) && v > 0) return v; } return DEFAULT_RULES[name]; };
  // "Feed posts per week" was 5 before the daily-posting plan; the code default is now 7 when the setting is missing
  return { feed_posts_per_week: num('feed_posts_per_week', ['feed posts per week']), plan_ahead_days: num('plan_ahead_days'), max_text_heavy_run: num('max_text_heavy_run'), max_promo_run: num('max_promo_run') };
}

const TEXT_HEAVY = /quote on an image|sanskrit|carousel|suggested reading|publication/i;
const PROMO = /course|meet the teacher|event|promo|marketing|launch|countdown/i;
const T = v => String(v ?? '').trim().toUpperCase();
// The `text_heavy` column (TRUE / FALSE) overrides the guess from the type of post
export const isTextHeavy = p => T(p.text_heavy) === 'TRUE' ? true : T(p.text_heavy) === 'FALSE' ? false : TEXT_HEAVY.test(p.pillar || '') || p.media_kind === 'carousel';
export const isPromo = p => PROMO.test(p.pillar || '') || !!String(p.linked_event || '').trim();
const countsAsFeed = p => !['Skip', 'Deleted', 'Failed', 'Needs edit'].includes(p.status) && isFeed(p) && /^\d{4}-\d{2}-\d{2}$/.test(p.publish_date || '');

// Feed rhythm over posts in posting order: [{ rule, from, to, count, text }]
export function rhythmWarnings(posts, rules = DEFAULT_RULES) {
  const feed = posts.filter(countsAsFeed).sort((a, b) => (a.publish_date + timeKey(a.publish_time_ET)).localeCompare(b.publish_date + timeKey(b.publish_time_ET)));
  const out = [];
  const runs = (test, max, rule, word) => {
    let run = [];
    const flush = () => { if (run.length > max) out.push({ rule, from: run[0].publish_date, to: run[run.length - 1].publish_date, count: run.length, text: `${run.length} ${word} posts in a row (${run[0].publish_date} to ${run[run.length - 1].publish_date}). The most we plan is ${max}.` }); run = []; };
    for (const p of feed) test(p) ? run.push(p) : flush();
    flush();
  };
  runs(isTextHeavy, rules.max_text_heavy_run, 'text_heavy', 'text-heavy');
  runs(isPromo, rules.max_promo_run, 'promo', 'promotional');
  return out;
}

// Which of the next `days` days (from `from`) have a feed post planned? → { total, covered, missing: [date] }
export function weekAhead(posts, from, days = 7) {
  const have = new Set(posts.filter(countsAsFeed).filter(p => p.status !== 'Expired').map(p => p.publish_date));
  const list = Array.from({ length: days }, (_, i) => { const d = new Date(from + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + i); return d.toISOString().slice(0, 10); });
  return { total: days, covered: list.filter(d => have.has(d)).length, missing: list.filter(d => !have.has(d)) };
}

// What a Proposed post still needs before it can be approved.
//   blocked: facts are missing (can't be approved until fixed at the source)
//   flags:   sign-offs and checks (can be approved with a reason)
export function guardrails(p, { eventLabels } = {}) {
  const blocked = [], flags = [];
  if (!String(p.image_url || '').trim() && !String(p.image_id || '').trim() && !String(p.slides_json || '').trim()) blocked.push('No picture or video yet');
  if (p.media_kind !== 'story' && !String(p.caption || '').trim()) blocked.push('No caption yet');
  if (String(p.linked_event || '').trim() && eventLabels && !eventLabels.has(p.linked_event)) blocked.push('Its event isn’t on the Master Schedule, so the facts can’t be checked');
  if (String(p.caption || '').length > 2200) blocked.push('Caption is over 2,200 characters');
  if (String(p.quote_text || '').trim() && p.quote_check !== 'Verbatim') flags.push('Quote not checked word for word');
  if (/sanskrit|educational/i.test(p.pillar || '')) flags.push('Needs teacher clearance (Floss, Stephanie or Jacob)');
  if (/meet the teacher/i.test(p.pillar || '')) flags.push('Needs the teacher’s OK');
  if (String(p.image_review || '') && p.image_review !== 'Kept') flags.push('Picture not checked yet');
  return { blocked, flags };
}

// ---------- Day categories: each weekday can have a standing post type; a week can override it ----------
export const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
export const weekdayOf = d => WEEKDAYS[(new Date(d + 'T12:00:00Z').getUTCDay() + 6) % 7];
const mon = d => { const x = new Date(d + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7)); return x.toISOString().slice(0, 10); };
// rows: Day Categories values [{ weekday, category, scope: standing | week_of, week_of }]. A "this week only" row wins over the standing one.
export function categoryFor(date, rows = []) {
  const wd = weekdayOf(date).toLowerCase(), wk = mon(date);
  const mine = rows.filter(r => String(r.weekday || '').trim().toLowerCase() === wd);
  const once = mine.find(r => /week/i.test(r.scope || '') && String(r.week_of || '').slice(0, 10) === wk);
  const standing = mine.filter(r => !/week/i.test(r.scope || '')).pop();
  return String((once || standing)?.category || '').trim();
}
// The state of one day: open (no category) | filled-approved | filled-awaiting | filled-blocked | not-filled | missed
// posts: that day's posts; blockedOf(post) → true when facts are missing. `instead` is what is there in the category's place.
export function dayState({ date, today, posts, category, blockedOf = () => false }) {
  if (!category) return { state: 'open' };
  const live = posts.filter(countsAsFeed);
  const match = live.filter(p => String(p.pillar || '').trim().toLowerCase() === category.toLowerCase());
  const best = match.find(p => ['Approved', 'Posted', 'Manual', 'Unconfirmed'].includes(p.status)) || match[0];
  if (best) return { state: ['Approved', 'Posted', 'Manual', 'Unconfirmed'].includes(best.status) ? 'filled-approved' : blockedOf(best) ? 'filled-blocked' : 'filled-awaiting', post: best };
  const instead = live[0]?.pillar || '';
  return { state: date < today ? 'missed' : 'not-filled', instead };
}
export const STATE_LABEL = { open: 'No category', 'filled-approved': 'Filled · approved', 'filled-awaiting': 'Filled · awaiting approval', 'filled-blocked': 'Filled but blocked', 'not-filled': 'Not filled', missed: 'Missed' };
