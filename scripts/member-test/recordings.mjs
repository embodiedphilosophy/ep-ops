// Recordings on the mentee page: matching ended sessions to recording posts, the 72-hour wait, the orientation, and the digest line.
// Run: node --import ./scripts/ce-test/register.mjs scripts/member-test/recordings.mjs
import assert from 'assert/strict';
const R = await import('../../lib/mentee/recordings.js');
const config = { mentorship_sessions_space_id: 7, immersions: [{ n: 1, title: 'Beneath the Pose', sat: '2026-11-14', sun: '2026-11-15' }, { n: 2, title: 'Tasting the Real', sat: '2026-12-05', sun: '2026-12-06' }],
  orientation: { title: 'Orientation', date: '2026-10-18', sub: 'Sahṛdaya Upāya · how the year works', url: 'https://ss/o' } };
const ev = (id, name, start, end, extra = {}) => ({ id, name, starts_at: start, ends_at: end, space_id: 7, ...extra });
const post = (id, slug, name, extra = {}) => ({ id, slug, name, url: `https://ss/${slug}`, ...extra });
const events = [
  ev(1, 'Open Session', '2026-11-14T15:00:00Z', '2026-11-14T17:30:00Z'), ev(2, 'Practicum', '2026-11-15T15:00:00Z', '2026-11-15T17:30:00Z'),
  ev(3, 'Open Session', '2026-12-05T15:00:00Z', '2026-12-05T17:30:00Z'), ev(4, 'Mentee orientation call', '2026-10-18T15:00:00Z', '2026-10-18T16:30:00Z'),
  ev(5, 'Elsewhere', '2026-11-14T15:00:00Z', '2026-11-14T17:30:00Z', { space_id: 99 }),
];
const posts = [post(10, 'recording-2026-11-14-abc', 'Open Session', { duration: 9100 })];
// Sun 15 Nov, 2 days later: Open Session ready, Practicum on its way (under 72h), orientation always there
let r = R.recordingsFrom({ events, posts, config, now: Date.parse('2026-11-17T12:00:00Z') });
assert.deepEqual(r.items.map(i => [i.title, i.state]), [['Practicum · Beneath the Pose', 'wait'], ['Open Session · Beneath the Pose', 'ready'], ['Orientation', 'ready']]);
assert.equal(r.items[1].url, 'https://ss/recording-2026-11-14-abc'); assert.equal(r.items[1].duration, 9100); assert.equal(r.items[1].sub, 'Immersion 1 · with the whole school'); assert.equal(r.items[0].sub, 'Immersion 1 · mentees only');
assert.equal(r.after, true); assert.deepEqual(r.missing, []); assert.equal(r.count, 3);
// 4 days later with no Practicum recording: it leaves the mentee's card and goes to the digest
r = R.recordingsFrom({ events, posts, config, now: Date.parse('2026-11-19T20:00:00Z') });
assert.deepEqual(r.items.map(i => i.title), ['Open Session · Beneath the Pose', 'Orientation']); assert.deepEqual(r.missing, [{ title: 'Practicum · Beneath the Pose', day: '2026-11-15' }]);
assert.deepEqual(R.missingLines(r), ['Recording missing: Practicum · Beneath the Pose (15 Nov)']);
// the recording posted later is picked up; a Vimeo link on the event page counts too; sessions not over yet are left out
r = R.recordingsFrom({ events: [...events, ev(6, 'Practicum', '2026-12-06T15:00:00Z', '2026-12-06T17:30:00Z')], posts: [...posts, post(11, 'recording-2026-11-15-def', 'Practicum')], config, now: Date.parse('2026-12-05T20:00:00Z') });
assert.equal(r.items.filter(i => i.state === 'ready').length, 3); assert.ok(!r.items.some(i => i.day === '2026-12-06'), 'Dec 6 has not happened');
r = R.recordingsFrom({ events: [ev(7, 'Practicum', '2026-11-15T15:00:00Z', '2026-11-15T17:30:00Z', { post: { url: 'https://ss/e/7', body: 'https://vimeo.com/123456789' } })], posts: [], config, now: Date.parse('2026-11-16T12:00:00Z') });
assert.equal(r.items[0].state, 'ready'); assert.equal(r.items[0].url, 'https://ss/e/7');
// before any immersion: only the orientation, and nothing "after"
r = R.recordingsFrom({ events: [], posts: [], config, now: Date.parse('2026-11-01T12:00:00Z') });
assert.deepEqual(r.items.map(i => i.title), ['Orientation']); assert.equal(r.after, false);
// the orientation event itself is not listed twice; the orientation post slug is not mistaken for a session recording
r = R.recordingsFrom({ events, posts: [post(12, 'recording-2026-10-18-orientation', 'Orientation')], config, now: Date.parse('2026-11-01T12:00:00Z') });
assert.equal(r.items.length, 1);
console.log('recordings: ok');
// the orientation with no recording address yet: "on its way" for 72 hours, nothing before the day, then the digest
const cfg2 = { ...config, orientation: { ...config.orientation, date: '2026-11-01', url: '' } };
let r2 = R.recordingsFrom({ events: [], posts: [], config: cfg2, now: Date.parse('2026-11-01T22:00:00Z') });
assert.deepEqual(r2.items.map(i => [i.title, i.state, i.url]), [['Orientation', 'wait', '']]);
assert.deepEqual(R.recordingsFrom({ events: [], posts: [], config: cfg2, now: Date.parse('2026-10-31T22:00:00Z') }).items, [], 'not before the day');
r2 = R.recordingsFrom({ events: [], posts: [], config: cfg2, now: Date.parse('2026-11-05T22:00:00Z') });
assert.deepEqual([r2.items.length, r2.missing.map(m => m.title)], [0, ['Orientation']]);
// once the Make scenario posts the recording (slug recording-2026-11-01-143023), the orientation is found with no address filled in
r2 = R.recordingsFrom({ events: [], posts: [post(20, 'recording-2026-11-01-143023', 'Sah\u1e5bdaya Up\u0101ya: Mentorship Orientation', { duration: 7100 })], config: cfg2, now: Date.parse('2026-11-02T10:00:00Z') });
assert.deepEqual(r2.items.map(i => [i.state, i.url, i.duration]), [['ready', 'https://ss/recording-2026-11-01-143023', 7100]]); assert.deepEqual(r2.missing, []);
console.log('recordings (orientation): ok');
