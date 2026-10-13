import { notFound } from 'next/navigation';
import { canEditSite } from '@/lib/ops/nav';
import { getOffering } from '@/lib/ops/offerings';
import { circleChanges, onboardingChanges, FIELD_NAMES } from '@/lib/ops/library';
import { linkChoices } from '@/lib/ops/libraryprefill';
import Shell, { opsUser } from '../../Shell';
import Form from './Form';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Course Library — Embodied Philosophy', robots: { index: false, follow: false } };

export default async function Prepare({ params }) {
  const user = await opsUser(canEditSite);
  const o = await getOffering((await params).id);
  if (!o) notFound();
  const choices = await linkChoices().catch(() => []);
  return (
    <Shell user={user} current="library" eyebrow={o.status === 'published' ? 'Live listing' : 'Prepare and publish a listing'} title={o.title || 'Untitled'}
      head={<a className="btn ghost" href="/ops/library">Back to Course Library</a>}>
      <Form initial={o} choices={choices}
        changed={{ circle: circleChanges(o).map(f => FIELD_NAMES[f] || f), onboarding: onboardingChanges(o).map(f => FIELD_NAMES[f] || f) }}
        kalighat={process.env.KALIGHAT_COVER_URL || ''} />
    </Shell>
  );
}
