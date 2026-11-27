// Settings in four groups (EP Ops 2, step 8): Team and roles, Templates, Website copy, Connections and jobs.
// Each group is a list of sections; a section is a sheet table (the editor in app/ops/content/SiteEditor.js) or a page that
// already existed (the Social sign-offs, the Student reminder rules, the Social rules, the systems and jobs list).
// The role rule of each section is the one it had before: the operations tables are directors only, the website tables are for
// those who edit the site, the sign-offs and reminder rules for staff. Nothing here widens access (the editor's API checks again).
import { SITE_TABLES, ADMIN_TABLES, MENTEE_TABLES, SS_TABLES, LIBRARY_TABLES, tableOf } from './sitetables';
import { isStaff, canEditSite } from './nav';

const director = u => !!u?.director;
const admin = key => ({ key, table: key, who: director, label: ADMIN_TABLES.find(t => t.key === key)?.label });
const site = (list, head) => list.map(t => ({ key: t.key, table: t.key, who: canEditSite, label: t.label, head }));

export const GROUPS = [
  { key: 'team', label: 'Team and roles', title: 'Team and roles', who: isStaff,
    desc: 'Who is on the team, what each person can do, and who signs off on what.',
    sections: [{ ...admin('team'), label: 'Team' }, { ...admin('resources'), label: 'Team links' }, { key: 'signoffs', label: 'Social roles and sign-offs', who: isStaff }] },
  { key: 'templates', label: 'Templates', title: 'Templates', who: isStaff,
    desc: 'The tasks, emails and agreements that are made for you. Changes apply from the next daily run; finished tasks are left alone.',
    sections: [{ ...admin('templates'), label: 'Task templates' }, { ...admin('defaults'), label: 'Track defaults' }, { ...admin('recurring'), label: 'Recurring tasks' },
      { ...admin('contracts'), label: 'Agreements' }, { key: 'reminders', label: 'Student reminders', who: isStaff }, { key: 'social-rules', label: 'Social rules', who: director }] },
  { key: 'website', label: 'Website copy', title: 'Website copy', who: canEditSite,
    desc: 'Every table the website reads. A change shows on the site within a few minutes.',
    sections: [...site(SITE_TABLES, 'Website'), ...site(SS_TABLES, 'Sādhana School'), ...site(MENTEE_TABLES, 'Sahṛdaya Upāya'), ...site(LIBRARY_TABLES, 'Library')] },
  { key: 'connections', label: 'Connections and jobs', title: 'Connections and scheduled jobs', who: director,
    desc: 'The systems the dashboard talks to, and the jobs that run on their own.',
    sections: [{ key: 'overview', label: 'Systems and jobs', who: director }, { ...admin('circlegroups'), label: 'Circle spaces' }, { ...admin('funnel'), label: 'Funnel steps (Kit tags)' }, { key: 'ads-library', label: 'Ads audience library', who: director }, { key: 'ads-safety', label: 'Ads safety net', who: director }] },
];

// The sections a person may open in a group
export const sectionsFor = (group, u) => (GROUPS.find(g => g.key === group)?.sections || []).filter(s => s.who(u));

// Which group a section (or table) lives in
export const groupOfSection = key => GROUPS.find(g => g.sections.some(s => s.key === key))?.key || '';

// The first section a person lands on: a director opens Task templates (as the old All settings did); anyone else, the first they may see
export const defaultSection = (group, u) => {
  const list = sectionsFor(group, u);
  return (group === 'templates' && u?.director ? list.find(s => s.key === 'templates') : null) || (group === 'website' ? list.find(s => s.key === 'links') : null) || list[0];
};

// Older addresses: ?t=<table>, and the earlier ?view=tables / social-rules / reminders → { view, s } (or null)
export function oldSettingsAddress(sp) {
  const first = v => (Array.isArray(v) ? v[0] : v) || '';
  const t = first(sp.t), v = first(sp.view);
  if (!first(sp.s)) {
    if (t && tableOf(t) && groupOfSection(t)) return { view: groupOfSection(t), s: t };
    if (v === 'social-rules') return { view: 'templates', s: 'social-rules' };
    if (v === 'reminders') return { view: 'templates', s: 'reminders' };
    if (v === 'tables') return {};
  }
  return null;
}

// The final address of a table's section (for the older ?t= links): /ops/settings?view=website&s=links
export const settingsHref = key => groupOfSection(key) ? `/ops/settings?view=${groupOfSection(key)}&s=${key}` : '/ops/settings';
