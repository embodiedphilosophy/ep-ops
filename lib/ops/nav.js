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

// group 'more' sits under a divider in the sidebar.
// Settings is every sheet-backed table in one place: the website tables for the editors, plus the
// operations tables (templates, team, Circle, resources) for directors. Admin's lists moved to Today → Triage.
const ITEMS = [
  { key: 'home', href: '/ops', label: 'Today', who: () => true },
  { key: 'events', href: '/ops/events', label: 'Events', who: () => true },
  { key: 'tasks', href: '/ops/tasks', label: 'Tasks', who: isStaff },
  { key: 'content', href: '/ops/content', label: 'Publish', who: isStaff },
  { key: 'insights', href: '/ops/insights', label: 'Business', who: u => !!u?.director },
  { key: 'team', href: '/ops/team', label: 'People', who: isStaff, group: 'more' },
  { key: 'settings', href: '/ops/settings', label: 'Settings', who: u => canEditSite(u), group: 'more' },
];

export const navFor = u => ITEMS.filter(i => i.who(u));
