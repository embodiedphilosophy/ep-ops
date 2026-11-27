import { getEpisodes, placeholder } from '@/lib/podcast';
import { isStaff, canEditSite } from '@/lib/ops/nav';
import { redirect } from 'next/navigation';
import Review from '../people/Review';
import { loadCalendar, loadTemplates } from '@/lib/calendar';
import { todayET } from '@/lib/events';
import { addDays } from '@/lib/ops/tasks';
import { longDate } from '@/lib/dates';
import Shell, { opsUser } from '../Shell';
import SiteEditor from './SiteEditor';
import { settingsHref } from '@/lib/ops/settingsgroups';
import { tableOf } from '@/lib/ops/sitetables';
import { EmailViews } from '../email/EmailKit';
import { NextPosts } from './SocialEngine';
import { draftUrl } from '@/lib/kit';
import { promoRows } from '@/lib/ops/promo';
import { waitingReplays } from '@/lib/ops/lanes';
import { loadPages, offeringKey } from '@/lib/teach';
import PromoEmails from './PromoEmails';
import { upcomingSocial } from '@/lib/social';
import { readPlain } from '@/lib/ops/store';
import { flagOf } from '../SocialGrid';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Content — Embodied Philosophy', robots: { index: false, follow: false } };

const TABS = [['email', 'Promo emails']];

// Is everything we publish moving? Social, Email and Media, and Review: what teachers sent for the website.
// The website's own tables live in Settings.
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
  const tabs = TABS.filter(([k]) => k !== 'review' || canEditSite(user));
  // The old Overview (status board, Next posts) is gone: This week is the new front page, and Next posts lives in Social
  if (sp?.tab === 'media') redirect('/ops/programs?view=recordings');
  if (sp?.tab === 'review') redirect('/ops/people?view=review');
  if (!tabs.some(([k]) => k === sp?.tab)) redirect('/ops/publish');
  const tab = sp.tab;
  return (
    <Shell user={user} current={tab === 'email' ? 'email-emails' : `content-${tab}`} desc="The promo emails planned for each event: written and adjusted here, checked against Kit." eyebrow="Teachers · Email · Launches" title="Promo emails"
      head={tab === 'email' ? <EmailViews on="promo" /> : <nav className="ops-filters" aria-label="Content">{tabs.map(([k, l]) => <a key={k} href={`/ops/content?tab=${k}`} aria-current={k === tab ? 'page' : undefined}>{l}</a>)}</nav>}>
      {tab === 'email' && <Email canEdit={canEditSite(user)} />}
      {tab === 'email' && <SiteEditor scope="email" initial="scaffolding" base="/ops/content?tab=email&" />}
      {tab === 'media' && <Media />}
      {tab === 'review' && (<section><h2 className="ops-sub">Waiting for review</h2><p className="ops-empty">Bios and course pages teachers sent through onboarding. Approving or publishing puts them on the website.</p><Review /></section>)}
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

async function Media() {
  const [episodes, replays] = await Promise.all([getEpisodes(5).then(eps => eps.filter(e => !placeholder.includes(e))).catch(() => []), waitingReplays().catch(() => null)]);
  return (
    <section>
      <h2 className="ops-sub">Replays waiting to be posted <span>{replays?.length || ''}</span></h2>
      {replays === null ? <p className="ops-empty">Couldn’t read the calendar.</p>
        : replays.length === 0 ? <p className="ops-empty">Every session from the last 30 days has its replay.</p> : (
        <ul className="ops-meet">
          {replays.map(e => <li key={e.id}><div className="d">{longDate(e.date)}</div><div className="t">{e.title}</div><div className="w">Post the recording in Circle, then add its link as “Replay in Circle” in the event.</div></li>)}
        </ul>
      )}
      <h2 className="ops-sub">CHITHEADS: latest episodes</h2>
      {episodes.length === 0 ? <p className="ops-empty">Couldn’t read the podcast feed.</p> : (
        <ul className="ops-meet">
          {episodes.map(ep => (
            <li key={ep.title}>
              <div className="d">{ep.num ? `Ep. ${ep.num}` : 'Episode'}{ep.duration ? ` · ${ep.duration}` : ''}</div>
              <div className="t"><a href={ep.url} target="_blank" rel="noopener">{ep.title}</a></div>
              {ep.guest && <div className="w">{ep.guest}</div>}
            </li>
          ))}
        </ul>
      )}
      <p className="ops-empty" style={{ maxWidth: 640, marginTop: 16 }}>Coming next: Tarka milestones.</p>
    </section>
  );
}

const lower = v => String(v || '').trim().toLowerCase();
const shortDay = d => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });

// One row per lane: where it stands and the one next thing to do. Every number comes from data the tabs already read.
async function Overview({ canReview }) {
  const [social, promo, replays, bios, pages] = await Promise.all([
    upcomingSocial(9).catch(() => null),
    promoRows().catch(() => null),
    waitingReplays().catch(() => null),
    canReview ? readPlain('Teachers', { light: true }).catch(() => null) : null,
    canReview ? readPlain('Course Pages', { light: true }).catch(() => null) : null,
  ]);
  const posts = social && !social.error ? social.posts : null;
  const noImage = posts ? posts.filter(p => !p.thumb).length : 0;
  const notReviewed = posts ? posts.filter(p => p.thumb && flagOf(p)).length : 0;
  const needImages = noImage + notReviewed;
  const behind = promo?.kit ? promo.rows.filter(r => r.ready < r.want.length) : [];
  const late = behind.filter(r => r.want[r.ready]?.due < todayET()).length;
  const review = canReview && bios && pages ? [...bios.rows, ...pages.rows].filter(r => lower(r.values.status) === 'submitted').length : null;
  // [lane, level (green|amber|red|none), status word, next action, link]
  const lanes = [
    ['Social', !posts ? 'none' : needImages ? 'amber' : 'green', !posts ? 'Not connected' : needImages ? (noImage ? 'Needs images' : 'To check') : 'On track',
      !posts ? (social?.error || 'Couldn’t read the Social Engine.') : needImages ? [noImage && `${noImage} of the next ${posts.length} posts ${noImage === 1 ? 'has' : 'have'} no image`, notReviewed && `${notReviewed} ${notReviewed === 1 ? 'image hasn’t' : 'images haven’t'} been checked yet`].filter(Boolean).join(', ') : posts.length ? `The next ${posts.length} posts are ready` : 'No posts scheduled', '/ops/publish'],
    ['Email', !promo?.kit ? 'none' : late ? 'red' : behind.length ? 'amber' : 'green', !promo?.kit ? 'Not connected' : late ? 'Late' : behind.length ? 'Behind' : 'On track',
      !promo?.kit ? 'Kit isn’t connected, so promo emails can’t be checked.' : behind.length ? `${behind.length} event${behind.length === 1 ? '' : 's'} short of promo emails` : 'Every upcoming event has its promo emails', '/ops/content?tab=email'],
    ['Media', replays === null ? 'none' : replays.length ? 'amber' : 'green', replays === null ? 'Not connected' : replays.length ? 'Waiting' : 'On track',
      replays === null ? 'Couldn’t read the calendar.' : replays.length ? `${replays.length} replay${replays.length === 1 ? '' : 's'} to post` : 'Every recent session has its replay', '/ops/content?tab=media'],
    ...(canReview ? [['Site copy', review === null ? 'none' : review ? 'amber' : 'green', review === null ? 'Not connected' : review ? 'Waiting' : 'On track',
      review === null ? 'Couldn’t read the calendar sheet.' : review ? `${review} bio or course page waiting for review` : 'Nothing waiting for review', '/ops/content?tab=review']] : []),
  ];
  return (
    <section>
      <ul className="ops-lanes">{lanes.map(([name, level, word, next, href]) => (
        <li key={name}>
          <a href={href}><b>{name}</b><span className="st"><i className={`dot ${level === 'none' ? '' : level}`} />{word}</span><span className="nx">{next}</span></a>
        </li>))}</ul>
      <h2 className="ops-sub">Next posts <span>{posts?.length || ''}</span></h2>
      <NextPosts />
      <h2 className="ops-sub">Promo emails by event <span>{behind.length || ''}</span></h2>
      {!promo?.kit ? <p className="ops-empty">Kit isn’t connected, so emails can’t be checked yet.</p> : promo.rows.length === 0 ? <p className="ops-empty">No events in the next 10 weeks need promo emails.</p> : (
        <ul className="ops-meet">{promo.rows.map(({ e, want, ready }) => (
          <li key={e.id}><div className="d">{shortDay(e.date)}</div><div className="t">{e.title}</div><div className={`z ${ready < want.length && want[ready].due < todayET() ? 'late' : ''}`}>{ready} of {want.length} scheduled</div></li>))}</ul>
      )}
    </section>
  );
}
