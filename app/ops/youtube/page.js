import { canEditSocial } from '@/lib/ops/nav';
import { listItems, youtubeAvailable, STATUS, seriesList } from '@/lib/ops/youtube';
import Shell, { opsUser } from '../Shell';
import { Proposal, Review, Retry } from './YouTubeCards';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'YouTube — Embodied Philosophy', robots: { index: false, follow: false } };

const TABS = [['review', 'To review'], ['week', 'This week’s picks'], ['done', 'Published']];
const REVIEW = ['approved', 'producing', 'ready', 'publishing', 'failed'];
const DONE = ['published', 'skipped'];
const mins = s => (s ? `${Math.round(s / 60)} min` : '');
const day = v => (v ? new Date(v).toLocaleDateString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric' }) : '');

export default async function YouTube({ searchParams }) {
  const user = await opsUser(canEditSocial);
  const sp = await searchParams;
  const ok = youtubeAvailable();
  const items = ok ? await listItems().catch(e => { console.error('YouTube list failed', e.message); return null; }) : null;
  const all = items || [];
  const groups = {
    review: all.filter(i => REVIEW.includes(i.status)),
    week: all.filter(i => i.status === 'proposed'),
    done: all.filter(i => DONE.includes(i.status)),
  };
  const readyCount = groups.review.filter(i => i.status === 'ready').length;
  const tab = TABS.some(t => t[0] === sp?.tab) ? sp.tab : (groups.review.length ? 'review' : 'week');
  const shown = groups[tab];

  return (
    <Shell user={user} current="youtube" eyebrow="Publishing" title="YouTube"
      desc="Each Monday the pipeline picks five studio videos from Vimeo. Approve the ones you want: it cuts the strongest 15–20 minutes, makes a thumbnail, and brings it back here for you to check before it goes to YouTube.">
      {!ok && <p className="ops-note" role="alert">The database isn’t connected, so nothing can show here yet.</p>}
      {ok && !items && <p className="ops-note" role="alert">Couldn’t read the YouTube list just now. Try again in a minute.</p>}
      <div className="ops-tiles" role="list">
        {[[groups.week.length, 'Picks waiting for a yes'], [readyCount, 'Ready to check'],
          [groups.review.length - readyCount, 'Being edited or uploaded'], [all.filter(i => i.status === 'published').length, 'On YouTube']]
          .map(([n, l]) => <div className="ops-tile" role="listitem" key={l}><span className="n">{n}</span><span className="l">{l}</span></div>)}
      </div>
      <nav className="ops-tabs" aria-label="YouTube">
        {TABS.map(([k, name]) => <a key={k} href={`/ops/youtube?tab=${k}`} aria-current={k === tab ? 'page' : undefined}>{name}<span className="chipn mono">{groups[k].length}</span></a>)}
      </nav>
      {!shown.length
        ? <p className="ops-empty-box">{tab === 'week' ? 'No picks waiting. The next five arrive on Monday.' : tab === 'review' ? 'Nothing being edited. Approve a pick to start one.' : 'Nothing published yet.'}</p>
        : <ul className="ops-lib-rows yt-rows">
          {shown.map(i => {
            const [word, dot] = STATUS[i.status] || [i.status, ''];
            return (
              <li key={i.id} className="ops-lib-row yt-row">
                <span className="body">
                  <span className="ttl">{i.status === 'proposed' || !i.ytTitle ? i.title : i.ytTitle}</span>
                  <span className="meta">
                    <span className="st"><i className={`sq ${dot}`} aria-hidden="true" />{word}</span>
                    {i.teacher && <span>{i.teacher}</span>}
                    {i.status === 'proposed' && i.durationSec ? <span className="mono">{mins(i.durationSec)} source</span> : null}
                    {i.status === 'proposed' && i.plays ? <span className="mono">{i.plays} plays</span> : null}
                    {i.cut?.duration_sec ? <span className="mono">{mins(i.cut.duration_sec)} cut</span> : null}
                    <span className="mono">{day(i.updatedAt)}</span>
                    {i.link && <a href={i.link} target="_blank" rel="noopener noreferrer">Source on Vimeo</a>}
                    {i.youtubeUrl && <a className="tag-pine" href={i.youtubeUrl} target="_blank" rel="noopener noreferrer">Open on YouTube</a>}
                  </span>
                  {i.status === 'proposed' && <Proposal item={i} series={seriesList} />}
                  {['approved', 'producing'].includes(i.status) && <span className="hint">Editing usually takes 15–40 minutes after the pipeline picks it up (it checks every half hour).</span>}
                  {i.status === 'publishing' && <span className="hint">Uploading to YouTube. This takes a few minutes once the pipeline picks it up.</span>}
                  {i.status === 'failed' && <Retry item={i} />}
                  {i.status === 'ready' && <Review item={i} />}
                </span>
              </li>
            );
          })}
        </ul>}
      <p className="ops-note ops-foot">Cuts wait on Vimeo (unlisted, in the YouTube Queue folder) until you push them. Videos go to YouTube as private unless you choose otherwise, so you can still check them in YouTube Studio.</p>
    </Shell>
  );
}
