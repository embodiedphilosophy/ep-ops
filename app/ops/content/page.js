import { isStaff, canEditSite } from '@/lib/ops/nav';
import { redirect } from 'next/navigation';
import { todayET } from '@/lib/events';
import { longDate } from '@/lib/dates';
import Shell, { opsUser } from '../Shell';
import SiteEditor from './SiteEditor';
import { settingsHref } from '@/lib/ops/settingsgroups';
import { EmailViews } from '../email/EmailKit';
import { draftUrl } from '@/lib/kit';
import { promoRows } from '@/lib/ops/promo';
import { loadPages, offeringKey } from '@/lib/teach';
import PromoEmails from './PromoEmails';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Content — Embodied Philosophy', robots: { index: false, follow: false } };

// Publish › Promo emails (app/ops/place.js asks for it with ?tab=email). The older /ops/content?tab=... addresses go to their new homes.
export default async function Content({ searchParams }) {
  const user = await opsUser(isStaff);
  const sp = await searchParams;
  // The website tables moved to Settings
  // Social moved to its own workspace (/ops/publish): old links and bookmarks land on the right page
  if (sp?.tab === 'social') {
    const s = String(sp.s || '');
    const to = { review: 'review', health: 'review', history: 'published', quotes: 'library', captions: 'library', rules: 'rules', art: 'library', images: 'library', promo: 'library', videos: 'library', categories: 'library', sources: 'library' }[s];
    const keep = ['art', 'promo', 'videos', 'categories', 'sources', 'quotes', 'captions'].includes(s) ? `&s=${s}` : '';
    redirect(to === 'rules' ? '/ops/settings?view=templates&s=social-rules' : to ? `/ops/publish?view=${to}${keep}` : '/ops/publish');
  }
  if (sp?.tab === 'website') redirect(sp?.t ? settingsHref(String(sp.t)) : '/ops/settings');
  // Everything else that used to live here moved (lib/ops/redirects.mjs sends /ops/content?tab=media and ?tab=review on before this runs)
  if (sp?.tab === 'media') redirect('/ops/programs?view=recordings');
  if (sp?.tab === 'review') redirect('/ops/people?view=review');
  if (sp?.tab !== 'email') redirect('/ops/publish');
  return (
    <Shell user={user} current="email-emails" desc="The promo emails planned for each event: written and adjusted here, checked against Kit." eyebrow="Teachers · Email · Launches" title="Promo emails"
      head={<EmailViews on="promo" />}>
      <Email canEdit={canEditSite(user)} />
      <SiteEditor scope="email" initial="scaffolding" base="/ops/publish?view=promo&" />
    </Shell>
  );
}


// Promo emails per event: planned in Task Templates, written and adjusted on the Promo Emails tab, checked
// against Kit (lib/ops/promo.js). Editing, previewing and building Kit drafts happen in PromoEmails.
async function Email({ canEdit }) {
  const [{ rows, untagged, kit, failed }, pages] = await Promise.all([
    promoRows().catch(() => ({ rows: [], untagged: [], kit: false, failed: true })),
    loadPages({ fresh: false }).catch(() => []),
  ]);
  const short = iso => iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/New_York' }) : '';
  const pageOf = Object.fromEntries(pages.map(p => [p.offering, p]));
  const kitOf = b => b && { id: b.id, subject: b.subject || '', at: b.at || '', sent: !!b.sent, url: draftUrl(b.id) };
  // Plain data for the client list (the teacher's promo blurbs seed the body of planned emails 1–3)
  const events = rows.map(({ e, all, extra, ready }) => {
    const page = pageOf[offeringKey(e)];
    let n = 0;
    return {
      id: e.sched_id, title: e.title, date: e.date, when: longDate(e.date), registration: e.registration_url || '', kit, ready,
      emails: all.map(x => ({ key: x.key, label: x.label, planned: x.planned, due: x.due, planDue: x.planDue || '', row: x.row, values: x.values, skipped: x.skipped,
        kit: kitOf(x.kit), blurb: x.planned && page ? String(page[`promo_${++n}`] || '').trim() : '' })),
      unmatched: extra.map(kitOf),
    };
  });
  return (
    <section>
      <h2 className="ops-sub">Promo emails <span>{rows.filter(r => r.ready < r.want.length).length || ''}</span></h2>
      <p className="ops-empty" style={{ maxWidth: 680 }}>Each upcoming event’s promo emails, as Task Templates plan them. Click one to write it, preview it and build its Kit draft (sending stays in Kit). Mark a planned email “Not needed” if this event doesn’t need it, or add another. A Kit email counts for an event when its subject or internal description carries the event ID, e.g. “[E047] Promo #2”; drafts built here carry it already.</p>
      {failed ? <p className="ops-empty">Couldn’t read the calendar sheet. Try again shortly.</p>
        : !kit && <p className="ops-empty">Kit isn’t connected (KIT_API_KEY), so what’s scheduled can’t be checked yet.</p>}
      {!failed && (events.length === 0 ? <p className="ops-empty">No events in the next 10 weeks need promo emails.</p>
        : <PromoEmails events={events} canEdit={canEdit} today={todayET()} />)}
      {untagged.length > 0 && (<>
        <h3 className="ops-se-h">Scheduled without an event ID</h3>
        <p className="ops-empty">Add the event ID to the subject or internal description in Kit if these promote an event.</p>
        <ul className="ops-promo-un">{untagged.map(b => <li key={b.id}><a href={draftUrl(b.id)} target="_blank" rel="noopener">{b.subject || 'Untitled'}</a> <span>{short(b.at)}</span></li>)}</ul>
      </>)}
      <h2 className="ops-sub" style={{ marginTop: 28 }}>The Weekly Scaffolding</h2>
    </section>
  );
}
