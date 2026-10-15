import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/ops/auth';
import { listTasks } from '@/lib/ops/taskstore';
import { dedupe, needsYouFor } from '@/lib/ops/tasks';
import { navFor, isTeacher, isStaff } from '@/lib/ops/nav';
import { clockAvailable } from '@/lib/ops/hours';
import ClockWidget from './ClockWidget';

// The signed-in user for an ops page, or off to sign in. `allow` narrows who may open the page.
export async function opsUser(allow = () => true) {
  const user = await currentUser();
  if (!user) redirect('/ops/login');
  if (!allow(user)) redirect('/ops');
  return user;
}

// Today's count: exactly the "Needs you" list on Today (late or due this week, or waiting on you)
async function needsYouCount(user) {
  try { return needsYouFor(user, dedupe(await listTasks())).list.length; } catch { return 0; }
}

const initials = name => String(name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('');
const roleOf = u => u.director ? 'Director' : isTeacher(u) ? 'Teacher' : (String(u.type || '').replace(/^./, c => c.toUpperCase()) || 'Team');

// Sidebar and page header shared by every ops page. A terra count shows only when something needs action.
// eyebrow: the small line over the page title (a date, a range, what the page covers).
export default async function Shell({ user, current, title, eyebrow, desc, head, children }) {
  const items = navFor(user);
  const badges = isStaff(user) ? { home: await needsYouCount(user) } : {};
  const link = i => (
    <a key={i.key} href={i.href} aria-current={i.key === current ? 'page' : undefined}>
      {i.label}
      {badges[i.key] ? <span className="ops-badge" aria-label={`${badges[i.key]} need action`}>{badges[i.key]}</span> : null}
    </a>
  );
  const main = items.filter(i => i.group !== 'more'), more = items.filter(i => i.group === 'more');
  // A small heading over each section of the sidebar (hidden on phones, where the menu is one row)
  const withHeads = main.flatMap((i, n) => i.section && i.section !== main[n - 1]?.section
    ? [<span key={`h-${i.section}`} className="ops-nav-sec" aria-hidden="true">{i.section}</span>, link(i)] : [link(i)]);
  return (
    <div className="ops-shell">
      <aside className="ops-side">
        <a href="/ops" className="ops-brand"><span className="w1">EP Ops</span><span className="w2">General Manager</span></a>
        {items.length > 1 && <form action="/ops/search" className="ops-search" role="search"><input name="q" placeholder="Search" aria-label="Search the dashboard" /></form>}
        {items.length > 1 && <nav className="ops-nav" aria-label="Dashboard">{withHeads}</nav>}
        {more.length > 0 && <nav className="ops-nav more" aria-label="More">{more.map(link)}</nav>}
        {isStaff(user) && !user.director && clockAvailable() && <ClockWidget tags={user.roles || []} />}
        <div className="ops-me">
          <span className="av" aria-hidden="true">{initials(user.name)}</span>
          <span><b>{user.name}</b><small>{roleOf(user)} · <a href="/api/ops/logout">Sign out</a></small></span>
        </div>
      </aside>
      <main className="ops">
        {(title || head) && (
          <div className="ops-head">
            {title && <div className="ttl">{eyebrow && <span className="ops-eyebrow">{eyebrow}</span>}<h1>{title}</h1>{desc && <p className="ops-desc">{desc}</p>}</div>}
            {head}
          </div>
        )}
        {children}
      </main>
    </div>
  );
}
