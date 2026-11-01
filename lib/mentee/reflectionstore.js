// Mentee reflections in Neon (tables made on first use; same database as the rest). A reflection has versions; a version is never edited once it is
// shared, a revision is a new row. Comments are the cohort's feedback (and replies); reads feed "n you haven't read".
import { neon } from '@neondatabase/serverless';
import { cleanReflection, changedParagraphs, KINDS, stepOf } from './reflections';

const url = () => process.env.DATABASE_URL || process.env.POSTGRES_URL || '';
let sqlFn = null, testSql = null;
const sql = () => { if (testSql) return testSql; if (!url()) throw new Error('The reflections aren’t connected yet'); return (sqlFn ||= neon(url())); };
export const reflectionsAvailable = () => !!testSql || !!url();
export function _setSql(fn) { testSql = fn; ready = null; } // tests only

let ready = null;
function ensure() {
  return (ready ||= (async () => {
    const q = sql();
    await q`CREATE TABLE IF NOT EXISTS mentee_reflections (
      id bigserial PRIMARY KEY, author_email text NOT NULL, author_name text NOT NULL DEFAULT '', season text NOT NULL DEFAULT '', month text NOT NULL, topic text NOT NULL DEFAULT '',
      status text NOT NULL DEFAULT 'draft', shared_at timestamptz, posted_at timestamptz, posted_post_id text, posted_url text, show_as text NOT NULL DEFAULT 'name', at timestamptz NOT NULL DEFAULT now()
    )`;
    await q`CREATE TABLE IF NOT EXISTS mentee_reflection_versions (
      id bigserial PRIMARY KEY, reflection_id bigint NOT NULL, n int NOT NULL, title text NOT NULL DEFAULT '', body text NOT NULL DEFAULT '', at timestamptz NOT NULL DEFAULT now(), shared_at timestamptz, UNIQUE (reflection_id, n)
    )`;
    await q`CREATE TABLE IF NOT EXISTS mentee_reflection_comments (
      id bigserial PRIMARY KEY, reflection_id bigint NOT NULL, version_n int NOT NULL, author_email text NOT NULL, author_name text NOT NULL DEFAULT '', kind text NOT NULL, body text NOT NULL,
      parent_id bigint, addressed_in int, at timestamptz NOT NULL DEFAULT now()
    )`;
    await q`CREATE TABLE IF NOT EXISTS mentee_reflection_reads (email text NOT NULL, reflection_id bigint NOT NULL, last_read_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (email, reflection_id))`;
    await q`CREATE INDEX IF NOT EXISTS mentee_reflections_author ON mentee_reflections (author_email, month)`;
  })().catch(e => { ready = null; throw e; }));
}

const lower = s => String(s ?? '').trim().toLowerCase();
const iso = t => (t ? new Date(t).toISOString() : '');
const num = id => { const n = Number(id); if (!Number.isInteger(n) || n < 1) throw new Error('Couldn’t find that reflection'); return n; };

async function load(id) {
  const [r] = await sql()`SELECT * FROM mentee_reflections WHERE id = ${num(id)}`;
  if (!r) throw new Error('Couldn’t find that reflection');
  return r;
}
const isAuthor = (me, r) => lower(me.email) === r.author_email;
async function mustBeAuthor(me, id) {
  await ensure();
  const r = await load(id);
  if (!isAuthor(me, r)) throw new Error('Only the author can do that');
  return r;
}
async function versionsOf(id) { return sql()`SELECT n, title, body, at, shared_at FROM mentee_reflection_versions WHERE reflection_id = ${id} ORDER BY n`; }

// ---- writing ----
// A new reflection (version 1, a draft only the author sees)
export async function createDraft(me, b, { season = '', month, topic = '' }) {
  const c = cleanReflection(b);
  if (!/^\d{4}-\d{2}$/.test(month || '')) throw new Error('Unknown month');
  await ensure();
  const [r] = await sql()`INSERT INTO mentee_reflections (author_email, author_name, season, month, topic) VALUES (${lower(me.email)}, ${String(me.name || '').slice(0, 60)}, ${season}, ${month}, ${String(topic).slice(0, 200)}) RETURNING id`;
  await sql()`INSERT INTO mentee_reflection_versions (reflection_id, n, title, body) VALUES (${r.id}, 1, ${c.title}, ${c.body})`;
  return String(r.id);
}

// Save the working draft (the latest version, as long as it has not been shared)
export async function saveDraft(me, id, b) {
  const r = await mustBeAuthor(me, id), c = cleanReflection(b);
  const vs = await versionsOf(r.id), last = vs[vs.length - 1];
  if (last.shared_at) throw new Error('Press Revise to write a new version first');
  await sql()`UPDATE mentee_reflection_versions SET title = ${c.title}, body = ${c.body}, at = now() WHERE reflection_id = ${r.id} AND n = ${last.n} AND shared_at IS NULL`;
}

// Revise: a new version, starting from the last one
export async function startRevision(me, id) {
  const r = await mustBeAuthor(me, id);
  const vs = await versionsOf(r.id), last = vs[vs.length - 1];
  if (!last.shared_at) return last.n; // already has a working draft
  await sql()`INSERT INTO mentee_reflection_versions (reflection_id, n, title, body) VALUES (${r.id}, ${last.n + 1}, ${last.title}, ${last.body})`;
  return last.n + 1;
}

// Share the working version with the cohort. The first share puts the reflection in front of the cohort.
export async function shareVersion(me, id) {
  const r = await mustBeAuthor(me, id);
  const vs = await versionsOf(r.id), last = vs[vs.length - 1];
  if (last.shared_at) throw new Error('This version is already shared');
  if (!String(last.body).trim()) throw new Error('Write something first');
  await sql()`UPDATE mentee_reflection_versions SET shared_at = now() WHERE reflection_id = ${r.id} AND n = ${last.n} AND shared_at IS NULL`;
  await sql()`UPDATE mentee_reflections SET status = CASE WHEN status = 'draft' THEN 'shared' ELSE status END, shared_at = COALESCE(shared_at, now()) WHERE id = ${r.id}`;
  return last.n;
}

// Delete a reflection that was never shared
export async function discardDraft(me, id) {
  const r = await mustBeAuthor(me, id);
  if (r.status !== 'draft') throw new Error('Only a draft that hasn’t been shared can be deleted');
  await sql()`DELETE FROM mentee_reflection_versions WHERE reflection_id = ${r.id}`;
  await sql()`DELETE FROM mentee_reflections WHERE id = ${r.id}`;
}

// ---- feedback ----
export async function addComment(me, id, { kind, body, parentId }) {
  await ensure();
  const r = await load(id);
  if (r.status === 'draft') throw new Error('This reflection hasn’t been shared yet');
  const text = String(body ?? '').replace(/\r/g, '').trim();
  if (!text) throw new Error('Write something first');
  if (text.length > 3000) throw new Error('Keep it under 3,000 characters');
  let k = 'reply', parent = null;
  if (parentId) {
    const [p] = await sql()`SELECT id, parent_id FROM mentee_reflection_comments WHERE id = ${num(parentId)} AND reflection_id = ${r.id}`;
    if (!p) throw new Error('That comment is no longer there');
    parent = p.parent_id || p.id; // replies stay one level deep
  } else {
    if (!KINDS.includes(kind)) throw new Error('Choose what kind of feedback this is');
    if (isAuthor(me, r)) throw new Error('Write feedback on other people’s reflections; reply to the comments on yours');
    k = kind;
  }
  const vs = await versionsOf(r.id), sharedN = vs.filter(v => v.shared_at).length;
  const [c] = await sql()`INSERT INTO mentee_reflection_comments (reflection_id, version_n, author_email, author_name, kind, body, parent_id) VALUES (${r.id}, ${Math.max(1, sharedN)}, ${lower(me.email)}, ${String(me.name || '').slice(0, 60)}, ${k}, ${text}, ${parent}) RETURNING id`;
  return String(c.id);
}

// The author ticks the feedback they have worked from: those comments show "addressed in version n"
export async function setAddressed(me, id, commentIds, n) {
  const r = await mustBeAuthor(me, id);
  const want = new Set((commentIds || []).map(num));
  const top = await sql()`SELECT id, addressed_in FROM mentee_reflection_comments WHERE reflection_id = ${r.id} AND parent_id IS NULL`;
  for (const c of top) {
    const ticked = want.has(Number(c.id));
    if (ticked && c.addressed_in == null) await sql()`UPDATE mentee_reflection_comments SET addressed_in = ${n} WHERE id = ${c.id}`;
    else if (!ticked && c.addressed_in === n) await sql()`UPDATE mentee_reflection_comments SET addressed_in = NULL WHERE id = ${c.id}`; // un-ticked in this version
  }
}

// ---- posting to Sādhana School ----
export async function postedState(me, id) { await ensure(); const r = await load(id); return { status: r.status, postId: r.posted_post_id || '', url: r.posted_url || '', author: isAuthor(me, r) }; }
export async function finalVersion(me, id) {
  const r = await mustBeAuthor(me, id);
  const shared = (await versionsOf(r.id)).filter(v => v.shared_at);
  if (!shared.length) throw new Error('Share your reflection with the cohort before posting it to Sādhana School');
  return { reflection: r, version: shared[shared.length - 1] };
}
export async function markPosted(id, { postId, url, showAs = 'name' }) {
  await ensure();
  await sql()`UPDATE mentee_reflections SET status = 'posted', posted_at = now(), posted_post_id = ${String(postId)}, posted_url = ${String(url || '')}, show_as = ${showAs} WHERE id = ${num(id)} AND posted_post_id IS NULL`;
}
export async function markUnposted(me, id) {
  const r = await mustBeAuthor(me, id);
  await sql()`UPDATE mentee_reflections SET status = 'shared', posted_at = NULL, posted_post_id = NULL, posted_url = NULL WHERE id = ${r.id}`;
}

// ---- reading ----
// The reflections this person may see: the cohort's shared and posted ones, and their own drafts. Newest first.
export async function listReflections(me, { month } = {}) {
  await ensure();
  const email = lower(me.email);
  const rows = await sql()`SELECT * FROM mentee_reflections WHERE (status <> 'draft' OR author_email = ${email}) ORDER BY COALESCE(shared_at, at) DESC, id DESC LIMIT 200`;
  if (!rows.length) return [];
  const [vs, cm, rd] = await Promise.all([
    sql()`SELECT reflection_id, n, title, body, shared_at FROM mentee_reflection_versions ORDER BY n`,
    sql()`SELECT reflection_id, COUNT(*)::int AS n, MAX(at) AS last FROM mentee_reflection_comments GROUP BY reflection_id`,
    sql()`SELECT reflection_id, last_read_at FROM mentee_reflection_reads WHERE email = ${email}`,
  ]);
  const read = new Map(rd.map(x => [String(x.reflection_id), x.last_read_at])), counts = new Map(cm.map(x => [String(x.reflection_id), x]));
  return rows.filter(r => !month || r.month === month).map(r => {
    const mine = isAuthor(me, r), all = vs.filter(v => String(v.reflection_id) === String(r.id)), shared = all.filter(v => v.shared_at);
    const shown = mine ? all[all.length - 1] : shared[shared.length - 1] || all[all.length - 1];
    const lastShared = shared.length ? shared[shared.length - 1].shared_at : null, got = read.get(String(r.id)), c = counts.get(String(r.id));
    const unread = !mine && r.status !== 'draft' && (!got || (lastShared && new Date(lastShared) > new Date(got)));
    return { id: String(r.id), mine, author: r.author_name || 'A mentee', month: r.month, topic: r.topic, status: r.status, title: shown?.title || '', version: shown?.n || 1, sharedVersions: shared.length, step: stepOf({ status: r.status, sharedVersions: shared.length }), sharedAt: iso(r.shared_at), postedAt: iso(r.posted_at), postedUrl: r.posted_url || '', comments: c ? c.n : 0, unread, hasDraft: mine && all.length > shared.length };
  });
}

// One reflection with its versions (each marked with the paragraphs changed since the one before) and its comments; reading it as someone else marks it read
export async function getReflection(me, id) {
  await ensure();
  const r = await load(id), mine = isAuthor(me, r);
  if (r.status === 'draft' && !mine) throw new Error('Couldn’t find that reflection');
  const all = await versionsOf(r.id), vis = mine ? all : all.filter(v => v.shared_at);
  const versions = vis.map((v, i) => ({ n: v.n, title: v.title, shared: !!v.shared_at, sharedAt: iso(v.shared_at), at: iso(v.at), paragraphs: changedParagraphs(i ? vis[i - 1].body : '', v.body), body: v.body }));
  const comments = (await sql()`SELECT id, version_n, author_email, author_name, kind, body, parent_id, addressed_in, at FROM mentee_reflection_comments WHERE reflection_id = ${r.id} ORDER BY at, id`)
    .map(c => ({ id: String(c.id), version: c.version_n, who: c.author_name || 'A mentee', mine: c.author_email === lower(me.email), byAuthor: c.author_email === r.author_email, kind: c.kind, body: c.body, parent: c.parent_id ? String(c.parent_id) : null, addressedIn: c.addressed_in, at: iso(c.at) }));
  if (!mine && r.status !== 'draft') await sql()`INSERT INTO mentee_reflection_reads (email, reflection_id, last_read_at) VALUES (${lower(me.email)}, ${r.id}, now()) ON CONFLICT (email, reflection_id) DO UPDATE SET last_read_at = now()`;
  const shared = all.filter(v => v.shared_at);
  return { id: String(r.id), mine, author: r.author_name || 'A mentee', month: r.month, topic: r.topic, status: r.status, sharedAt: iso(r.shared_at), postedAt: iso(r.posted_at), postedUrl: r.posted_url || '', showAs: r.show_as, step: stepOf({ status: r.status, sharedVersions: shared.length }), versions, comments, workingN: mine && all.length > shared.length ? all[all.length - 1].n : 0 };
}

// For the evergreen card and the formation record
export async function summaryFor(me, month) {
  await ensure();
  const list = await listReflections(me, {});
  const mine = list.find(x => x.mine && x.month === month) || null;
  const unread = list.filter(x => x.unread).length;
  const posted = list.filter(x => x.mine && x.status === 'posted').map(x => ({ id: x.id, title: x.title, day: x.postedAt.slice(0, 10) }));
  return { mine: mine && { id: mine.id, title: mine.title, status: mine.status, version: mine.version, comments: mine.comments }, unread, posted };
}
