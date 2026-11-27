import { canPayroll } from '@/lib/ops/nav';
import Shell, { opsUser } from '../Shell';
import Payroll from './Payroll';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Payroll — Embodied Philosophy', robots: { index: false, follow: false } };

// The month's pay in one place: faculty sessions, salaried and hourly staff. Directors, and anyone given the Payroll role.
export default async function Page({ searchParams }) {
  const user = await opsUser(canPayroll);
  const sp = await searchParams;
  return (
    <Shell user={user} current="payroll" eyebrow="Business" title="Payroll"
      desc="Every payment for the month in one place: filled in from the schedule, invitations, salaries and the time clock, and all of it editable. Finalize the month, then send it to the payroll admin.">
      <Payroll initialMonth={/^\d{4}-\d{2}$/.test(sp?.month || '') ? sp.month : ''} />
    </Shell>
  );
}
