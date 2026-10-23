import { NextResponse } from 'next/server';
import { currentUser } from '@/lib/ops/auth';
import { canEditSite } from '@/lib/ops/nav';
import { readTab, TABS } from '@/lib/mentee/content';
import { pollsFrom } from '@/lib/mentee/polls';
import { pollVotes, menteeAvailable } from '@/lib/mentee/store';
import { mentees } from '@/lib/member/cohort';

export const dynamic = 'force-dynamic';

// Results of the mentee "which time works?" surveys, for the editors (Settings → Polls → see who answered).
// → { polls: [{ id, title, closed, final, options: [{ start, count, people: [name] }], answered, waiting: [name] }], votesOn }
export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Please sign in again' }, { status: 401 });
  if (!canEditSite(user)) return NextResponse.json({ error: 'Only Jacob, Irene and Floss can see survey results' }, { status: 403 });
  try {
    const [rows, cohort] = await Promise.all([readTab(TABS.polls), mentees().catch(() => [])]);
    const name = Object.fromEntries(cohort.map(m => [m.email, m.name]));
    const polls = pollsFrom(rows, {});
    const votesOn = menteeAvailable();
    const out = [];
    for (const p of polls) {
      const votes = votesOn ? await pollVotes(p.id) : [];
      const by = new Map();
      for (const v of votes) (by.get(v.slot) || by.set(v.slot, []).get(v.slot)).push(name[v.email] || v.email);
      const answered = new Set(votes.map(v => v.email));
      out.push({ id: p.id, title: p.title, closed: p.closed, final: p.final?.start || '', closes: p.closes,
        options: p.options.map(o => ({ start: o.start, count: (by.get(o.start) || []).length, people: by.get(o.start) || [] })),
        answered: answered.size, waiting: cohort.filter(m => !answered.has(m.email)).map(m => m.name) });
    }
    return NextResponse.json({ polls: out, votesOn, cohort: cohort.length });
  } catch (e) {
    console.error('polls GET', e.message);
    return NextResponse.json({ error: 'Couldn’t read the results just now. Try again shortly.' }, { status: 502 });
  }
}
