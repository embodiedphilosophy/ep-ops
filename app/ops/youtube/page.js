import { canYouTube } from '@/lib/ops/nav';
import { studio, dispatchConfigured, SERIES, PRIVACY } from '@/lib/ops/youtube';
import Shell, { opsUser } from '../Shell';
import { Proposals, Review, Published, Skipped } from './Studio';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'YouTube — Embodied Philosophy', robots: { index: false, follow: false } };

const TABS = [['week', 'This week'], ['review', 'Review queue'], ['published', 'Published'], ['skipped', 'Skipped']];
const TITLES = { week: 'This week’s proposals', review: 'Review queue', published: 'Published', skipped: 'Skipped' };
const DESCS = {
  week: 'Five talks from the Studio-Produced Vimeo archive, picked each Monday. Approve the ones worth a 15–20 minute YouTube cut.',
  review: 'Finished cuts. Watch the stretch, tidy the title and thumbnail, then push to YouTube.',
  published: 'Everything sent to YouTube from here. None of these is proposed again.',
  skipped: 'Proposals you passed on. They won’t be proposed again unless you bring them back.',
};
const day = iso => iso ? new Date(iso + (iso.length === 10 ? 'T12:00:00Z' : '')).toLocaleDateString('en-US', { timeZone: 'America/New_York', month: 'long', day: 'numeric' }) : '';

export default async function YouTube({ searchParams }) {
  const user = await opsUser(canYouTube);
  const sp = await searchParams;
  const tab = TABS.some(t => t[0] === sp?.tab) ? sp.tab : 'week';
  const s = await studio().catch(e => ({ error: e.message, proposals: [], earlier: [], review: [], published: [], skipped: [], week: '' }));
  const count = { week: s.proposals.filter(p => p.status === 'proposed').length, review: s.review.length, published: s.published.length, skipped: s.skipped.length };
  const tiles = [
    [count.week, 'Waiting for a yes'],
    [[...s.proposals, ...s.earlier].filter(p => p.status === 'producing').length, 'Being cut'],
    [s.review.filter(c => c.status === 'review').length, 'Ready for review'],
    [s.published.length, 'On YouTube'],
  ];
  return (
    <Shell user={user} current="youtube" eyebrow={s.week ? `Week of ${day(s.week)}` : 'Vimeo → YouTube'} title={TITLES[tab]} desc={DESCS[tab]}>
      <div className="ops-tiles" role="list">
        {tiles.map(([n, l]) => <div className="ops-tile" role="listitem" key={l}><span className="n">{n}</span><span className="l">{l}</span></div>)}
      </div>
      {s.error && <p className="ops-err" role="alert">Couldn’t load YouTube records: {s.error}</p>}
      {!dispatchConfigured() && <p className="ops-note">The YouTube pipeline isn’t connected yet, so Approve, Re-cut, Re-render and Push won’t start anything. Add GITHUB_PIPELINE_TOKEN to the ep-ops project on Vercel.</p>}
      <nav className="ops-tabs" aria-label="YouTube">
        {TABS.map(([k, name]) => <a key={k} href={`/ops/youtube?tab=${k}`} aria-current={k === tab ? 'page' : undefined}>{name}<span className="chipn mono">{count[k]}</span></a>)}
      </nav>
      {tab === 'week' && <Proposals rows={[...s.proposals, ...s.earlier]} series={SERIES} hasWeek={!!s.week} />}
      {tab === 'review' && <Review cuts={s.review} series={SERIES} privacy={PRIVACY} />}
      {tab === 'published' && <Published cuts={s.published} />}
      {tab === 'skipped' && <Skipped rows={s.skipped} series={SERIES} />}
      <p className="ops-note ops-foot">New proposals arrive every Monday morning. Cuts are made on GitHub (the ep-youtube-pipeline repo) and usually take 20–40 minutes; this page shows them as soon as they’re back. Everything goes to YouTube as private unless you choose otherwise.</p>
    </Shell>
  );
}
