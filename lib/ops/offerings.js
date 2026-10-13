import { neon } from '@neondatabase/serverless';
import { blankOffering } from './library';

// Offering records and the access map live in the dashboard's own Postgres database (the same Neon database as
// tasks). Without DATABASE_URL (local tests only) they live in memory, so a test run never touches a real database.
const url = () => process.env.DATABASE_URL || process.env.POSTGRES_URL || '';
let sqlFn = null;
const sql = () => (sqlFn ||= neon(url()));
export const persistent = () => !!url();
const mem = (globalThis.__epOfferings ||= { offerings: new Map(), map: new Map() });

let ready = null;
function ensure() {
  if (!url()) return Promise.resolve();
  return (ready ||= (async () => {
    const q = sql();
    await q`CREATE TABLE IF NOT EXISTS ops_offerings (id text PRIMARY KEY, data jsonb NOT NULL, status text NOT NULL DEFAULT 'draft', updated_at timestamptz NOT NULL DEFAULT now())`;
    await q`CREATE TABLE IF NOT EXISTS ops_access_map (circle_id text PRIMARY KEY, kind text NOT NULL DEFAULT 'paywall', title text NOT NULL DEFAULT '', access text NOT NULL DEFAULT '', requires text NOT NULL DEFAULT '', unlock_note text NOT NULL DEFAULT '')`;
  })().catch(e => { ready = null; throw e; }));
}

export async function listOfferings() {
  await ensure();
  const rows = url() ? (await sql()`SELECT data FROM ops_offerings WHERE id <> '__meta' ORDER BY updated_at DESC`).map(r => r.data) : [...mem.offerings.values()].filter(d => d.offering_id !== '__meta');
  return rows.map(d => blankOffering(d));
}
export async function getOffering(id) {
  await ensure();
  const d = url() ? (await sql()`SELECT data FROM ops_offerings WHERE id = ${id}`)[0]?.data : mem.offerings.get(id);
  return d ? blankOffering(d) : null;
}
export async function saveOffering(o) {
  await ensure();
  const data = { ...o, updated_at: new Date().toISOString() };
  if (url()) await sql()`INSERT INTO ops_offerings (id, data, status, updated_at) VALUES (${data.offering_id}, ${JSON.stringify(data)}::jsonb, ${data.status}, now())
    ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, status = EXCLUDED.status, updated_at = now()`;
  else mem.offerings.set(data.offering_id, data);
  return blankOffering(data);
}

export async function listAccessMap() {
  await ensure();
  return url() ? await sql()`SELECT circle_id, kind, title, access, requires, unlock_note FROM ops_access_map` : [...mem.map.values()];
}
export async function setAccess({ circle_id, kind = 'paywall', title = '', access = '', requires = '', unlock_note = '' }) {
  await ensure();
  if (url()) await sql()`INSERT INTO ops_access_map (circle_id, kind, title, access, requires, unlock_note) VALUES (${circle_id}, ${kind}, ${title}, ${access}, ${requires}, ${unlock_note})
    ON CONFLICT (circle_id) DO UPDATE SET access = EXCLUDED.access, requires = EXCLUDED.requires, unlock_note = EXCLUDED.unlock_note, title = EXCLUDED.title`;
  else mem.map.set(circle_id, { circle_id, kind, title, access, requires, unlock_note });
}

// Small facts about the desk itself (when Circle was last checked, and what it returned)
export async function getMeta() {
  await ensure();
  return (url() ? (await sql()`SELECT data FROM ops_offerings WHERE id = '__meta'`)[0]?.data : mem.offerings.get('__meta')) || null;
}
export async function setMeta(data) {
  await ensure();
  if (url()) await sql()`INSERT INTO ops_offerings (id, data, status, updated_at) VALUES ('__meta', ${JSON.stringify(data)}::jsonb, 'meta', now()) ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`;
  else mem.offerings.set('__meta', { ...data, offering_id: '__meta' });
}
