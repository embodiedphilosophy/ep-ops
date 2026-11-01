// What the mentor view remembers: reflections Jacob has marked as replied, and the pairs already nudged this rotation.
// Same Neon database as the rest (tables made on first use). Also reads the pieces the queue needs from the reflections and articulation tables.
import { neon } from '@neondatabase/serverless';

const url = () => process.env.DATABASE_URL || process.env.POSTGRES_URL || '';
let sqlFn = null, testSql = null;
const sql = () => { if (testSql) return testSql; if (!url()) throw new Error('The mentor view isn’t connected yet'); return (sqlFn ||= neon(url())); };
export const mentorStoreAvailable = () => !!testSql || !!url();
export function _setSql(fn) { testSql = fn; ready = null; } // tests only

let ready = null;
function ensure() {
  return (ready ||= (async () => {
    const q = sql();
    await q`CREATE TABLE IF NOT EXISTS mentee_mentor_acks (ref text PRIMARY KEY, at timestamptz NOT NULL DEFAULT now())`;
    await q`CREATE TABLE IF NOT EXISTS mentee_nudges (rotation int NOT NULL, key text NOT NULL, at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (rotation, key))`;
  })().catch(e => { ready = null; throw e; }));
}

export async function acks() { await ensure(); return new Set((await sql()`SELECT ref FROM mentee_mentor_acks`).map(r => r.ref)); }
export async function ackReflection(id) {
  await ensure();
  const n = Number(id); if (!Number.isInteger(n) || n < 1) throw new Error('Couldn’t find that reflection');
  await sql()`INSERT INTO mentee_mentor_acks (ref) VALUES (${`r:${n}`}) ON CONFLICT (ref) DO NOTHING`;
}

// Shared or posted reflections that none of the mentors has commented on yet
export async function unrepliedReflections(mentorEmails) {
  await ensure();
  const m = mentorEmails.map(e => String(e).toLowerCase());
  const rows = await sql()`SELECT r.id, r.author_email, r.author_name, r.shared_at,
      (SELECT title FROM mentee_reflection_versions v WHERE v.reflection_id = r.id AND v.shared_at IS NOT NULL ORDER BY n DESC LIMIT 1) AS title
    FROM mentee_reflections r
    WHERE r.status <> 'draft' AND r.shared_at IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM mentee_reflection_comments c WHERE c.reflection_id = r.id AND c.author_email = ANY(${m}))
    ORDER BY r.shared_at`;
  return rows.map(r => ({ id: String(r.id), title: r.title || 'Untitled', authorEmail: r.author_email, author: r.author_name, sharedAt: new Date(r.shared_at).toISOString() }));
}

// Articulation sessions logged inside a rotation, for pair health
export async function rotationSessions(from, to) {
  await ensure();
  const rows = await sql()`SELECT day::text AS day, present FROM mentee_articulation WHERE day >= ${from} AND day <= ${to}`;
  return rows.map(r => ({ day: r.day, present: r.present || [] }));
}

export async function nudgedMap(rotation) {
  await ensure();
  const rows = await sql()`SELECT key, at FROM mentee_nudges WHERE rotation = ${rotation}`;
  return Object.fromEntries(rows.map(r => [r.key, new Date(r.at).toISOString().slice(0, 10)]));
}
export async function markNudged(rotation, key) {
  await ensure();
  await sql()`INSERT INTO mentee_nudges (rotation, key) VALUES (${rotation}, ${key}) ON CONFLICT (rotation, key) DO NOTHING`;
}
