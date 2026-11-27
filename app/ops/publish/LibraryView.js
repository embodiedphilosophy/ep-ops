import { notFound } from 'next/navigation';
import Shell, { opsUser } from '../Shell';
import { isStaff } from '@/lib/ops/nav';
import SocialEngine from '../content/SocialEngine';
import LibraryPage from '../social/LibraryPage';
import { canEditSocial } from '@/lib/ops/nav';
import '../social/social.css';

export const dynamic = 'force-dynamic';

// The libraries and tables behind the posts, each on its own page (design: Library, Sources, Published & insights; the Rules are in Settings › Templates)
const SECTIONS = {
  library: { nav: 'social-library', title: 'Library', em: '', desc: 'One place for art, promo graphics and video.', keys: ['categories', 'sources'] },
  sources: { nav: 'social-library', title: 'Sources', em: '· Quotes & Captions', desc: 'Only verified quotes and approved snippets are ever used.', keys: ['quotes', 'captions'] },
  published: { nav: 'social-published', title: 'Published', em: '& insights', desc: 'What went out on Instagram, newest first.', keys: ['history'] },
};

export default async function Page({ params, searchParams }) {
  const { section: asked } = await params;
  const sp = await searchParams;
  // ?s=quotes or ?s=captions is the Sources page (Quotes & captions); the Library's own tables are ?s=categories and ?s=sources (Archive folders)
  const section = asked === 'library' && ['quotes', 'captions'].includes(sp?.s) ? 'sources' : asked;
  const cfg = SECTIONS[section];
  if (!cfg) notFound();
  const user = await opsUser(u => isStaff(u) && (!cfg.director || u.director));
  // The Library is its own three-pane screen (filters, pictures, provenance); its categories and archive folders stay as tables behind a link
  // (directors only: they are director tables, so anyone else asking for them gets the Library, not an error)
  if (section === 'library' && !(['categories', 'sources'].includes(sp?.s) && user.director)) return <Shell user={user} current={cfg.nav}><LibraryPage canEdit={canEditSocial(user)} director={!!user.director} /></Shell>;
  return (
    <Shell user={user} current={cfg.nav}>
      <div className="soc">
        <header className="soc-head">
          <div><span className="eyebrow">Content · Social</span><h1>{cfg.title} {cfg.em && <em>{cfg.em}</em>}</h1><p>{cfg.desc}</p></div>
          <div className="soc-act">{section === 'sources' ? <a className="soc-btn" href="/ops/publish?view=library">← Library</a> : <a className="soc-btn" href="/ops/publish">← Calendar</a>}</div>
        </header>
        <SocialEngine director={!!user.director} keys={cfg.keys} initial={sp?.s} base={`/ops/publish?view=${section === 'sources' ? 'library' : section}`} />
      </div>
    </Shell>
  );
}
