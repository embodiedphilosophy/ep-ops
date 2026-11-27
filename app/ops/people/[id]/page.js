import { loadTeam } from '@/lib/ops/tasks';
import { loadCalendar } from '@/lib/calendar';
import { todayET } from '@/lib/events';
import { isStaff, canEditEvents, canEditEmail } from '@/lib/ops/nav';
import { loadInvites, loadTemplates, offerings, KINDS, FEE_UNITS } from '@/lib/ops/faculty';
import { directory, sessionsFor } from '@/lib/ops/teachers';
import { teamRows, TYPES } from '@/lib/ops/people';
import { statusFor, teamHours, pendingRequests, clockAvailable } from '@/lib/ops/hours';
import { peopleRows, personHref } from '@/lib/ops/peopledir';
import { InviteForm, PersonActions } from '../Invitations';
import InviteList, { newestFirst } from '../InviteList';
import OnboardingStudio from '../OnboardingStudio';
import { Profile, StartProfile } from '../ProfileEditor';
import { MyHours, PersonHours, noClock, monthOf, monthName } from '../Hours';
import Shell, { opsUser } from '../../Shell';
import '../../social/social.css';
import '../../email/email.css';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Person — Embodied Philosophy', robots: { index: false, follow: false } };

// One person (EP Ops 2, step 5): the old Faculty, Teacher profiles and Hours pages as one record. Overview, Profile and headshot (the
// profile editor, review and headshot crops), Invitations and onboarding (their invitations, the invitation form, their onboarding as
// they will see it), Hours (their own, or for a director the person's hours and requests), Access (who they are on the Team tab).
// The id is the person's email, as everywhere else. Each tab keeps the role check its old page had.
const first = v => (Array.isArray(v) ? v[0] : v) || '';
const short = d => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
const TABS = [['overview', 'Overview'], ['profile', 'Profile and headshot'], ['invitations', 'Invitations and onboarding'], ['hours', 'Hours'], ['access', 'Access']];

export default async function PersonPage({ params, searchParams }) {
  const email = decodeURIComponent((await params).id).trim().toLowerCase(), sp = (await searchParams) || {};
  const user = await opsUser(isStaff);
  const manage = canEditEvents(user), editEmail = canEditEmail(user), me = String(user.email).toLowerCase(), self = email === me;
  const [team, tdir, invites, everyone] = await Promise.all([
    loadTeam().catch(() => []), directory({ fresh: false }).catch(() => []),
    manage ? loadInvites().catch(() => []) : [], manage ? teamRows().catch(() => []) : [],
  ]);
  const m = team.find(x => x.email === email), off = !m && everyone.find(x => x.email === email && !x.active), t = tdir.find(x => x.email === email);
  if (!m && !t && !off) return (
    <Shell user={user} current="people" title="We can’t find that person">
      <p className="ops-empty">They may not be on the team or on any session yet. <a href="/ops/people">Back to everyone</a>.</p>
    </Shell>);

  const requests = user.director && clockAvailable() ? await pendingRequests().catch(() => []) : [];
  const row = peopleRows({ team: m ? [m] : [], tdir: t ? [t] : [], invites, requests }).find(r => r.email === email)
    || { email, name: off.name, kind: String(off.type).toLowerCase() === 'teacher' ? 'Faculty' : 'Staff', detail: '', roles: off.roles || '', needs: [], t: null };
  const name = row.name, faculty = row.kind === 'Faculty', teacherType = String(m?.type || off?.type).toLowerCase() === 'teacher';
  const mine = invites.filter(i => String(i.email).toLowerCase() === email);
  const showHours = !!m && !m.director && !teacherType && ((self && !user.director) || (user.director && !self));
  const tabs = TABS.filter(([k]) => k === 'overview' || (k === 'profile' && (faculty || t?.has_profile)) || (k === 'invitations' && manage && (faculty || mine.length))
    || (k === 'hours' && showHours) || (k === 'access' && manage && (m || off)));
  const tab = tabs.some(x => x[0] === first(sp.tab)) ? first(sp.tab) : 'overview';
  const base = personHref(email);
  const typeLabel = (TYPES.find(x => x.value === String(m?.type || off?.type).toLowerCase()) || {}).label || (m?.director ? 'Director' : 'Staff');

  const crumb = <nav className="ops-crumb" aria-label="Breadcrumb"><a href="/ops/people">People</a><span aria-hidden="true">/</span><span>{faculty ? 'Faculty' : 'Staff'}</span></nav>;
  const head = tabs.length > 1 && (
    <nav className="ops-filters" aria-label="Person tabs">
      {tabs.map(([k, label]) => <a key={k} href={k === 'overview' ? base : `${base}?tab=${k}`} aria-current={k === tab ? 'page' : undefined}>{label}{k === 'overview' && row.needs.length > 0 ? <span className="n">{row.needs.length}</span> : null}</a>)}
    </nav>);
  const desc = [row.roles, email].filter(Boolean).join(' · ');

  let body = null;
  if (tab === 'overview') body = await Overview({ row, email, t, m, off, mine, manage, base, typeLabel, faculty, self });
  else if (tab === 'profile') body = (
    <div className="ops-wsp" id="profile">
      {t?.has_profile ? <Profile email={email} embedded />
        : <section className="pg-card"><div className="pg-card-head"><h2>No profile yet</h2></div>
          <p className="ops-empty">{name} doesn’t have a bio or headshot on file. {editEmail && email ? 'Start one here, or they can send their own through onboarding.' : 'They can send their own through onboarding.'}</p>
          {editEmail && email && <StartProfile email={email} name={name} />}</section>}
    </div>);
  else if (tab === 'invitations') body = await Invitations({ email, name, mine });
  else if (tab === 'hours') body = await Hours({ user, m, self, month: monthOf(sp), name, email });
  else if (tab === 'access') body = (
    <div className="ops-wsp">
      <section className="pg-card" aria-label="Access">
        <div className="pg-card-head"><h2>{off ? 'Taken off the team' : 'On the team'}</h2></div>
        <dl className="pg-dl">
          <dt>They are</dt><dd>{typeLabel}</dd>
          <dt>Roles in Ops</dt><dd>{row.roles || '—'}</dd>
          <dt>Email</dt><dd><a href={`mailto:${email}`}>{email}</a></dd>
          {(m?.time_zone || m?.timezone || m?.tz) && <><dt>Time zone</dt><dd>{m.time_zone || m.timezone || m.tz}</dd></>}
        </dl>
        <p className="ops-meta">Who can sign in, and as what, comes from the Team tab. Taking someone off means they can no longer sign in; nothing is deleted and they can be brought back.</p>
        <PersonActions email={email} name={name} active={!off} teacher={teacherType} self={self} />
      </section>
    </div>);

  return (
    <Shell user={user} current="people" eyebrow={crumb} titleEl={<h1 className="ops-name">{name}</h1>} desc={desc} head={head}>
      {body}
    </Shell>);
}

async function Overview({ row, email, t, m, off, mine, manage, base, typeLabel, faculty, self }) {
  const today = todayET(), cal = faculty || t?.upcoming || t?.taught ? await loadCalendar().catch(() => []) : [];
  const sess = sessionsFor(cal, email, row.name), coming = sess.filter(e => e.date >= today).sort((a, b) => a.date.localeCompare(b.date));
  const open = mine.filter(i => i.status === 'sent').length;
  const tiles = [
    ...(faculty || coming.length || sess.length ? [{ l: faculty ? 'Coming up' : 'Hosting', n: coming.length, c: coming.length ? `next ${short(coming[0].date)}` : 'nothing scheduled' }, { l: 'Taught so far', n: sess.length - coming.length, c: 'sessions' }] : []),
    { l: 'Needs a look', n: row.needs.length, c: row.needs.length ? 'see below' : 'all clear', late: row.needs.length > 0 },
    ...(manage && faculty ? [{ l: 'Invitations waiting', n: open, c: mine.length ? `${mine.length} in all` : 'none yet' }] : []),
  ];
  return (
    <div className="ops-wsp">
      <div className="ops-tiles pp-tiles" role="list">
        {tiles.map(c => <div key={c.l} role="listitem" className={`ops-tile${c.late ? ' late' : ''}`}><span className="l">{c.l}</span><span className="n">{c.n}</span><span className="l sub">{c.c || ' '}</span></div>)}
      </div>
      <div className="pg-two">
        <section className="pg-card" aria-label="What they need">
          <div className="pg-card-head"><h2>What they need</h2></div>
          {row.needs.length === 0 ? <p className="ops-empty">Nothing waiting.</p> : (
            <ul className="pg-ready">{row.needs.map(n => <li key={n.key}><span>{n.text}</span>{n.href ? <a href={n.href}>Open</a> : null}</li>)}</ul>)}
        </section>
        <section className="pg-card" aria-label="Who they are">
          <div className="pg-card-head"><h2>{off ? 'Taken off the team' : 'Who they are'}</h2></div>
          <dl className="pg-dl">
            <dt>Kind</dt><dd>{faculty ? 'Faculty' : 'Staff'}{row.detail ? ` · ${row.detail}` : ''}</dd>
            {(m || off) && <><dt>On the team as</dt><dd>{typeLabel}</dd></>}
            <dt>Roles in Ops</dt><dd>{row.roles || '—'}</dd>
            <dt>Email</dt><dd><a href={`mailto:${email}`}>{email}</a></dd>
            {t?.has_profile && <><dt>Profile</dt><dd>{t.state}{t.status ? ` · ${t.status}` : ''}</dd></>}
            {faculty && manage && <><dt>Onboarding</dt><dd>{t?.onboarded ? 'Finished' : m && !m.welcomed_on ? 'Not opened yet' : 'Not finished'}</dd></>}
          </dl>
        </section>
      </div>
      {coming.length > 0 && (
        <section className="pg-card" aria-label="Coming up">
          <div className="pg-card-head"><h2>Coming up</h2><a href="/ops/programs">Open Programs</a></div>
          <ul className="pg-ready">{coming.slice(0, 8).map(e => <li key={(e.sched_id || e.id) + e.date}><span><b>{e.title}</b></span><span className="pg-gap">{short(e.date)}</span></li>)}</ul>
        </section>)}
    </div>);
}

// Invitations and onboarding: their invitations (invite them to something), and their onboarding as they will see it
async function Invitations({ email, name, mine }) {
  const [templates, offs] = await Promise.all([loadTemplates(), offerings().catch(() => [])]);
  return (
    <div className="ops-wsp">
      <div className="pg-two">
        <section className="pg-card" aria-label="Their invitations">
          <div className="pg-card-head"><h2>Invitations</h2><a href="/ops/people?view=invitations">Everyone’s invitations</a></div>
          <InviteList list={newestFirst(mine)} empty={`${name} hasn’t been invited to anything yet.`} />
        </section>
        <section className="pg-card" aria-label="Invite them">
          <div className="pg-card-head"><h2>Invite to a program</h2></div>
          <InviteForm offerings={offs} templates={templates.map(x => x.name)} kinds={KINDS} units={FEE_UNITS} prefill={{ name, email }} />
        </section>
      </div>
      <section className="pg-card" aria-label="Their onboarding">
        <div className="pg-card-head"><h2>Their onboarding</h2></div>
        <p className="ops-meta">See it exactly as {name.split(' ')[0] || 'they'} will, adjust the words, then send the invitation.</p>
        <OnboardingStudio initial={email} />
      </section>
    </div>);
}

// Hours: your own, or (directors) this person's this month and any request waiting on a yes
async function Hours({ user, m, self, month, name, email }) {
  if (!clockAvailable()) return <div className="ops-wsp">{noClock()}</div>;
  if (self && !user.director) {
    const st = await statusFor(user, month);
    return <div className="ops-wsp"><p className="ops-meta">{monthName(month)}</p><MyHours st={st} month={month} /></div>;
  }
  const [rows, reqs] = await Promise.all([teamHours(await loadTeam().catch(() => []), month), pendingRequests()]);
  return <div className="ops-wsp"><p className="ops-meta">{monthName(month)} · <a href="/ops/people?view=hours">Everyone’s hours</a></p><PersonHours row={rows.find(r => r.email === email)} req={reqs.find(r => r.email === email)} name={name} /></div>;
}
