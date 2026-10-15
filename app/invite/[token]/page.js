import { findByToken, loadTemplates, fillContract, STATUS_LABEL } from '@/lib/ops/faculty';
import Answer from './Answer';

export const dynamic = 'force-dynamic';
const nice = d => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });

// The invited teacher's page (no sign-in: the signed link is the key). Yes → read and sign; No → confirm.
export default async function Invite({ params, searchParams }) {
  const { token } = await params;
  const sp = await searchParams;
  const inv = await findByToken(token).catch(() => null);
  if (!inv) return (<><h1>This link has expired</h1><p>Please reply to the invitation email and we’ll send a fresh one.</p></>);
  const dates = String(inv.dates).split(',').map(s => s.trim()).filter(Boolean);
  const facts = (
    <div className="facts">
      <b>{inv.kind}</b> · {dates.map(nice).join(' · ')}<br />
      {inv.fee ? <>Fee: ${inv.fee} {inv.fee_unit === 'flat' ? 'for the whole offering' : 'per session'}</> : null}
    </div>
  );
  if (inv.status === 'signed') return (<>
    <p className="eyebrow">Signed</p><h1>Thank you, {inv.signer_name.split(' ')[0]}</h1>
    <p>Your agreement for <b>{inv.offering_title}</b> is signed and countersigned.</p>
    <p><a className="btn" href={`/invite/${token}/contract`}>Read or print your agreement</a></p>
    <p>Next, a short onboarding for your bio, photo and course details. Sign in with <b>{inv.email}</b>.</p>
    <p><a className="btn quiet" href="/teach">Start onboarding</a></p>
  </>);
  if (inv.status !== 'sent') return (<><p className="eyebrow">{STATUS_LABEL[inv.status] || inv.status}</p><h1>{inv.offering_title}</h1><p>This invitation is closed. If that’s a surprise, just reply to the email.</p></>);
  const tpl = (await loadTemplates()).find(t => t.name === inv.template);
  const text = tpl ? fillContract(tpl.body, inv) : '';
  return (<>
    <p className="eyebrow">An invitation to teach</p>
    <h1>{inv.offering_title}</h1>
    {inv.message && <p style={{ whiteSpace: 'pre-wrap' }}>{inv.message}</p>}
    {facts}
    <Answer token={token} decline={sp?.a === 'no'} text={text} name={inv.name} />
  </>);
}
