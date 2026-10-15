import { findByToken } from '@/lib/ops/faculty';
import { currentUser } from '@/lib/ops/auth';
import { canEditEvents } from '@/lib/ops/nav';
import { loadInvites } from '@/lib/ops/faculty';

export const dynamic = 'force-dynamic';
const when = iso => new Date(iso).toLocaleString('en-US', { timeZone: 'America/New_York', dateStyle: 'long', timeStyle: 'short' }) + ' ET';

// The archived, signed agreement: exactly the text that was signed, with both signatures and its fingerprint.
// The teacher opens it with their link; staff open it from Faculty → Invitations (/invite/staff/contract?id=F…).
export default async function Contract({ params, searchParams }) {
  const { token } = await params;
  const sp = await searchParams;
  let inv = null;
  if (token === 'staff') {
    const user = await currentUser().catch(() => null);
    if (user && canEditEvents(user)) inv = (await loadInvites()).find(r => r.id === sp?.id) || null;
  } else inv = await findByToken(token).catch(() => null);
  if (!inv || inv.status !== 'signed') return (<><h1>Not available</h1><p>This agreement isn’t signed yet, or the link has expired.</p></>);
  return (<>
    <p className="eyebrow">Signed agreement · {inv.id}</p>
    <h1>{inv.offering_title}</h1>
    <div className="contract full">{inv.contract_text}</div>
    <div className="sig">
      <div><b>{inv.signer_name}</b>Teacher · signed {when(inv.signed_at)}<br /><span className="muted">{inv.email}</span></div>
      <div><b>{inv.countersigned_by}</b>For Embodied Philosophy · countersigned {when(inv.countersigned_at)}</div>
    </div>
    <p className="muted" style={{ marginTop: 24 }}>Fingerprint {inv.contract_hash} (SHA-256 of the agreement text above). Signed online by typed name and consent{inv.signer_ip ? ` from ${inv.signer_ip}` : ''}.</p>
    <p className="noprint muted">To keep a PDF, use your browser’s Print and choose “Save as PDF”.</p>
  </>);
}
