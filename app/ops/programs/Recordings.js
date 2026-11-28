import Shell, { opsUser } from '../Shell';
import { isStaff } from '@/lib/ops/nav';
import { Media } from '../email/Media';
import '../social/social.css';
import '../email/email.css';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Media — Embodied Philosophy', robots: { index: false, follow: false } };

export default async function Page() {
  const user = await opsUser(isStaff);
  return (
    <Shell user={user} current="email-media" eyebrow="Programs" title="Recordings" desc="Recordings to post, the latest episodes, and what is coming for Tarka.">
      <Media bare />
    </Shell>);
}
