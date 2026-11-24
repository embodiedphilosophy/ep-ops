import { notFound } from 'next/navigation';
import Shell, { opsUser } from '../../Shell';
import { isStaff } from '@/lib/ops/nav';
import SocialEngine from '../../content/SocialEngine';
import '../social.css';

export const dynamic = 'force-dynamic';

// The libraries and tables behind the posts, each on its own page (design: Library, Sources, Published & insights, Rules)
const SECTIONS = {
  library: { nav: 'social-library', title: 'Library', em: '', desc: 'One place for art, promo graphics and video.', keys: ['art', 'promo', 'videos', 'categories', 'sources'] },
  sources: { nav: 'social-sources', title: 'Sources', em: '· Quotes & Captions', desc: 'Only verified quotes and approved snippets are ever used.', keys: ['quotes', 'captions'] },
  published: { nav: 'social-published', title: 'Published', em: '& insights', desc: 'What went out on Instagram, newest first.', keys: ['history'] },
  rules: { nav: 'social-rules', title: 'Rules', em: '', desc: 'How the planner works: posts per week, the mix, times, reuse gaps and guardrails.', keys: ['rules'], director: true },
};

export default async function Page({ params, searchParams }) {
  const { section } = await params;
  const cfg = SECTIONS[section];
  if (!cfg) notFound();
  const user = await opsUser(u => isStaff(u) && (!cfg.director || u.director));
  const sp = await searchParams;
  return (
    <Shell user={user} current={cfg.nav}>
      <div className="soc">
        <header className="soc-head">
          <div><span className="eyebrow">Content · Social</span><h1>{cfg.title} {cfg.em && <em>{cfg.em}</em>}</h1><p>{cfg.desc}</p></div>
          <div className="soc-act"><a className="soc-btn" href="/ops/social">← Calendar</a></div>
        </header>
        <SocialEngine director={!!user.director} keys={cfg.keys} initial={sp?.s} base={`/ops/social/${section}`} />
      </div>
    </Shell>
  );
}
