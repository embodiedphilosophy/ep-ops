// A few facts the Health panel shows (last Instagram sync, sync errors, Meta token expiry). They live in
// the dashboard's database; without one the sync still runs, it just can't remember when.
import { neon } from '@neondatabase/serverless';
const url = () => process.env.DATABASE_URL || process.env.POSTGRES_URL || '';
let q = null, ready = null;
const sql = () => (q ||= neon(url()));
const ensure = () => (ready ||= sql()`CREATE TABLE IF NOT EXISTS ops_social_health (key text PRIMARY KEY, value jsonb NOT NULL DEFAULT '{}', at timestamptz NOT NULL DEFAULT now())`.catch(e => { ready = null; throw e; }));

export async function setHealth(key, value) {
  if (!url()) return false;
  await ensure();
  await sql()`INSERT INTO ops_social_health (key, value, at) VALUES (${key}, ${JSON.stringify(value)}::jsonb, now()) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, at = now()`;
  return true;
}
export async function getHealth(key) {
  if (!url()) return null;
  await ensure();
  const r = await sql()`SELECT value, at FROM ops_social_health WHERE key = ${key}`;
  return r[0] ? { ...r[0].value, at: r[0].at } : null;
}
