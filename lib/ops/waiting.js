import { readPlain } from './store';
import { pendingRequests, clockAvailable } from './hours';
import { loadMetrics } from './metrics';
import { upcomingSocial } from '../social';
import { todayET } from '../events';
import { podsWaiting } from './podswaiting';
import { ceLedger, ceConfigured } from './ce';
import { canEditSite, canApproveSocial } from './nav';

const lower = s => String(s || '').trim().toLowerCase();
const addDays = (d, n) => new Date(new Date(`${d}T12:00:00Z`).getTime() + n * 864e5).toISOString().slice(0, 10);
const dayWord = d => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).replace(',', '');
const short = (s, n) => (String(s || '').length > n ? `${String(s).slice(0, n)}…` : String(s || ''));
// Ad Agent actions that mean "leave it alone"
const IDLE = /^(|-|—|hold|keep|none|no change|maintain)$/i;
const DONE = /applied|done|paused|scaled/i;
// A slow neighbour (the website's CE records) never holds the page up
const within = (p, ms = 4000) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('too slow')), ms))]);

// What each kind of item is called in a count, e.g. "2 emails, 1 bio, 1 hours request"
export const KIND_WORD = { 'Extra hours': ['hours request', 'hours requests'], 'Social post': ['post', 'posts'], Email: ['email', 'emails'], 'Teacher bio': ['bio', 'bios'],
  'Course page': ['course page', 'course pages'], 'Study pod': ['pod', 'pods'], 'CE credit': ['CE credit', 'CE credits'], 'Ad Agent': ['ad suggestion', 'ad suggestions'] };
export function kindsLine(items) {
  const n = {};
  for (const w of items) n[w.kind] = (n[w.kind] || 0) + (w.count || 1);
  const order = Object.keys(KIND_WORD);
  return Object.entries(n).sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0])).map(([k, c]) => `${c} ${(KIND_WORD[k] || [k.toLowerCase(), k.toLowerCase()])[c === 1 ? 0 : 1]}`).join(', ');
}

// Everything waiting on this person's yes, from every area, oldest first. Each source is read only for people who may decide it (the same
// rules as the pages where the work is done), and fails on its own: a sheet that can't be read just leaves its items out.
// social: the upcoming posts Today has already read (upcomingSocial), so the Social Engine is read once. Circle cancellations are not here
// (no data source).
// → [{ key, kind, title, detail, at (ISO or ''), href, cta?, count?, request?: { id, hours } }]
export async function waitingOnYou(user, { social } = {}) {
  const director = !!user?.director, site = canEditSite(user), approve = canApproveSocial(user);
  const [hours, soc, profiles, pages, metrics, plan, pods, held] = await Promise.all([
    director && clockAvailable() ? pendingRequests().catch(() => []) : [],
    approve ? (social === undefined ? upcomingSocial(60).catch(() => null) : social) : null,
    site ? readPlain('Teachers', { light: true }).catch(() => null) : null,
    site ? readPlain('Course Pages', { light: true }).catch(() => null) : null,
    director ? loadMetrics().catch(() => null) : null,
    // Emails the team marked "Ready for Jake": read only, from the Email Plan the Publish calendar reads (the tab may not exist yet)
    director ? readPlain('Email Plan', { light: true }).catch(() => null) : null,
    site ? podsWaiting().catch(e => { console.error('Today, study pods', e.message); return null; }) : null,
    site && ceConfigured() ? within(ceLedger()).catch(e => { console.error('Today, CE credits', e.message); return null; }) : null,
  ]);
  const items = [];

  for (const r of hours) items.push({
    key: `hours-${r.id}`, kind: 'Extra hours', title: `${r.name} asks for ${r.hours} more hours`, detail: r.why || '', at: r.at,
    href: '/ops/people?view=hours', request: { id: r.id, hours: r.hours },
  });

  for (const r of plan?.rows || []) if (lower(r.values.status) === 'ready for jake') {
    const v = r.values, when = [v.planned_date && dayWord(v.planned_date), v.planned_time_et && `${v.planned_time_et} ET`].filter(Boolean).join(', ');
    items.push({ key: `email-${v.id || r.row}`, kind: 'Email', title: v.subject || `${v.type || 'Email'} ${v.step || ''}`.trim(), detail: [when, `ready from ${v.owner || v.updated_by || 'the team'}`].filter(Boolean).join(' · '),
      at: /^\d{4}-\d{2}-\d{2}$/.test(v.planned_date) ? `${v.planned_date}T00:00:00Z` : '', href: `/ops/publish?view=compose&kind=email&id=${encodeURIComponent(v.id)}` });
  }

  // Posts waiting for a yes in the next seven days: one line, the Review tab has the posts themselves
  const horizon = addDays(todayET(), 7);
  const posts = (soc?.posts || []).filter(p => lower(p.status) === 'proposed' && p.date <= horizon);
  if (posts.length) {
    const nets = [...new Set(posts.flatMap(p => String(p.platforms || '').split(',').map(s => s.trim()).filter(Boolean).map(s => /^ig/i.test(s) ? 'Instagram' : /^fb/i.test(s) ? 'Facebook' : s)))];
    const first = posts[0].date, last = posts[posts.length - 1].date;
    items.push({ key: 'social', kind: 'Social post', count: posts.length, title: `${posts.length} ${posts.length === 1 ? 'post' : 'posts'} for the next week`,
      detail: [nets.join(' and '), first === last ? `goes out ${dayWord(first)}` : `going out ${dayWord(first)} to ${dayWord(last)}`].filter(Boolean).join(' · '),
      at: `${first}T00:00:00Z`, href: '/ops/publish?view=review' });
  }

  for (const r of profiles?.rows || []) if (lower(r.values.status) === 'submitted')
    items.push({ key: `bio-${r.row}`, kind: 'Teacher bio', title: r.values.name || 'Teacher bio', detail: 'New bio and headshot', at: '', href: '/ops/people?view=review' });
  for (const r of pages?.rows || []) if (lower(r.values.status) === 'submitted')
    items.push({ key: `page-${r.row}`, kind: 'Course page', title: r.values.title || r.values.offering || 'Course page', detail: 'Course page from a teacher', at: '', href: '/ops/people?view=review' });

  // Study pods: students who asked to lead one (a yes), and running pods that still need a chat link
  for (const q of pods?.requests || []) items.push({ key: `pod-${q.uid}`, kind: 'Study pod', title: `${q.name} asks to lead a pod`, detail: short(q.note, 90), at: q.at || '', href: '/ops/students?view=pods', cta: 'Decide' });
  for (const p of pods?.needChat || []) items.push({ key: `podchat-${p.id}`, kind: 'Study pod', title: `${p.topic} needs a chat link`, detail: `${p.leader} · ${p.count} ${p.count === 1 ? 'member' : 'members'}`, at: '', href: '/ops/students?view=pods', cta: 'Add it' });

  // Certificates finished unusually fast are held for a look before they are issued
  for (const c of (held?.certs || []).filter(c => c.status === 'held'))
    items.push({ key: `ce-${c.id}`, kind: 'CE credit', title: `${c.name || 'A member'} · held for a look`, detail: c.title ? `${c.title} · finished unusually fast` : 'Finished unusually fast', at: c.done_at || '', href: '/ops/students?view=ce&tab=held' });

  // Ad Agent in recommend-only mode: read-only, link out to the Finance view
  if (metrics && metrics.mode && metrics.mode.toUpperCase() !== 'AUTO') {
    for (const a of metrics.adSets) {
      if (IDLE.test(a.action) || DONE.test(a.status)) continue;
      items.push({ key: `ad-${a.id}`, kind: 'Ad Agent', title: `${a.action}: ${a.name}`, detail: a.why, at: '', href: '/ops/business?view=finance', cta: 'See it' });
    }
  }

  // Oldest first; items without a timestamp sort after dated ones, in the order found
  return items.map((x, i) => ({ x, i })).sort((a, b) => (a.x.at || '9').localeCompare(b.x.at || '9') || a.i - b.i).map(o => o.x);
}
