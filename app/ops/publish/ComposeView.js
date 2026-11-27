import Shell, { opsUser } from '../Shell';
import { isStaff, canYouTube } from '@/lib/ops/nav';
import { studio, problems, SERIES, PRIVACY } from '@/lib/ops/youtube';
import ComposePage from '../social/ComposePage';
import { EmailEditor } from '../email/EmailEditor';
import { Cut } from '../youtube/Studio';
import '../social/social.css';
import '../email/email.css';
import './publish.css';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Compose — Embodied Philosophy', robots: { index: false, follow: false } };
const first = v => (Array.isArray(v) ? v[0] : v) || '';
const KINDS = [['email', 'Email'], ['post', 'Post'], ['video', 'Video cut']];

// Publish › Compose (EP Ops 2, step 6): one frame for the three things that go out. The Post composer, the Email editor and the Video cut
// editor are the existing ones, unchanged, shown in the same three columns (details, preview, checks). ?kind=email|post|video picks one;
// with no kind it is a post (the old /ops/social/compose address), and /ops/publish?view=compose-email is the email.
export default async function Page({ searchParams } = {}) {
  const user = await opsUser(isStaff);
  const sp = (await searchParams) || {};
  const asked = first(sp.kind);
  const kind = asked === 'email' ? 'email' : asked === 'video' && canYouTube(user) ? 'video' : 'post';
  const kinds = KINDS.filter(([k]) => k !== 'video' || canYouTube(user));
  let body;
  if (kind === 'post') {
    const row = first(sp.row);
    body = (
      <div className="soc-compose">
        <header className="soc-head">
          <div><span className="eyebrow">Publish · Post</span><h1>{row ? 'Edit' : 'New'} <em>post</em></h1></div>
          <div className="soc-act"><a className="soc-btn" href="/ops/publish?show=social">← Calendar</a></div>
        </header>
        <ComposePage row={row} type={first(sp.type)} date={first(sp.date)} seeded={!!sp.seed} />
      </div>);
  } else if (kind === 'email') {
    body = <EmailEditor />;
  } else {
    const s = await studio().catch(() => null), id = first(sp.id);
    const cuts = s ? [...s.review, ...s.published] : [], cut = cuts.find(c => c.id === id);
    body = (
      <div className="soc-compose">
        <header className="soc-head">
          <div><span className="eyebrow">Publish · Video cut</span><h1>{cut ? 'Edit' : 'Choose a'} <em>video cut</em></h1><p>Cuts are made from the Vimeo talks and go to YouTube from here.</p></div>
          <div className="soc-act"><a className="soc-btn" href="/ops/publish?view=video">← Video</a></div>
        </header>
        {!s && <p className="ops-err" role="alert">Couldn’t load the YouTube records.</p>}
        {cut ? <Cut c={cut} series={SERIES} privacy={PRIVACY} checks={cut.status === 'published' ? [] : problems(cut)} />
          : <section className="soc-panel" aria-label="Cuts"><div className="ph"><h2>Cuts</h2><span className="sub">Pick one to edit and push to YouTube.</span></div>
            {!cuts.length ? <p className="ops-empty">No cuts yet. Approve a proposal on <a href="/ops/publish?view=video">Video</a> and its cut appears here.</p>
              : <ul className="pub-list">{cuts.map(c => <li key={c.id}><a className="soc-btn small" href={`/ops/publish?view=compose&kind=video&id=${encodeURIComponent(c.id)}`}>{c.yt_title || c.source_title || c.id}</a><span className="sub">{c.status === 'published' ? 'On YouTube' : c.status === 'review' ? 'Ready for review' : 'Being worked on'}</span></li>)}</ul>}
          </section>}
      </div>);
  }
  return (
    <Shell user={user} current="publish">
      <div className={`pub-compose k-${kind}`}>
        <nav className="pub-kinds" aria-label="What are you making?">
          <span className="pub-cap">Make</span>
          {kinds.map(([k, l]) => <a key={k} className="pub-chip" href={`/ops/publish?view=compose&kind=${k}`} aria-current={k === kind ? 'page' : undefined}>{l}</a>)}
          <span className="sub">Details on the left, a preview in the middle, checks on the right.</span>
        </nav>
        {body}
      </div>
    </Shell>
  );
}
