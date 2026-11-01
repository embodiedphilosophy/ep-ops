// The Ops "Mentee year" page: the helpers (lib/ops/menteeyear.js) and the content file (data/mentee-year.json). No network.
// Run: node --import ./scripts/ce-test/register.mjs scripts/ops-test/mentee-year.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { segments, plain, nextSteps, daysUntil, currentMonth, reviewFor, laneStyle } from '../../lib/ops/menteeyear.js';
const data = JSON.parse(readFileSync(new URL('../../data/mentee-year.json', import.meta.url)));

// text marks
assert.deepEqual(segments('**Read** Kronman, _Education’s End_ ~(optional)~ due ^Sat 31 Oct^.'), [{ t: 'b', s: 'Read' }, { t: 'text', s: ' Kronman, ' }, { t: 'i', s: 'Education’s End' }, { t: 'text', s: ' ' }, { t: 'q', s: '(optional)' }, { t: 'text', s: ' due ' }, { t: 'd', s: 'Sat 31 Oct' }, { t: 'text', s: '.' }]);
assert.equal(plain('**a** _b_ ^c^'), 'a b c'); assert.equal(plain('~Suggested: _Yoga Body_~'), 'Suggested: Yoga Body'); assert.deepEqual(segments(''), []);

// the content: ten months Oct 2026 – Jul 2027, the five layers, four weeks, 22 dated steps in date order, every step on a real project
assert.deepEqual(data.months.map(m => m.id), ['2026-10', '2026-11', '2026-12', '2027-01', '2027-02', '2027-03', '2027-04', '2027-05', '2027-06', '2027-07']);
assert.deepEqual(data.rhythm.map(r => r.level), ['Daily', 'Weekly', 'Monthly', 'Quarterly', 'Culmination']); assert.equal(data.week.length, 4);
assert.equal(data.steps.length, 22); assert.ok(data.steps.every(s => /^\d{4}-\d{2}-\d{2}$/.test(s.date) && ['talk', 'offering', 'both'].includes(s.project) && s.title && s.evidence));
assert.deepEqual(data.steps.map(s => s.date), [...data.steps.map(s => s.date)].sort(), 'steps are in date order');
for (const m of data.months) for (const s of m.steps) { assert.match(s.date, /^\d{4}-\d{2}-\d{2}$/, 'month steps carry real dates'); assert.equal(s.date.slice(0, 7), m.id, 'and sit in their own month'); assert.ok(data.steps.some(r => r.date === s.date && r.title === s.text), 'and are in the dated table'); }
assert.equal(data.months.reduce((n, m) => n + m.steps.length, 0), data.steps.length, 'the month cards and the dated table list the same steps');
assert.ok(data.months.every(m => m.items.some(t => /One-to-one/.test(t)) ), 'every month names the one-to-one');
assert.ok(data.oneToOne.howTo.some(t => /last week of the month/.test(t)) && data.oneToOne.howTo.some(t => /Book early/.test(t)), 'book early, session in the last week');
assert.equal(data.oneToOne.template.length, 5); assert.deepEqual(data.lanes.months, ['Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul']);

// next steps and the month card
assert.deepEqual(nextSteps(data.steps, '2026-11-01', 3).map(s => s.date), ['2026-11-30', '2026-12-31', '2026-12-31']);
assert.deepEqual(nextSteps(data.steps, '2026-12-31', 1).map(s => s.date), ['2026-12-31'], 'a step due today still shows');
assert.equal(nextSteps(data.steps, '2027-08-01', 3).length, 0, 'after the year, nothing');
assert.equal(daysUntil('2026-11-30', '2026-11-01'), 29); assert.equal(daysUntil('2026-11-01', '2026-11-03'), -2);
assert.equal(currentMonth(data.months, '2026-11-15').id, '2026-11'); assert.equal(currentMonth(data.months, '2026-09-01').id, '2026-10', 'before October: the first month'); assert.equal(currentMonth(data.months, '2027-09-01').id, '2027-07', 'after July: the last');

// the quarterly reviews are tick-lists: December, March, June
const rs = data.reviews;
assert.deepEqual(rs.map(r => r.month), ['2026-11', '2027-03', '2027-06']); assert.match(rs[0].title, /November · Q1/);
assert.ok(rs.every(r => r.checks.length >= 5 && r.checks.every(c => c[0] === c[0].toUpperCase())));
assert.ok(rs[0].checks.some(c => /competenc/i.test(c)) && rs[1].checks.some(c => /attendance/i.test(c)) && rs[2].checks.some(c => /10 of 10/.test(c)));
assert.equal(reviewFor(rs, '2026-11-10').month, '2026-11', 'this month’s review'); assert.equal(reviewFor(rs, '2026-10-01').month, '2026-11', 'otherwise the next one'); assert.equal(reviewFor(rs, '2027-07-01'), null);
// the lanes sit in the right columns
assert.deepEqual(laneStyle({ from: 0, to: 2 }), { gridColumn: '2 / 4' });
assert.ok([...data.lanes.talk, ...data.lanes.offering].every(b => b.from >= 0 && b.to <= 9 && b.to > b.from));

// edits kept in the Mentee Year Content tab: a row replaces one piece of text; blank, unknown or non-editable paths are ignored; the original is never changed
const { applyOverrides, isEditablePath, pathValue } = await import('../../lib/mentee/yearcontent.js');
const ov = applyOverrides(data, [
  { path: 'lede', value: '  A new introduction.  ' }, { path: 'months.1.items.0', value: 'Immersion 1 moved.' }, { path: 'oneToOne.howTo.1', value: '' },
  { path: 'months.99.items.0', value: 'nowhere' }, { path: 'steps.0.title', value: 'not editable here' }, { path: 'months.1.id', value: 'sneaky' }, { path: '__proto__.x', value: 'no' },
]);
assert.equal(ov.lede, 'A new introduction.'); assert.equal(ov.months[1].items[0], 'Immersion 1 moved.'); assert.equal(ov.oneToOne.howTo[1], data.oneToOne.howTo[1], 'blank = original');
assert.equal(ov.months[1].id, data.months[1].id); assert.notEqual(data.lede, ov.lede, 'the data file object is not changed');
assert.ok(isEditablePath('rhythm.0.items.2') && isEditablePath('footer') && !isEditablePath('months.1.steps.0.text') && !isEditablePath('lanes.months.0'));
assert.equal(pathValue(data, 'months.1.theme'), data.months[1].theme); assert.equal(pathValue(data, 'months.1.items'), undefined);
console.log('mentee year: ok');
