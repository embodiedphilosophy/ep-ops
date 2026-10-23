// Mentee data the page writes: ticked assignments and Travelogue lines. Same Neon database as the practice log
// and formation record (DATABASE_URL); tables are made on first use. The Travelogue is the member's own: nothing
// in the site or in Ops reads it back except to show it to the person who wrote it.
import { neon } from '@neondatabase/serverless';

const url = () => process.env.DATABASE_URL || process.env.POSTGRES_URL || '';
let sqlFn = null;
let testSql = null;
const sql = () => { if (testSql) return testSql; if (!url()) throw new Error('The mentee record isn’t connected yet'); return (sqlFn ||= neon(url())); };
export const menteeAvailable = () => !!testSql || !!url();
export function _setSql(fn) { testSql = fn; ready = null; } // tests only

let ready = null;
function ensure() {
  return (ready ||= (async () => {
    const q = sql();
    await q`CREATE TABLE IF NOT EXISTS mentee_assignments (
      uid text NOT NULL, assignment_id text NOT NULL, done_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (uid, assignment_id)
    )`;
    await q`CREATE TABLE IF NOT EXISTS mentee_travelogue (
      id bigserial PRIMARY KEY, uid text NOT NULL, day date NOT NULL, body text NOT NULL, at timestamptz NOT NULL DEFAULT now()
    )`;
    await q`CREATE TABLE IF NOT EXISTS mentee_submissions (
      id bigserial PRIMARY KEY, uid text NOT NULL, email text NOT NULL, assignment_id text NOT NULL, title text NOT NULL DEFAULT '',
      body text NOT NULL DEFAULT '', file_url text NOT NULL DEFAULT '', file_name text NOT NULL DEFAULT '',
      status text NOT NULL DEFAULT 'draft', at timestamptz NOT NULL DEFAULT now(), UNIQUE (uid, assignment_id)
    )`;
    await q`CREATE TABLE IF NOT EXISTS mentee_poll_votes (
      uid text NOT NULL, email text NOT NULL, poll text NOT NULL, slot text NOT NULL, at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (uid, poll, slot)
    )`;
    await q`ALTER TABLE mentee_submissions ADD COLUMN IF NOT EXISTS return_note text NOT NULL DEFAULT ''`;
    await q`CREATE INDEX IF NOT EXISTS mentee_travelogue_uid ON mentee_travelogue (uid, day DESC, id DESC)`;
  })().catch(e => { ready = null; throw e; }));
}

export async function doneIds(uid) {
  await ensure();
  const rows = await sql()`SELECT assignment_id FROM mentee_assignments WHERE uid = ${uid}`;
  return new Set(rows.map(r => r.assignment_id));
}

export async function setDone(uid, id, done) {
  await ensure();
  if (!/^a[0-9a-f]{12}$/.test(String(id))) throw new Error('Unknown assignment');
  if (done) await sql()`INSERT INTO mentee_assignments (uid, assignment_id) VALUES (${uid}, ${id}) ON CONFLICT DO NOTHING`;
  else await sql()`DELETE FROM mentee_assignments WHERE uid = ${uid} AND assignment_id = ${id}`;
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;
export async function addLine(uid, day, text) {
  const body = String(text ?? '').replace(/[ \t]+/g, ' ').trim();
  if (!body) throw new Error('Write a line first');
  if (body.length > 1000) throw new Error('Keep it to a line or two (1,000 characters at most)');
  if (!DAY.test(day || '')) throw new Error('Unknown date');
  await ensure();
  await sql()`INSERT INTO mentee_travelogue (uid, day, body) VALUES (${uid}, ${day}, ${body})`;
}

export async function recentLines(uid, limit = 3) {
  await ensure();
  const rows = await sql()`SELECT id, day::text AS day, body FROM mentee_travelogue WHERE uid = ${uid} ORDER BY day DESC, id DESC LIMIT ${limit}`;
  return rows.map(r => ({ id: String(r.id), day: r.day, text: r.body }));
}

// Hand-ins ------------------------------------------------------------------------------------------------
// One row per mentee per assignment: a draft, then submitted, then (if Jacob sends it back) returned. Resubmitting is allowed.
const STATUS = ['draft', 'submitted'];
export async function saveSubmission(me, a) {
  if (!/^a[0-9a-f]{12}$/.test(String(a.assignmentId))) throw new Error('Unknown assignment');
  const status = STATUS.includes(a.status) ? a.status : 'draft';
  const body = String(a.text ?? '').trim().slice(0, 20000);
  const fileUrl = String(a.fileUrl ?? '').slice(0, 1000), fileName = String(a.fileName ?? '').replace(/[\r\n]+/g, ' ').slice(0, 200);
  if (fileUrl && !fileUrl.startsWith('submissions/' + me.uid + '/')) throw new Error('Unknown file');
  await ensure();
  if (status === 'submitted' && !body && !fileUrl) {
    const had = await sql()`SELECT 1 FROM mentee_submissions WHERE uid = ${me.uid} AND assignment_id = ${a.assignmentId} AND file_url <> ''`;
    if (!had.length) throw new Error('Write a response or attach a file first');
  }
  await sql()`INSERT INTO mentee_submissions (uid, email, assignment_id, title, body, file_url, file_name, status) VALUES (${me.uid}, ${String(me.email).toLowerCase()}, ${a.assignmentId}, ${String(a.title ?? '').slice(0, 200)}, ${body}, ${fileUrl}, ${fileName}, ${status})
    ON CONFLICT (uid, assignment_id) DO UPDATE SET body = EXCLUDED.body, file_url = CASE WHEN EXCLUDED.file_url <> '' THEN EXCLUDED.file_url ELSE mentee_submissions.file_url END, file_name = CASE WHEN EXCLUDED.file_url <> '' THEN EXCLUDED.file_name ELSE mentee_submissions.file_name END, status = EXCLUDED.status, title = EXCLUDED.title, at = now()`;
}

// The member's own hand-ins, keyed by assignment id
export async function submissionsFor(uid) {
  await ensure();
  const rows = await sql()`SELECT assignment_id, body, file_name, (file_url <> '') AS has_file, status, return_note, at FROM mentee_submissions WHERE uid = ${uid}`;
  return Object.fromEntries(rows.map(r => [r.assignment_id, { status: r.status, text: r.body, fileName: r.file_name, hasFile: !!r.has_file, note: r.status === 'returned' ? r.return_note : '', at: new Date(r.at).toISOString() }]));
}

// Mentor view: everything handed in and not yet returned
export async function openSubmissions() {
  await ensure();
  const rows = await sql()`SELECT id, email, title, body, file_name, (file_url <> '') AS has_file, at FROM mentee_submissions WHERE status = 'submitted' ORDER BY at`;
  return rows.map(r => ({ id: String(r.id), email: r.email, title: r.title, text: r.body, fileName: r.file_name, hasFile: !!r.has_file, at: new Date(r.at).toISOString() }));
}
export async function returnSubmission(id, note = '') {
  await ensure();
  const n = Number(id); if (!Number.isInteger(n)) throw new Error('Couldn’t find that hand-in');
  await sql()`UPDATE mentee_submissions SET status = 'returned', return_note = ${String(note ?? '').trim().slice(0, 2000)} WHERE id = ${n} AND status = 'submitted'`;
}
// For the signed file link: who owns the file
export async function fileOf(id) {
  await ensure();
  const n = Number(id); if (!Number.isInteger(n)) return null;
  const rows = await sql()`SELECT uid, file_url, file_name FROM mentee_submissions WHERE id = ${n} AND file_url <> ''`;
  return rows[0] ? { uid: rows[0].uid, path: rows[0].file_url, name: rows[0].file_name } : null;
}

// Polls ("which time works?") ------------------------------------------------------------------------------
// The member's own picks, { pollId: [iso, ...] }
export async function votesFor(uid) {
  await ensure();
  const rows = await sql()`SELECT poll, slot FROM mentee_poll_votes WHERE uid = ${uid} ORDER BY slot`;
  const out = {};
  for (const r of rows) (out[r.poll] ||= []).push(r.slot);
  return out;
}
// Replace the member's picks for one poll (picking nothing clears them)
export async function setVotes(me, poll, slots) {
  await ensure();
  const id = String(poll || '').slice(0, 80);
  await sql()`DELETE FROM mentee_poll_votes WHERE uid = ${me.uid} AND poll = ${id}`;
  for (const slot of slots) await sql()`INSERT INTO mentee_poll_votes (uid, email, poll, slot) VALUES (${me.uid}, ${String(me.email).toLowerCase()}, ${id}, ${slot}) ON CONFLICT DO NOTHING`;
}
// Mentor view: everyone's picks for a poll → [{ slot, email, at }]
export async function pollVotes(poll) {
  await ensure();
  const rows = await sql()`SELECT slot, email, at FROM mentee_poll_votes WHERE poll = ${String(poll)} ORDER BY slot, email`;
  return rows.map(r => ({ slot: r.slot, email: r.email, at: new Date(r.at).toISOString() }));
}
