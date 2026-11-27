// The People directory (EP Ops 2, step 5): staff and faculty in one list, each with what they need.
// Nothing here is read from anywhere new. It puts together what the old Faculty page (the Team tab, invitations), the old Teacher
// profiles page (the Teachers tab and the calendar: lib/ops/teachers.js `directory`) and the old Hours page (pending requests) read.
// Pure functions: the page does the reading.
import { capOf } from './hours';

const lower = s => String(s || '').trim().toLowerCase();
export const personHref = (email, tab = '') => `/ops/people/${encodeURIComponent(lower(email))}${tab ? `?tab=${tab}` : ''}`;
const isTeacherType = m => lower(m?.type) === 'teacher';

// What each kind of need is called, and where it is dealt with
export const NEED_GROUP = { submission: 'profile', noprofile: 'profile', photo: 'profile', bio: 'profile', update: 'profile', onboarding: 'invitation', invite: 'invitation', hours: 'hours' };

// team: the Team tab (active people), tdir: lib/ops/teachers `directory()`, invites: Faculty Invitations,
// requests: pending extra-hours requests (directors only; [] otherwise)
export function peopleRows({ team = [], tdir = [], invites = [], requests = [] }) {
  const byEmail = new Map(tdir.filter(t => t.email).map(t => [t.email, t]));
  const seen = new Set();
  const sent = email => invites.filter(i => lower(i.email) === email && i.status === 'sent');
  const asks = email => requests.find(r => lower(r.email) === email);

  const needsOf = ({ email, t, member, faculty }) => {
    const out = [], add = (key, text, tab) => out.push({ key, group: NEED_GROUP[key], text, href: personHref(email, tab) });
    const staffProfile = !faculty && t?.has_profile; // a staff member without a profile isn't asked for one
    if (t && (faculty || staffProfile)) {
      if (t.flags.includes('submission')) add('submission', 'Bio waiting for review', 'profile');
      if (t.flags.includes('noprofile')) add('noprofile', 'No profile yet', 'profile');
      if (t.flags.includes('photo')) add('photo', 'Headshot missing', 'profile');
      if (t.flags.includes('bio')) add('bio', 'Bio missing', 'profile');
      else if (t.flags.includes('update')) add('update', 'Bio is more than a year old', 'profile');
    } else if (faculty && member && !t) add('noprofile', 'No profile yet', 'profile');
    if (faculty) {
      if (member && !member.welcomed_on && !t?.onboarded) add('onboarding', 'Hasn’t opened onboarding yet', 'invitations');
      else if (t?.has_profile && !t.onboarded && (t.upcoming > 0 || member)) add('onboarding', 'Onboarding not finished', 'invitations');
    }
    const open = sent(email);
    if (open.length) add('invite', open.length === 1 ? 'Invitation waiting for an answer' : `${open.length} invitations waiting for an answer`, 'invitations');
    const r = asks(email);
    if (r) add('hours', `Asks for ${r.hours} more hours`, 'hours');
    return out;
  };
  const nextOf = (t, faculty) => !t ? '' : t.upcoming ? `${faculty ? '' : 'Hosting '}${t.upcoming} coming up` : faculty ? 'Nothing scheduled' : '';

  const rows = [];
  for (const m of team) {
    const email = lower(m.email), t = byEmail.get(email), faculty = isTeacherType(m);
    seen.add(email);
    const cap = capOf(m);
    rows.push({
      id: email, email, name: m.name, kind: faculty ? 'Faculty' : 'Staff', member: true, director: !!m.director,
      detail: [faculty ? '' : t?.upcoming ? 'hosts sessions' : '', !faculty && cap ? 'hourly' : ''].filter(Boolean).join(', '),
      roles: [m.director ? 'Director' : '', ...(m.roles || [])].filter((r, i, a) => r && a.indexOf(r) === i).join(', '),
      next: nextOf(t, faculty), t, needs: needsOf({ email, t, member: m, faculty }),
      invited: sent(email).length > 0, photo: t?.photo_url || '',
    });
  }
  for (const t of tdir) {
    if (t.email && seen.has(t.email)) continue;
    const email = t.email;
    rows.push({
      id: email, email, name: t.preferred_name || t.name, kind: 'Faculty', member: false, director: false, detail: 'guest', roles: t.role || '',
      next: nextOf(t, true), t, needs: email ? needsOf({ email, t, member: null, faculty: true }) : [{ key: 'noemail', group: 'profile', text: 'No email on the schedule', href: '' }],
      invited: email ? sent(email).length > 0 : false, photo: t.photo_url || '', hidden: !!t.hidden, test: !!t.test,
    });
  }
  const rank = r => (r.kind === 'Staff' ? 0 : 1);
  return rows.sort((a, b) => rank(a) - rank(b) || (a.kind === 'Staff' ? (b.director - a.director) : ((b.t?.upcoming > 0) - (a.t?.upcoming > 0))) || a.name.localeCompare(b.name));
}

// The chips: All, Staff, Faculty, Invited, Needs something (and Hidden, for the people who can bring profiles back)
export const SHOWS = [['all', 'All'], ['staff', 'Staff'], ['faculty', 'Faculty'], ['invited', 'Invited'], ['needs', 'Needs something']];
export function filterRows(rows, { show = 'all', q = '', profile = false } = {}) {
  const hit = (r, s) => `${r.name} ${r.email} ${r.roles} ${r.kind}`.toLowerCase().includes(s);
  const needle = lower(q);
  return rows.filter(r => {
    if (show === 'hidden') return r.hidden;
    if (r.hidden) return false;
    if (show === 'staff' && r.kind !== 'Staff') return false;
    if (show === 'faculty' && r.kind !== 'Faculty') return false;
    if (show === 'invited' && !r.invited) return false;
    if (show === 'needs' && !(profile ? r.needs.some(n => n.group === 'profile') : r.needs.length)) return false;
    return !needle || hit(r, needle);
  });
}
