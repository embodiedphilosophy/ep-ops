// Every old /ops address and where it lives now (EP Ops 2). One shared table: next.config.mjs serves it as redirects (before any page
// runs) and scripts/ops-test/links.cjs visits every row. Query strings are kept (?show=, ?id=, ?event=, ?row=, ?s= ...): Next appends
// the incoming query to the destination. These are temporary (307) redirects, so a browser never caches a wrong turn while the
// reorganisation is still landing; they can be made permanent at the end.
// ?view= names a view (tab) inside a place: see VIEWS in lib/ops/nav.js and LOADERS in app/ops/place.js.
const tab = (value, key = 'tab') => [{ type: 'query', key, value }];
export const REDIRECTS = [
  // Programs
  // One program is its own page: /ops/events?event=E047 (a session or a program's key) opens it. Past/Cancelled/Done (?show=) stay lists.
  { source: '/ops/events', has: tab('(?<event>.+)', 'event'), missing: [{ type: 'query', key: 'show' }], destination: '/ops/programs/:event' },
  { source: '/ops/programs', has: tab('(?<event>.+)', 'event'), missing: [{ type: 'query', key: 'show' }], destination: '/ops/programs/:event' },
  { source: '/ops/events', destination: '/ops/programs' },
  { source: '/ops/email/launches', destination: '/ops/programs?view=launches' },
  { source: '/ops/library', destination: '/ops/programs?view=library' },
  { source: '/ops/library/:id', destination: '/ops/programs/library/:id' },
  { source: '/ops/landing', destination: '/ops/programs?view=landing' },
  { source: '/ops/email/media', destination: '/ops/programs?view=recordings' },
  { source: '/ops/social/campaigns', destination: '/ops/programs?view=launches#coming-up' }, // Coming up & campaigns now lives on Launches
  // People (one directory, one record per person: /ops/people/[id], the id is the person's email)
  { source: '/ops/email/teachers', has: tab('(?<email>.+)', 'email'), destination: '/ops/people/:email?tab=profile' },
  { source: '/ops/team', has: tab('onboarding'), destination: '/ops/people?view=onboarding' }, // ?email= is kept: the picker opens on that teacher
  { source: '/ops/team', destination: '/ops/people' },
  { source: '/ops/email/teachers', destination: '/ops/people?needs=profile' },
  { source: '/ops/hours', destination: '/ops/people?view=hours' },
  // Publish
  { source: '/ops/social', destination: '/ops/publish' },
  { source: '/ops/social/this-week', destination: '/ops/publish?view=this-week' },
  { source: '/ops/social/library', destination: '/ops/publish?view=library' },
  { source: '/ops/social/review', destination: '/ops/publish?view=review' },
  { source: '/ops/social/published', destination: '/ops/publish?view=published' },
  { source: '/ops/social/compose', destination: '/ops/publish?view=compose' },
  { source: '/ops/social/sources', destination: '/ops/publish?view=library&s=sources' },
  { source: '/ops/email', destination: '/ops/publish?view=week' },
  { source: '/ops/email/emails', destination: '/ops/publish?view=email' },
  { source: '/ops/email/calendar', destination: '/ops/publish?show=email' },
  { source: '/ops/email/edit', destination: '/ops/publish?view=compose&kind=email' },
  { source: '/ops/email/newsletter', destination: '/ops/publish?view=newsletter' },
  { source: '/ops/youtube', destination: '/ops/publish?view=video' },
  // Students
  { source: '/ops/support', destination: '/ops/students?view=support' },
  { source: '/ops/mentee-year', destination: '/ops/students?view=mentee' },
  { source: '/ops/one-to-ones', destination: '/ops/students?view=one-to-ones' },
  { source: '/ops/settings/pods', destination: '/ops/students?view=pods' },
  { source: '/ops/settings/polls', destination: '/ops/students?view=mentee&tab=surveys' },
  { source: '/ops/settings/partners', destination: '/ops/students?view=mentee&tab=partners' },
  { source: '/ops/ce', destination: '/ops/students?view=ce' },
  // Business: Insights is Finance; its Funnel block is Audience (an address with ?f=, the funnel's period, opens Audience)
  { source: '/ops/insights', has: tab('(?<period>.+)', 'f'), destination: '/ops/business?view=audience' },
  { source: '/ops/insights', destination: '/ops/business?view=finance' },
  { source: '/ops/payroll', destination: '/ops/business?view=payroll' },
  // Settings: four groups (Team and roles, Templates, Website copy, Connections and jobs); ?s= names the section. /ops/settings itself stays:
  // its older ?t=<table> and ?view=tables | social-rules | reminders addresses are read by the page (app/ops/place.js, lib/ops/settingsgroups.js)
  { source: '/ops/social/team', destination: '/ops/settings?view=team&s=signoffs' },
  { source: '/ops/social/rules', destination: '/ops/settings?view=templates&s=social-rules' },
  { source: '/ops/email/reminders', destination: '/ops/settings?view=templates&s=reminders' },
  // The older stubs, pointed straight at the final address (no link goes through two redirects)
  // /ops/admin and /ops/content?tab=social|website choose their target from the query, so their pages do the redirect themselves
  { source: '/ops/content', has: tab('email'), destination: '/ops/publish?view=promo' },
  { source: '/ops/content', has: tab('media'), destination: '/ops/programs?view=recordings' },
  { source: '/ops/content', has: tab('review'), destination: '/ops/people?view=review' },
  { source: '/ops/content', missing: [{ type: 'query', key: 'tab' }], destination: '/ops/publish' },
];
// next.config shape: every entry a temporary redirect
export const nextRedirects = () => REDIRECTS.map(r => ({ ...r, permanent: false }));
