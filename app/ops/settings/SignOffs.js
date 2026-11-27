import { canEditSocial, canApproveSocial, canPublishSocial } from '@/lib/ops/nav';
import { loadTeam } from '@/lib/calendar';
import { readPlain } from '@/lib/ops/store';
import '../social/social.css';

// Settings › Team and roles › Social roles and sign-offs: the old Team & roles page of Social, as a section (same reads, same words).
// Sign-offs are flags, never locks: whoever schedules can approve a flagged post by giving a reason (lib/ops/socialrules.js)
const SIGNOFFS = [
  ['Carousel: educational', 'Teacher clearance', 'Floss, Stephanie or Jacob checks it against the teacher’s own words.'],
  ['Sanskrit translation', 'Floss', 'Only text that has already been checked is used.'],
  ['Teacher video', 'Any approver', 'Floss checks the caption line.'],
  ['Meet the teacher', 'Any approver', 'The teacher confirms it through their guest link.'],
  ['Quote on an image · South Asian art', 'Any approver', ''],
  ['Course promo · campaigns', 'Jake or Floss', ''],
];
const yes = v => <span aria-label={v ? 'Yes' : 'No'}>{v ? '✓' : '—'}</span>;

export default async function SignOffs() {
  const [team, rules] = await Promise.all([loadTeam().catch(() => []), readPlain('Rules', { sheet: 'social', light: true }).catch(() => ({ rows: [] }))]);
  const how = String(rules.rows.find(r => /how.?to.?video/i.test(r.values.setting))?.values.value || '');
  const people = team.filter(t => canEditSocial(t) || t.director).map(t => ({ name: t.name, roles: t.roles.join(', '), create: canEditSocial(t), approve: canApproveSocial(t), publish: canPublishSocial(t) }));
  return (
    <div className="soc">
      <p className="ops-empty">Who can make, approve and schedule posts. Roles come from the Team table in this tab; ask a director to change someone’s roles. <a href="/ops/publish?view=review">Review and approve →</a></p>
      <section className="soc-panel" aria-label="People">
        <div className="ph"><h2>People</h2></div>
        <div style={{ overflowX: 'auto' }}><table className="ops-table"><thead><tr><th>Name</th><th>Roles</th><th>Makes posts</th><th>Approves</th><th>Schedules and publishes</th></tr></thead>
          <tbody>{people.map(p => <tr key={p.name}><td><b>{p.name}</b></td><td>{p.roles}</td><td>{yes(p.create)}</td><td>{yes(p.approve)}</td><td>{yes(p.publish)}</td></tr>)}</tbody></table></div>
      </section>
      <section className="soc-panel" aria-label="Sign-offs">
        <div className="ph"><h2>Who signs off on what</h2><span className="sub">These flag a post for a second look. They never lock it: an approver can go ahead by giving a reason.</span></div>
        <ul className="soc-rev">{SIGNOFFS.map(([k, who, note]) => <li key={k}><div className="b"><b>{k}</b><span>{who}{note ? ` · ${note}` : ''}</span></div></li>)}</ul>
      </section>
      <section className="soc-panel" aria-label="Tuesday check-in">
        <div className="ph"><h2>Tuesday check-in</h2><span className="sub">9:30 ET. The team picks the week’s images together.</span></div>
        <p>{how ? <>New to the Composer? <a href={how} target="_blank" rel="noreferrer">Watch the how-to video</a>.</> : 'No how-to video has been added yet. A director can add one in Templates → Social rules, in a row called “How-to video”.'}</p>
      </section>
    </div>
  );
}
