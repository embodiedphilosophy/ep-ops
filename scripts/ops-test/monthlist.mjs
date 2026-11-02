// The month list (lib/mentee/monthlist.js): the same rows on the mentee page, in Ops and on /school/mentee-year, and the Ops changes laid over them.
// Run: node --import ./scripts/ce-test/register.mjs scripts/ops-test/monthlist.mjs
import assert from 'assert/strict';
const M = await import('../../lib/mentee/monthlist.js');
const config = (await import('../../data/mentee.json', { with: { type: 'json' } })).default;
const books = [
  { month: '1', starts: '2026-10-21', title: 'Education’s End', author: 'Anthony Kronman', kind: 'required' },
  { month: '2', starts: '2026-11-16', title: 'The Truth of Yoga', author: 'Daniel Simpson', kind: 'required' },
  { month: '2', starts: '2026-11-16', title: 'Yoga Body', author: 'Mark Singleton', kind: 'suggested' },
];
const keys = l => l.filter(r => !r.hidden && r.circle).map(r => r.key);
let nov = M.monthList({ ym: '2026-11', config, bookRows: books });
// the same six things, in the same order, as the mentee page in Circle at the start of November
assert.deepEqual(keys(nov), ['book-education-s-end', 'book-the-truth-of-yoga', 'buddy', 'immersion-1', 'one-to-one', 'reflection']);
assert.deepEqual(nov.filter(r => r.kind === 'book').map(r => r.when), ['Now', 'From 16 Nov']);
assert.equal(nov.find(r => r.key === 'book-education-s-end').line, 'Anthony Kronman. About 30 minutes most days.');
assert.equal(nov.find(r => r.key === 'book-yoga-body').circle, false, 'suggested books are not a row in Circle');
assert.match(nov.find(r => r.key === 'immersion-1').line, /^Your first weekend together/);
assert.equal(nov.find(r => r.key === 'reflection').title, 'Write your first reflection');
assert.equal(nov.find(r => r.key === 'immersion-1').title, 'Immersion 1 · Beneath the Pose');
assert.equal(nov.find(r => r.key === 'reflection').date, '2026-11-30', 'last Monday');
assert.equal(nov.find(r => r.key === 'one-to-one').date, '2026-11-23');
assert.match(nov.find(r => r.key === 'buddy').hint, /Rotation 1 \(Oct–Nov\): the same buddy/);
// October: no immersion → the mentee-year line; July: the retreat line; December with no books → the mentee-year Read line
assert.equal(M.monthList({ ym: '2026-10', config, bookRows: books }).find(r => r.kind === 'note').title, 'No immersion');
assert.equal(M.monthList({ ym: '2027-07', config }).find(r => r.key === 'note-immersion-1').title, 'Retreat practicum');
assert.match(M.monthList({ ym: '2026-12', config }).find(r => r.key === 'note-book-1').title, /^Read Pierre Hadot/);
assert.equal(M.monthList({ ym: '2026-10', config, bookRows: books }).find(r => r.kind === 'book').when, 'From 21 Oct');
// Ops changes: rename + move immersion 1, hide the buddy row, reword the reflection, move the one-to-one window, a task
const rowRows = [
  { month: '2026-11', row: 'immersion-1', sat_link: 'https://zoom.us/j/111', sun_link: 'https://zoom.us/j/222', title: 'Under the Pose', date: '2026-11-21', end: '2026-11-22', link: 'https://ss.embodiedphilosophy.com/c/x', line: 'Bring a notebook.' },
  { month: '2026-11', row: 'buddy', publish: 'FALSE' },
  { month: '2026-11', row: 'reflection', title: 'Your first reflection' },
  { month: '2026-11', row: 'one-to-one', date: '2026-11-24', end: '2026-11-28' },
];
const tasks = [{ id: 't-2026-11-x', month: '2026-11', date: '2026-11-20', title: 'Watch', detail: '', link: '' }];
nov = M.monthList({ ym: '2026-11', config, bookRows: books, rowRows, tasks });
const im = nov.find(r => r.key === 'immersion-1');
assert.deepEqual([im.title, im.date, im.end, im.link, im.line], ['Immersion 1 · Under the Pose', '2026-11-21', '2026-11-22', 'https://ss.embodiedphilosophy.com/c/x', 'Bring a notebook.']);
assert.equal(nov.find(r => r.key === 'buddy').hidden, true); assert.equal(nov.find(r => r.key === 'reflection').title, 'Your first reflection');
assert.equal(nov.find(r => r.key === 'one-to-one').date, '2026-11-24'); assert.ok(nov.some(r => r.key === 't-2026-11-x'));
assert.deepEqual([im.satLink, im.sunLink], ['https://zoom.us/j/111', 'https://zoom.us/j/222']);
const cfg = M.withOverrides(config, rowRows);
assert.deepEqual([cfg.immersions[0].sat_link, cfg.immersions[0].sun_link], ['https://zoom.us/j/111', 'https://zoom.us/j/222']);
assert.deepEqual([cfg.immersions[0].title, cfg.immersions[0].sat, cfg.immersions[0].prepare_link], ['Under the Pose', '2026-11-21', 'https://ss.embodiedphilosophy.com/c/x']);
assert.equal(cfg.windows.find(w => w.from.startsWith('2026-11')).to, '2026-11-28'); assert.equal(config.immersions[0].sat, '2026-11-14', 'the original is untouched');
assert.deepEqual(M.monthOverrides(rowRows, '2026-11').buddy, { title: '', line: '', hide: true });
// the order set in Ops: placed rows first, the rest in their usual order
const ordered = M.monthList({ ym: '2026-11', config, bookRows: books, tasks, rowRows: [{ month: '2026-11', row: '_order', line: 't-2026-11-x, reflection' }] }).filter(r => r.circle).map(r => r.key);
assert.deepEqual(ordered.slice(0, 3), ['t-2026-11-x', 'reflection', 'book-education-s-end']);
assert.deepEqual(M.monthOrder([{ month: '2026-11', row: '_order', line: 'a, b' }], '2026-11'), ['a', 'b']);
assert.equal(M.overridesFrom([{ month: '2026-11', row: '_order', line: 'a' }])['2026-11|_order'], undefined);
console.log('monthlist: ok');
