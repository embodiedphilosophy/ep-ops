import { redirect } from 'next/navigation';

// Admin was split up: its triage list is Tasks → No owner, its tables are in Settings.
export const dynamic = 'force-dynamic';
export default async function Admin({ searchParams }) {
  const sp = await searchParams;
  redirect(sp?.t ? `/ops/settings?t=${encodeURIComponent(sp.t)}` : '/ops/tasks?show=unowned');
}
