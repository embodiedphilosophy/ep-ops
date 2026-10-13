// Tasks in the dashboard's own Postgres database (Neon, through the Vercel Marketplace). Same functions and
// same task shape as ./motion.js, so everything that reads or writes tasks works unchanged; ./taskstore.js
// picks this store once DATABASE_URL is set.
//
// The conventions kept in the description carry over as they are: [ep:…] event tags, [blocked:Name],
// [auto:date:rule]. Owners are labels (a person's name or a role), as in Motion.
import { neon } from '@neondatabase/serverless';

const url = () => process.env.DATABASE_URL || process.env.POSTGRES_URL || '';
let sqlFn = null;
const sql = () => {
  if (!url()) throw new Error('DATABASE_URL is not set');
  return (sqlFn ||= neon(url()));
};

// Tables are made on first use, so a fresh database needs no setup step
let ready = null;
function ensure() {
  return (ready ||= (async () => {
    const q = sql();
    await q`CREATE TABLE IF NOT EXISTS ops_tasks (
      id text PRIMARY KEY,
      name text NOT NULL,
      description text NOT NULL DEFAULT '',
      due date,
      labels text[] NOT NULL DEFAULT '{}',
      completed boolean NOT NULL DEFAULT false,
      completed_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      created_by text NOT NULL DEFAULT '',
      motion_id text UNIQUE
    )`;
    await q`CREATE INDEX IF NOT EXISTS ops_tasks_open ON ops_tasks (completed, due)`;
    await q`CREATE TABLE IF NOT EXISTS ops_task_comments (
      id bigserial PRIMARY KEY,
      task_id text NOT NULL REFERENCES ops_tasks(id) ON DELETE CASCADE,
      content text NOT NULL,
      at timestamptz NOT NULL DEFAULT now()
    )`;
    await q`CREATE INDEX IF NOT EXISTS ops_task_comments_task ON ops_task_comments (task_id, at)`;
  })().catch(e => { ready = null; throw e; }));
}

const iso = d => d ? (d instanceof Date ? d.toISOString() : String(d)).slice(0, 10) : '';
const shape = r => ({
  id: r.id, name: r.name, description: r.description || '', due: iso(r.due), completed: !!r.completed,
  labels: [...(r.labels || []), ...((r.name || '').match(/^\[([^\]]+)\]/) ? [r.name.match(/^\[([^\]]+)\]/)[1]] : [])].filter(Boolean),
  blockedOn: ((r.description || '').match(/\[blocked:([^\]]+)\]/) || [])[1] || '',
  auto: ((r.description || '').match(/\[auto:(\d{4}-\d{2}-\d{2})/) || [])[1] || '',
  createdAt: r.created_at ? new Date(r.created_at).toISOString() : '',
  completedAt: r.completed_at ? new Date(r.completed_at).toISOString() : '',
});

// Open tasks, plus anything finished in the last 60 days (Recently done, undo, the readiness counts).
// A short cache keeps one page render from asking the database the same thing several times.
let cache = { at: 0, tasks: [] };
export async function listTasks({ fresh = false } = {}) {
  if (!fresh && Date.now() - cache.at < 15_000) return cache.tasks;
  await ensure();
  const rows = await sql()`SELECT * FROM ops_tasks WHERE NOT completed OR completed_at > now() - interval '60 days' ORDER BY due NULLS LAST, created_at`;
  cache = { at: Date.now(), tasks: rows.map(shape) };
  return cache.tasks;
}

const newId = () => 't_' + crypto.randomUUID().replace(/-/g, '').slice(0, 20);

export async function createTask({ name, due, labels, description, createdBy = '', motionId = null, completed = false }) {
  await ensure();
  cache.at = 0;
  const id = newId();
  const [r] = await sql()`INSERT INTO ops_tasks (id, name, description, due, labels, completed, completed_at, created_by, motion_id)
    VALUES (${id}, ${name}, ${description || ''}, ${due || null}, ${labels || []}, ${completed}, ${completed ? new Date().toISOString() : null}, ${createdBy}, ${motionId})
    ON CONFLICT (motion_id) DO NOTHING RETURNING *`;
  return r ? shape(r) : null;
}

export async function completeTask(id) {
  await ensure();
  cache.at = 0;
  await sql()`UPDATE ops_tasks SET completed = true, completed_at = now(), updated_at = now() WHERE id = ${id}`;
  return { ok: true };
}

export async function reopenTask(id) {
  await ensure();
  cache.at = 0;
  await sql()`UPDATE ops_tasks SET completed = false, completed_at = NULL, updated_at = now() WHERE id = ${id}`;
  return { ok: true };
}

// Change a task's name, labels, description or due date (only the fields given)
export async function updateTask(id, { name, labels, description, due } = {}) {
  await ensure();
  cache.at = 0;
  const q = sql();
  if (name !== undefined) await q`UPDATE ops_tasks SET name = ${name}, updated_at = now() WHERE id = ${id}`;
  if (labels !== undefined) await q`UPDATE ops_tasks SET labels = ${labels}, updated_at = now() WHERE id = ${id}`;
  if (description !== undefined) await q`UPDATE ops_tasks SET description = ${description}, updated_at = now() WHERE id = ${id}`;
  if (due) await q`UPDATE ops_tasks SET due = ${due}, updated_at = now() WHERE id = ${id}`;
  return { ok: true };
}

// A task that a newer assignment has replaced: renamed and closed, so it drops off everyone's lists
export async function retireTask(id, name) {
  await updateTask(id, { name: `${name.replace(/ \(superseded\)$/, '')} (superseded)` });
  return completeTask(id);
}

export async function addComment(taskId, content, at = null) {
  await ensure();
  if (at) await sql()`INSERT INTO ops_task_comments (task_id, content, at) VALUES (${taskId}, ${content}, ${at})`;
  else await sql()`INSERT INTO ops_task_comments (task_id, content) VALUES (${taskId}, ${content})`;
  return { ok: true };
}
export async function listComments(taskId) {
  await ensure();
  const rows = await sql()`SELECT id, content, at FROM ops_task_comments WHERE task_id = ${taskId} ORDER BY at`;
  return rows.map(c => ({ id: String(c.id), content: c.content, at: new Date(c.at).toISOString() }));
}

// Motion ids already copied, so the one-time import can run again safely
export async function importedMotionIds() {
  await ensure();
  const rows = await sql()`SELECT motion_id FROM ops_tasks WHERE motion_id IS NOT NULL`;
  return new Set(rows.map(r => r.motion_id));
}
