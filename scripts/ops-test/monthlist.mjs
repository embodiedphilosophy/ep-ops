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
const keys = l => l.filter(r => !r.hidden).map(r => r.key);
let nov = M.monthList({ ym: '2026-11', config, bookRows: books });
assert.deepEqual(keys(nov), ['buddy', 'immersion-1', 'book-the-truth-of-yoga', 'book-yoga-body', 'one-to-one', 'reflection']);
assert.equal(nov.find(r => r.key === 'immersion-1').title, 'Immersion 1 · Beneath the Pose');
assert.equal(nov.find(r => r.key === 'reflection').date, '2026-11-30', 'last Monday');
assert.equal(nov.find(r => r.key === 'one-to-one').date, '2026-11-23');
assert.match(nov.find(r => r.key === 'buddy').line, /Rotation 1 \(Oct–Nov\): the same buddy/);
// October: no immersion → the mentee-year line; July: the retreat line; December with no books → the mentee-year Read line
assert.equal(M.monthList({ ym: '2026-10', config, bookRows: books }).find(r => r.kind === 'note').title, 'No immersion');
assert.equal(M.monthList({ ym: '2027-07', config }).find(r => r.key === 'note-immersion-1').title, 'Retreat practicum');
assert.match(M.monthList({ ym: '2026-12', config, bookRows: books }).find(r => r.key === 'note-book-1').title, /^Read Pierre Hadot/);
// Ops changes: rename + move immersion 1, hide the buddy row, reword the reflection, move the one-to-one window, a task
const rowRows = [
  { month: '2026-11', row: 'immersion-1', title: 'Under the Pose', date: '2026-11-21', end: '2026-11-22', link: 'https://ss.embodiedphilosophy.com/c/x', line: 'Bring a notebook.' },
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
const cfg = M.withOverrides(config, rowRows);
assert.deepEqual([cfg.immersions[0].title, cfg.immersions[0].sat, cfg.immersions[0].prepare_link], ['Under the Pose', '2026-11-21', 'https://ss.embodiedphilosophy.com/c/x']);
assert.equal(cfg.windows.find(w => w.from.startsWith('2026-11')).to, '2026-11-28'); assert.equal(config.immersions[0].sat, '2026-11-14', 'the original is untouched');
assert.deepEqual(M.monthOverrides(rowRows, '2026-11').buddy, { title: '', line: '', hide: true });
console.log('monthlist: ok');
