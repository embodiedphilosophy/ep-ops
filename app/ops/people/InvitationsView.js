import { loadInvites, loadTemplates, offerings, KINDS, FEE_UNITS } from '@/lib/ops/faculty';
import { canEditEvents } from '@/lib/ops/nav';
import { InviteForm } from './Invitations';
import InviteList, { newestFirst } from './InviteList';
import Shell, { opsUser } from '../Shell';

// People › Invitations (the old Faculty → Invitations): invite a teacher to an offering; follow each invitation to a signed agreement
export default async function InvitationsView() {
  const user = await opsUser(canEditEvents);
  const [invites, templates, offs] = await Promise.all([loadInvites({ light: false }), loadTemplates(), offerings().catch(() => [])]);
  const list = newestFirst(invites), open = list.filter(i => i.status === 'sent');
  return (
    <Shell user={user} current="people" desc="Invite faculty, and follow each invitation to a signed agreement." eyebrow="Invitations and agreements" title="Invitations">
      <div className="ops-grid">
        <section className="ops-col">
          <h2>Invitations <span>{open.length} waiting</span></h2>
          <InviteList list={list} empty="No invitations yet. Invite your first teacher with the form." />
        </section>
        <aside className="ops-col">
          <h2>Invite a teacher</h2>
          <InviteForm offerings={offs} templates={templates.map(t => t.name)} kinds={KINDS} units={FEE_UNITS} />
          <p className="ops-meta" style={{ marginTop: 16 }}>When they say yes they are added to every session (Teachers and reminder emails) and sent their onboarding link. With an agreement, they read and sign it online first; it is countersigned for EP automatically and archived here. Agreements live in <a href="/ops/settings?t=contracts">Settings → Contracts</a>.</p>
        </aside>
      </div>
    </Shell>
  );
}
