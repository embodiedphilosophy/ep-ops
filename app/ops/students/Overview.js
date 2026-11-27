import Shell, { opsUser } from '../Shell';
import { isStaff, canSupport, canEditSite } from '@/lib/ops/nav';
import { todayET } from '@/lib/events';
import { zendeskConfigured, listQueue, loadGaps, TOPICS } from '@/lib/ops/support';
import { podsWaiting } from '@/lib/ops/podswaiting';
import { loadOpsYear } from '@/lib/ops/menteeyearops';
import { PROJECTS } from '@/lib/ops/menteeyear';
import { ceLedger, ceConfigured } from '@/lib/ops/ce';
import { TABS as SUPPORT_TABS, onePerPerson, ago } from './SupportView';

// Students › Overview ("Who needs looking after"): one card for each of the things the other tabs hold, so the day starts with what is waiting.
// Nothing new is read: every card is built from what that tab's own page reads (the Zendesk queue and Ether's gaps, the study pods Today already
// counts, the mentee year, the CE ledger), and each card shows only to the people who may open that tab. Each card links to where the work is done.
// ("Paid but not in Circle" and counts on the tabs are later pieces: they need new data.)
const short = (s, n) => (String(s || '').length > n ? `${String(s).slice(0, n)}…` : String(s || ''));
const d3 = iso => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).replace(',', '');
const at = iso => new Date(iso).toLocaleString('en-US', { timeZone: 'America/New_York', weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export default async function Overview() {
  const user = await opsUser(isStaff);
  const today = todayET(), director = !!user.director, site = canEditSite(user);
  const [support, pods, year, ce] = await Promise.all([
    canSupport(user) ? supportCard() : null,
    site ? podsWaiting().then(p => ({ ok: true, ...(p || {}), off: !p })).catch(e => { console.error('students overview, pods', e.message); return { ok: false }; }) : null,
    loadOpsYear({ today }).catch(e => { console.error('students overview, mentee year', e.message); return null; }),
    site ? ceCard() : null,
  ]);

  return (
    <Shell user={user} current="students" eyebrow="Students" title="Who needs looking after"
      desc="Support, the mentee year, study pods and CE credits, in one place. Each card opens the tab where the work is done.">
      <div className="st-grid">
        {support && <SupportCard s={support} />}
        {year && <MenteeCard year={year} today={today} director={director} site={site} />}
        {pods && <PodsCard p={pods} />}
        {ce && <CeCard c={ce} />}
      </div>
    </Shell>
  );
}

// ---- Support: what is waiting for a reply ----
async function supportCard() {
  if (!zendeskConfigured()) return { off: true };
  const [queue, gaps] = await Promise.all([
    listQueue().catch(e => { console.error('Support queue failed', e.message); return null; }),
    loadGaps().catch(() => []),
  ]);
  if (queue === null) return { down: true };
  const reply = SUPPORT_TABS[0];
  const people = onePerPerson(queue.filter(reply.test).sort((a, b) => Date.parse(a.updated) - Date.parse(b.updated)));
  const topics = [...TOPICS, { key: 'other', label: 'Other' }].map(x => ({ ...x, n: people.filter(t => t.topic === x.key).length })).filter(x => x.n);
  return { people, topics, gaps: gaps.length };
}
function SupportCard({ s }) {
  const n = s.people?.length || 0;
  return (
    <section className="ops-panel st-card st-wide" aria-label="Support">
      <h2>Support · needs a reply <span className="st-n">{s.off || s.down ? '' : n}</span></h2>
      {s.off && <p className="ops-empty">Zendesk isn’t connected here yet, so tickets can’t show. The Answers list still works.</p>}
      {s.down && <p className="ops-empty">Zendesk didn’t answer just now. Reload in a minute, or work in Zendesk directly.</p>}
      {!s.off && !s.down && (<>
        {s.topics.length > 0 && <div className="st-chips">{s.topics.map(x => <a key={x.key} className="ops-status" href={`/ops/students?view=support&tab=reply&topic=${x.key}`}>{x.label} {x.n}</a>)}</div>}
        {n === 0 ? <p className="ops-empty">Nothing waiting for a reply.</p> : (
          <ul className="st-rows">{s.people.slice(0, 4).map(t => (
            <li key={t.id}><a href={`/ops/students?view=support&tab=reply&t=${t.id}`}><b>{t.requester?.name || t.requester?.email || 'Unknown'}</b><span className="st-sub">{short(t.subject, 70)}</span></a><span className="st-when">{ago(t.updated)}</span></li>
          ))}</ul>)}
        <p className="st-foot">{s.gaps ? `${plural(s.gaps, 'question')} from Ether’s chat ${s.gaps === 1 ? 'has' : 'have'} no answer yet. They feed the Answers list.` : 'Ether’s unanswered questions feed the Answers list.'}</p>
        <p className="st-links">{n > 4 && <a href="/ops/students?view=support">All {n} →</a>}<a href="/ops/students?view=support&tab=answers">Answers →</a></p>
      </>)}
    </section>
  );
}

// ---- The mentee year: this month, what is next, who is behind ----
function MenteeCard({ year, today, director, site }) {
  const ym = today.slice(0, 7), mentees = year.mentees.length;
  const reflection = (year.progress?.[ym] || []).find(r => r.kind === 'reflection');
  const skipped = year.skips.reduce((n, m) => n + m.items.length, 0), skippers = year.skips.filter(m => m.items.length).length;
  const od = year.overdue, names = [...new Set(od.map(o => o.name))];
  const next = year.bookings.filter(b => !b.past).slice(0, 3);
  const dot = c => (c.count === c.of && c.of ? 'ok' : c.count && c.step.date < today ? 'risk' : 'none');
  return (
    <section className="ops-panel st-card" aria-label="Mentee year">
      <h2>Sahṛdaya Upāya · this month</h2>
      {year.month && <p className="ops-empty">{year.month.title.split(' ')[0]} · {year.month.theme}</p>}
      <ul className="st-stats">
        {reflection && <li><i className={reflection.done === reflection.of && reflection.of ? 'ok' : 'none'} /><span>{reflection.done} of {reflection.of} mentees have posted this month’s reflection</span></li>}
        <li><i className={skipped ? 'soon' : 'none'} /><span>{skipped ? `${plural(skipped, 'item')} skipped by ${plural(skippers, 'mentee')} (shown on their reports)` : 'No items skipped'}</span></li>
        <li><i className={od.length ? 'risk' : 'none'} /><span>{od.length ? `${plural(od.length, 'project step')} overdue · ${names.slice(0, 2).join(', ')}${names.length > 2 ? `, +${names.length - 2}` : ''}` : 'No project steps overdue'}</span></li>
        {year.configured && <li><i className={year.notBooked.length ? 'soon' : 'none'} /><span>{year.notBooked.length ? `${plural(year.notBooked.length, 'mentee')} still to book a one-to-one` : `All ${mentees} mentees have a one-to-one booked`}</span></li>}
        {year.configured && year.noSummary.length > 0 && <li><i className="soon" /><span>{plural(year.noSummary.length, 'booked one-to-one')} without a summary yet</span></li>}
      </ul>
      {year.upcoming.length > 0 && (<><h3 className="st-h">Next project steps</h3>
        <ul className="st-rows">{year.upcoming.map(c => (
          <li key={c.step.id}><span><b>{c.step.title}</b><span className="st-sub">{d3(c.step.date)} · {PROJECTS[c.step.project]}</span></span><span className={`st-count ${dot(c)}`}>{c.count} of {c.of}</span></li>
        ))}</ul></>)}
      {director && next.length > 0 && (<><h3 className="st-h">Next one-to-ones</h3>
        <ul className="st-rows">{next.map(x => (
          <li key={x.uuid}><span><b>{x.name || x.email}</b><span className="st-sub">{at(x.start)}</span></span><span className={`ops-status ${x.status.key === 'in' ? 'ok' : x.status.key}`}>{x.status.label}</span></li>
        ))}</ul></>)}
      <p className="st-links">
        <a href="/ops/students?view=mentee">Open the Mentee year →</a>
        {director && <a href="/ops/students?view=one-to-ones">One-to-ones →</a>}
        {site && <a href="/ops/students?view=mentee&tab=partners">Articulation partners →</a>}
        {site && <a href="/ops/students?view=mentee&tab=surveys">Surveys →</a>}
      </p>
    </section>
  );
}

// ---- Study pods: waiting for a yes, or a chat link ----
function PodsCard({ p }) {
  const requests = p.requests || [], needChat = p.needChat || [], waiting = requests.length + needChat.length;
  return (
    <section className="ops-panel st-card" aria-label="Study pods">
      <h2>Pods waiting for a yes <span className="st-n">{p.ok && !p.off ? requests.length : ''}</span></h2>
      {!p.ok && <p className="ops-empty">Couldn’t read the study pods just now. Try again shortly.</p>}
      {p.ok && p.off && <p className="ops-empty">Study pods will show here once the database is connected.</p>}
      {p.ok && !p.off && (<>
        {waiting === 0 && <p className="ops-empty">Nothing waiting. {p.open ? `${plural(p.open, 'pod')} ${p.open === 1 ? 'is' : 'are'} open for members.` : 'No pods are open yet.'}</p>}
        {requests.length > 0 && (<><h3 className="st-h">Asked to lead a pod</h3><ul className="st-rows">{requests.slice(0, 4).map(r => (
          <li key={r.uid}><span><b>{r.name}</b>{r.note && <span className="st-sub">{short(r.note, 90)}</span>}</span></li>))}</ul></>)}
        {needChat.length > 0 && (<><h3 className="st-h">Running, needs a chat link</h3><ul className="st-rows">{needChat.slice(0, 4).map(x => (
          <li key={x.id}><span><b>{x.topic}</b><span className="st-sub">{x.leader} · {plural(x.count, 'member')}</span></span></li>))}</ul></>)}
        <p className="st-foot">Jacob or Floss can approve. Open the Pods tab to approve or decline, and to add a chat link.</p>
        <p className="st-links"><a href="/ops/students?view=pods">{requests.length ? 'Approve or decline →' : 'Study pods →'}</a></p>
      </>)}
    </section>
  );
}

// ---- CE credits: certificates held for a look ----
async function ceCard() {
  if (!ceConfigured()) return { off: true };
  try {
    const d = await ceLedger();
    if (d?.off) return { off: true };
    return { issuedMonth: d.counts?.issued_month ?? 0, held: (d.certs || []).filter(c => c.status === 'held').length, tracking: d.counts?.tracking ?? 0 };
  } catch (e) { console.error('students overview, CE', e.message); return { down: true }; }
}
function CeCard({ c }) {
  return (
    <section className="ops-panel st-card" aria-label="CE credits">
      <h2>CE credits · Wisdom School Plus <span className="st-n">{c.off || c.down ? '' : c.held}</span></h2>
      {c.off && <p className="ops-empty">The CE records aren’t connected here yet.</p>}
      {c.down && <p className="ops-empty">Couldn’t reach the CE records just now. Try again shortly.</p>}
      {!c.off && !c.down && (<>
        <p className="ops-empty">{c.held ? `${plural(c.held, 'certificate')} held for a quick look before ${c.held === 1 ? 'it is' : 'they are'} issued.` : 'Nothing held for a look.'}</p>
        <ul className="st-stats"><li><i className="ok" /><span>{c.issuedMonth} issued this month</span></li><li><i className="none" /><span>{c.tracking} members tracking a pathway</span></li></ul>
        <p className="st-links"><a href="/ops/students?view=ce&tab=held">{c.held ? 'Take a look →' : 'CE credits →'}</a></p>
      </>)}
    </section>
  );
}
