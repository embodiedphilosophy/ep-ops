// Who sees which part of the ops dashboard. Teachers: Today and Events (plus a short People page linked
// from Today). Staff add Tasks, Publish and People. Directors add Business; directors and the two editors get Settings.
export const isTeacher = u => !u?.director && (u?.newTeacher || String(u?.type || '').toLowerCase() === 'teacher');
export const isStaff = u => !!u && !isTeacher(u);
// Who can edit events (Schedule and Event Details): directors, the general manager and the project manager
// Social posts: the editors above plus anyone with the Social role (approve, edit captions, libraries)
export const canEditSocial = u => canEditEvents(u) || (u?.roles || []).some(r => /^social$/i.test(r));
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
  { key: 'support', href: '/ops/support', label: 'Support', section: 'Students', who: u => canSupport(u) },
  { key: 'insights', href: '/ops/insights', label: 'Finance', section: 'Business', who: u => !!u?.director },
  { key: 'search', href: '/ops/search', label: 'Search', who: () => true, group: 'more' },
  { key: 'ce', href: '/ops/ce', label: 'CE credits', who: u => canEditSite(u), group: 'more' },
  { key: 'settings', href: '/ops/settings', label: 'Settings', who: u => canEditSite(u), group: 'more' },
];

// Support desk (Zendesk tickets + the EP Support KB): directors, managers, and anyone with a customer/support role
export const canSupport = u => !!u && (u.director || ['manager', 'projects'].includes(String(u.type || '').toLowerCase())
  || (u.roles || []).some(r => /customer|support|happiness/i.test(r)));

export const navFor = u => ITEMS.filter(i => i.who(u));
