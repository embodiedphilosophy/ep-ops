// Review & Health data for the Social workspace: used by the API and by the pages themselves.
import { readPlain } from './store';
import { loadCalendar } from '../calendar';
import { todayET } from '../events';
import { thumbOf, displayStatus, timeKey, eventLabel } from './socialengine';
import { readRules, guardrails, rhythmWarnings } from './socialrules';
import { getHealth } from './socialhealth';
import { tokenDaysLeft, igConfigured } from './igsync';
import { canEditSocial, canPublishSocial } from './nav';

const SHOW = { sheet: 'social', light: true };
const addDays = (d, n) => { const x = new Date(d + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
export const eventList = async () => (await loadCalendar().catch(() => []))
  .filter(e => e.date >= addDays(todayET(), -3) && e.date <= addDays(todayET(), 120) && /public/i.test(e.audience || '') && e.track !== 'MM')
  .filter((e, i, a) => a.findIndex(x => eventLabel(x) === eventLabel(e)) === i).slice(0, 60).map(eventLabel);
export const rulesOf = async () => readRules((await readPlain('Rules', SHOW).catch(() => ({ rows: [] }))).rows);

// ---- Review & approve: every Proposed post in the next two weeks, with what it still needs ----
export async function reviewData(user) {
  const [plan, labels, rules, lib] = await Promise.all([readPlain('Weekly Plan', SHOW), eventList(), rulesOf(), readPlain('Image Library', SHOW).catch(() => ({ rows: [] }))]);
  const set = new Set(labels), today = todayET(), until = addDays(today, 14);
  const byImage = Object.fromEntries(lib.rows.map(r => [r.values.image_id, r.values]));
  const rows = plan.rows.filter(r => (r.values.status || 'Proposed') === 'Proposed' && displayStatus(r.values) === 'Proposed' && r.values.publish_date >= today && r.values.publish_date <= until)
    .sort((a, b) => (a.values.publish_date || '9').localeCompare(b.values.publish_date || '9') || timeKey(a.values.publish_time_ET).localeCompare(timeKey(b.values.publish_time_ET)))
    .map(r => { const img = byImage[r.values.image_id] || {}; return { ...r, ...guardrails(r.values, { eventLabels: set }), thumb: thumbOf(r.values.image_url || img.public_url, r.values.image_url ? '' : img.drive_file_id) }; });
  const rhythm = rhythmWarnings(plan.rows.map(r => r.values).filter(v => v.status !== 'Deleted' && v.publish_date >= today), rules);
  return { rows, rhythm, canPublish: canPublishSocial(user), canEdit: canEditSocial(user), window: { from: today, to: until } };
}

// ---- Health: what to look at first, ranked ----
export async function healthData(user) {
  const items = [], add = (level, title, detail, link = '', action = null) => items.push({ level, title, detail, link, ...(action && { action }) });
  const today = todayET();
  const [plan, sync, syncErr, lib, hist] = await Promise.all([readPlain('Weekly Plan', SHOW), getHealth('ig_sync').catch(() => null), getHealth('ig_sync_error').catch(() => null),
    readPlain('Image Library', SHOW).catch(() => null), readPlain('Post History', SHOW).catch(() => null)]);
  // Instagram connection and the hourly sync
  const viaMake = !igConfigured() && !!process.env.SOCIAL_INGEST_SECRET;
  if (viaMake) {
    // Make sends only new posts, so a quiet week is normal: show when one last arrived instead of calling it behind
    add('Low', 'Instagram is connected through Make', sync ? `The last post came in ${new Date(sync.last_synced_at || sync.at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/New_York' })}. Likes and comments stay at their first value until the dashboard has its own Meta token.` : 'No post has come in yet. Switch on the Make scenario “EP Social: Instagram to dashboard”.');
  } else if (!igConfigured()) add('High', 'Instagram isn’t connected', 'The hourly check that fills Published and confirms posts can’t run yet. It needs the Meta access token and Instagram account ID in Vercel, or the Make scenario “EP Social: Instagram to dashboard”.');
  else if (!sync) add('High', 'The Instagram check hasn’t run yet', 'Open /api/ops/social-sync once with the cron key to run it, or wait for the next hour.');
  else {
    const hrs = (Date.now() - new Date(sync.last_synced_at || sync.at).getTime()) / 36e5;
    if (hrs > 3) add('High', 'The Instagram check is behind', `It last ran ${Math.round(hrs)} hours ago. It should run every hour.`);
    else add('Low', 'The Instagram check is running', `Last ran ${Math.max(1, Math.round(hrs * 60))} minutes ago: ${sync.added ?? 0} new, ${sync.matched ?? 0} matched to the plan.`);
  }
  if (syncErr && (!sync || new Date(syncErr.at) > new Date(sync.at))) add('High', 'The last Instagram check failed', String(syncErr.error || '').slice(0, 200));
  const days = await tokenDaysLeft().catch(() => null);
  if (days !== null && days < 30) add(days < 14 ? 'High' : 'Medium', 'The Meta access token runs out soon', days < 0 ? 'It has run out.' : `${days} days left. Make a new one in Meta Business Settings (System users).`);
  // Posts
  const rows = plan.rows.map(r => ({ ...r.values, _row: r.row })).filter(v => v.status !== 'Deleted');
  const unconf = rows.filter(v => displayStatus(v) === 'Unconfirmed');
  if (unconf.length) add('High', `${unconf.length} approved post${unconf.length === 1 ? '' : 's'} not confirmed`, `Past their time with no “Posted” yet: ${unconf.slice(0, 3).map(v => v.publish_date).join(', ')}${unconf.length > 3 ? '…' : ''}. Check Instagram, then the Published tab.`, '/ops/publish');
  const failed = rows.filter(v => v.status === 'Failed' && v.publish_date >= addDays(today, -14));
  if (failed.length) add('High', `${failed.length} post${failed.length === 1 ? '' : 's'} failed to publish`, String(failed[0].error || 'Open it to see why.').slice(0, 160), '/ops/publish');
  const soon = rows.filter(v => ['Proposed', 'Approved'].includes(v.status) && v.publish_date >= today && v.publish_date <= addDays(today, 7));
  const noPic = soon.filter(v => !String(v.image_url || '').trim() && !String(v.image_id || '').trim() && !String(v.slides_json || '').trim());
  if (noPic.length) add('Medium', `${noPic.length} post${noPic.length === 1 ? '' : 's'} this week without a picture`, noPic.slice(0, 3).map(v => v.publish_date).join(', '), '/ops/publish');
  const expired = rows.filter(v => displayStatus(v) === 'Expired');
  if (expired.length) add('Medium', `${expired.length} expired post${expired.length === 1 ? '' : 's'}`, 'Proposed posts that weren’t approved in time. They never went out. Deleting only hides them: nothing is wiped from the sheet.', '/ops/publish', canPublishSocial(user) ? { kind: 'deleteExpired', n: expired.length } : null);
  // Sheets
  const broken = [['Image Library', lib], ['Post History', hist], ['Weekly Plan', plan]].filter(([, d]) => d && d.head.some(h => /^#(REF|N\/A|ERROR|NAME|VALUE)/i.test(h)));
  for (const [name] of broken) add('Medium', `A broken column in ${name}`, 'A header shows an error (like #REF!). Open the sheet and fix or delete that column.');
  if (lib && lib.rows.length >= 2900) add('Low', 'The Image Library is close to the reading limit', `${lib.rows.length} rows; the dashboard reads up to 3,000.`);
  if (!items.some(i => i.level !== 'Low')) add('Low', 'Nothing needs attention', 'Everything checked looks fine.');
  const order = { High: 0, Medium: 1, Low: 2 };
  return { items: items.sort((a, b) => order[a.level] - order[b.level]), checked_at: new Date().toISOString() };
}
