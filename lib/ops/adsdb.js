// The database door for Ads: one function, query(text, params) → rows. In production it is Neon (DATABASE_URL, the same database as tasks).
// In tests it is an in-process Postgres (PGlite), so adsstore.js runs the same SQL in both and no test ever touches a real database.
//
// The one test-only switch, inert unless set: ADS_TEST_DB=pglite gives an in-process Postgres (PGlite, a devDependency, loaded by a dynamic import that
// only runs when the switch is set). With it set, Neon is never used, whatever DATABASE_URL says.
import { neon } from '@neondatabase/serverless';

let adapter = null;
let neonFn = null;

async function pglite() {
  // A name held in a variable, so the build neither bundles nor traces PGlite (it is a test tool; production never loads it)
  const pkg = '@electric-sql/pglite';
  const { PGlite } = await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ pkg);
  const db = new PGlite();
  return { query: async (text, params) => (await db.query(text, params)).rows };
}

async function door() {
  if (process.env.ADS_TEST_DB === 'pglite') return (adapter ||= await pglite());
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL || '';
  if (!url) throw new Error('The database isn’t connected (DATABASE_URL is not set).');
  neonFn ||= neon(url);
  return { query: (text, params) => neonFn.query(text, params) };
}

export async function adsQuery(text, params = []) {
  return (await door()).query(text, params);
}
