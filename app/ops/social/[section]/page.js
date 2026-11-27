import { notFound, redirect } from 'next/navigation';

// Moved in EP Ops 2 (step 6): Library, Sources and Published are views of Publish and Rules is in Settings (lib/ops/redirects.mjs does the
// redirect first; this is the fallback). The page itself is app/ops/publish/LibraryView.js.
export const dynamic = 'force-dynamic';
const TO = { library: '/ops/publish?view=library', sources: '/ops/publish?view=library&s=sources', published: '/ops/publish?view=published', rules: '/ops/settings?view=templates&s=social-rules' };
export default async function Page({ params }) {
  const { section } = await params;
  if (!TO[section]) notFound();
  redirect(TO[section]);
}
