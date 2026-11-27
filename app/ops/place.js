import { redirect } from 'next/navigation';
import Shell from './Shell';
import { currentUser } from '@/lib/ops/auth';
import { viewsFor } from '@/lib/ops/nav';

// One of the eight places. A place is a page with views (tabs); each view shows what the old page showed, using that page's own
// components, data and API calls (the old page runs and its content is placed inside the one shared shell). Nothing is re-implemented.
const LOADERS = {
  programs: {
    index: () => import('./programs/Index'), launches: () => import('./programs/LaunchesView'),
    library: () => import('./programs/Library'), landing: () => import('./programs/Landing'), recordings: () => import('./programs/Recordings'),
  },
  people: { directory: () => import('./people/Directory'), invitations: () => import('./people/InvitationsView'), onboarding: () => import('./people/OnboardingView'), review: () => import('./people/ReviewView'), hours: () => import('./people/Hours') },
  publish: {
    calendar: () => import('./publish/CalendarView'), compose: () => import('./publish/ComposeView'), review: () => import('./publish/ReviewView'),
    library: () => import('./publish/LibraryView'), published: () => import('./publish/LibraryView'), email: () => import('./publish/EmailsView'),
    week: () => import('./publish/WeekView'), 'this-week': () => import('./publish/ThisWeekView'), newsletter: () => import('./publish/NewsletterView'),
    promo: () => import('./content/page'), reminders: () => import('./publish/RemindersView'), video: () => import('./publish/VideoView'),
  },
  students: {
    support: () => import('./support/page'), mentee: () => import('./mentee-year/page'), 'one-to-ones': () => import('./one-to-ones/page'), pods: () => import('./settings/pods/page'),
    polls: () => import('./settings/polls/page'), partners: () => import('./settings/partners/page'), ce: () => import('./ce/page'),
  },
  business: { finance: () => import('./insights/page'), payroll: () => import('./payroll/page') },
  settings: { tables: () => import('./settings/Tables'), team: () => import('./social/team/page'), 'social-rules': () => import('./publish/LibraryView'), reminders: () => import('./email/reminders/page') },
};
const first = v => (Array.isArray(v) ? v[0] : v) || '';

// Which view the address asks for: ?view=, or the older query strings that used to pick a page. Returns the view and the query the view's
// page should see (a few older addresses are really a view plus a setting).
function wanted(place, sp) {
  const v = first(sp.view);
  // People: the older Faculty and Teacher profiles addresses (?tab=invitations, ?tab=onboarding, ?needs=profile&tab=review). ?needs=profile
  // alone is the directory narrowed to profiles; ?email= opens that person's record (app/ops/people/page.js).
  if (place === 'people' && !v) { const t = first(sp.tab); if (t === 'invitations' || t === 'onboarding') return { view: t, sp }; if (t === 'review' && first(sp.needs) === 'profile') return { view: 'review', sp }; }
  if (place === 'publish') {
    if (!v && first(sp.tab) === 'email') return { view: 'promo', sp };
    // the older Email calendar and Email editor addresses: the calendar's Email kind, and Compose as an email
    if (v === 'email-calendar') return { view: 'calendar', sp: { ...sp, view: 'calendar', show: 'email' } };
    if (v === 'compose-email') return { view: 'compose', sp: { ...sp, view: 'compose', kind: 'email' } };
  }
  return { view: v, sp };
}
// What the old page needs as its `params` (the social sections were one page with a section name)
const paramsFor = (place, view, sp, extra) => (place === 'publish' && (view === 'library' || view === 'published')) ? { section: view }
  : (place === 'settings' && view === 'social-rules') ? { section: 'rules' } : extra || {};

export async function renderPlace(place, { searchParams, params } = {}) {
  const sp0 = (await searchParams) || {}, user = await currentUser();
  if (!user) redirect('/ops/login');
  const views = viewsFor(place, user);
  if (!views.length) redirect('/ops');
  const { view: want, sp } = wanted(place, sp0);
  const view = views.find(v => v.key === want) || views[0];
  const mod = await LOADERS[place][view.key]();
  const props = { searchParams: Promise.resolve(sp), params: Promise.resolve(paramsFor(place, view.key, sp, await params)) };
  // the old pages that read ?tab= for their own tabs keep working: the Promo emails view is the Content page's email tab
  if (place === 'publish' && view.key === 'promo') props.searchParams = Promise.resolve({ ...sp, tab: 'email' });
  const el = await mod.default(props);
  const qs = o => new URLSearchParams(Object.entries(o).filter(([, v]) => v)).toString();
  const tabs = views.length > 1 && (
    <nav className="ops-filters" aria-label={`${place} views`}>
      {views.map(v => <a key={v.key} href={`/ops/${place}${v === views[0] ? '' : `?${qs({ view: v.key })}`}`} aria-current={v.key === view.key ? 'page' : undefined}>{v.label}</a>)}
    </nav>);
  // Unwrap: the old page returned <Shell ...>content</Shell>. Keep its content, title and own header tabs inside the one shell.
  if (el?.type === Shell) {
    const p = el.props;
    return <Shell {...p} current={place} head={<>{tabs}{p.head}</>}>{p.children}</Shell>;
  }
  return el;
}
