import { loadTeam } from '@/lib/ops/tasks';
import { loadResources } from '@/lib/ops/resources';
import { isStaff, canEditEvents, canEditEmail } from '@/lib/ops/nav';
import { loadInvites } from '@/lib/ops/faculty';
import { directory } from '@/lib/ops/teachers';
import { teamRows, TYPES } from '@/lib/ops/people';
import { pendingRequests, clockAvailable } from '@/lib/ops/hours';
import { peopleRows, filterRows, SHOWS, personHref } from '@/lib/ops/peopledir';
import { AddPerson, PersonActions } from './Invitations';
import { StartProfile, ClearTests, AddTeacher } from './ProfileEditor';
import Shell, { opsUser } from '../Shell';
import '../social/social.css';
import '../email/email.css';

const first = v => (Array.isArray(v) ? v[0] : v) || '';
const tzOf = m => m.time_zone || m.timezone || m.tz || '';

// People › Directory (EP Ops 2, step 5): staff and faculty in one list, each with what they need. It puts together what the old
// Faculty page (the Team tab, invitations), Teacher profiles (the Teachers tab) and Hours (requests waiting on a yes) already read.
// A name opens that person's record. ?show= is the chip; ?needs=profile is the old Teacher profiles address (people whose profile
// needs a look); ?q= searches.
export default async function Directory({ searchParams }) {
  const user = await opsUser(isStaff);
  const sp = (await searchParams) || {};
  const manage = canEditEvents(user), editEmail = canEditEmail(user);
  const [team, resources, everyone, tdir, invites, requests] = await Promise.all([
    loadTeam().catch(() => []), loadResources(), manage ? teamRows().catch(() => []) : [],
    directory({ fresh: false }).catch(() => []),
    manage ? loadInvites().catch(() => []) : [],
    user.director && clockAvailable() ? pendingRequests().catch(() => []) : [],
  ]);
  const rows = peopleRows({ team, tdir, invites, requests });
  const profileOnly = first(sp.needs) === 'profile';
  const show = profileOnly ? 'needs' : SHOWS.some(s => s[0] === first(sp.show)) || first(sp.show) === 'hidden' ? first(sp.show) : 'all';
  const q = first(sp.q).trim();
  const shown = filterRows(rows, { show, q, profile: profileOnly });
  const visible = rows.filter(r => !r.hidden), hidden = rows.filter(r => r.hidden);
  const count = k => k === 'staff' ? visible.filter(r => r.kind === 'Staff').length : k === 'faculty' ? visible.filter(r => r.kind === 'Faculty').length
    : k === 'invited' ? visible.filter(r => r.invited).length : k === 'needs' ? visible.filter(r => r.needs.length).length : visible.length;
  const tests = visible.filter(r => r.test && r.email).map(r => r.email);
  const gone = everyone.filter(p => !p.active);
  const href = (extra = {}) => { const p = new URLSearchParams(); for (const [k, v] of Object.entries({ q, ...extra })) if (v) p.set(k, v); const s = p.toString(); return s ? `/ops/people?${s}` : '/ops/people'; };
  const links = resources || [], groups = [...new Set(links.map(r => r.group))];
  const me = String(user.email).toLowerCase();

  const head = (
    <div className="pp-actions">
      {manage && <a className="chip" href="/ops/people?add=1#add">Add someone</a>}
      {manage && <a className="chip primary" href="/ops/people?view=invitations">Invite a teacher</a>}
      <a className="chip" href={user.director ? '/ops/people?view=hours' : personHref(me, 'hours')}>{user.director ? 'Team hours' : 'My hours'}</a>
    </div>);

  return (
    <Shell user={user} current="people" desc="Staff and faculty in one list, with what each person needs. A name opens their record." eyebrow="People" title="Everyone who makes EP run" head={head}>
      <nav className="pg-chips" aria-label="Who to show">
        {SHOWS.filter(([k]) => k !== 'invited' || manage).map(([k, label]) => <a key={k} href={href({ show: k === 'all' ? '' : k })} aria-current={show === k ? 'page' : undefined}>{label}{k !== 'all' && count(k) > 0 && <span className="n">{count(k)}</span>}</a>)}
        {editEmail && hidden.length > 0 && <a href={href({ show: 'hidden' })} aria-current={show === 'hidden' ? 'page' : undefined}>Hidden<span className="n">{hidden.length}</span></a>}
      </nav>
      <form className="pp-find" action="/ops/people" role="search" aria-label="Search people">
        {show !== 'all' && !profileOnly && <input type="hidden" name="show" value={show} />}
        {profileOnly && <input type="hidden" name="needs" value="profile" />}
        <input name="q" defaultValue={q} placeholder="Search by name, email or role" aria-label="Search by name, email or role" />
        <button className="chip">Search</button>
        {q && <a href={href({ q: '', show: show === 'all' ? '' : show })}>Clear</a>}
      </form>
      {profileOnly && <p className="ops-note pp-note">Showing the people whose profile or bio needs a look. <a href="/ops/people">Show everyone</a></p>}
      {editEmail && tests.length > 0 && show !== 'hidden' && <p className="pp-note">Some entries look like tests. <ClearTests emails={tests} /></p>}

      {shown.length === 0 ? <p className="ops-empty pg-empty">{q ? `Nobody matches “${q}”.` : show === 'needs' ? 'Nobody needs anything right now.' : 'No one here.'}</p> : (
        <div className="pg-scroll"><table className="pg-table pp-table">
          <thead><tr><th>Name</th><th>Kind</th><th>Roles in Ops</th><th>Next</th><th>What they need</th></tr></thead>
          <tbody>{shown.map((r, i) => (
            <tr key={r.id || `${r.name}-${i}`}>
              <td>{r.email ? <a className="pg-name" href={personHref(r.email)}>{r.name}</a> : <b className="pg-name">{r.name}</b>}
                {r.email && <a className="sub" href={`mailto:${r.email}`}>{r.email}</a>}</td>
              <td>{r.kind}{r.detail && <span className="sub">{r.detail}</span>}</td>
              <td className="pg-fac">{r.roles || <span className="none">—</span>}{r.test && <span className="ops-status risk pp-test">Looks like a test entry</span>}</td>
              <td className="pg-when">{r.next || <span className="none">—</span>}</td>
              <td>{r.needs.length ? <span className="pp-needs">{r.needs.map(n => n.href ? <a key={n.key} className="ops-status soon" href={n.href}>{n.text}</a> : <span key={n.key} className="ops-status soon">{n.text}</span>)}</span> : <span className="none">—</span>}
                {editEmail && r.kind === 'Faculty' && r.email && !r.t?.has_profile && <StartProfile email={r.email} name={r.name} />}</td>
            </tr>))}</tbody>
        </table></div>)}

      {manage && (
        <details className="pp-add" id="add" open={!!first(sp.add)}>
          <summary>Add someone</summary>
          <div className="pp-add-body">
            <h2 className="ops-sub">Add to the team</h2>
            <AddPerson types={TYPES} director={!!user.director} />
            <p className="ops-meta">To ask a teacher to teach something (with a fee and, if you like, an agreement), use <a href="/ops/people?view=invitations">Invitations</a>: saying yes puts them on the sessions.</p>
            {editEmail && <AddTeacher />}
          </div>
        </details>)}
      {manage && gone.length > 0 && (
        <details className="pp-gone">
          <summary>Taken off the team <span className="n">{gone.length}</span></summary>
          <ul className="ops-dir">{gone.map(m => <li key={m.email || m.row}><b>{m.name}</b><span className="meta">{m.type || ''}</span><span>{m.email}</span>
            <PersonActions email={m.email} name={m.name} active={false} /></li>)}</ul>
        </details>)}

      <section className="pp-res" aria-label="Resources">
        <h2>Resources</h2>
        {resources === null || links.length === 0 ? (
          <p className="ops-empty">{user.director ? <>No links yet. Add them in <a href="/ops/settings?t=resources">Settings → Resources</a>: SOPs, brand assets, Drive, Circle and Kit.</> : 'No links yet.'}</p>
        ) : groups.map(g => (
          <div key={g} className="ops-res">
            <h3>{g}</h3>
            <ul>{links.filter(r => r.group === g).map(r => <li key={r.url}><a href={r.url} target="_blank" rel="noopener">{r.title} ↗</a></li>)}</ul>
          </div>
        ))}
      </section>
    </Shell>
  );
}
