import { notFound, redirect } from 'next/navigation';
import { loadPages, loadProfiles, offeringKey } from '@/lib/teach';
import { loadCalendar } from '@/lib/calendar';
import { currentUser } from '@/lib/ops/auth';
import { canEditSite } from '@/lib/ops/nav';
import { CoursePageView } from '@/app/teach/Onboarding';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Course page preview — Embodied Philosophy' };

// The editors (Jacob, Irene, Floss) and the course's own teachers can see a course page before it's published
export default async function Preview({ params }) {
  const { slug } = await params;
  const user = await currentUser();
  if (!user) redirect('/ops/login');
  const page = (await loadPages()).find(p => p.slug === slug);
  if (!page) notFound();
  const emails = String(page.teacher_emails || '').split(/[\s,]+/).map(s => s.toLowerCase()).filter(Boolean);
  if (!canEditSite(user) && !emails.includes(user.email)) notFound();
  const evs = (await loadCalendar()).filter(e => offeringKey(e) === page.offering).sort((a, b) => a.date.localeCompare(b.date));
  if (!evs.length) notFound();
  const f = evs[0], last = evs[evs.length - 1];
  const o = { key: page.offering, program: f.program, host: f.host, title: f.title, time: f.time, price: f.price,
    start: f.date, end: last.end_date || last.date, sessions: evs.map(e => ({ id: e.id, date: e.date, time: e.time })) };
  const profiles = (await loadProfiles()).filter(p => emails.includes(String(p.email).toLowerCase())).map(p => ({ name: p.name, role: p.role, bio: p.bio, photo: p.photo_url }));
  const live = String(page.status).toLowerCase() === 'published';
  const site = process.env.SITE_URL || 'https://www.embodiedphilosophy.com';
  return (
    <div className="ops-root course-page">
      <div className="t-demo">{live ? <>This page is live at <a href={`${site}/courses/${slug}`}>{site.replace(/^https?:\/\//, '')}/courses/{slug}</a>.</> : 'Draft preview. It goes live on the website once the EP team publishes it (Team → Waiting for review).'}</div>
      <CoursePageView o={o} page={page} profile={{ ...(profiles[0] || { name: f.teachers }), others: profiles.length ? profiles : undefined }} />
    </div>
  );
}
