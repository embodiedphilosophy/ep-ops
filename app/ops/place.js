import { redirect } from 'next/navigation';
import Shell from './Shell';
import { currentUser } from '@/lib/ops/auth';
import { viewsFor, canSupport, canEditSite } from '@/lib/ops/nav';
import { oldSettingsAddress } from '@/lib/ops/settingsgroups';

// One of the nine places. A place is a page with views (tabs); each view shows what the old page showed, using that page's own
// components, data and API calls (the old page runs and its content is placed inside the one shared shell). Nothing is re-implemented.
// Settings: the four groups are one page given the group's name (app/ops/settings/Group.js)
const group = g => async () => { const { default: Group } = await import('./settings/Group'); return { default: p => Group({ group: g, ...p }) }; };
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
    overview: () => import('./students/Overview'), support: () => import('./students/SupportView'), mentee: () => import('./students/MenteeView'),
    pods: () => import('./students/PodsView'), 'one-to-ones': () => import('./students/OneToOnesView'), ce: () => import('./students/CeView'),
  },
  ads: { campaigns: () => import('./ads/CampaignsView'), creative: () => import('./ads/CreativeView'), library: () => import('./ads/LibraryView'), safety: () => import('./ads/SafetyView'), insights: () => import('./ads/InsightsView') },
  business: { finance: () => import('./business/FinanceView'), payroll: () => import('./business/PayrollView') },
  settings: { team: group('team'), templates: group('templates'), website: group('website'), connections: group('connections') },
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
  // Settings: the older ?t=<table> and ?view=tables | team | social-rules | reminders addresses open the right group and section
  if (place === 'settings') { const o = oldSettingsAddress(sp); if (o) return { view: o.view || '', sp: { ...sp, ...o } }; }
  // Students: the older Surveys and Partners views are tabs of the Mentee year (the old Settings pages)
  if (place === 'students' && (v === 'polls' || v === 'partners')) return { view: 'mentee', sp: { ...sp, view: 'mentee', tab: v === 'polls' ? 'surveys' : 'partners' } };
  return { view: v, sp };
}
// Which view an address with no ?view= opens: the first the role may see, except that someone whose work here is only Support (Ichha) opens on Support
// (Settings: a director opens on Templates, as the old All settings did; others on Website copy if they edit the site, else their first group)
const defaultView = (place, user, views) => (place === 'students' && canSupport(user) && !canEditSite(user) && views.find(v => v.key === 'support'))
  || (place === 'settings' && (user.director ? views.find(v => v.key === 'templates') : views.find(v => v.key === 'website'))) || views[0];
// What the old page needs as its `params` (the social sections were one page with a section name)
const paramsFor = (place, view, sp, extra) => (place === 'publish' && (view === 'library' || view === 'published')) ? { section: view }
  : extra || {};

export async function renderPlace(place, { searchParams, params } = {}) {
  const sp0 = (await searchParams) || {}, user = await currentUser();
  if (!user) redirect('/ops/login');
  const views = viewsFor(place, user);
  if (!views.length) redirect('/ops');
  const { view: want, sp } = wanted(place, sp0);
  const home = defaultView(place, user, views), view = views.find(v => v.key === want) || home;
  const mod = await LOADERS[place][view.key]();
  const props = { searchParams: Promise.resolve(sp), params: Promise.resolve(paramsFor(place, view.key, sp, await params)) };
  // the old pages that read ?tab= for their own tabs keep working: the Promo emails view is the Content page's email tab
  if (place === 'publish' && view.key === 'promo') props.searchParams = Promise.resolve({ ...sp, tab: 'email' });
  const el = await mod.default(props);
  const qs = o => new URLSearchParams(Object.entries(o).filter(([, v]) => v)).toString();
  const tabs = views.length > 1 && (
    <nav className="ops-filters" aria-label={`${place} views`}>
      {views.map(v => <a key={v.key} href={`/ops/${place}${v === home ? '' : `?${qs({ view: v.key })}`}`} aria-current={v.key === view.key ? 'page' : undefined}>{v.label}</a>)}
    </nav>);
  // Unwrap: the old page returned <Shell ...>content</Shell>. Keep its content, title and own header actions; the place's tabs go in the
  // header's fixed tab row, so they sit in the same spot on every view
  if (el?.type === Shell) {
    const p = el.props;
    return <Shell {...p} current={place} tabs={tabs || undefined}>{p.children}</Shell>;
  }
  return el;
}
