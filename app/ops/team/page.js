import { loadTeam } from '@/lib/ops/tasks';
import { loadResources } from '@/lib/ops/resources';
import { isTeacher, canEditSite } from '@/lib/ops/nav';
import Shell, { opsUser } from '../Shell';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Team — Embodied Philosophy', robots: { index: false, follow: false } };

const tzOf = m => m.time_zone || m.timezone || m.tz || '';

// Who does what, and where is everything? Teachers get the short version: contacts and their guide.
export default async function Team() {
  const user = await opsUser();
  const teacher = isTeacher(user);
  const [team, resources] = await Promise.all([loadTeam().catch(() => []), loadResources()]);
  const staff = team.filter(m => String(m.type).toLowerCase() !== 'teacher');
  const teachers = team.filter(m => String(m.type).toLowerCase() === 'teacher');
  const links = (resources || []).filter(r => !teacher || r.teachers);
  const groups = [...new Set(links.map(r => r.group))];

  return (
    <Shell user={user} current="team" head={!teacher && <a className="chip" href="/ops/hours">{user.director ? 'Team hours' : 'My hours'}</a>} eyebrow={teacher ? 'Contacts and your guide' : 'Who does what, and where it lives'} title="People">
      <div className="ops-grid">
        <section className="ops-col">
          <h2>{teacher ? 'Your contacts at EP' : 'Staff'} <span>{staff.length}</span></h2>
          <ul className="ops-dir">
            {staff.map(m => (
              <li key={m.email}>
                <b>{m.name}</b>{m.director ? ' · Director' : ''}
                <span className="meta">{[m.roles.join(', '), tzOf(m)].filter(Boolean).join(' · ')}</span>
                <a href={`mailto:${m.email}`}>{m.email}</a>
              </li>
            ))}
          </ul>
          {!teacher && teachers.length > 0 && (<>
            <h2>Teachers on the Team tab <span>{teachers.length}</span></h2>
            <ul className="ops-dir">
              {teachers.map(m => <li key={m.email}><b>{m.name}</b><span className="meta">{tzOf(m)}</span><a href={`mailto:${m.email}`}>{m.email}</a></li>)}
            </ul>
          </>)}
        </section>
        <aside className="ops-col">
          {teacher ? (<>
            <h2>Your guide</h2>
            <p className="ops-empty">Your bio, course pages, readings and slides all live in <a href="/teach">teacher onboarding</a>.</p>
          </>) : null}
          {!teacher && canEditSite(user) && (<>
            <h2>Waiting for review</h2>
            <p className="ops-empty">Teacher bios and course pages are reviewed in <a href="/ops/content?tab=review">Publish → Review</a>.</p>
          </>)}
          {user.director && (<>
            <h2>Teacher onboarding</h2>
            <p className="ops-empty">Where each teacher on the schedule is in onboarding, and “try it as” them: <a href="/teach">open the pipeline →</a></p>
          </>)}
          <h2>Resources</h2>
          {resources === null || links.length === 0 ? (
            <p className="ops-empty">{user.director ? <>No links yet. Add them in <a href="/ops/settings?t=resources">Settings → Resources</a>: SOPs, brand assets, Drive, Circle and Kit.</> : 'No links yet.'}</p>
          ) : groups.map(g => (
            <div key={g} className="ops-res">
              <h3>{g}</h3>
              <ul>{links.filter(r => r.group === g).map(r => <li key={r.url}><a href={r.url} target="_blank" rel="noopener">{r.title} ↗</a></li>)}</ul>
            </div>
          ))}
        </aside>
      </div>
    </Shell>
  );
}
