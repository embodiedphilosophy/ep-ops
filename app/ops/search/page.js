import { listTasks } from '@/lib/ops/taskstore';
import { loadCalendar } from '@/lib/calendar';
import { loadTeam, dedupe, visibleTo, eventIdFromTag } from '@/lib/ops/tasks';
import { loadProfiles } from '@/lib/teach';
import { isTeacher, isStaff, canEditEvents, canSupport } from '@/lib/ops/nav';
import { loadInvites, STATUS_LABEL } from '@/lib/ops/faculty';
import { zendeskConfigured, listQueue } from '@/lib/ops/support';
import { todayET } from '@/lib/events';
import Shell, { opsUser } from '../Shell';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Search — Embodied Philosophy', robots: { index: false, follow: false } };

const short = d => d ? new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }) : '';
const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// One box for everything: sessions and programs, tasks, people, invitations and support tickets
export default async function Search({ searchParams }) {
  const user = await opsUser();
  const sp = await searchParams;
  const q = String(sp?.q || '').trim().slice(0, 80);
  const words = norm(q).split(/\s+/).filter(Boolean);
  const hit = (...fields) => { const hay = norm(fields.join(' ')); return words.every(w => hay.includes(w)); };
  const today = todayET();
  let groups = [];
  if (words.length) {
    const [cal, tasks, team, profiles, invites, tickets] = await Promise.all([
      loadCalendar().catch(() => []),
      listTasks().then(dedupe).catch(() => []),
      isStaff(user) ? loadTeam().catch(() => []) : [],
      isStaff(user) ? loadProfiles({ fresh: false }).catch(() => []) : [],
      canEditEvents(user) ? loadInvites().catch(() => []) : [],
      canSupport(user) && zendeskConfigured() ? listQueue().catch(() => []) : [],
    ]);
    const mine = isTeacher(user) ? cal.filter(e => String(e.teachers).includes(user.name) || String(e.teacher_host_emails).toLowerCase().includes(user.email)) : cal;
    // Programs: one result per series; sessions otherwise (upcoming first, then the most recent past)
    const seen = new Set(), sessions = [];
    for (const e of [...mine].sort((a, b) => (a.date < today) - (b.date < today) || (a.date < today ? b.date.localeCompare(a.date) : a.date.localeCompare(b.date)))) {
      if (!hit(e.title, e.internal_title, e.teachers, e.series, e.program_name, e.module_title, e.track, e.course_host)) continue;
      if (e.series && e.track !== 'MM') { if (seen.has(e.series)) continue; seen.add(e.series); }
      sessions.push({ href: e.series && e.track !== 'MM' ? `/ops/events?all=1&event=P-${e.series}` : e.date >= today ? `/ops/events?all=1&event=${e.id}` : `/ops/events?show=past&event=${e.sched_id}`,
        title: e.series && e.track !== 'MM' && e.program_name ? e.program_name : e.title, sub: `${short(e.date)} · ${e.track}${e.teachers ? ` · ${e.teachers}` : ''}${e.series ? ` · ${e.series}` : ''}` });
    }
    const visible = user.director ? tasks : visibleTo(user, tasks);
    const ts = visible.filter(t => hit(t.name, t.labels.join(' '))).sort((a, b) => a.completed - b.completed || (a.due || '9').localeCompare(b.due || '9'))
      .map(t => ({ href: `/ops/tasks?show=${t.completed ? 'done' : 'open'}${eventIdFromTag(t.description) ? `&event=${encodeURIComponent(eventIdFromTag(t.description))}` : ''}`, title: t.name, sub: `${t.completed ? 'Done' : t.due && t.due < today ? 'Late' : 'Open'}${t.due ? ` · due ${short(t.due)}` : ''} · ${t.labels.join(', ') || 'no owner'}` }));
    const people = [];
    const pseen = new Set();
    for (const m of team) if (hit(m.name, m.email, m.roles.join(' '), m.type)) { pseen.add(m.email); people.push({ href: `mailto:${m.email}`, title: m.name, sub: [m.type, m.roles.join(', '), m.email].filter(Boolean).join(' · ') }); }
    for (const p of profiles) if (!pseen.has(p.email) && hit(p.name, p.email, p.role)) people.push({ href: `mailto:${p.email}`, title: p.name || p.email, sub: ['Teacher', p.role, p.email].filter(Boolean).join(' · ') });
    const inv = invites.filter(i => hit(i.name, i.email, i.offering_title, i.kind)).map(i => ({ href: '/ops/team?tab=invitations', title: `${i.name} · ${i.offering_title}`, sub: `${STATUS_LABEL[i.status] || i.status} · ${i.kind}` }));
    const tk = tickets.filter(t => hit(t.subject, t.requester?.name, t.requester?.email)).map(t => ({ href: `/ops/support?tab=${['pending', 'hold'].includes(t.status) ? 'waiting' : t.kind === 'person' ? 'reply' : 'other'}&t=${t.id}`, title: t.subject, sub: `${t.requester?.name || t.requester?.email || 'Unknown'} · ${t.status}` }));
    groups = [['Programs and sessions', sessions], ['Tasks', ts], ['People', people], ['Invitations', inv], ['Support tickets', tk]].filter(([, l]) => l.length);
  }
  const total = groups.reduce((n, [, l]) => n + l.length, 0);
  return (
    <Shell user={user} current="search" title="Search" desc="Programs, sessions, tasks, people, invitations and tickets."
      head={<form action="/ops/search" className="ops-search-big"><input name="q" defaultValue={q} placeholder="Search everything" autoFocus aria-label="Search" /><button className="chip primary">Search</button></form>}>
      {!words.length ? <p className="ops-empty">Type a name, a program, a teacher or a task.</p>
        : total === 0 ? <p className="ops-empty">Nothing matches “{q}”.</p>
        : groups.map(([label, list]) => (
          <section key={label} className="ops-col" style={{ marginBottom: 24 }}>
            <h2>{label} <span>{list.length}</span></h2>
            <ul className="ops-results">{list.slice(0, 25).map((r, i) => <li key={i}><a href={r.href}><b>{r.title}</b><small>{r.sub}</small></a></li>)}</ul>
            {list.length > 25 && <p className="ops-more">{list.length - 25} more: add another word to narrow it.</p>}
          </section>
        ))}
    </Shell>
  );
}
