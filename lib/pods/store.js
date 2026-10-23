// Study pods in the Neon database (DATABASE_URL), tables made on first use. See lib/pods/logic.js for the rules.
import { neon } from '@neondatabase/serverless';
import { MIN, MAX, MAX_OPEN_PER_LEADER } from './logic';

const url = () => process.env.DATABASE_URL || process.env.POSTGRES_URL || '';
let sqlFn = null, testSql = null;
const sql = () => { if (testSql) return testSql; if (!url()) throw new Error('Study pods aren’t connected yet'); return (sqlFn ||= neon(url())); };
export const podsAvailable = () => !!testSql || !!url();
export function _setSql(fn) { testSql = fn; ready = null; } // tests only

let ready = null;
function ensure() {
  return (ready ||= (async () => {
    const q = sql();
    await q`CREATE TABLE IF NOT EXISTS pod_leaders (
      uid text PRIMARY KEY, email text NOT NULL, name text NOT NULL DEFAULT '', note text NOT NULL DEFAULT '', status text NOT NULL DEFAULT 'applied',
      applied_at timestamptz NOT NULL DEFAULT now(), decided_at timestamptz, decided_by text NOT NULL DEFAULT ''
    )`;
    await q`CREATE TABLE IF NOT EXISTS pods (
      id bigserial PRIMARY KEY, leader_uid text NOT NULL, leader_email text NOT NULL, leader_name text NOT NULL DEFAULT '', topic text NOT NULL,
      description text NOT NULL DEFAULT '', schedule text NOT NULL DEFAULT '', status text NOT NULL DEFAULT 'open', chat_url text NOT NULL DEFAULT '',
      created_at timestamptz NOT NULL DEFAULT now(), started_at timestamptz
    )`;
    await q`CREATE TABLE IF NOT EXISTS pod_members (
      pod_id bigint NOT NULL, uid text NOT NULL, email text NOT NULL, name text NOT NULL DEFAULT '', joined_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (pod_id, uid)
    )`;
  })().catch(e => { ready = null; throw e; }));
}
const lower = e => String(e || '').trim().toLowerCase();
const num = id => { const n = Number(id); if (!Number.isInteger(n) || n < 1) throw new Error('That pod isn’t there.'); return n; };

// Leaders ---------------------------------------------------------------------------------------------------
export async function leaderOf(uid) {
  await ensure();
  return (await sql()`SELECT uid, email, name, note, status FROM pod_leaders WHERE uid = ${uid}`)[0] || null;
}
// Ask to lead (once; someone who was declined can ask again with a new note)
export async function apply(me, note) {
  await ensure();
  const cur = await leaderOf(me.uid);
  if (cur?.status === 'approved') throw new Error('You are already a pod leader.');
  if (cur?.status === 'applied') throw new Error('Your request is with us already. We will let you know here.');
  await sql()`INSERT INTO pod_leaders (uid, email, name, note, status) VALUES (${me.uid}, ${lower(me.email)}, ${me.name}, ${note}, 'applied')
    ON CONFLICT (uid) DO UPDATE SET note = EXCLUDED.note, status = 'applied', applied_at = now(), decided_at = NULL, decided_by = '', name = EXCLUDED.name`;
}
export async function decideLeader(uid, approve, by) {
  await ensure();
  await sql()`UPDATE pod_leaders SET status = ${approve ? 'approved' : 'declined'}, decided_at = now(), decided_by = ${String(by || '')} WHERE uid = ${String(uid)} AND status IN ('applied', 'declined', 'approved')`;
}
export async function leaders() {
  await ensure();
  return sql()`SELECT uid, email, name, note, status, applied_at, decided_at, decided_by FROM pod_leaders ORDER BY (status = 'applied') DESC, applied_at DESC`;
}

// Pods -------------------------------------------------------------------------------------------------------
// An approved leader opens a pod. The leader is its first member.
export async function createPod(me, p) {
  await ensure();
  const l = await leaderOf(me.uid);
  if (l?.status !== 'approved') throw new Error('Only approved pod leaders can open a pod.');
  const open = (await sql()`SELECT count(*)::int AS n FROM pods WHERE leader_uid = ${me.uid} AND status IN ('open', 'active')`)[0].n;
  if (open >= MAX_OPEN_PER_LEADER) throw new Error(`You can lead up to ${MAX_OPEN_PER_LEADER} pods at a time.`);
  const row = (await sql()`INSERT INTO pods (leader_uid, leader_email, leader_name, topic, description, schedule) VALUES (${me.uid}, ${lower(me.email)}, ${me.name}, ${p.topic}, ${p.description ?? ""}, ${p.schedule ?? ""}) RETURNING id`)[0];
  await sql()`INSERT INTO pod_members (pod_id, uid, email, name) VALUES (${row.id}, ${me.uid}, ${lower(me.email)}, ${me.name})`;
  return String(row.id);
}

// Pods people can see (open or running) with their members, as { pods, membersBy }
export async function listPods({ all = false } = {}) {
  await ensure();
  const pods = all ? await sql()`SELECT * FROM pods ORDER BY created_at DESC` : await sql()`SELECT * FROM pods WHERE status IN ('open', 'active') ORDER BY (status = 'open') DESC, created_at DESC`;
  const members = pods.length ? await sql()`SELECT pod_id, uid, email, name, joined_at FROM pod_members WHERE pod_id = ANY(${pods.map(p => Number(p.id))}) ORDER BY joined_at` : [];
  const membersBy = {};
  for (const m of members) (membersBy[String(m.pod_id)] ||= []).push({ uid: m.uid, email: m.email, name: m.name });
  return { pods, membersBy };
}

// Join. Fails if the pod is full or closed. Returns { started } = true when this person was the one who brought it to the minimum.
export async function join(me, podId) {
  await ensure();
  const id = num(podId);
  const ins = await sql()`INSERT INTO pod_members (pod_id, uid, email, name)
    SELECT ${id}, ${me.uid}, ${lower(me.email)}, ${me.name} WHERE EXISTS (SELECT 1 FROM pods WHERE id = ${id} AND status IN ('open', 'active'))
      AND (SELECT count(*) FROM pod_members WHERE pod_id = ${id}) < ${MAX} ON CONFLICT DO NOTHING RETURNING uid`;
  if (!ins.length) {
    const p = (await sql()`SELECT status FROM pods WHERE id = ${id}`)[0];
    if (!p || !['open', 'active'].includes(p.status)) throw new Error('This pod isn’t open any more.');
    if ((await sql()`SELECT 1 FROM pod_members WHERE pod_id = ${id} AND uid = ${me.uid}`).length) throw new Error('You are already in this pod.');
    throw new Error(`This pod is full (${MAX} people).`);
  }
  const started = await sql()`UPDATE pods SET status = 'active', started_at = now() WHERE id = ${id} AND status = 'open' AND (SELECT count(*) FROM pod_members WHERE pod_id = ${id}) >= ${MIN} RETURNING id`;
  return { started: started.length > 0 };
}
export async function leave(me, podId) {
  await ensure();
  const id = num(podId);
  const p = (await sql()`SELECT leader_uid, status FROM pods WHERE id = ${id}`)[0];
  if (!p) throw new Error('That pod isn’t there.');
  if (p.leader_uid === me.uid) throw new Error('As the leader you can cancel the pod instead.');
  await sql()`DELETE FROM pod_members WHERE pod_id = ${id} AND uid = ${me.uid}`;
}
// The leader cancels a pod that has not begun; staff can cancel any
export async function cancelPod(me, podId, { staff = false } = {}) {
  await ensure();
  const id = num(podId);
  const r = staff ? await sql()`UPDATE pods SET status = 'cancelled' WHERE id = ${id} AND status IN ('open', 'active') RETURNING id`
    : await sql()`UPDATE pods SET status = 'cancelled' WHERE id = ${id} AND leader_uid = ${me.uid} AND status = 'open' RETURNING id`;
  if (!r.length) throw new Error(staff ? 'That pod isn’t running.' : 'Only the leader can cancel a pod that hasn’t begun.');
}
// Staff: the pod's chat link (made in Circle)
export async function setChatUrl(podId, urlValue) {
  await ensure();
  const u = String(urlValue || '').trim();
  if (u && !/^https:\/\/\S+$/.test(u)) throw new Error('A full link starting with https://');
  await sql()`UPDATE pods SET chat_url = ${u} WHERE id = ${num(podId)}`;
}
