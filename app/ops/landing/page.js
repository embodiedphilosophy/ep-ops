import { isStaff, canEditSite } from '@/lib/ops/nav';
import { listOfferings } from '@/lib/ops/offerings';
import { readLandingPages, checkAll, verdict, libraryMatch } from '@/lib/ops/landingpages';
import Shell, { opsUser } from '../Shell';
import CopyLink from './CopyLink';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Landing Pages — Embodied Philosophy', robots: { index: false, follow: false } };

const STATES = { running: ['Running', 'green'], upcoming: ['Upcoming', 'amber'], evergreen: ['Evergreen', ''], ended: ['Ended', ''] };
const TABS = [['all', 'All'], ['attention', 'Needs attention'], ['running', 'Running'], ['upcoming', 'Upcoming'], ['evergreen', 'Evergreen'], ['ended', 'Ended']];
const ORDER = { running: 0, upcoming: 1, evergreen: 2, ended: 3 };

const day = v => {
  if (!v) return '';
  const d = /^\d{4}-\d{2}-\d{2}$/.test(String(v)) ? new Date(`${v}T12:00:00Z`) : new Date(v);
  return isNaN(d) ? String(v) : d.toLocaleDateString('en-US', { timeZone: /^\d{4}-\d{2}-\d{2}$/.test(String(v)) ? 'UTC' : 'America/New_York', month: 'short', day: 'numeric', year: 'numeric' });
};
const range = p => p.startsAt && p.endsAt && day(p.startsAt) !== day(p.endsAt) ? `${day(p.startsAt)} – ${day(p.endsAt)}` : day(p.startsAt || p.endsAt);
const short = u => String(u || '').replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '');

export default async function LandingPages({ searchParams }) {
  const user = await opsUser(isStaff);
  const sp = await searchParams;
  const tab = TABS.some(t => t[0] === sp?.tab) ? sp.tab : 'all';
  const fresh = sp?.check === '1';
  const [{ pages, error }, offerings] = await Promise.all([readLandingPages(), listOfferings().catch(() => [])]);
  const checks = await checkAll(pages, { fresh });
  const editLibrary = canEditSite(user);

  const rows = pages.map(p => {
    const page = verdict(checks.get(p.url), { exact200: true });
    const checkout = p.checkoutUrl ? verdict(checks.get(p.checkoutUrl)) : { ok: null, say: '' };
    const lib = libraryMatch(p, offerings);
    return { ...p, page, checkout, broken: page.ok === false || checkout.ok === false, lib: lib ? { id: lib.offering_id, title: lib.title } : null };
  }).sort((a, b) => ORDER[a.state] - ORDER[b.state]
    || (a.state === 'ended' ? String(b.endsAt || b.startsAt).localeCompare(String(a.endsAt || a.startsAt)) : String(a.startsAt).localeCompare(String(b.startsAt)))
    || a.title.localeCompare(b.title));

  const count = k => k === 'all' ? rows.length : k === 'attention' ? rows.filter(r => r.broken).length : rows.filter(r => r.state === k).length;
  const shown = rows.filter(r => tab === 'all' || (tab === 'attention' ? r.broken : r.state === tab));
  const broken = count('attention');

  return (
    <Shell user={user} current="landing" eyebrow="Website" title="Landing Pages"
      desc="Every /lp/ page on the website, read straight from the site. New pages appear here on their own within five minutes."
      head={<div className="ops-actions"><span className="mono ops-last">Links checked {new Date().toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' })} ET</span><a className="btn ghost" href={`/ops/landing?tab=${tab}&check=1`}>Check links now</a></div>}>
      {error && <p className="ops-note" role="alert">{error}</p>}
      <div className="ops-tiles" role="list">
        {[[count('running'), 'Running now'], [count('upcoming'), 'Upcoming'], [count('evergreen'), 'Evergreen'], [broken, broken ? 'Broken links' : 'All links working']].map(([n, l]) =>
          <div className={`ops-tile${l === 'Broken links' ? ' lp-risk' : ''}`} role="listitem" key={l}><span className="n">{n}</span><span className="l">{l}</span></div>)}
      </div>
      <nav className="ops-tabs" aria-label="Landing pages">
        {TABS.map(([k, name]) => <a key={k} href={`/ops/landing?tab=${k}`} aria-current={k === tab ? 'page' : undefined}>{name}<span className="chipn mono">{count(k)}</span></a>)}
      </nav>
      {!shown.length
        ? <p className="ops-empty-box">{error ? 'Nothing to show until the website’s list can be read.' : tab === 'attention' ? 'Every page and checkout link is answering normally.' : tab === 'all' ? 'No landing pages on the website yet.' : 'Nothing here right now.'}</p>
        : <ul className="ops-lib-rows lp-rows">
          {shown.map(r => {
            const [word, dot] = STATES[r.state];
            return (
              <li key={r.slug || r.url} className={`ops-lib-row lp-row${r.state === 'ended' ? ' ended' : ''}${r.broken ? ' broken' : ''}`}>
                <span className="body">
                  <a className="ttl" href={r.url} target="_blank" rel="noopener noreferrer">{r.title}</a>
                  <span className="meta">
                    <span className="st"><i className={`sq ${dot}`} aria-hidden="true" />{word}</span>
                    {r.teacher && <span>{r.teacher}</span>}
                    {range(r) && <span className="mono">{range(r)}</span>}
                    {r.publishedAt && <span className="mono">Published {day(r.publishedAt)}</span>}
                    {r.lib && (editLibrary ? <a className="tag-pine" href={`/ops/library/${r.lib.id}`}>Course Library entry</a> : <span className="tag-pine">In the Course Library</span>)}
                  </span>
                  <span className="lp-links">
                    <span className="lp-link"><span className="k">Live page</span><a className="mono" href={r.url} target="_blank" rel="noopener noreferrer">{short(r.url)}</a>
                      {r.page.ok === false && <span className="lp-bad"><i className="sq red" aria-hidden="true" />{r.page.say}</span>}</span>
                    <span className="lp-link"><span className="k">Checkout</span>{r.checkoutUrl
                      ? <><a className="mono" href={r.checkoutUrl} target="_blank" rel="noopener noreferrer">{short(r.checkoutUrl)}</a>{r.checkout.ok === false && <span className="lp-bad"><i className="sq red" aria-hidden="true" />{r.checkout.say}</span>}</>
                      : <span className="none">No checkout link</span>}</span>
                  </span>
                  {r.state === 'ended' && <span className="lp-nudge">Event ended — take down or convert to on-demand?</span>}
                </span>
                <span className="acts"><CopyLink url={r.url} /></span>
              </li>
            );
          })}
        </ul>}
      <p className="ops-note ops-foot">This list comes from the website itself, so there’s nothing to enter here. To change a page, edit it on the website. A page is flagged when its address doesn’t answer normally, or when its checkout link fails.</p>
    </Shell>
  );
}
