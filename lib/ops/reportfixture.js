// TEST ONLY (REPORT_TEST_DB=pglite): a synthetic copy of the Practice Report quiz's Neon database, in an in-process Postgres (PGlite), shaped exactly like production:
//   public.events   one row per thing a visitor did (no personal data)
//   public.reports  one row per finished quiz: id, created_at, email, and `data` jsonb holding the whole stored report, first name and email included
//   public.report_stats  the safe summary view over reports (the same SQL as docs/ops-handoff.md, "Practice Report: one-time setup")
//   ops_reader      a read-only login: SELECT on the view and on events only, nothing on reports
// Everything in it is made up (names and emails end in example.invalid) so a test can prove no personal value ever comes out. The connection is switched to ops_reader before it is handed
// back, so every query the app makes runs as that login and a query against the raw table is denied, as in production.

export const SAFE_VIEW_SQL = `CREATE OR REPLACE VIEW public.report_stats AS
SELECT created_at,
  data->>'archetype' AS archetype, data->>'archetype2' AS archetype2,
  data->'answers'->>'stage' AS stage,
  data->'answers'->'draw' AS draw,
  data->'answers'->'edge' AS edge,
  data->'answers'->>'fam' AS fam,
  data->'roles' AS roles,
  data->>'heardFrom' AS heard_from, data->>'sid' AS sid, data->>'country' AS country,
  data->'attr'->>'utm_source' AS utm_source, data->'attr'->>'utm_medium' AS utm_medium,
  data->'attr'->>'utm_campaign' AS utm_campaign, data->'attr'->>'utm_content' AS utm_content
FROM public.reports`;

export async function buildSyntheticQuiz() {
  const pkg = '@electric-sql/pglite';   // a name held in a variable, so the build neither bundles nor traces it (as the Ads database door does)
  const { PGlite } = await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ pkg);
  const db = new PGlite();
  await db.query(`CREATE TABLE public.events (id bigserial PRIMARY KEY, at timestamptz NOT NULL DEFAULT now(), sid text, name text, step text, props jsonb, utm_source text, utm_medium text, utm_campaign text, utm_content text, ref text, country text, device text)`);
  await db.query(`CREATE TABLE public.reports (id text PRIMARY KEY, created_at timestamptz NOT NULL DEFAULT now(), email text, data jsonb NOT NULL)`);
  await db.query(SAFE_VIEW_SQL);

  // Same mix as before the real mapping: 60 people; three archetype names (30 / 15 / 15), every third from the Kali Winter 2027 ad, answers in threes. draw, edge and roles are a mix of one value and several.
  const T = ['The Contemplative', 'The Devotee', 'The Scholar', 'The Householder'], STAGE = ['new', 'intermittent', 'daily_long'], EDGE = ['boredom', 'doubt', 'skeptic'], FAM = ['new', 'read', 'studied'], DRAW = ['stillness', 'devotion', 'meaning'], ROLE = ['yoga_teacher', 'therapist', 'student'];
  const now = Date.now();
  for (let i = 0; i < 60; i++) {
    const ad = i % 3 === 0;   // every third person came from the Kali Winter 2027 ad campaign
    const draw = DRAW[(i + 1) % 3], edge = EDGE[i % 3 === 0 ? 0 : (i % 2) + 1];
    const data = {
      firstName: `Synthetic Person ${i}`, email: `synthetic.person.${i}@example.invalid`, sid: `synthetic-sid-${i}`, country: 'ZZ', heardFrom: ['social', 'podcast', 'friend'][i % 3],
      archetype: T[i % 2 === 0 ? 0 : i % 4], archetype2: T[(i + 1) % 4],
      answers: { stage: STAGE[i % 3], draw: i % 5 === 0 ? [draw, 'study'] : draw, edge: i % 7 === 0 ? [edge, 'consistency', edge] : edge, fam: FAM[i % 3], time: '20', streak: '7' },
      roles: i % 4 === 0 ? [ROLE[(i + 2) % 3], 'seeker'] : [ROLE[(i + 2) % 3]],
      attr: ad ? { utm_source: 'meta', utm_medium: 'paid_social', utm_campaign: 'kali-winter-2027', utm_content: '' } : { utm_source: 'newsletter', utm_medium: 'email', utm_campaign: 'weekly', utm_content: '' },
    };
    await db.query('INSERT INTO public.reports (id, created_at, email, data) VALUES ($1, $2, $3, $4)', [`r${i}`, new Date(now - (i % 40) * 86400e3).toISOString(), data.email, JSON.stringify(data)]);
    await db.query('INSERT INTO public.events (sid, name, step, utm_source) VALUES ($1, $2, $3, $4)', [data.sid, 'Quiz Started', 'intro', data.attr.utm_source]);
  }

  // The read-only login: the view and events, nothing on the raw table. Then every query runs as it.
  await db.query(`CREATE ROLE ops_reader NOSUPERUSER NOINHERIT`);
  await db.query(`GRANT USAGE ON SCHEMA public TO ops_reader`);
  await db.query(`GRANT SELECT ON public.report_stats TO ops_reader`);
  await db.query(`GRANT SELECT ON public.events TO ops_reader`);
  await db.query(`REVOKE ALL ON public.reports FROM ops_reader`);
  await db.query(`SET ROLE ops_reader`);
  return db;
}
