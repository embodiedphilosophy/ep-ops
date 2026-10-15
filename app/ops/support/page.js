import Shell, { opsUser } from '../Shell';
import { canSupport } from '@/lib/ops/nav';
import { zendeskConfigured, zendeskTicketUrl, kbSheetUrl, listQueue, getTicket, loadEntries, suggest, loadGaps } from '@/lib/ops/support';
import SupportReply from './SupportReply';
import './support.css';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Support — Embodied Philosophy', robots: { index: false, follow: false } };

const when = iso => new Date(iso).toLocaleString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const ago = iso => { const h = (Date.now() - Date.parse(iso)) / 36e5; return h < 1 ? 'just now' : h < 24 ? `${Math.floor(h)} h ago` : `${Math.floor(h / 24)} d ago`; };
const TABS = [
  { key: 'reply', label: 'Needs a reply', test: t => t.kind === 'person' && ['new', 'open'].includes(t.status) },
  { key: 'waiting', label: 'Waiting on customer', test: t => t.kind === 'person' && ['pending', 'hold'].includes(t.status) },
  { key: 'other', label: 'Pitches & automated', test: t => t.kind !== 'person' },
];
const STATUS = { new: 'New', open: 'Open', pending: 'Waiting on customer', hold: 'On hold', solved: 'Solved' };

// The support desk: Zendesk tickets in, replies out, with the EP Support KB alongside
export default async function Support({ searchParams }) {
  const user = await opsUser(canSupport);
  const sp = await searchParams;
  const tab = TABS.find(t => t.key === sp?.tab) || TABS[0];

  if (!zendeskConfigured()) {
    return (<Shell user={user} current="support" title="Support">
      <p className="ops-note">Connect Zendesk to see tickets here: add ZENDESK_EMAIL and ZENDESK_API_TOKEN in Vercel (ep-website).</p>
    </Shell>);
  }

  const [queue, entries, gaps] = await Promise.all([
    listQueue().catch(e => { console.error('Support queue failed', e.message); return null; }),
    loadEntries().catch(() => []),
    loadGaps().catch(() => []),
  ]);
  const counts = Object.fromEntries(TABS.map(t => [t.key, (queue || []).filter(t.test).length]));
  const list = (queue || []).filter(tab.test).sort((a, b) => tab.key === 'reply' ? Date.parse(a.updated) - Date.parse(b.updated) : Date.parse(b.updated) - Date.parse(a.updated));
  const selectedId = Number(sp?.t) || null;
  const ticket = selectedId ? await getTicket(selectedId).catch(() => null) : null;
  const picks = ticket ? suggest(entries, ticket) : [];
  const drafts = entries.filter(e => String(e.status).toLowerCase() === 'draft').length;
  const href = (k, t) => `/ops/support?tab=${k}${t ? `&t=${t}` : ''}`;

  return (
    <Shell user={user} current="support" eyebrow="Zendesk and the EP Support KB" title="Support"
      head={<a className="chip" href={kbSheetUrl()} target="_blank" rel="noopener">Open the KB sheet</a>}>
      <nav className="ops-sup-tabs" aria-label="Queues">
        {TABS.map(t => <a key={t.key} href={href(t.key)} aria-current={t.key === tab.key ? 'page' : undefined}>{t.label} <span>{counts[t.key]}</span></a>)}
      </nav>

      {queue === null && <p className="ops-note">Zendesk didn’t answer just now. Reload in a minute, or work in Zendesk directly.</p>}

      <div className={`ops-sup${ticket ? ' has-ticket' : ''}`}>
        <section className="ops-sup-list" aria-label={tab.label}>
          {list.length === 0 ? <p className="ops-empty">{tab.key === 'reply' ? 'Nothing waiting for a reply.' : 'Nothing here.'}</p> : (
            <ul>{list.map(t => (
              <li key={t.id} className={t.id === selectedId ? 'on' : ''}>
                <a href={href(tab.key, t.id)}>
                  <b>{t.requester?.name || t.requester?.email || 'Unknown'}</b>
                  <span className="subj">{t.subject}</span>
                  <small><i className={`dot ${t.status}`} aria-hidden="true" />{STATUS[t.status] || t.status} · {ago(t.updated)}{t.entry ? ` · Ether: ${t.entry}` : ''}</small>
                </a>
              </li>
            ))}</ul>
          )}
        </section>

        <section className="ops-sup-detail" aria-label="Ticket">
          {!ticket ? (
            <div className="ops-sup-side">
              <h2>Gaps from Ether <span>{gaps.length} in 30 days</span></h2>
              {gaps.length === 0 ? <p className="ops-empty">No unanswered questions from the chat this month.</p> : (
                <ul className="ops-sup-gaps">{gaps.slice(0, 12).map((g, i) => (
                  <li key={i}><span>{g.summary_for_ichha || '(no summary)'}</span><small>{g.time_utc}{g.zendesk_ticket ? ` · #${g.zendesk_ticket}` : ''}</small></li>
                ))}</ul>
              )}
              <p className="ops-more">{drafts} draft {drafts === 1 ? 'answer is' : 'answers are'} waiting for review in the <a href={kbSheetUrl()} target="_blank" rel="noopener">KB sheet</a>. Pick a ticket to reply.</p>
            </div>
          ) : (
            <>
              <div className="ops-sup-tickethead">
                <div>
                  <a className="back" href={href(tab.key)}>← All tickets</a>
                  <h2>{ticket.subject}</h2>
                  <small>{ticket.requester?.name} · {ticket.requester?.email} · #{ticket.id} · {STATUS[ticket.status] || ticket.status}</small>
                </div>
                <a className="chip" href={zendeskTicketUrl(ticket.id)} target="_blank" rel="noopener">Open in Zendesk</a>
              </div>
              <ol className="ops-sup-thread">{ticket.comments.map(c => (
                <li key={c.id} className={c.fromCustomer ? 'them' : c.public ? 'us' : 'note'}>
                  <small>{c.author}{!c.public ? ' · internal note' : ''} · {when(c.at)}</small>
                  <p>{c.body}</p>
                </li>
              ))}</ol>
              <SupportReply id={ticket.id} status={ticket.status} picks={picks.map(p => ({ id: p.id, question: p.question, answer: p.answer, notes: p.notes, handoff: p.handoff }))}
                subject={ticket.subject} firstMessage={ticket.comments.find(c => c.fromCustomer)?.body || ''} />
            </>
          )}
        </section>
      </div>
    </Shell>
  );
}
