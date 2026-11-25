// Teachers & Email, phase 1: read Kit, match every email to an event, find what needs tidying.
// Kit is read here; the only thing written back is an event ID in an email's internal description (see the API route).
import { kitConfigured, listBroadcasts, listTags, listSegments, listSequences, eventIdsOf, draftUrl } from '../kit';
import { loadCalendar } from '../calendar';
import { todayET } from '../events';
import { linkRows } from './emaildata';
import { planRows } from './emailplan';

const addDays = (d, n) => { const x = new Date(d + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
export const evId = e => String(e.sched_id || e.id || '').toUpperCase();
// Stale on sight (Jake's 25 Nov list): WR1–3, [NEEDS CONTENT] Scaffoldings, test drafts and empty "Sequence" shells
export const STALE = /^\s*wr\s?[123]\b|\[needs content\]|^\s*test\b|\btest (email|draft)\b|^\s*sequence\s*$/i;

let cache = null;
// → { at, broadcasts, sequences, tags: {id: name}, segments: {id: name}, error }  Cached for 2 minutes; fresh: true skips the cache.
export async function kitSnapshot({ fresh = false } = {}) {
  if (!kitConfigured()) return { at: '', broadcasts: [], sequences: [], tags: {}, segments: {}, error: 'Kit isn’t connected yet.' };
  if (!fresh && cache && Date.now() - cache.at < 2 * 60 * 1000) return cache.data;
  try {
    const [broadcasts, sequences, tags, segments] = await Promise.all([listBroadcasts(), listSequences().catch(() => []), listTags().catch(() => []), listSegments().catch(() => [])]);
    const data = { at: new Date().toISOString(), broadcasts, sequences, tags: Object.fromEntries(tags.map(t => [t.id, t.name])), segments: Object.fromEntries(segments.map(s => [s.id, s.name])), error: '' };
    cache = { at: Date.now(), data }; return data;
  } catch (e) {
    console.error('Kit sync failed', e.message);
    if (cache) return { ...cache.data, error: 'Kit didn’t answer just now. Showing what we last read.' };
    return { at: '', broadcasts: [], sequences: [], tags: {}, segments: {}, error: /429/.test(e.message) ? 'Kit asked us to slow down. Try again in a minute.' : 'Couldn’t reach Kit.' };
  }
}
export const forgetKit = () => { cache = null; };

// Who an email goes to, in words: the tags and segments in its subscriber filter, or everyone
function audienceOf(b, snap) {
  const names = [];
  const walk = x => {
    if (Array.isArray(x)) return x.forEach(walk);
    if (!x || typeof x !== 'object') return;
    const ids = Array.isArray(x.ids) ? x.ids : [];
    if (x.type === 'tag') ids.forEach(i => names.push(snap.tags[i] || `tag ${i}`));
    else if (x.type === 'segment') ids.forEach(i => names.push(snap.segments[i] || `segment ${i}`));
    Object.values(x).forEach(v => typeof v === 'object' && walk(v));
  };
  walk(b.subscriber_filter);
  return names.length ? [...new Set(names)].join(', ') : 'Everyone';
}
const stateOf = b => b.published_at ? 'sent' : b.send_at ? 'scheduled' : 'draft';

// The Emails list: every broadcast from the last 60 days to the next 90 (and every undated draft), matched to its event.
export async function emailList({ fresh = false } = {}) {
  const [snap, links, cal, plan] = await Promise.all([kitSnapshot({ fresh }), linkRows({ light: !fresh }).catch(() => []), loadCalendar().catch(() => []), planRows({ light: !fresh }).catch(() => [])]);
  const planOf = Object.fromEntries(plan.filter(r => r.values.kit_id).map(r => [String(r.values.kit_id), r.values.id]));
  const today = todayET(), from = addDays(today, -60), to = addDays(today, 90);
  const events = Object.fromEntries(cal.map(e => [evId(e), e]));
  const linkOf = Object.fromEntries(links.map(r => [String(r.values.kit_id), r.values]));
  const all = snap.broadcasts.map(b => {
    const state = stateOf(b), when = b.published_at || b.send_at || '', date = when ? new Date(when).toLocaleDateString('en-CA', { timeZone: 'America/New_York' }) : '';
    const mine = linkOf[String(b.id)] || {};
    const text = `${b.subject || ''} ${b.description || ''}`;
    const mm = /\[MM-REMINDER[^\]]*\]/i.test(text);
    const id = String(mine.event_id || '').toUpperCase() || eventIdsOf(b).find(i => events[i]) || '';
    const ev = events[id];
    const kind = mm || /reminder/i.test(b.subject || '') ? 'reminder' : /scaffolding/i.test(text) ? 'newsletter' : ev ? 'promo' : 'other';
    return { kit_id: String(b.id), subject: b.subject || '(no subject)', description: b.description || '', state, date, when, audience: audienceOf(b, snap),
      event_id: ev ? id : '', event_title: ev?.title || '', program: ev?.track || (mm ? 'MM' : /scaffolding/i.test(text) ? 'Scaffolding' : ''), kind,
      plan_id: planOf[String(b.id)] || '', linked: !!ev || mm || kind === 'newsletter' || !!planOf[String(b.id)], archived: String(mine.archived).toUpperCase() === 'TRUE', note: mine.note || '', url: draftUrl(b.id), flags: [], mm };
  });
  // The hand-made "Meditation Monday today at 12pm" email duplicates the automatic [MM-REMINDER] one for the same day
  const autoDays = new Set(all.filter(x => x.mm && x.state !== 'draft').map(x => x.date));
  for (const x of all) {
    if (x.state === 'draft' && STALE.test(x.subject)) x.flags.push('stale');
    if (!x.mm && x.state !== 'sent' && /meditation monday/i.test(x.subject) && /today|12\s?pm/i.test(x.subject) && autoDays.has(x.date)) x.flags.push('duplicate');
  }
  const inWindow = all.filter(x => x.state === 'draft' ? true : x.date >= from && x.date <= to);
  const rows = inWindow.sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999'));
  const open = rows.filter(x => !x.archived);
  return { configured: kitConfigured(), at: snap.at, error: snap.error, emails: rows, sequences: snap.sequences.length,
    counts: { total: open.length, unlinked: open.filter(x => !x.linked).length, stale: open.filter(x => x.flags.includes('stale')).length, duplicate: open.filter(x => x.flags.includes('duplicate')).length, archived: rows.length - open.length },
    events: cal.filter(e => e.date >= addDays(today, -90) && !/cancel/i.test(e.status)).sort((a, b) => a.date.localeCompare(b.date)).map(e => ({ id: evId(e), title: e.title, date: e.date, program: e.track })) };
}

// This week and the Programming side panel: public events for the next 14 days (from Monday), with how many of their planned
// emails are in Kit, what the Master Schedule is missing, and what needs attention across all emails.
export async function weekData({ fresh = false } = {}) {
  const { plannedSlots } = await import('./promo');
  const { loadTemplates } = await import('../calendar');
  const { eventFacts } = await import('./templates/facts');
  const { ruleRows, ruleOf, covers, sendsText } = await import('./reminders');
  const { minutesOf } = await import('./templates/facts');
  const [list, cal, tpls, plan, rules] = await Promise.all([emailList({ fresh }), loadCalendar(), loadTemplates().catch(() => []), planRows({ light: !fresh }).catch(() => []), ruleRows().catch(() => [])]);
  const today = todayET(), dow = new Date(today + 'T12:00:00Z').getUTCDay(), monday = addDays(today, -((dow + 6) % 7)), end = addDays(monday, 13);
  const slots = plannedSlots(tpls);
  const mine = id => list.emails.filter(x => x.event_id === id && !x.archived);
  const ruleList = rules.map(ruleOf);
  const clock = m => `${(m / 60 | 0) % 12 || 12}${m % 60 ? ':' + String(m % 60).padStart(2, '0') : ''}${m >= 720 ? 'pm' : 'am'} ET`;
  // Every email for one event, each with the place it is edited: the Ops editor when Ops planned it, otherwise Kit.
  // Meditation Mondays also show the website's automatic "we begin in one hour" email; reminder rules that cover the
  // event show even before they have made anything, so a missing reminder is visible and one click from its rule.
  const emailsOf = (e, id, em) => {
    const out = em.map(x => ({ key: 'k' + x.kit_id, label: x.subject, state: x.state, date: x.date, href: x.plan_id ? `/ops/email/edit?id=${x.plan_id}` : x.url, where: x.plan_id ? 'Edit in Ops' : 'Open in Kit', external: !x.plan_id, ruleKey: '' }));
    for (const r of plan) {
      const v = r.values; if (String(v.event_id).toUpperCase() !== id || v.kit_id || /not needed/i.test(v.status || '')) continue;
      out.push({ key: 'p' + v.id, label: v.subject || `${v.type || 'Email'} (no subject yet)`, state: 'planned in Ops', date: v.planned_date || '', href: `/ops/email/edit?id=${v.id}`, where: 'Edit in Ops', external: false });
    }
    if (String(e.track).toUpperCase() === 'MM' || /^meditation-mondays$/i.test(e.series || '')) {
      const k = list.emails.find(x => x.mm && x.date === e.date && !x.archived), start = minutesOf(e.time || '12pm');
      out.push(k ? { key: 'mm' + k.kit_id, label: `${k.subject} (automatic)`, state: k.state, date: k.date, href: k.url, where: 'Open in Kit', external: true }
        : { key: 'mm', label: 'Meditation Mondays begins in one hour (automatic)', state: e.date < today ? 'wasn’t made' : `made that morning, goes out at ${start == null ? 'one hour before' : clock(start - 60)}`, date: e.date, href: '/ops/email/reminders#builtin-mm', where: 'How it works', external: false });
    }
    for (const r of ruleList) {
      // already made by this rule (its Kit description says so, or the plan holds its key)
      if (!covers(r, e) || em.some(x => String(x.description).includes(`Reminder · ${r.name}`)) || plan.some(p => String(p.values.launch_id).startsWith(`${r.id}:${id}:`))) continue;
      out.push({ key: 'r' + r.id, label: `Reminder: ${r.name}`, state: r.enabled ? `rule on · ${sendsText(r.sends) || 'no send time'}` : 'rule is off', date: e.date, href: '/ops/email/reminders', where: 'Edit the rule', external: false });
    }
    return out.sort((a, b) => (a.date || '9').localeCompare(b.date || '9'));
  };
  const events = cal.filter(e => e.date >= monday && e.date <= end && !/cancel/i.test(e.status) && !/internal/i.test(e.audience || ''))
    .sort((a, b) => a.date.localeCompare(b.date) || String(a.time).localeCompare(String(b.time))).map(e => {
      const id = evId(e), em = mine(id), planned = (slots[e.track] || []).length;
      return { id, title: e.title, date: e.date, time: e.time || '', program: e.track, planned, inKit: em.filter(x => x.state !== 'draft').length, drafts: em.filter(x => x.state === 'draft').length,
        missing: eventFacts(e).missing || [], thisWeek: e.date <= addDays(monday, 6), emails: emailsOf(e, id, em), add: `/ops/email/edit?event=${encodeURIComponent(id)}&date=${e.date}` };
    });
  const open = list.emails.filter(x => !x.archived);
  const attention = [
    list.counts.unlinked && { key: 'unlinked', n: list.counts.unlinked, text: `${list.counts.unlinked} Kit email${list.counts.unlinked === 1 ? '' : 's'} not matched to an event`, href: '/ops/email/emails?show=unlinked' },
    list.counts.duplicate && { key: 'duplicate', n: list.counts.duplicate, text: `${list.counts.duplicate} duplicate Meditation Monday reminder${list.counts.duplicate === 1 ? '' : 's'}`, href: '/ops/email/emails?show=tidy' },
    list.counts.stale && { key: 'stale', n: list.counts.stale, text: `${list.counts.stale} old draft${list.counts.stale === 1 ? '' : 's'} to put away`, href: '/ops/email/emails?show=tidy' },
    ...events.filter(e => e.thisWeek && e.missing.length).map(e => ({ key: 'missing-' + e.id, n: 1, text: `${e.title} is missing ${e.missing.join(', ')} in Programming`, href: '/ops/events' })),
  ].filter(Boolean);
  return { configured: list.configured, at: list.at, error: list.error, monday, events, attention, counts: list.counts, open: open.length };
}
