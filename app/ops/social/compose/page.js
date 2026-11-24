import Shell, { opsUser } from '../../Shell';
import { isStaff } from '@/lib/ops/nav';
import ComposePage from '../ComposePage';
import '../social.css';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Composer — Embodied Philosophy', robots: { index: false, follow: false } };

export default async function Page({ searchParams }) {
  const user = await opsUser(isStaff);
  const sp = await searchParams;
  return (
    <Shell user={user} current="social-compose">
      <div className="soc">
        <header className="soc-head">
          <div><span className="eyebrow">Content · Social</span><h1>{sp?.row ? 'Edit' : 'New'} <em>post</em></h1></div>
          <div className="soc-act"><a className="soc-btn" href="/ops/social">← Calendar</a></div>
        </header>
        <ComposePage row={sp?.row || ''} type={sp?.type || ''} date={sp?.date || ''} seeded={!!sp?.seed} />
      </div>
    </Shell>
  );
}
