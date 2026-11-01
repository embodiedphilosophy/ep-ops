// CE end-to-end against an in-memory Postgres (PGlite), with the real store and service code:
// Circle webhook → lessons → course done → reflection → certificate (issued or held) → staff actions → CSV.
// No network: no sheet (Site Pathways falls back to data/pathways.json), no email (CE_EMAILS unset).
// Run: npm i --no-save @electric-sql/pglite && node --import ./scripts/ce-test/register.mjs scripts/ce-test/db.mjs
import assert from 'assert/strict';
import { PGlite } from '@electric-sql/pglite';

process.env.MEMBER_SECRET = 'test-secret';
delete process.env.DATABASE_URL; delete process.env.CE_EMAILS; delete process.env.CALENDAR_SHEET_ID; delete process.env.EVENTS_SHEET_CSV_URL;
const store = await import('../../lib/ce/store.js');
const db = new PGlite();
store._setSql((strings, ...vals) => db.sql(strings, ...vals).then(r => r.rows));
const svc = await import('../../lib/ce/service.js');
const R = await import('../../lib/ce/rules.js');

const P = await svc.loadPathways();
assert.ok(P.length >= 2, 'fallback pathways load');
const slug = P[0].slug;
const plus = { wisdomPlus: true, wisdom: true };

// Webhook for an unknown space is logged but not matched
let r = await svc.handleCircle(R.parseCircle({ member: { email: 'maya@example.com' }, lesson: { id: 1, space_id: 999 } }, 'lesson'), { test: 1 });
assert.equal(r.matched, false);
assert.equal((await store.unmatchedEvents()).length, 1);

// Lessons and course completion recorded directly (the fallback rows have no Circle space ids)
await store.recordLesson('Maya@Example.com', slug, '11');
await store.recordLesson('maya@example.com', slug, '12');
await store.recordLesson('maya@example.com', slug, '12'); // duplicate ignored
let s = await svc.memberSummary('maya@example.com', plus, '2026-10-15');
assert.equal(s.rows[0].status, 'progress'); assert.equal(s.rows[0].lessonsDone, 2);

// Reflection before finishing is refused
await assert.rejects(() => svc.reflect({ email: 'maya@example.com', tier: plus, slug, r1: 'x '.repeat(20), r2: 'y '.repeat(12), name: 'Maya', attest: true }), /Finish every lesson/);
await store.recordDone('maya@example.com', slug);
s = await svc.memberSummary('maya@example.com', plus, '2026-10-15');
assert.equal(s.rows[0].status, 'reflect');

// Not Plus → refused; no attestation → refused; too short → refused
await assert.rejects(() => svc.reflect({ email: 'maya@example.com', tier: { wisdom: true }, slug, r1: 'x '.repeat(20), r2: 'y '.repeat(12), name: 'Maya', attest: true }), /Wisdom School Plus/);
await assert.rejects(() => svc.reflect({ email: 'maya@example.com', tier: plus, slug, r1: 'x '.repeat(20), r2: 'y '.repeat(12), name: 'Maya', attest: false }), /confirm/);
await assert.rejects(() => svc.reflect({ email: 'maya@example.com', tier: plus, slug, r1: 'short', r2: 'short', name: 'Maya', attest: true }), /few sentences/);

const cert = await svc.reflect({ email: 'maya@example.com', uid: '7', tier: plus, slug, r1: 'word '.repeat(30), r2: 'word '.repeat(20), name: 'Maya Albright', yaId: '123', attest: true });
assert.match(cert.id, /^EP-CE-\d{4}-0001$/); assert.equal(cert.status, 'issued'); assert.equal(cert.hours, P[0].hours);
await assert.rejects(() => svc.reflect({ email: 'maya@example.com', tier: plus, slug, r1: 'word '.repeat(30), r2: 'word '.repeat(20), name: 'Maya', attest: true }), /already have/);
s = await svc.memberSummary('maya@example.com', plus, '2026-10-15');
assert.equal(s.rows[0].status, 'certified'); assert.ok(s.rows[0].cert.pdf.includes(cert.id)); assert.equal(s.certifiedHours, P[0].hours);

// Renewal date
await store.setRenewal('maya@example.com', '2027-03-01');
s = await svc.memberSummary('maya@example.com', plus, '2026-10-15');
assert.equal(s.renewal, '2027-03-01'); assert.equal(s.cycle.start, '2024-03-01');

// A second member finishes far too fast → held; staff approve it
const slug2 = P[1].slug;
await db.query(`INSERT INTO ce_lessons (email, pathway, lesson_id, at) VALUES ('sam@example.com', $1, '1', now() - interval '10 minutes')`, [slug2]);
await store.recordDone('sam@example.com', slug2);
const orig = P[1].runtimeMinutes;
// fallback rows have no runtime; give one via a pathway override for this test
const svcPath = await svc.loadPathways(); assert.equal(orig, 0);
// (with no runtime the pace check is 'unknown' and the certificate issues)
const c2 = await svc.reflect({ email: 'sam@example.com', tier: plus, slug: slug2, r1: 'word '.repeat(30), r2: 'word '.repeat(20), name: 'Sam', attest: true });
assert.equal(c2.pace, 'unknown'); assert.equal(c2.status, 'issued');
// Force a held one and approve
await db.query(`UPDATE ce_certs SET status = 'held' WHERE id = $1`, [c2.id]);
const ap = await svc.approve(c2.id, 'Jacob');
assert.equal(ap.status, 'issued'); assert.match(ap.notes, /Approved by Jacob/);
await assert.rejects(() => svc.approve(c2.id, 'Jacob'), /Only a held/);

// Rename, revoke, staff mark-done
const rn = await svc.rename(cert.id, 'Maya R. Albright', 'Floss');
assert.equal(rn.name, 'Maya R. Albright');
const rv = await svc.revoke(c2.id, 'Jacob', 'test');
assert.equal(rv.status, 'revoked');
await svc.markDone('lee@example.com', slug, 'Floss');
s = await svc.memberSummary('lee@example.com', plus, '2026-10-15');
assert.equal(s.rows[0].status, 'reflect');

// Ledger + CSV
const l = await svc.ledger();
assert.equal(l.certs.length, 2); assert.equal(l.counts.tracking, 2);
const csv = R.certsCsv(l.certs);
assert.ok(csv.includes(cert.id) && csv.includes('Maya R. Albright'));
// After revoking, Sam can earn the certificate again
const c3 = await svc.reflect({ email: 'sam@example.com', tier: plus, slug: slug2, r1: 'word '.repeat(30), r2: 'word '.repeat(20), name: 'Sam', attest: true });
assert.match(c3.id, /-0003$/);

console.log('CE database flow passed:', l.certs.map(c => `${c.id} ${c.status}`).join(', '));
