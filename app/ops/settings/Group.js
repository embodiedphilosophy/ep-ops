import Shell, { opsUser } from '../Shell';
import SiteEditor from '../content/SiteEditor';
import SocialEngine from '../content/SocialEngine';
import { Reminders } from '../email/Reminders';
import SignOffs from './SignOffs';
import Connections from './Connections';
import { GROUPS, sectionsFor, defaultSection } from '@/lib/ops/settingsgroups';
import '../social/social.css';
import '../email/email.css';

const first = v => (Array.isArray(v) ? v[0] : v) || '';

// Settings in four groups (EP Ops 2, step 8). One group is a list of sections on the left and the section on the right. A section is one of
// the sheet tables (the editor reads and saves through /api/ops/site, as before) or one of the pages Settings gathered: Social roles and
// sign-offs, Student reminders, Social rules, and the systems and jobs list. Roles: see lib/ops/settingsgroups.js.
export default async function SettingsGroup({ group, searchParams }) {
  const g = GROUPS.find(x => x.key === group);
  const user = await opsUser(g.who);
  const sp = await searchParams;
  const list = sectionsFor(group, user);
  const sec = list.find(s => s.key === first(sp.s)) || defaultSection(group, user);
  const href = k => `/ops/settings?view=${group}&s=${k}`;
  let body;
  if (sec.table) body = <SiteEditor key={sec.key} only={[sec.table]} initial={sec.table} base={`${href(sec.key)}&`} />;
  else if (sec.key === 'signoffs') body = await SignOffs();
  else if (sec.key === 'reminders') body = <Reminders />;
  else if (sec.key === 'social-rules') body = <div className="soc"><SocialEngine director={!!user.director} keys={['rules']} base={href(sec.key)} /></div>;
  else body = <Connections />;
  return (
    <Shell user={user} current="settings" eyebrow="Settings" title={g.title} desc={g.desc}>
      <div className="ops-setgrid">
        <nav className="ops-setlist" aria-label={`${g.label} sections`}>
          {list.map((s, i) => (
            <span key={s.key} className="ops-setitem">
              {s.head && s.head !== list[i - 1]?.head && <span className="g">{s.head}</span>}
              <a href={href(s.key)} aria-current={s.key === sec.key ? 'page' : undefined}>{s.label}</a>
            </span>
          ))}
        </nav>
        <div className="ops-setbody" aria-label={sec.label}>{body}</div>
      </div>
    </Shell>
  );
}
