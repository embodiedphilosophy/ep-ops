import { NextResponse } from 'next/server';
import { currentUser } from '@/lib/ops/auth';
import { canEditSite } from '@/lib/ops/nav';
import { menteeAvailable, pairRows } from '@/lib/mentee/store';
import { groupsFrom } from '@/lib/mentee/pairing';
import { mentees } from '@/lib/member/cohort';
import { todayET } from '@/lib/events';
import config from '@/data/mentee.json';

export const dynamic = 'force-dynamic';

// The articulation partners the mentees chose for a month (they pair themselves on their Mentorship Dashboard; lib/mentee/pairing.js),
// and who hasn't chosen yet. Read only: GET ?month=YYYY-MM (default this month).
export async function GET(req) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Please sign in again' }, { status: 401 });
  if (!canEditSite(user)) return NextResponse.json({ error: 'Only Jacob, Irene and Floss can see peer partners' }, { status: 403 });
  const asked = new URL(req.url).searchParams.get('month') || '';
  const month = /^\d{4}-\d{2}$/.test(asked) ? asked : todayET().slice(0, 7);
  if (!menteeAvailable()) return NextResponse.json({ month, on: false, groups: [], unpaired: [] });
  try {
    const mentors = new Set((config.mentor_emails || []).map(e => String(e).toLowerCase()));
    const [rows, cohort] = await Promise.all([pairRows(config.season, month), mentees().catch(() => [])]);
    const groups = groupsFrom(rows).map(g => ({ id: g.id, members: g.members }));
    const paired = new Set(groups.flatMap(g => g.members.map(m => m.email)));
    const unpaired = cohort.filter(m => !paired.has(m.email) && !mentors.has(m.email)).map(m => ({ email: m.email, name: m.name })).sort((a, b) => a.name.localeCompare(b.name));
    return NextResponse.json({ month, on: true, groups, unpaired, cohortSize: cohort.filter(m => !mentors.has(m.email)).length });
  } catch (e) {
    console.error('ops partners chosen', e.message);
    return NextResponse.json({ error: 'Couldn’t read this month’s partners. Try again.' }, { status: 502 });
  }
}
