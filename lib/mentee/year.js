// The mentee year on the mentee page and in Ops: the dated project steps, the quarterly review checks, the lanes, the one-to-one summary, the nudges
// and the Monday digest lines. Pure (no network): scripts/member-test/year.mjs. Rows come from three tabs on EP-Programming-Calendar
// (Mentee Schedule, Mentee Months, Mentee Step Status); when a tab is missing or empty the seed in data/mentee-year.json stands in, so the page always works.
import data from '../../data/mentee-year.json';

export const SEASON = '2026-27';
export const REVIEW_KEYS = ['q1', 'mid', 'readiness'];
export const SCHEDULE_HEAD = ['step_id', 'season', 'date', 'project', 'title', 'detail', 'evidence', 'month', 'kind', 'review', 'order', 'publish'];
export const MONTHS_HEAD = ['month', 'title', 'theme', 'focus', 'reflection_due', 'rotation', 'immersion_n', 'publish'];
export const STATUS_HEAD = ['email', 'circle_member_id', 'step_id', 'status', 'done_at', 'note', 'updated_by', 'updated_at'];
export const PREFS_ID = 'prefs:reminders';
export const oneToOneId = ym => `1to1-${ym}`;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const lower = s => String(s ?? '').trim().toLowerCase();
const shown = r => !/^(false|no|hide)$/i.test(r.publish || '');
export const daysBetween = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 864e5);
const addDays = (d, n) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
const lastDay = ym => { const [y, m] = ym.split('-').map(Number); return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10); };
const prevMonth = ym => { const [y, m] = ym.split('-').map(Number); return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`; };
export const plainText = s => String(s ?? '').replace(/\*\*|\^|~|(?<![A-Za-z])_|_(?![A-Za-z])/g, '');

export const slug = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);

// ---- the seed: data/mentee-year.json as sheet rows (scripts/seed-mentee-schedule.mjs writes these once; also the fallback) ----
export function seedRows(d = data) {
  const used = new Set(), out = [];
  d.steps.forEach((s, i) => {
    const month = s.date.slice(0, 7);
    // A step keeps the id it has in the data (Mentee Step Status rows point at it, so rewording a title must not move it); a new step without one gets an id from its title
    let id = s.id || `s-${month}-${slug(s.title)}`; for (let n = 2; used.has(id); n++) id = `${s.id || `s-${month}-${slug(s.title)}`}-${n}`; used.add(id);
    out.push({ step_id: id, season: SEASON, date: s.date, project: s.project, title: s.title, detail: s.detail, evidence: s.evidence, month, kind: 'step', review: '', order: String(i + 1), publish: 'TRUE' });
  });
  d.reviews.forEach((r, ri) => r.checks.forEach((c, i) => out.push({ step_id: `r-${REVIEW_KEYS[ri]}-${i + 1}`, season: SEASON, date: '', project: '', title: c, detail: '', evidence: '', month: r.month, kind: 'review_check', review: REVIEW_KEYS[ri], order: String(i + 1), publish: 'TRUE' })));
  return out;
}
export const seedMonths = (d = data) => d.months.map(m => ({ month: m.id, title: m.title, theme: m.theme, focus: m.focus, reflection_due: '', rotation: '', immersion_n: '', publish: 'TRUE' }));

// ---- reading the Schedule tab (or the seed) ----
export function scheduleFrom(rows) {
  const live = (rows || []).filter(r => r.step_id && shown(r));
  const src = live.length ? live : seedRows();
  const steps = src.filter(r => (r.kind || 'step') === 'step' && DAY.test(r.date)).map(r => ({ id: r.step_id, date: r.date, project: ['talk', 'offering', 'both'].includes(r.project) ? r.project : 'both', title: r.title, detail: r.detail || '', evidence: r.evidence || '', month: r.month || r.date.slice(0, 7), order: Number(r.order) || 0 }))
    .sort((a, b) => a.date.localeCompare(b.date) || a.order - b.order);
  const reviews = data.reviews.map((r, i) => {
    const key = REVIEW_KEYS[i];
    const checks = src.filter(x => x.kind === 'review_check' && x.review === key).sort((a, b) => Number(a.order) - Number(b.order)).map(x => ({ id: x.step_id, text: x.title }));
    return { key, month: r.month, title: r.title, name: ['Q1', 'Mid-year', 'Readiness'][i], checks };
  }).filter(r => r.checks.length);
  return { steps, reviews, fromSheet: !!live.length };
}
export function monthFrom(rows, ym) {
  const r = (rows || []).filter(shown).find(x => x.month === ym);
  const j = data.months.find(m => m.id === ym);
  if (!r && !j) return null;
  return { id: ym, title: (r && r.title) || j.title, theme: (r && r.theme) || j.theme, focus: (r && r.focus) || (j && j.focus) || '', reflectionDue: r && DAY.test(r.reflection_due) ? r.reflection_due : '', n: data.months.findIndex(m => m.id === ym) + 1, of: data.months.length };
}

// ---- status rows ----
// rows: Step Status rows as objects (email, step_id, status, ...). → { done: Set, prefsOff: bool, notes: { stepId: { text, at } }, sent: Set }
export function statusFor(rows, email) {
  const e = lower(email), out = { done: new Set(), prefsOff: false, notes: {}, sent: new Set() };
  for (const r of rows || []) {
    if (lower(r.email) !== e) continue;
    if (r.step_id === PREFS_ID) out.prefsOff = lower(r.status) === 'off';
    else if (r.step_id.startsWith('nudge:')) out.sent.add(r.step_id);
    else if (r.status === 'done') out.done.add(r.step_id);
    else if (r.status === 'summary') out.notes[r.step_id] = { text: r.note || '', at: r.updated_at || '' };
  }
  return out;
}

// ---- the next three steps: overdue first, then by date ----
export function nextFor(steps, done, today, n = 3) {
  const open = steps.filter(s => !done.has(s.id)).map(s => ({ ...s, daysTo: daysBetween(today, s.date), overdue: s.date < today }));
  const od = open.filter(s => s.overdue).sort((a, b) => a.date.localeCompare(b.date)), up = open.filter(s => !s.overdue).sort((a, b) => a.date.localeCompare(b.date));
  return [...od, ...up].slice(0, n);
}

// ---- quarterly reviews: locked in the month before, open in its month (until ticked through), complete once every check is ticked ----
export function reviewCard(reviews, done, today) {
  const ym = today.slice(0, 7), mk = r => { const n = r.checks.filter(c => done.has(c.id)).length; return { ...r, ticked: n, total: r.checks.length, opensOn: `${r.month}-01` }; };
  const rs = reviews.map(mk);
  for (const r of rs) {
    if (r.ticked === r.total) { if (r.month === ym) return { ...r, state: 'complete' }; continue; }
    if (ym >= r.month) return { ...r, state: 'open' };
    if (ym === prevMonth(r.month)) return { ...r, state: 'locked' };
    break;
  }
  return null;
}
export const laterReviews = (reviews, today) => reviews.filter(r => r.month > today.slice(0, 7)).map(r => ({ key: r.key, name: r.name, month: r.month, opensOn: `${r.month}-01`, endsOn: lastDay(r.month) }));
export const reviewOpen = (review, today) => today >= `${review.month}-01`;

// ---- lanes: Nov–Jul, a dot per step, four states ----
export function lanesFor(steps, done, today) {
  const L = data.lanes, base = data.months.find(m => m.id.endsWith('-11')).id; // lane month 0 = November 2026
  const monthId = i => { const [y, m] = base.split('-').map(Number), t = (m - 1) + i; return `${y + Math.floor(t / 12)}-${String(t % 12 + 1).padStart(2, '0')}`; };
  const months = L.months.map((label, i) => ({ ym: monthId(i), label, current: monthId(i) === today.slice(0, 7) }));
  const dot = s => ({ id: s.id, title: s.title, date: s.date, project: s.project, state: done.has(s.id) ? 'done' : s.date < today ? 'overdue' : s.date.slice(0, 7) === today.slice(0, 7) ? 'due' : 'coming' });
  const lane = (key, phases) => ({ key, name: key === 'talk' ? '60-minute talk' : 'Three-session offering', phases, steps: steps.filter(s => s.project === key || s.project === 'both').map(s => ({ ...dot(s), col: months.findIndex(m => m.ym === s.month) })).filter(s => s.col >= 0) });
  const talk = lane('talk', L.talk), offering = lane('offering', L.offering), cur = months.findIndex(m => m.current);
  const here = cur < 0 ? '' : [...talk.phases, ...offering.phases].filter(p => cur >= p.from && cur < p.to).map(p => p.label.toLowerCase()).filter((v, i, a) => a.indexOf(v) === i);
  return { months, talk, offering, doneCount: steps.filter(s => done.has(s.id)).length, total: steps.length, here: cur < 0 ? '' : `You are here: ${months[cur].label === 'Nov' ? 'November' : new Date(`${months[cur].ym}-15T12:00:00Z`).toLocaleDateString('en-US', { month: 'long', timeZone: 'UTC' })}, ${here.length ? here.join(' and ') : 'keep going'}.` };
}

// ---- the one-to-one summary: the page's own (newest) wins, then Calendly's answer, then the older note ----
export function summaryChoice({ page, calendly, legacy }) {
  if (page && String(page).trim()) return { text: String(page).trim(), source: 'page' };
  if ((calendly || []).length) return { text: calendly.map(a => a.a).join('\n'), source: 'calendly' };
  if (legacy && String(legacy).trim()) return { text: String(legacy).trim(), source: 'page' };
  return null;
}
// A summary can be edited until two days before the session
export const editableUntil = start => (start ? new Date(Date.parse(start) - 2 * 864e5).toISOString() : '');
export const canEdit = (start, now = Date.now()) => !!start && now < Date.parse(start) - 2 * 864e5;

// ---- everything the page needs, one object ----
export function buildYear({ scheduleRows, monthRows, statusRows, email, today, booked = null, legacyNote = '', now = Date.now() }) {
  const sch = scheduleFrom(scheduleRows), st = statusFor(statusRows, email), ym = today.slice(0, 7);
  const first = data.months.find(m => m.id.endsWith('-11')).id, started = ym >= first && ym <= data.months[data.months.length - 1].id;
  const next = nextFor(sch.steps, st.done, today, 3).map(s => ({ ...s, status: 'open' }));
  const all = sch.steps.map(s => ({ ...s, status: st.done.has(s.id) ? 'done' : 'open', overdue: !st.done.has(s.id) && s.date < today, daysTo: daysBetween(today, s.date) }));
  const rv = started ? reviewCard(sch.reviews, st.done, today) : null;
  const bm = booked && booked.start ? new Date(booked.start).toISOString().slice(0, 7) : '';
  const sum = booked ? summaryChoice({ page: bm ? (st.notes[oneToOneId(bm)] || {}).text : '', calendly: booked.summary && booked.source !== 'note' ? booked.summary.filter(x => x.q !== 'What you sent') : [], legacy: legacyNote }) : null;
  return {
    started, today, startsOn: `${first}-01`, endsOn: lastDay(data.months[data.months.length - 1].id), bring: REVIEW_KEYS[data.reviews.findIndex(r => r.month === ym)] || '', // 'q1' | 'mid' | 'readiness' in the month that holds that review (the one-to-one covers it), else ''
    month: monthFrom(monthRows, ym), months: data.months.map(m => monthFrom(monthRows, m.id)), steps: started ? next : [], allSteps: all, doneCount: all.filter(s => s.status === 'done').length, total: all.length,
    lanes: started ? lanesFor(sch.steps, st.done, today) : null,
    review: rv && { key: rv.key, state: rv.state, name: rv.name, title: rv.title, month: rv.month, opensOn: rv.opensOn, ticked: rv.ticked, total: rv.total, checks: rv.checks.map(c => ({ ...c, done: st.done.has(c.id) })) },
    later: started ? laterReviews(sch.reviews, today) : [],
    oneToOne: { summary: sum, editableUntil: booked ? editableUntil(booked.start) : '', canEdit: booked ? canEdit(booked.start, now) : false, template: data.oneToOne.template },
    reminders: !st.prefsOff, fromSheet: sch.fromSheet,
  };
}

// ---- cohort numbers for Ops ----
// mentees: [{ name, email }]; statusRows: all rows. → [{ step, doneBy: [emails], count }]
export function cohortSteps(steps, mentees, statusRows) {
  const by = new Map(mentees.map(m => [lower(m.email), statusFor(statusRows, m.email).done]));
  return steps.map(s => { const doneBy = mentees.filter(m => by.get(lower(m.email)).has(s.id)); return { step: s, doneBy: doneBy.map(m => ({ name: m.name, email: lower(m.email), at: (statusRows.find(r => lower(r.email) === lower(m.email) && r.step_id === s.id && r.status === 'done') || {}).done_at || '' })), count: doneBy.length, of: mentees.length }; });
}
export function reviewProgress(review, mentees, statusRows, today) {
  const ended = today > lastDay(review.month);
  return mentees.map(m => { const d = statusFor(statusRows, m.email).done, n = review.checks.filter(c => d.has(c.id)).length; return { name: m.name, email: lower(m.email), ticked: n, total: review.checks.length, state: n === review.checks.length ? 'ready' : n > 0 ? 'progress' : ended ? 'risk' : 'none' }; });
}
// Status of a booked one-to-one for Ops: amber from 3 days before, red from 1 day before
export function summaryStatus(start, hasSummary, now = Date.now()) {
  if (hasSummary) return { key: 'in', label: 'Summary in' };
  const days = Math.ceil((Date.parse(start) - now) / 864e5);
  if (days < 0) return { key: 'none', label: 'No summary' };
  if (days <= 1) return { key: 'risk', label: days <= 0 ? 'No summary · today' : 'No summary · tomorrow' };
  if (days <= 3) return { key: 'soon', label: `No summary · in ${days} days` };
  return { key: 'none', label: `No summary · in ${days} days` };
}

// ---- nudges: email, once each (a `nudge:<kind>:<id>` row in Step Status), per-mentee reminders switch ----
const first = n => String(n || '').trim().split(/\s+/)[0] || 'there';
const dayName = d => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' });
/**
 * mentees: [{ name, email }]; statusRows: all rows; bookings: [{ email, start, summary? }] (summary true when written); returns the nudges due today.
 * Each: { key, email, name, kind, subject, lines: [paragraph text], button: { label, path } }
 */
export function dueNudges({ schedule, mentees, statusRows, bookings = [], today, tz = 'America/New_York' }) {
  const out = [], sch = scheduleFrom(schedule), first1 = data.months.find(m => m.id.endsWith('-11')).id;
  if (today.slice(0, 7) < first1) return out;
  for (const m of mentees) {
    const e = lower(m.email), st = statusFor(statusRows, e);
    if (st.prefsOff) continue;
    const add = (kind, id, subject, lines, button) => { const key = `nudge:${kind}:${id}`; if (!st.sent.has(key)) out.push({ key, email: e, name: m.name, kind, subject, lines, button }); };
    const hi = `Hi ${first(m.name)}`;
    for (const s of sch.steps) {
      if (st.done.has(s.id)) continue;
      const to = daysBetween(today, s.date);
      if (to > 0 && to <= 7) add('soon', s.id, `Your next project step: ${s.title}`, [`${hi}, a gentle note that “${s.title}” is due ${dayName(s.date)}.`, s.evidence ? `${s.evidence}.` : '', 'If you’ve done it, tick it on your page so Jacob knows.'].filter(Boolean), { label: 'Open my page', path: '/c/mentorship' });
      else if (to <= -3 && to >= -10) add('overdue', s.id, `Checking in: ${s.title}`, [`${hi}, “${s.title}” was due ${dayName(s.date)}. No rush and no judgment.`, 'If it’s done, tick it; if it’s stuck, bring it to your one-to-one or message Jacob.'], { label: 'Open my page', path: '/c/mentorship' });
    }
    // (Quarterly review ticks are off: the review happens in the one-to-one, so nothing here reminds mentees to tick it.)
    for (const b of bookings.filter(x => lower(x.email) === e)) {
      const to = daysBetween(today, new Date(b.start).toLocaleDateString('en-CA', { timeZone: tz }));
      if (to >= 0 && to <= 3 && !b.summary) add('summary', new Date(b.start).toISOString().slice(0, 10), `A few lines for Jacob before ${new Date(b.start).toLocaleDateString('en-US', { weekday: 'long', timeZone: tz })}`, [`${hi}, before you meet on ${new Date(b.start).toLocaleString('en-US', { weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: tz })}, add a few lines on what you’d like to work on, discuss, or are struggling with.`, 'Jacob reads it beforehand.'], { label: 'Add my summary', path: '/c/mentorship' });
    }
  }
  return out;
}

// ---- Monday digest lines for Jacob (a line is left out when its count is 0) ----
export function digestLines({ schedule, mentees, statusRows, bookings = [], today, tz = 'America/New_York' }) {
  const sch = scheduleFrom(schedule), nm = e => (mentees.find(m => lower(m.email) === lower(e)) || {}).name || e, lines = [];
  const doneOf = e => statusFor(statusRows, e).done;
  const overdue = [];
  for (const m of mentees) for (const s of sch.steps) if (s.date < today && !doneOf(m.email).has(s.id)) overdue.push([m.name, s.title]);
  if (overdue.length) lines.push(`Steps overdue: ${overdue.length} (${overdue.slice(0, 6).map(o => `${o[0]} · ${o[1]}`).join('; ')}${overdue.length > 6 ? `; +${overdue.length - 6} more` : ''})`);
  const wk = addDays(today, 7);
  for (const s of sch.steps.filter(x => x.date >= today && x.date <= wk)) { const n = mentees.filter(m => doneOf(m.email).has(s.id)).length; if (n < mentees.length) lines.push(`Due this week, not yet ticked: '${s.title}': ${n} of ${mentees.length}`); }
  const noSum = bookings.filter(b => !b.summary && daysBetween(today, new Date(b.start).toLocaleDateString('en-CA', { timeZone: tz })) >= 0 && daysBetween(today, new Date(b.start).toLocaleDateString('en-CA', { timeZone: tz })) <= 7);
  if (noSum.length) lines.push(`One-to-ones this week without a summary: ${noSum.length} (${noSum.map(b => `${nm(b.email)}, ${new Date(b.start).toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit', timeZone: tz })}`).join('; ')})`);
  if (Number(today.slice(8)) >= 15) { const booked = new Set(bookings.map(b => lower(b.email))), nb = mentees.filter(m => !booked.has(lower(m.email))); if (nb.length) lines.push(`Not booked for ${new Date(`${today}T12:00:00Z`).toLocaleDateString('en-US', { month: 'long', timeZone: 'UTC' })} yet: ${nb.length}`); }
  const quiet = mentees.filter(m => { const mine = statusRows.filter(r => lower(r.email) === lower(m.email) && !r.step_id.startsWith('nudge:') && r.step_id !== PREFS_ID && r.updated_at); if (!mine.length) return false; return daysBetween(mine.map(r => r.updated_at).sort().pop().slice(0, 10), today) >= 30; });
  if (quiet.length) lines.push(`Quiet for 30 days (no ticks, no summary): ${quiet.map(m => m.name).join(', ')}`);
  return lines;
}
