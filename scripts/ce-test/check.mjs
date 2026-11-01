// Offline checks for CE credits: tracker rules, pace check, Circle webhook parsing, CSV, and a sample
// certificate PDF (written to scripts/ce-test/out/sample.pdf). No network, no database.
// Run: node --import ./scripts/ce-test/register.mjs scripts/ce-test/check.mjs
import assert from 'assert/strict';
import { mkdir, writeFile } from 'fs/promises';

process.env.MEMBER_SECRET = 'test-secret';
const R = await import('../../lib/ce/rules.js');
const { certificatePdf } = await import('../../lib/ce/pdf.js');

// ---- pathways from Site Pathways rows
const rows = [
  { title: 'Classical Yoga & the Yoga Sūtras', ce_hours: '19.5', ya_category: 'Yoga Humanities', courses: 'A; B; C', circle_space_id: '101', lessons: '12', runtime_minutes: '1170' },
  { title: 'The Subtle Body: Chakras, Prāṇa & Breath', ce_hours: '3.5', ya_category: 'Anatomy & Physiology', circle_space_id: '102, 103' },
  { title: 'Meditation for Real Life', ce_hours: '12', ya_category: 'Techniques, Training & Practice', circle_space_id: '104', lessons: '8', runtime_minutes: '720' },
  { title: 'No CE here', ce_hours: '' },
];
const P = R.cePathways(rows);
assert.equal(P.length, 3);
assert.equal(P[0].slug, 'classical-yoga-and-the-yoga-sutras');
assert.equal(P[1].slug, 'the-subtle-body-chakras-prana-and-breath');
assert.deepEqual(P[1].spaceIds, ['102', '103']);
assert.equal(P[2].sample, true);
assert.equal(R.pathwayForSpace(P, '103').slug, P[1].slug);
assert.equal(R.pathwayForSpace(P, '999'), null);

// ---- pace check
assert.equal(R.paceCheck('2026-10-01T00:00:00Z', '2026-10-01T03:00:00Z', 2400), 'held');   // 3 h of a 40 h pathway
assert.equal(R.paceCheck('2026-10-01T00:00:00Z', '2026-10-20T00:00:00Z', 2400), 'pass');
assert.equal(R.paceCheck(null, '2026-10-20T00:00:00Z', 2400), 'unknown');
assert.equal(R.paceCheck('2026-10-01T00:00:00Z', '2026-10-20T00:00:00Z', 0), 'unknown');

// ---- ids and links
assert.equal(R.certId(2026, 142), 'EP-CE-2026-0142');
assert.ok(R.CERT_ID.test('EP-CE-2026-0142'));
const k = R.certKey('EP-CE-2026-0142');
assert.ok(R.goodKey('EP-CE-2026-0142', k));
assert.ok(!R.goodKey('EP-CE-2026-0143', k));
assert.ok(!R.goodKey('EP-CE-2026-0142', 'nope'));

// ---- renewal window
assert.deepEqual(R.cycleWindow('2027-03-01', '2026-10-15'), { start: '2024-03-01', end: '2027-03-01', set: true });
assert.deepEqual(R.cycleWindow(null, '2026-10-15'), { start: '2023-10-15', end: '2026-10-15', set: false });

// ---- tracker summary
const plus = { wisdomPlus: true, wisdom: true };
const ws = { wisdomPlus: false, wisdom: true };
const certs = [{ id: 'EP-CE-2026-0001', pathway: P[0].slug, status: 'issued', hours: 19.5, category: 'Yoga Humanities', issued_at: '2026-08-02T12:00:00Z', name: 'Maya' }];
const s = R.summarise({ pathways: P, lessons: { [P[1].slug]: { count: 2 }, [P[2].slug]: { count: 8 } }, done: { [P[2].slug]: '2026-10-13T12:00:00Z' }, certs, today: '2026-10-15', tier: plus });
assert.deepEqual(s.rows.map(r => r.status), ['certified', 'progress', 'reflect']);
assert.equal(s.cycle.hours, 19.5); assert.equal(s.cycle.met, false);
assert.equal(s.availableHours, 35);
assert.equal(s.rows[2].percent, 100);
assert.equal(s.rows[1].percent, 0); // no lesson total known
const s2 = R.summarise({ pathways: P, lessons: {}, done: { [P[2].slug]: '2026-10-13T12:00:00Z' }, certs: [], today: '2026-10-15', tier: ws });
assert.equal(s2.rows[2].status, 'locked');
const held = R.summarise({ pathways: P, certs: [{ ...certs[0], status: 'held' }], today: '2026-10-15', tier: plus });
assert.equal(held.rows[0].status, 'held'); assert.equal(held.cycle.hours, 0);
const revoked = R.summarise({ pathways: P, certs: [{ ...certs[0], status: 'revoked' }], today: '2026-10-15', tier: plus });
assert.equal(revoked.rows[0].status, 'new');

// ---- Circle webhook payloads (several plausible shapes)
let c = R.parseCircle({ community_member: { email: 'A@B.com', name: 'A' }, lesson: { id: 55, space_id: 104 } }, 'lesson');
assert.deepEqual([c.kind, c.email, c.lessonId, c.spaceId], ['lesson', 'a@b.com', '55', '104']);
c = R.parseCircle({ data: { member: { email: 'x@y.org' }, course: { id: 104 } }, event: 'completed_course' });
assert.deepEqual([c.kind, c.email, c.spaceId], ['course', 'x@y.org', '104']);
c = R.parseCircle({ member_email: 'q@r.io', space: { id: 102 }, lesson_id: 9 });
assert.deepEqual([c.kind, c.email, c.spaceId, c.lessonId], ['lesson', 'q@r.io', '102', '9']);

// ---- CSV
const csv = R.certsCsv([{ id: 'EP-CE-2026-0001', status: 'issued', name: 'Maya, "M"', hours: 12, r1: 'line\nbreak' }]);
assert.ok(csv.startsWith('Certificate ID,'));
assert.ok(csv.includes('"Maya, ""M"""'));

// ---- sample certificate
const pdf = await certificatePdf({ id: 'EP-CE-2026-0142', name: 'Maya Albright', title: 'The Subtle Body: Chakras, Prāṇa & Breath', hours: 3.5, category: 'Anatomy & Physiology', issued_at: '2026-10-14T15:00:00Z' },
  { yacepId: '[YACEP ID]', verify: R.verifyUrl('EP-CE-2026-0142') });
assert.ok(pdf.length > 10000);
await mkdir(new URL('./out/', import.meta.url), { recursive: true });
await writeFile(new URL('./out/sample.pdf', import.meta.url), pdf);

console.log('CE checks passed · sample certificate: scripts/ce-test/out/sample.pdf');
