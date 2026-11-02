// Editing the mentee year (Ops → Mentee year): the checks and ids (lib/ops/menteeyearedit.js) and how the Schedule tab is read
// once it holds edits (lib/mentee/year.js: each kind falls back to the seed on its own; tasks reach the mentee's month). No network.
// Run: node --import ./scripts/ce-test/register.mjs scripts/ops-test/mentee-year-edit.mjs
import assert from 'node:assert/strict';
import { checkItem, checkMonth, newId } from '../../lib/ops/menteeyearedit.js';
import { scheduleFrom, seedRows, buildYear } from '../../lib/mentee/year.js';

// checks
assert.deepEqual(checkItem('task', { date: '2026-11-20', title: '  Watch the orientation \n recording ', link: 'https://ss.embodiedphilosophy.com/c/x' }).values, { date: '2026-11-20', title: 'Watch the orientation recording', detail: '', link: 'https://ss.embodiedphilosophy.com/c/x' });
assert.ok(checkItem('task', { date: '2026-11-20', title: 'x', link: 'http://insecure' }).errors.link);
assert.ok(checkItem('task', { date: '2027-09-01', title: 'x' }).errors.date, 'outside the year');
assert.ok(checkItem('task', { date: '', title: '' }).errors.title);
assert.ok(checkItem('step', { date: '2026-12-01', title: 'x' }).errors.project);
assert.equal(checkItem('step', { date: '2026-12-01', title: 'x', project: 'talk', evidence: 'E' }).values.evidence, 'E');
assert.ok(checkMonth({ month: '2030-01' }).errors); assert.equal(checkMonth({ month: '2026-11', theme: 'T' }).values.theme, 'T');
assert.equal(newId('task', '2026-11-20', 'Watch the orientation!', new Set()), 't-2026-11-watch-the-orientation');
assert.equal(newId('task', '2026-11-20', 'Watch', new Set(['t-2026-11-watch'])), 't-2026-11-watch-2');

// reading: an empty tab = the seed; a tab with only a task keeps the seeded steps and adds the task
const seed = seedRows(), task = { step_id: 't-2026-11-watch', kind: 'task', date: '2026-11-20', title: 'Watch', detail: '', link: '', publish: 'TRUE' };
const nSteps = seed.filter(r => r.kind === 'step').length;
assert.equal(scheduleFrom([]).steps.length, nSteps); assert.deepEqual(scheduleFrom([]).tasks, []);
const onlyTask = scheduleFrom([task]);
assert.equal(onlyTask.steps.length, nSteps, 'adding a first task keeps the seeded steps'); assert.equal(onlyTask.tasks.length, 1); assert.ok(onlyTask.reviews.length);
// a seeded tab with one step hidden and one edited
const rows = seed.map((r, i) => i === 0 ? { ...r, publish: 'FALSE' } : i === 1 ? { ...r, title: 'Edited' } : r);
const sch = scheduleFrom([...rows, task, { ...task, step_id: 't-2026-11-gone', publish: 'FALSE' }]);
assert.equal(sch.steps.length, nSteps - 1, 'a hidden step stays hidden'); assert.ok(sch.steps.some(s => s.title === 'Edited')); assert.equal(sch.tasks.length, 1, 'a hidden task is left out');
// the mentee's month: this month's tasks with their ticks
const y = buildYear({ scheduleRows: [task, { ...task, step_id: 't-2026-12-x', date: '2026-12-05' }], monthRows: [], statusRows: [{ email: 'a@x.test', step_id: 't-2026-11-watch', status: 'done' }], email: 'a@x.test', today: '2026-11-10' });
assert.deepEqual(y.tasks.map(t => [t.id, t.status]), [['t-2026-11-watch', 'done']]);
console.log('mentee-year-edit: all good');
