import { redirect } from 'next/navigation';

// Moved in EP Ops 2 (step 7): this address redirects to its new home (lib/ops/redirects.mjs does it first; this is the fallback)
export const dynamic = 'force-dynamic';
export default function Page() { redirect('/ops/students?view=pods'); }
