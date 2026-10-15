import { loadTeam } from '@/lib/ops/tasks';
import { loadResources } from '@/lib/ops/resources';
import { isTeacher, canEditSite, canEditEvents } from '@/lib/ops/nav';
import { loadInvites, loadTemplates, offerings, KINDS, FEE_UNITS, STATUS_LABEL, inviteUrl } from '@/lib/ops/faculty';
import { InviteForm, InviteActions } from './Invitations';
import Shell, { opsUser } from '../Shell';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Team — Embodied Philosophy', robots: { index: false, follow: false } };

const tzOf = m => m.time_zone || m.timezone || m.tz || '';

// Who does what, and where is everything? Teachers get the short version: contacts and their guide.
export default async function Team({ searchParams }) {
  const user = await opsUser();
  const sp = await searchParams;
  const teacher = isTeacher(user);
  if (sp?.tab === 'invitations' && canEditEvents(user)) return <Invitations user={user} />;
  const [team, resources] = await Promise.all([loadTeam().catch(() => []), loadResources()]);
  const staff = team.filter(m => String(m.type).toLowerCase() !== 'teacher');
  const teachers = team.filter(m => String(m.type).toLowerCase() === 'teacher');
  const links = (resources || []).filter(r => !teacher || r.teachers);
  const groups = [...new Set(links.map(r => r.group))];

  return (
    <Shell user={user} current="team" desc="Who does what, and where everything lives." head={!teacher && <a className="chip" href="/ops/hours">{user.director ? 'Team hours' : 'My hours'}</a>} eyebrow={teacher ? 'Contacts and your guide' : 'Who does what, and where it lives'} title="Faculty & team">
      {canEditEvents(user) && <Tabs current="people" />}
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
            <p className="ops-empty">Teacher bios and course pages are reviewed in <a href="/ops/content?tab=review">Content → Review</a>.</p>
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

function Tabs({ current }) {
  return (
    <nav className="ops-filters" aria-label="Faculty" style={{ marginBottom: 16 }}>
      <a href="/ops/team" aria-current={current === 'people' ? 'page' : undefined}>People</a>
      <a href="/ops/team?tab=invitations" aria-current={current === 'invitations' ? 'page' : undefined}>Invitations</a>
    </nav>
  );
}

const nice = d => d ? new Date(d.length > 10 ? d : `${d}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: d.length > 10 ? 'America/New_York' : 'UTC' }) : '';
const DOT = { sent: 'amber', signed: 'green', declined: 'grey', cancelled: 'grey' };

// Faculty → Invitations: invite a teacher to an offering; follow each invitation to a signed agreement
async function Invitations({ user }) {
  const [invites, templates, offs] = await Promise.all([loadInvites({ light: false }), loadTemplates(), offerings().catch(() => [])]);
  const base = process.env.OPS_URL || '';
  const list = [...invites].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  const open = list.filter(i => i.status === 'sent');
  return (
    <Shell user={user} current="team" desc="Invite faculty, and follow each invitation to a signed agreement." eyebrow="Invitations and agreements" title="Faculty & team">
      <Tabs current="invitations" />
      <div className="ops-grid">
        <section className="ops-col">
          <h2>Invitations <span>{open.length} waiting</span></h2>
          {list.length === 0 ? <p className="ops-empty">No invitations yet. Invite your first teacher with the form.</p> : (
            <ul className="ops-invites">
              {list.map(i => (
                <li key={i.id}>
                  <span className={`st ${DOT[i.status] || 'grey'}`}><span className={`dot ${DOT[i.status] || 'grey'}`} aria-hidden="true" />{STATUS_LABEL[i.status] || i.status}</span>
                  <span className="what">
                    <b>{i.name}</b> · {i.offering_title}
                    <small>{i.kind}{i.fee ? ` · $${i.fee} ${i.fee_unit === 'flat' ? 'flat' : 'per session'}` : ''} · invited {nice(i.created_at)} by {i.created_by}
                      {i.status === 'signed' ? ` · signed ${nice(i.signed_at)}` : i.status === 'sent' && i.email_status ? ` · email ${i.email_status}` : ''}</small>
                  </span>
                  <InviteActions id={i.id} status={i.status} link={i.status === 'sent' ? inviteUrl(base, i) : ''} contract={i.status === 'signed' ? `/invite/staff/contract?id=${i.id}` : ''} />
                </li>
              ))}
            </ul>
          )}
        </section>
        <aside className="ops-col">
          <h2>Invite a teacher</h2>
          {templates.length === 0 ? (
            <p className="ops-empty">First add your standard agreement in <a href="/ops/settings?t=contracts">Settings → Contracts</a>. It can use {'{{teacher_name}}'}, {'{{offering}}'}, {'{{dates}}'}, {'{{fee}}'} and {'{{terms}}'}, which fill themselves in.</p>
          ) : <InviteForm offerings={offs} templates={templates.map(t => t.name)} kinds={KINDS} units={FEE_UNITS} />}
          <p className="ops-meta" style={{ marginTop: 16 }}>When they say yes, they read and sign the agreement online; it is countersigned for EP automatically and archived here. They are then added to every session (Teachers and reminder emails), and onboarding takes it from there.</p>
        </aside>
      </div>
    </Shell>
  );
}
