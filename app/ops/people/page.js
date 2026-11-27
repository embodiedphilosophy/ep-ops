import { redirect } from 'next/navigation';
import { renderPlace } from '../place';

export const dynamic = 'force-dynamic';

// people: one of the eight places; the view comes from ?view= (see app/ops/place.js). One person is a record: /ops/people/[id].
const first = v => (Array.isArray(v) ? v[0] : v) || '';
export default async function Page(props) {
  const sp = (await props.searchParams) || {};
  // the older addresses that named a person (?email=) open their record (the Teacher profiles page); Onboarding keeps ?email= for its picker
  if (first(sp.email) && !first(sp.view) && first(sp.tab) !== 'onboarding') redirect(`/ops/people/${encodeURIComponent(first(sp.email).toLowerCase())}?tab=profile`);
  return renderPlace('people', props);
}
