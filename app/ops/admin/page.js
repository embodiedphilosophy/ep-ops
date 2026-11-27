import { redirect } from 'next/navigation';
import { settingsHref } from '@/lib/ops/settingsgroups';

// Admin was split up: its triage list is Tasks → No owner, its tables are in Settings (?t=<table> opens that table's section).
export const dynamic = 'force-dynamic';
export default async function Admin({ searchParams }) {
  const sp = await searchParams;
  redirect(sp?.t ? settingsHref(String(sp.t)) : '/ops/tasks?show=unowned');
}
