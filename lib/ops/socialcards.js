// The four status cards across the top of the Social calendar (Social, Email, Media, System health): one line of fact each.
import { readPlain } from './store';
import { promoRows } from './promo';
import { waitingReplays } from './lanes';
import { reviewData, healthData } from './socialstatus';
import { todayET } from '../events';
import { displayStatus } from './socialengine';

const plural = (n, a, b = a + 's') => `${n} ${n === 1 ? a : b}`;
export async function statusCards(user) {
  const today = todayET();
  const [review, promo, replays, health, plan] = await Promise.all([
    reviewData(user).catch(() => null), promoRows().catch(() => null), waitingReplays().catch(() => null), healthData(user).catch(() => null),
    readPlain('Weekly Plan', { sheet: 'social', light: true }).catch(() => null)]);
  const cards = [];
  // Social
  if (review) {
    const blocked = review.rows.filter(r => r.blocked.length).length, ok = review.rows.length - blocked;
    const hand = plan ? plan.rows.filter(r => r.values.status === 'Manual' && r.values.publish_date >= today).length : 0;
    cards.push({ label: 'Social', title: `${ok} to approve · ${blocked} blocked`, sub: hand ? `${plural(hand, 'post')} to post by hand` : 'Nothing waiting to be posted by hand', href: '/ops/social/review' });
  } else cards.push({ label: 'Social', title: 'Not connected', sub: 'The Social Engine sheet couldn’t be read', href: '/ops/social/review' });
  // Email
  if (promo?.kit) {
    const behind = promo.rows.filter(r => r.ready < r.want.length), late = behind.filter(r => r.want[r.ready]?.due < today).length;
    cards.push({ label: 'Email', title: behind.length ? `${plural(behind.length, 'event')} short of promo emails` : 'Every event has its promo emails', sub: late ? `${plural(late, 'due date')} already passed` : 'On track', late: late > 0, href: '/ops/content?tab=email' });
  } else cards.push({ label: 'Email', title: 'Kit isn’t connected', sub: 'Promo emails can’t be checked yet', href: '/ops/content?tab=email' });
  // Media
  cards.push(replays ? { label: 'Media', title: replays.length ? `${plural(replays.length, 'replay')} to post in Circle` : 'Every recent session has its replay', sub: replays.length ? `Oldest: ${replays[0].title}` : 'Nothing waiting', href: '/ops/content?tab=media' }
    : { label: 'Media', title: 'Not connected', sub: 'The calendar couldn’t be read', href: '/ops/content?tab=media' });
  // System health
  const issues = health ? health.items.filter(i => i.level !== 'Low') : [];
  cards.push(health ? { label: 'System health', title: issues[0]?.title || 'All checks look fine', sub: issues.length > 1 ? `${issues.length - 1} more ${issues.length === 2 ? 'issue' : 'issues'} · open Health →` : issues.length ? 'Open Health →' : 'Checked when you open this page', alert: issues.some(i => i.level === 'High'), href: '/ops/social/review' }
    : { label: 'System health', title: 'Not checked', sub: 'Open Health →', href: '/ops/social/review' });
  return { cards, reviewCount: review ? review.rows.length : 0 };
}

// "Plan delivered Fri 20 Nov 9:00 ET · next plan Fri 27 Nov · approvals close Sun 18:00 ET (23:00 London)"
export function planLine(todayISO = todayET()) {
  const d = new Date(todayISO + 'T12:00:00Z'), wd = (d.getUTCDay() + 2) % 7; // days since the last Friday
  const last = new Date(d); last.setUTCDate(d.getUTCDate() - wd);
  const next = new Date(last); next.setUTCDate(last.getUTCDate() + 7);
  const f = x => x.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
  return `Plan delivered ${f(last)} 9:00 ET · next plan ${f(next)} · approvals close Sun 18:00 ET (23:00 London)`;
}
