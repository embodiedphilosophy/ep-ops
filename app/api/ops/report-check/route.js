import { NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { currentUser } from '@/lib/ops/auth';

// Does the Practice Report connection work, and is it safe? Directors only. Signed in, open /api/ops/report-check.
// Connects with REPORT_DATABASE_URL (the read-only ops_reader role on the quiz's Neon database) and returns counts and yes/no answers only:
// no answers, no names, no emails. It checks that the login can read the safe summary view (report_stats) and the events, cannot write to either,
// and cannot read the raw reports table (which holds names and emails).
export const dynamic = 'force-dynamic';

export async function GET() {
  const user = await currentUser();
  if (!user?.director) return NextResponse.json({ error: 'This check is for directors. Please sign in again.' }, { status: 401 });
  const url = process.env.REPORT_DATABASE_URL || '';
  if (!url) return NextResponse.json({ ok: false, problem: 'REPORT_DATABASE_URL is not set in this deployment.' });
  try {
    const sql = neon(url);
    const [who] = await sql.query('SELECT current_user AS role');
    const [counts] = await sql.query('SELECT (SELECT count(*) FROM public.events)::int AS events, (SELECT count(*) FROM public.report_stats)::int AS report_stats');
    const [perm] = await sql.query(`SELECT has_table_privilege(current_user, 'public.events', 'INSERT,UPDATE,DELETE') AS can_write_events,
      has_table_privilege(current_user, 'public.report_stats', 'INSERT,UPDATE,DELETE') AS can_write_view,
      has_table_privilege(current_user, 'public.reports', 'SELECT') AS can_read_raw`);
    const readOnly = !perm.can_write_events && !perm.can_write_view, rawClosed = !perm.can_read_raw, rightRole = who.role === 'ops_reader';
    const says = [
      rightRole ? 'This login is ops_reader, as it should be.' : 'This login is not ops_reader: use the ops_reader connection string.',
      'The safe summary view is readable.',
      'The events are readable.',
      readOnly ? 'This login cannot change anything: good.' : 'This login can change the quiz’s data: it should be read-only.',
      rawClosed ? 'The raw reports table is closed to this login: good.' : 'The raw reports table is still readable by this login (it holds names and emails): run the second half of the SQL under “Practice Report: one-time setup” in docs/ops-handoff.md.',
    ];
    return NextResponse.json({ ok: rightRole && readOnly && rawClosed, role: who.role, events: counts.events, report_stats: counts.report_stats, read_only: readOnly, raw_table_closed: rawClosed, says });
  } catch (e) {
    // Name the kind of failure without echoing anything from the connection string
    const m = String(e?.message || '');
    const problem = /password/i.test(m) ? 'The password in the connection string was not accepted.'
      : /does not exist/i.test(m) && /role/i.test(m) ? 'The role name in the connection string is wrong (it should be ops_reader).'
      : /relation .*report_stats.* does not exist/i.test(m) ? 'Connected, but the safe summary view (report_stats) does not exist yet: run the SQL under “Practice Report: one-time setup” in docs/ops-handoff.md.'
      : /permission denied/i.test(m) ? 'Connected, but the role cannot read the safe summary view or the events: run the GRANT lines of the one-time SQL.'
      : /invalid|url|parse/i.test(m) ? 'The connection string is not in the right format.'
      : 'Could not connect to the Practice Report database.';
    return NextResponse.json({ ok: false, problem });
  }
}
