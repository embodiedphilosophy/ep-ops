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
// The same three people edit the website content (Content → Website)
export const canEditSite = u => canEditEvents(u);
export const canEditEvents = u => !!u && (u.director || ['manager', 'projects'].includes(String(u.type || '').toLowerCase()));

// The sidebar, in sections by what people come to do. group 'more' sits under a divider (set-up and
// rarely used pages). Settings is every sheet-backed table in one place.
const ITEMS = [
  { key: 'home', href: '/ops', label: 'Today', who: () => true },
  { key: 'events', href: '/ops/events', label: 'Programming', section: 'Programs', who: () => true },
  { key: 'tasks', href: '/ops/tasks', label: 'Tasks', section: 'Programs', who: isStaff },
  { key: 'team', href: '/ops/team', label: 'Faculty', section: 'People', who: isStaff },
  { key: 'hours', href: '/ops/hours', label: 'Hours', section: 'People', who: isStaff },
  { key: 'content', href: '/ops/content', label: 'Content', section: 'Publishing', who: isStaff },
  { key: 'library', href: '/ops/library', label: 'Course Library', section: 'Publishing', who: u => canEditSite(u) },
  { key: 'landing', href: '/ops/landing', label: 'Landing Pages', section: 'Publishing', who: isStaff },
  { key: 'youtube', href: '/ops/youtube', label: 'YouTube', section: 'Publishing', who: u => canYouTube(u) },
  // Social is its own workspace (the Content & Social v2 design): one section of the sidebar, a page for each job
  { key: 'social', href: '/ops/social', label: 'Calendar', section: 'Social', who: isStaff },
  { key: 'social-compose', href: '/ops/social/compose', label: 'Composer', section: 'Social', who: isStaff },
  { key: 'social-library', href: '/ops/social/library', label: 'Library', section: 'Social', who: isStaff },
  { key: 'social-review', href: '/ops/social/review', label: 'Review & approve', section: 'Social', who: isStaff },
  { key: 'social-sources', href: '/ops/social/sources', label: 'Sources · Quotes & Captions', section: 'Social', who: isStaff },
  { key: 'social-published', href: '/ops/social/published', label: 'Published & insights', section: 'Social', who: isStaff },
  { key: 'social-rules', href: '/ops/social/rules', label: 'Rules', section: 'Social', who: u => !!u?.director },
  { key: 'content-email', href: '/ops/content?tab=email', label: 'Email', section: 'Also in Content', who: isStaff },
  { key: 'content-media', href: '/ops/content?tab=media', label: 'Media', section: 'Also in Content', who: isStaff },
  { key: 'content-review', href: '/ops/content?tab=review', label: 'Site copy review', section: 'Also in Content', who: u => canEditSite(u) },
  { key: 'support', href: '/ops/support', label: 'Support', section: 'Students', who: u => canSupport(u) },
  { key: 'insights', href: '/ops/insights', label: 'Finance', section: 'Business', who: u => !!u?.director },
  { key: 'search', href: '/ops/search', label: 'Search', who: () => true, group: 'more' },
  { key: 'ce', href: '/ops/ce', label: 'CE credits', who: u => canEditSite(u), group: 'more' },
  { key: 'mentee-year', href: '/ops/mentee-year', label: 'Mentee year', section: 'Students', who: isStaff },
  { key: 'settings', href: '/ops/settings', label: 'Settings', who: u => canEditSite(u), group: 'more' },
];

// Support desk (Zendesk tickets + the EP Support KB): directors, managers, and anyone with a customer/support role
export const canSupport = u => !!u && (u.director || ['manager', 'projects'].includes(String(u.type || '').toLowerCase())
  || (u.roles || []).some(r => /customer|support|happiness/i.test(r)));

// YouTube (Vimeo → YouTube cuts): directors and anyone with the Media or YouTube role (Jacob, Rebecka)
export const canYouTube = u => !!u && (u.director || (u.roles || []).some(r => /^(media|youtube)$/i.test(r)));

export const navFor = u => ITEMS.filter(i => i.who(u));
