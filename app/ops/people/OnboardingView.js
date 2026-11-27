import { canEditEvents } from '@/lib/ops/nav';
import OnboardingStudio from './OnboardingStudio';
import Shell, { opsUser } from '../Shell';

const first = v => (Array.isArray(v) ? v[0] : v) || '';

// People › Onboarding (the old Faculty → Onboarding): see a teacher's onboarding as they will, edit it, send the invitation.
// A person's own record has the same thing under "Invitations and onboarding".
export default async function OnboardingView({ searchParams }) {
  const user = await opsUser(canEditEvents), sp = (await searchParams) || {};
  return (
    <Shell user={user} current="people" desc="See a teacher’s onboarding exactly as they will, adjust it, then send their invitation." eyebrow="Teacher onboarding" title="Onboarding">
      <OnboardingStudio initial={first(sp.email).toLowerCase()} />
    </Shell>);
}
