// The mentee year: steps ordering, review states, lanes, summary precedence, nudges (once only), digest lines.
// Run: node --import ./scripts/ce-test/register.mjs scripts/member-test/year.mjs
import assert from 'assert/strict';
const Y = await import('../../lib/mentee/year.js');

// seed: 22 steps + 18 review checks (5 / 7 / 6), stable unique ids
const seed = Y.seedRows();
assert.equal(seed.filter(r => r.kind === 'step').length, 22); assert.equal(seed.filter(r => r.kind === 'review_check').length, 18);
assert.deepEqual(['q1', 'mid', 'readiness'].map(k => seed.filter(r => r.review === k).length), [5, 7, 6]);
assert.equal(new Set(seed.map(r => r.step_id)).size, seed.length); assert.ok(seed.every(r => /^(s-\d{4}-\d{2}-|r-(q1|mid|readiness)-\d)/.test(r.step_id)));
// step ids are frozen: Mentee Step Status rows point at them, so rewording a title must never move one. These are the ids origin/main (3e797c9) derived from the old titles.
const FROZEN = [
 "s-2026-11-start-your-project-notebook",
 "s-2026-12-longlist-three-possible-talk-topics",
 "s-2026-12-note-two-or-three-session-1-angles-you-c",
 "s-2027-01-name-your-real-group-and-venue",
 "s-2027-02-bring-a-talk-topic-proposal-to-your-one-",
 "s-2027-02-choose-your-session-1-angle",
 "s-2027-03-memorise-st-7-59-in-sanskrit-and-english",
 "s-2027-03-write-the-session-1-talk",
 "s-2027-04-rehearse-the-session-2-talk-with-your-pa",
 "s-2027-04-book-your-three-dates-and-open-sign-ups",
 "s-2027-04-try-a-10-minute-seed-version-on-your-par",
 "s-2027-05-practise-paryavasana-responses-on-five-r",
 "s-2027-05-lead-the-full-upadesa-for-peers-under-su",
 "s-2027-05-bring-the-immersion-8-design-to-a-full-o",
 "s-2027-06-record-a-full-60-minute-run-through",
 "s-2027-06-write-the-follow-on-cohort-plan",
 "s-2027-06-mentor-feedback-on-the-run-through-book-",
 "s-2027-06-draft-the-final-report-outline",
 "s-2027-07-deliver-the-60-minute-talk-live-and-reco",
 "s-2027-07-complete-all-three-sessions-with-your-gr",
 "s-2027-07-revised-talk-if-you-re-revising",
 "s-2027-07-submit-the-final-report-and-sit-the-comp"
];
assert.deepEqual(seed.filter(r => r.kind === 'step').map(r => r.step_id), FROZEN, 'every step keeps its id');
const data = (await import('../../data/mentee-year.json', { with: { type: 'json' } })).default;
assert.deepEqual(data.steps.map(x => x.id), FROZEN, 'the id is written in the data, so the title can change');
assert.equal(Y.seedRows({ ...data, steps: [...data.steps, { date: '2026-12-01', project: 'talk', title: 'A new step', detail: '', evidence: '' }] }).filter(r => r.kind === 'step').pop().step_id, 's-2026-12-a-new-step', 'a step without an id still gets one from its title');
// a missing tab falls back to the seed
const sch = Y.scheduleFrom([]); assert.equal(sch.steps.length, 22); assert.equal(sch.fromSheet, false); assert.deepEqual(sch.reviews.map(r => r.checks.length), [5, 7, 6]);
// a real tab is used instead, and an unpublished row is left out
const live = Y.scheduleFrom([{ step_id: 's-x', date: '2026-12-01', project: 'talk', title: 'One', kind: 'step', publish: 'TRUE', order: '1' }, { step_id: 's-y', date: '2026-12-02', project: 'talk', title: 'Hidden', kind: 'step', publish: 'FALSE' }]);
assert.deepEqual(live.steps.map(s => s.id), ['s-x']); assert.equal(live.fromSheet, true);

// nextFor: not-done only, overdue first, then by date
const steps = sch.steps, id0 = steps[0].id; // 30 Nov, gather first ideas (both)
let n = Y.nextFor(steps, new Set(), '2026-12-02', 3); assert.deepEqual(n.map(s => [s.id === id0, s.overdue]), [[true, true], [false, false], [false, false]]); assert.equal(n[0].daysTo, -2);
n = Y.nextFor(steps, new Set([id0]), '2026-12-02', 3); assert.ok(n.every(s => !s.overdue) && n[0].date === '2026-12-31');
assert.equal(Y.nextFor(steps, new Set(steps.map(s => s.id)), '2026-12-02').length, 0);

// reviews: locked the month before, open in its month, complete when all ticked (shown that month), hidden otherwise
const R = sch.reviews, ids = k => R.find(r => r.key === k).checks.map(c => c.id);
const st = (t, done = []) => Y.reviewCard(R, new Set(done), t);
assert.equal(st('2026-10-20').state, 'locked'); assert.equal(st('2026-11-10').state, 'open'); assert.equal(st('2026-11-10').key, 'q1');
assert.equal(st('2026-11-20', ids('q1').slice(0, 4)).ticked, 4); assert.equal(st('2026-11-20', ids('q1')).state, 'complete');
assert.equal(st('2026-12-10', ids('q1')), null, 'December: nothing to show'); assert.equal(st('2027-01-10', ids('q1')), null, 'January: nothing to show'); assert.equal(st('2027-02-10', ids('q1')).state, 'locked'); assert.equal(st('2027-03-05', ids('q1')).state, 'open');
assert.equal(st('2027-01-10').state, 'open'); assert.equal(st('2026-09-05'), null, 'not before the year starts');
assert.deepEqual(Y.laterReviews(R, '2026-11-10').map(r => r.key), ['mid', 'readiness']); assert.equal(Y.laterReviews(R, '2026-11-10')[0].opensOn, '2027-03-01');

// lanes: dots in the right month and state; "Both" steps in both lanes
const L = Y.lanesFor(steps, new Set([id0]), '2026-12-10');
assert.equal(L.months.length, 9); assert.equal(L.months[1].current, true); assert.equal(L.doneCount, 1); assert.equal(L.total, 22);
assert.equal(L.talk.steps.find(s => s.id === id0).state, 'done'); assert.ok(L.offering.steps.some(s => s.id === id0));
assert.deepEqual(L.talk.steps.filter(s => s.col === 1).map(s => s.state), ['due']); assert.match(L.here, /^You are here: December/);
assert.equal(Y.lanesFor(steps, new Set(), '2027-01-05').talk.steps.find(s => s.date === '2026-12-31').state, 'overdue');

// status rows: ticks, un-ticks, notes, prefs, sent
const rows = [{ email: 'Maya@x.com', step_id: id0, status: 'done', done_at: '2026-11-28T19:00:00Z' }, { email: 'maya@x.com', step_id: steps[1].id, status: 'undone' }, { email: 'maya@x.com', step_id: '1to1-2026-11', status: 'summary', note: 'My words', updated_at: '2026-11-20T10:00:00Z' }, { email: 'sam@x.com', step_id: id0, status: 'done' }, { email: 'maya@x.com', step_id: 'prefs:reminders', status: 'off' }, { email: 'maya@x.com', step_id: 'nudge:soon:abc', status: 'sent' }];
const s = Y.statusFor(rows, 'MAYA@x.com'); assert.deepEqual([...s.done], [id0]); assert.equal(s.notes['1to1-2026-11'].text, 'My words'); assert.equal(s.prefsOff, true); assert.ok(s.sent.has('nudge:soon:abc'));

// summary precedence: the page's own wins, then Calendly, then an older note
assert.deepEqual(Y.summaryChoice({ page: 'Newer', calendly: [{ q: 'q', a: 'Older' }] }), { text: 'Newer', source: 'page' });
assert.deepEqual(Y.summaryChoice({ page: '', calendly: [{ q: 'q', a: 'From Calendly' }], legacy: 'old' }), { text: 'From Calendly', source: 'calendly' });
assert.equal(Y.summaryChoice({ legacy: 'Only a note' }).source, 'page'); assert.equal(Y.summaryChoice({}), null);
assert.equal(Y.canEdit('2026-11-24T19:00:00Z', Date.parse('2026-11-22T18:00:00Z')), true); assert.equal(Y.canEdit('2026-11-24T19:00:00Z', Date.parse('2026-11-22T20:00:00Z')), false);

// buildYear: before the year, a normal month, the page summary from Step Status
let y = Y.buildYear({ scheduleRows: [], monthRows: [], statusRows: [], email: 'maya@x.com', today: '2026-10-10' }); assert.equal(y.started, false); assert.deepEqual(y.steps, []); assert.equal(y.review, null);
y = Y.buildYear({ scheduleRows: [], monthRows: [{ month: '2026-11', theme: 'From the sheet', publish: 'TRUE' }], statusRows: rows, email: 'maya@x.com', today: '2026-11-10', booked: { start: '2026-11-24T19:00:00Z', summary: [{ q: 'q', a: 'Calendly words' }] }, now: Date.parse('2026-11-10T12:00:00Z') });
assert.equal(y.started, true); assert.equal(y.steps.length, 3); assert.equal(y.month.theme, 'From the sheet'); assert.equal(y.doneCount, 1); assert.equal(y.review.state, 'open');
assert.deepEqual(y.oneToOne.summary, { text: 'My words', source: 'page' }); assert.equal(y.oneToOne.canEdit, true); assert.equal(y.reminders, false);

// Ops: cohort counts, review progress, summary status colours
const mentees = [{ name: 'Maya', email: 'maya@x.com' }, { name: 'Sam', email: 'sam@x.com' }];
const c = Y.cohortSteps(steps, mentees, rows); assert.deepEqual([c[0].count, c[0].of], [2, 2]); assert.equal(c[0].doneBy[0].at, '2026-11-28T19:00:00Z'); assert.equal(c[1].count, 0);
const rp = Y.reviewProgress(R[0], mentees, [...rows, ...ids('q1').map(i => ({ email: 'sam@x.com', step_id: i, status: 'done' })), { email: 'maya@x.com', step_id: ids('q1')[0], status: 'done' }], '2026-12-05');
assert.deepEqual(rp.map(x => [x.state, x.ticked]), [['progress', 1], ['ready', 5]]);
assert.equal(Y.reviewProgress(R[0], mentees, [], '2026-12-05')[0].state, 'risk'); assert.equal(Y.reviewProgress(R[0], mentees, [], '2026-11-20')[0].state, 'none');
const now = Date.parse('2026-11-20T12:00:00Z'), at = d => `2026-11-${d}T19:00:00Z`;
assert.deepEqual([Y.summaryStatus(at(30), true, now).key, Y.summaryStatus(at(30), false, now).key, Y.summaryStatus(at(22), false, now).key, Y.summaryStatus(at(20), false, now).key], ['in', 'none', 'soon', 'risk']);

// nudges: due by the rules, respect the switch, never twice
const m2 = [{ name: 'Maya Rao', email: 'maya@x.com' }, { name: 'Sam Lee', email: 'sam@x.com' }];
let nu = Y.dueNudges({ schedule: [], mentees: m2, statusRows: [], today: '2026-11-25' });
assert.deepEqual(nu.filter(x => x.email === 'sam@x.com').map(x => x.kind), ['soon'], 'the 30 Nov step is 5 days away; there is no review reminder (the review is covered in the one-to-one)'); assert.match(nu[0].subject, /Your next project step: Gather first ideas for both projects/);
assert.equal(nu.length, 2);
assert.equal(Y.dueNudges({ schedule: [], mentees: m2, statusRows: [], today: '2026-11-10' }).length, 0, 'more than 7 days before: nothing');
nu = Y.dueNudges({ schedule: [], mentees: m2, statusRows: [{ email: 'sam@x.com', step_id: id0, status: 'done' }], today: '2026-12-03' }); assert.deepEqual(nu.map(x => [x.email, x.kind]), [['maya@x.com', 'overdue']], 'three days after, if not ticked');
nu = Y.dueNudges({ schedule: [], mentees: m2, statusRows: [{ email: 'maya@x.com', step_id: `nudge:overdue:${id0}`, status: 'sent' }, { email: 'sam@x.com', step_id: 'prefs:reminders', status: 'off' }], today: '2026-12-03' }); assert.deepEqual(nu, [], 'sent once; reminders off respected');
for (const day of ['2026-11-16', '2026-11-25', '2027-02-20', '2027-06-20']) assert.ok(!Y.dueNudges({ schedule: [], mentees: m2, statusRows: [], today: day }).some(x => x.kind === 'review'), 'no review reminder on ' + day);
nu = Y.dueNudges({ schedule: [], mentees: m2, statusRows: [], bookings: [{ email: 'maya@x.com', start: '2026-11-24T19:00:00Z', summary: false }, { email: 'sam@x.com', start: '2026-11-24T20:00:00Z', summary: true }], today: '2026-11-22' });
assert.deepEqual(nu.filter(x => x.kind === 'summary').map(x => x.email), ['maya@x.com']); assert.equal(Y.dueNudges({ schedule: [], mentees: m2, statusRows: [], today: '2026-10-20' }).length, 0, 'not before the year');

// digest: lines left out when zero
let dl = Y.digestLines({ schedule: [], mentees: m2, statusRows: [], today: '2026-10-10' }); assert.deepEqual(dl, [], 'nothing overdue, nothing due, no booking: no lines');
dl = Y.digestLines({ schedule: [], mentees: m2, statusRows: [{ email: 'sam@x.com', step_id: id0, status: 'done' }], bookings: [{ email: 'maya@x.com', start: '2026-12-08T19:00:00Z', summary: false }], today: '2026-12-07' });
assert.ok(dl.some(l => /^Steps overdue: 1 \(Maya Rao · Gather first ideas for both projects\)/.test(l))); assert.ok(!dl.some(l => /review/i.test(l)), 'no review line'); assert.ok(!Y.digestLines({ schedule: [], mentees: m2, statusRows: [], today: '2026-11-30' }).some(l => /review/i.test(l)), 'no review line while the review month is open either'); assert.ok(dl.some(l => /without a summary: 1 \(Maya Rao, Tue/.test(l)));
assert.ok(dl.some(l => /^Due this week, not yet ticked: 'Longlist three possible talk topics': 0 of 2/.test(l)) === false, '31 Dec is more than a week away');
dl = Y.digestLines({ schedule: [], mentees: m2, statusRows: [], bookings: [], today: '2026-12-16' }); assert.ok(dl.some(l => /^Not booked for December yet: 2/.test(l)));
console.log('year: ok');
