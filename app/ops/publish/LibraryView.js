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
  const { section } = await params;
  const cfg = SECTIONS[section];
  if (!cfg) notFound();
  const user = await opsUser(u => isStaff(u) && (!cfg.director || u.director));
  const sp = await searchParams;
  // The Library is its own three-pane screen (filters, pictures, provenance); its categories and archive folders stay as tables behind a link
  if (section === 'library' && !['categories', 'sources'].includes(sp?.s)) return <Shell user={user} current={cfg.nav}><LibraryPage canEdit={canEditSocial(user)} /></Shell>;
  return (
    <Shell user={user} current={cfg.nav}>
      <div className="soc">
        <header className="soc-head">
          <div><span className="eyebrow">Content · Social</span><h1>{cfg.title} {cfg.em && <em>{cfg.em}</em>}</h1><p>{cfg.desc}</p></div>
          <div className="soc-act">{section === 'sources' ? <a className="soc-btn" href="/ops/publish?view=library">← Library</a> : <a className="soc-btn" href="/ops/publish">← Calendar</a>}</div>
        </header>
        <SocialEngine director={!!user.director} keys={cfg.keys} initial={sp?.s} base={`/ops/publish?view=${section}`} />
      </div>
    </Shell>
  );
}
