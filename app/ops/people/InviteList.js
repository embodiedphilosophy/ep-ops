import { STATUS_LABEL, inviteUrl } from '@/lib/ops/faculty';
import { InviteActions } from './Invitations';

const nice = d => d ? new Date(d.length > 10 ? d : `${d}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: d.length > 10 ? 'America/New_York' : 'UTC' }) : '';
const DOT = { sent: 'amber', signed: 'green', accepted: 'green', declined: 'grey', cancelled: 'grey' };

// Invitations, each with its status and what can be done next (the old Faculty → Invitations list). Everyone's, or one person's.
export default function InviteList({ list, empty }) {
  const base = process.env.OPS_URL || '';
  if (list.length === 0) return <p className="ops-empty">{empty}</p>;
  return (
    <ul className="ops-invites">
      {list.map(i => (
        <li key={i.id}>
          <span className={`st ${DOT[i.status] || 'grey'}`}><span className={`dot ${DOT[i.status] || 'grey'}`} aria-hidden="true" />{STATUS_LABEL[i.status] || i.status}</span>
          <span className="what">
            <b>{i.name}</b> · {i.offering_title}
            <small>{i.kind}{i.fee ? ` · $${i.fee} ${i.fee_unit === 'flat' ? 'flat' : 'per session'}` : ''} · {i.source === 'onboarding' ? 'signed during onboarding' : `invited ${nice(i.created_at)} by ${i.created_by}`}
              {i.status === 'signed' ? ` · signed ${nice(i.signed_at)}` : i.status === 'accepted' ? ` · accepted ${nice(i.responded_at)}${i.template ? '' : ' · no agreement'}` : i.status === 'sent' && i.email_status ? ` · email ${i.email_status}` : ''}</small>
          </span>
          <InviteActions id={i.id} status={i.status} link={i.status === 'sent' ? inviteUrl(base, i) : ''} contract={i.status === 'signed' ? `/invite/staff/contract?id=${i.id}` : ''} />
        </li>
      ))}
    </ul>
  );
}
export const newestFirst = invites => [...invites].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
