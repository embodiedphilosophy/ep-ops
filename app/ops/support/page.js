import Shell, { opsUser } from '../Shell';
import { canSupport } from '@/lib/ops/nav';
import { zendeskConfigured, zendeskTicketUrl, kbSheetUrl, listQueue, getTicket, loadEntries, suggest, loadGaps, loadAnswers, canApprove, ANSWER_FIELDS, TOPICS } from '@/lib/ops/support';
import AnswerEditor from './AnswerEditor';
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
  if (sp?.tab === 'answers') return <Answers user={user} sp={sp} />;
  const tab = TABS.find(t => t.key === sp?.tab) || TABS[0];

  if (!zendeskConfigured()) {
    return (<Shell user={user} current="support" title="Support">
      <Tabs current={tab.key} />
      <p className="ops-note">Connect Zendesk to see tickets here: add ZENDESK_EMAIL and ZENDESK_API_TOKEN in Vercel (ep-ops). The Answers tab works without it.</p>
    </Shell>);
  }

  const [queue, entries, gaps] = await Promise.all([
    listQueue().catch(e => { console.error('Support queue failed', e.message); return null; }),
    loadEntries().catch(() => []),
    loadGaps().catch(() => []),
  ]);
  const counts = Object.fromEntries(TABS.map(t => [t.key, (queue || []).filter(t.test).length]));
  const sorted = (queue || []).filter(tab.test).sort((a, b) => tab.key === 'reply' ? Date.parse(a.updated) - Date.parse(b.updated) : Date.parse(b.updated) - Date.parse(a.updated));
  // One row per person: their other open tickets are counted on the row (often the same question twice)
  const byPerson = new Map();
  for (const t of sorted) {
    const k = String(t.requester?.email || t.id).toLowerCase();
    if (byPerson.has(k)) byPerson.get(k).more.push(t.id); else byPerson.set(k, { ...t, more: [] });
  }
  const people = [...byPerson.values()];
  // Topic chips on Needs a reply: answer alike questions together
  const topic = TOPICS.some(x => x.key === sp?.topic) || sp?.topic === 'other' ? sp.topic : '';
  const topicCounts = Object.fromEntries([...TOPICS.map(x => x.key), 'other'].map(k => [k, people.filter(t => t.topic === k).length]));
  const list = topic ? people.filter(t => t.topic === topic) : people;
  const selectedId = Number(sp?.t) || null;
  const ticket = selectedId ? await getTicket(selectedId).catch(() => null) : null;
  const picks = ticket ? suggest(entries, ticket) : [];
  const drafts = entries.filter(e => String(e.status).toLowerCase() === 'draft').length;
  const href = (k, t) => `/ops/support?tab=${k}${topic ? `&topic=${topic}` : ''}${t ? `&t=${t}` : ''}`;

  return (
    <Shell user={user} current="support" eyebrow="Zendesk and the EP Support KB" title="Support"
      head={<a className="chip" href={kbSheetUrl()} target="_blank" rel="noopener">Open the KB sheet</a>}>
      <Tabs current={tab.key} counts={counts} />

      {queue === null && <p className="ops-note">Zendesk didn’t answer just now. Reload in a minute, or work in Zendesk directly.</p>}

      <div className={`ops-sup${ticket ? ' has-ticket' : ''}`}>
        <section className="ops-sup-list" aria-label={tab.label}>
          {tab.key === 'reply' && people.length > 0 && (
            <nav className="ops-sup-topics" aria-label="Topic">
              <a href={`/ops/support?tab=reply`} aria-current={!topic ? 'page' : undefined}>All <span>{people.length}</span></a>
              {[...TOPICS, { key: 'other', label: 'Other' }].filter(x => topicCounts[x.key]).map(x => (
                <a key={x.key} href={`/ops/support?tab=reply&topic=${x.key}`} aria-current={topic === x.key ? 'page' : undefined}>{x.label} <span>{topicCounts[x.key]}</span></a>
              ))}
            </nav>
          )}
          {list.length === 0 ? <p className="ops-empty">{tab.key === 'reply' ? 'Nothing waiting for a reply.' : 'Nothing here.'}</p> : (
            <ul>{list.map(t => (
              <li key={t.id} className={t.id === selectedId ? 'on' : ''}>
                <a href={href(tab.key, t.id)}>
                  <b>{t.requester?.name || t.requester?.email || 'Unknown'}</b>
                  <span className="subj">{t.subject}</span>
                  <small><i className={`dot ${t.status}`} aria-hidden="true" />{STATUS[t.status] || t.status} · {ago(t.updated)}{t.entry ? ` · Ether: ${t.entry}` : ''}{t.more.length ? ` · ${t.more.length + 1} tickets from them` : ''}</small>
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

function Tabs({ current, counts = {} }) {
  return (
    <nav className="ops-sup-tabs" aria-label="Support">
      {TABS.map(t => <a key={t.key} href={`/ops/support?tab=${t.key}`} aria-current={t.key === current ? 'page' : undefined}>{t.label}{counts[t.key] != null && <span>{counts[t.key]}</span>}</a>)}
      <a href="/ops/support?tab=answers" aria-current={current === 'answers' ? 'page' : undefined}>Answers{counts.answers != null && <span>{counts.answers}</span>}</a>
    </nav>
  );
}

const STATE_ORDER = { conflict: 0, draft: 1, live: 2, retired: 3 };
const FILTERS = [
  { key: 'review', label: 'To review', test: a => ['draft', 'conflict'].includes(a.Status.toLowerCase()) || a['Open question'] },
  { key: 'live', label: 'Live', test: a => a.Status.toLowerCase() === 'live' },
  { key: 'all', label: 'All', test: a => a.Status.toLowerCase() !== 'retired' },
  { key: 'retired', label: 'Retired', test: a => a.Status.toLowerCase() === 'retired' },
];

// Every answer in the EP Support KB: what Ether says, what /help shows. Approvers make answers Live.
async function Answers({ user, sp }) {
  const answers = await loadAnswers().catch(e => { console.error('Answers failed', e.message); return null; });
  const filter = FILTERS.find(f => f.key === sp?.f) || FILTERS[0];
  const q = String(sp?.q || '').trim().toLowerCase();
  const list = (answers || []).filter(filter.test)
    .filter(a => !q || `${a.ID} ${a.Question} ${a['Public answer']} ${a.Topic}`.toLowerCase().includes(q))
    .sort((a, b) => (STATE_ORDER[a.Status.toLowerCase()] ?? 9) - (STATE_ORDER[b.Status.toLowerCase()] ?? 9) || String(a.Topic).localeCompare(b.Topic));
  const toReview = (answers || []).filter(FILTERS[0].test).length;
  const selected = (answers || []).find(a => String(a.row) === String(sp?.a));
  const href = (extra = {}) => '/ops/support?' + new URLSearchParams({ tab: 'answers', f: filter.key, ...(q ? { q } : {}), ...extra }).toString();
  return (
    <Shell user={user} current="support" eyebrow="What Ether says and the Help Centre shows" title="Support"
      head={<a className="chip" href={kbSheetUrl()} target="_blank" rel="noopener">Open the KB sheet</a>}>
      <Tabs current="answers" counts={{ answers: toReview }} />
      {answers === null && <p className="ops-note">The KB sheet didn’t answer just now. Reload in a minute.</p>}
      <div className={`ops-sup${selected ? ' has-ticket' : ''}`}>
        <section className="ops-sup-list" aria-label="Answers">
          <form className="ops-sup-filter" action="/ops/support">
            <input type="hidden" name="tab" value="answers" /><input type="hidden" name="f" value={filter.key} />
            <label className="sr">Search answers</label>
            <input type="search" name="q" defaultValue={sp?.q || ''} placeholder="Search answers" aria-label="Search answers" />
          </form>
          <div className="ops-sup-chips">{FILTERS.map(f => <a key={f.key} className={`chip${f.key === filter.key ? ' on' : ''}`} href={'/ops/support?' + new URLSearchParams({ tab: 'answers', f: f.key, ...(q ? { q } : {}) })}>{f.label}</a>)}</div>
          {list.length === 0 ? <p className="ops-empty">{filter.key === 'review' ? 'Nothing waiting for review.' : 'No answers here.'}</p> : (
            <ul>{list.map(a => (
              <li key={a.row} className={selected?.row === a.row ? 'on' : ''}>
                <a href={href({ a: a.row })}>
                  <b><span className="tag">{a.ID}</span>{a.Question}</b>
                  <small><i className={`dot ans-${a.Status.toLowerCase()}`} aria-hidden="true" />{a.Status || 'No status'} · {a.Topic || 'No topic'}{a.Owner ? ` · ${a.Owner}` : ''}{a['Open question'] ? ' · open question' : ''}</small>
                </a>
              </li>
            ))}</ul>
          )}
        </section>
        <section className="ops-sup-detail" aria-label="Answer">
          {selected ? (
            <AnswerEditor key={selected.row} answer={selected} fields={ANSWER_FIELDS} approver={canApprove(user)} back={href()} />
          ) : (
            <div className="ops-sup-side">
              <h2>How answers go live</h2>
              <ol className="ops-sup-steps">
                <li>Ichha saves a new answer from a ticket, or edits one here. It’s a <b>Draft</b>.</li>
                <li>Jacob, Irene or Floss reads it and clicks <b>Approve</b>. It’s <b>Live</b>.</li>
                <li>Ether uses Live answers within the hour. Live answers marked Public show on the Help Centre straight away.</li>
              </ol>
              <p className="ops-more">Editing a Live answer sends it back to Draft until it’s approved again{canApprove(user) ? ', except when you edit it' : ''}.</p>
            </div>
          )}
        </section>
      </div>
    </Shell>
  );
}
