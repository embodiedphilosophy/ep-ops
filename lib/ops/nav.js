// The sidebar is light (EP Ops 2, board 22). 'pine' gives the solid Pine one: it adds one class to the shell.
export const SIDEBAR = 'light';

// Who sees which part of the ops dashboard. Teachers: Today and Events (plus a short People page linked
// from Today). Staff add Tasks, Publish and People. Directors add Business; directors and the two editors get Settings.
export const isTeacher = u => !u?.director && (u?.newTeacher || String(u?.type || '').toLowerCase() === 'teacher');
export const isStaff = u => !!u && !isTeacher(u);
// Who can edit events (Schedule and Event Details): directors, the general manager and the project manager
// Social posts: the editors above plus anyone with the Social role (approve, edit captions, libraries)
// Content v2 roles (Team tab → roles): Editor, Approver, Creator, Publisher, plus the older Social role.
const hasRole = (u, re) => (u?.roles || []).some(r => re.test(String(r).trim()));
export const canEditSocial = u => canEditEvents(u) || hasRole(u, /^(social|editor|creator|publisher|approver)$/i);
// Approve posts / override a flag: directors and editors, and the Approver role (Stephanie)
export const canApproveSocial = u => canEditEvents(u) || hasRole(u, /^(social|editor|approver)$/i);
// Schedule and publish: everyone who can approve, plus the Publisher role (Carolyn)
export const canPublishSocial = u => canApproveSocial(u) || hasRole(u, /^publisher$/i);
// Delete a Proposed post: its author, or anyone who schedules or approves (the Publisher manages the week's list)
export const canDeleteSocial = (u, createdBy = '') => canPublishSocial(u) || (!!createdBy && [u?.name, u?.email].some(x => x && String(x).toLowerCase() === String(createdBy).toLowerCase()));
// Teachers & Email: the editors above plus anyone on Marketing, Media or Social (Rebecka)
// Payroll: directors, and anyone a director gives the Payroll role (Payroll → Settings → Who can see payroll)
export const canPayroll = u => !!u?.director || hasRole(u, /^payroll$/i);
// Ads (Meta campaigns): directors and anyone with the Ads role on the Team tab (Jacob, Rebecka). Nobody else, whatever else they can edit.
export const canAds = u => !!u?.director || hasRole(u, /^ads$/i);
export const canEditEmail = u => canEditEvents(u) || hasRole(u, /^(marketing|media|social)$/i);
// The same three people edit the website content (Content → Website)
export const canEditSite = u => canEditEvents(u);
export const canEditEvents = u => !!u && (u.director || ['manager', 'projects'].includes(String(u.type || '').toLowerCase()));

// The sidebar: nine places (the eight of EP Ops 2, and Ads for those who may see it) (EP Ops 2). Sub-pages are views (tabs) inside a place, not sidebar entries. Each place and
// each view keeps the role check its old page had. group 'more' sits under a divider.
const ITEMS = [
  { key: 'home', href: '/ops', label: 'Today', who: () => true },
  { key: 'programs', href: '/ops/programs', label: 'Programs', who: () => true }, // teachers see their own sessions here
  { key: 'tasks', href: '/ops/tasks', label: 'Tasks', who: isStaff },
  { key: 'people', href: '/ops/people', label: 'People', who: isStaff },
  { key: 'publish', href: '/ops/publish', label: 'Publish', who: isStaff },
  { key: 'ads', href: '/ops/ads', label: 'Ads', who: u => isStaff(u) && canAds(u) },
  { key: 'students', href: '/ops/students', label: 'Students', who: u => isStaff(u) },
  { key: 'business', href: '/ops/business', label: 'Business', who: u => !!u?.director || canPayroll(u) },
  { key: 'settings', href: '/ops/settings', label: 'Settings', who: u => canEditSite(u), group: 'more' },
];

// Which place an old page's `current` key belongs to (so a page that still names itself lights the right place)
const PLACE_PREFIX = [[/^(events|email-launches|library|landing|email-media|programs)/, 'programs'], [/^(team|email-teachers|hours|people)/, 'people'],
  [/^(social-rules|social-team|settings|email-reminders)/, 'settings'], [/^(social|email|youtube|content|publish)/, 'publish'],
  [/^(support|mentee-year|ce|one-to-ones|students)/, 'students'], [/^(insights|payroll|business)/, 'business'], [/^ads/, 'ads'], [/^tasks/, 'tasks'], [/^home/, 'home'], [/^search/, 'search']];
export const placeOf = key => (PLACE_PREFIX.find(([re]) => re.test(String(key || ''))) || [])[1] || String(key || '');

// The views (tabs) inside each place, in order; the first the user may see is the default. who: the old page's own rule.
export const VIEWS = {
  programs: [
    { key: 'index', label: 'Programs', who: () => true },
    { key: 'launches', label: 'Launches', who: isStaff },
    { key: 'library', label: 'Library', who: u => canEditSite(u) },
    { key: 'landing', label: 'Landing pages', who: isStaff },
    { key: 'recordings', label: 'Recordings', who: isStaff },
  ],
  // People (EP Ops 2, step 5): one directory of staff and faculty, and one record per person (/ops/people/[id]). The old Faculty,
  // Teacher profiles and Hours pages are views here or sections of the record. Invitations and Onboarding keep the old Faculty rule.
  people: [
    { key: 'directory', label: 'Directory', who: isStaff },
    { key: 'invitations', label: 'Invitations', who: canEditEvents },
    { key: 'onboarding', label: 'Onboarding', who: canEditEvents },
    { key: 'review', label: 'Bios to review', who: isStaff },
    { key: 'hours', label: 'Hours', who: isStaff },
  ],
  // Publish (EP Ops 2, step 6): one calendar for email, social, video and the automatic reminders, one Compose (email, post or video cut),
  // then Review, Library and Published (the old Social pages), and the email tools that stay as views: the Kit list, This week, the newsletter,
  // promo emails and the reminder sends. The older ?view=email-calendar and ?view=compose-email still work (app/ops/place.js).
  publish: [
    { key: 'calendar', label: 'Calendar', who: isStaff },
    { key: 'review', label: 'Review and approve', who: isStaff },
    { key: 'compose', label: 'Compose', who: isStaff },
    { key: 'library', label: 'Library', who: isStaff },
    { key: 'published', label: 'Published', who: isStaff },
    { key: 'email', label: 'Emails in Kit', who: isStaff },
    { key: 'week', label: 'This week', who: isStaff },
    { key: 'this-week', label: 'This Week at EP', who: isStaff },
    { key: 'newsletter', label: 'Newsletter', who: isStaff },
    { key: 'promo', label: 'Promo emails', who: isStaff },
    { key: 'reminders', label: 'Reminder sends', who: isStaff },
    { key: 'video', label: 'Video', who: u => canYouTube(u) },
  ],
  // Ads (Ads PR 2): Campaigns only for now. Audience library and Audience insights arrive with their own pull requests (4 and 5), with their own tabs then.
  ads: [
    { key: 'campaigns', label: 'Campaigns', who: u => canAds(u) },
  ],
  // Students (EP Ops 2, step 7): one place for the people who study with EP. Overview first; the Support desk, the Mentee year (with its
  // Surveys and Partners tabs), One-to-ones, Pods and CE credits each keep the role check their old page had (Pods, Surveys, Partners and CE:
  // those who edit the site; One-to-ones: directors). Someone whose job is only Support (Ichha) opens on Support (app/ops/place.js).
  students: [
    { key: 'overview', label: 'Overview', who: isStaff },
    { key: 'support', label: 'Support', who: u => canSupport(u) },
    { key: 'mentee', label: 'Mentee year', who: isStaff },
    { key: 'pods', label: 'Pods', who: u => canEditSite(u) },
    { key: 'one-to-ones', label: 'One-to-ones', who: u => !!u?.director },
    { key: 'ce', label: 'CE credits', who: u => canEditSite(u) },
  ],
  // Business (EP Ops 2, step 8): money. Finance and Audience (the quiz funnel) are the old Insights page, split; Payroll is the old Payroll page.
  // Finance and Audience: directors. Payroll: directors and anyone given the Payroll role.
  business: [
    { key: 'finance', label: 'Finance', who: u => !!u?.director },
    { key: 'payroll', label: 'Payroll', who: u => canPayroll(u) },
    { key: 'audience', label: 'Audience', who: u => !!u?.director },
  ],
  // Settings (EP Ops 2, step 8): four groups. Each group is a list of sections (lib/ops/settingsgroups.js holds each section's role rule: the
  // operations tables are directors only, the website tables are for those who edit the site, sign-offs and reminder rules are for staff).
  settings: [
    { key: 'team', label: 'Team and roles', who: isStaff },
    { key: 'templates', label: 'Templates', who: isStaff },
    { key: 'website', label: 'Website copy', who: u => canEditSite(u) },
    { key: 'connections', label: 'Connections and jobs', who: u => !!u?.director },
  ],
};
export const viewsFor = (place, u) => (VIEWS[place] || []).filter(v => v.who(u));

// Support desk (Zendesk tickets + the EP Support KB): directors, managers, and anyone with a customer/support role
export const canSupport = u => !!u && (u.director || ['manager', 'projects'].includes(String(u.type || '').toLowerCase())
  || (u.roles || []).some(r => /customer|support|happiness/i.test(r)));

// YouTube (Vimeo → YouTube cuts): directors and anyone with the Media or YouTube role (Jacob, Rebecka)
export const canYouTube = u => !!u && (u.director || (u.roles || []).some(r => /^(media|youtube)$/i.test(r)));

export const navFor = u => ITEMS.filter(i => i.who(u));
// The Search page is reached from the top-bar search; it is not a place.
