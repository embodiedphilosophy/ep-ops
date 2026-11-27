import { NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { currentUser } from '@/lib/ops/auth';

// Does the Practice Report connection work? Directors only. Signed in, open /api/ops/report-check.
// Connects with REPORT_DATABASE_URL (the read-only ops_reader role on the quiz's Neon database) and
// returns row counts only: no answers, no emails. It also confirms the role cannot write.
export const dynamic = 'force-dynamic';

export async function GET() {
  const user = await currentUser();
  if (!user?.director) return NextResponse.json({ error: 'This check is for directors. Please sign in again.' }, { status: 401 });
  const url = process.env.REPORT_DATABASE_URL || '';
  if (!url) return NextResponse.json({ ok: false, problem: 'REPORT_DATABASE_URL is not set in this deployment.' });
  try {
    const sql = neon(url);
    const [who] = await sql.query('SELECT current_user AS role');
    const [counts] = await sql.query('SELECT (SELECT count(*) FROM public.events)::int AS events, (SELECT count(*) FROM public.reports)::int AS reports');
    const [perm] = await sql.query(`SELECT has_table_privilege(current_user, 'public.events', 'INSERT,UPDATE,DELETE') AS can_write_events,
      has_table_privilege(current_user, 'public.reports', 'INSERT,UPDATE,DELETE') AS can_write_reports,
      has_column_privilege(current_user, 'public.reports', 'email', 'SELECT') AS can_read_email`);
    const readOnly = !perm.can_write_events && !perm.can_write_reports && !perm.can_read_email;
    return NextResponse.json({ ok: who.role === 'ops_reader' && readOnly, role: who.role, events: counts.events, reports: counts.reports, read_only: readOnly });
  } catch (e) {
    // Name the kind of failure without echoing anything from the connection string
    const m = String(e?.message || '');
    const problem = /password/i.test(m) ? 'The password in the connection string was not accepted.'
      : /does not exist/i.test(m) && /role/i.test(m) ? 'The role name in the connection string is wrong (it should be ops_reader).'
      : /permission denied/i.test(m) ? 'Connected, but the role cannot read the tables.'
      : /invalid|url|parse/i.test(m) ? 'The connection string is not in the right format.'
      : 'Could not connect to the Practice Report database.';
    return NextResponse.json({ ok: false, problem });
  }
}
