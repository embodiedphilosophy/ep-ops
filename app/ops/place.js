import { redirect } from 'next/navigation';
import Shell from './Shell';
import { currentUser } from '@/lib/ops/auth';
import { viewsFor } from '@/lib/ops/nav';

// One of the eight places. A place is a page with views (tabs); each view shows what the old page showed, using that page's own
// components, data and API calls (the old page runs and its content is placed inside the one shared shell). Nothing is re-implemented.
const LOADERS = {
  programs: {
    index: () => import('./events/page'), launches: () => import('./email/launches/page'),
    library: () => import('./library/page'), landing: () => import('./landing/page'), recordings: () => import('./email/media/page'),
  },
  people: { faculty: () => import('./team/page'), profiles: () => import('./email/teachers/page'), hours: () => import('./hours/page') },
  publish: {
    calendar: () => import('./social/page'), week: () => import('./email/page'), email: () => import('./email/emails/page'), 'email-calendar': () => import('./email/calendar/page'),
    compose: () => import('./social/compose/page'), 'compose-email': () => import('./email/edit/page'), 'this-week': () => import('./social/this-week/page'),
    review: () => import('./social/review/page'), library: () => import('./social/[section]/page'), published: () => import('./social/[section]/page'),
    newsletter: () => import('./email/newsletter/page'), promo: () => import('./content/page'), video: () => import('./youtube/page'),
  },
  students: {
    support: () => import('./support/page'), mentee: () => import('./mentee-year/page'), 'one-to-ones': () => import('./one-to-ones/page'), pods: () => import('./settings/pods/page'),
    polls: () => import('./settings/polls/page'), partners: () => import('./settings/partners/page'), ce: () => import('./ce/page'),
  },
  business: { finance: () => import('./insights/page'), payroll: () => import('./payroll/page') },
  settings: { tables: () => import('./settings/Tables'), team: () => import('./social/team/page'), 'social-rules': () => import('./social/[section]/page'), reminders: () => import('./email/reminders/page') },
};
const first = v => (Array.isArray(v) ? v[0] : v) || '';

// Which view the address asks for: ?view=, or the older query strings that used to pick a page
function wanted(place, sp) {
  const v = first(sp.view);
  if (place === 'people' && !v && (first(sp.needs) === 'profile' || first(sp.email))) return 'profiles';
  if (place === 'publish' && !v && first(sp.tab) === 'email') return 'promo';
  return v;
}
// What the old page needs as its `params` (the social sections were one page with a section name)
const paramsFor = (place, view, sp, extra) => (place === 'publish' && (view === 'library' || view === 'published')) ? { section: view }
  : (place === 'settings' && view === 'social-rules') ? { section: 'rules' } : extra || {};

export async function renderPlace(place, { searchParams, params } = {}) {
  const sp = (await searchParams) || {}, user = await currentUser();
  if (!user) redirect('/ops/login');
  const views = viewsFor(place, user);
  if (!views.length) redirect('/ops');
  const want = wanted(place, sp), key = want === 'compose-email' ? 'compose' : want; // the email editor is the Compose view, as an email
  const view = views.find(v => v.key === key) || views[0], load = want === 'compose-email' ? 'compose-email' : view.key;
  const mod = await (LOADERS[place]?.[load] || LOADERS[place]?.[view.key])();
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
