import { readPlain } from './store';
import { pendingRequests, clockAvailable } from './hours';
import { loadMetrics } from './metrics';
import { upcomingSocial } from '../social';
import { todayET } from '../events';

const lower = s => String(s || '').trim().toLowerCase();
const addDays = (d, n) => new Date(new Date(`${d}T12:00:00Z`).getTime() + n * 864e5).toISOString().slice(0, 10);
// Ad Agent actions that mean "leave it alone"
const IDLE = /^(|-|—|hold|keep|none|no change|maintain)$/i;
const DONE = /applied|done|paused|scaled/i;

// Everything waiting on the director's yes, oldest first. Each source fails on its own: a sheet that
// can't be read just leaves its items out. Circle cancellations are not here yet (no data source).
// → [{ key, kind, title, detail, at (ISO or ''), href, request?: { id, hours } }]
export async function waitingOnYou() {
  const [hours, social, profiles, pages, metrics] = await Promise.all([
    clockAvailable() ? pendingRequests().catch(() => []) : [],
    upcomingSocial(60).catch(() => null),
    readPlain('Teachers', { light: true }).catch(() => null),
    readPlain('Course Pages', { light: true }).catch(() => null),
    loadMetrics().catch(() => null),
  ]);
  const items = [];

  for (const r of hours) items.push({
    key: `hours-${r.id}`, kind: 'Extra hours', title: `${r.name} asks for ${r.hours} more hours`, detail: r.why || '', at: r.at,
    href: '/ops/hours', request: { id: r.id, hours: r.hours },
  });

  const horizon = addDays(todayET(), 7);
  for (const p of social?.posts || []) {
    if (lower(p.status) !== 'proposed' || p.date > horizon) continue;
    items.push({ key: `social-${p.id}`, kind: 'Social post', title: `${p.platforms || 'Post'} · ${p.pillar || p.id}`, detail: `Goes out ${p.date}${p.time ? ` at ${p.time}` : ''}`, at: `${p.date}T00:00:00Z`, href: '/ops/content?tab=social' });
  }

  for (const r of profiles?.rows || []) if (lower(r.values.status) === 'submitted')
    items.push({ key: `bio-${r.row}`, kind: 'Teacher bio', title: r.values.name || 'Teacher bio', detail: 'Bio and headshot', at: '', href: '/ops/content?tab=review' });
  for (const r of pages?.rows || []) if (lower(r.values.status) === 'submitted')
    items.push({ key: `page-${r.row}`, kind: 'Course page', title: r.values.title || r.values.offering || 'Course page', detail: '', at: '', href: '/ops/content?tab=review' });

  // Ad Agent in recommend-only mode: read-only, link out to the sheet's Insights view
  if (metrics && metrics.mode && metrics.mode.toUpperCase() !== 'AUTO') {
    for (const a of metrics.adSets) {
      if (IDLE.test(a.action) || DONE.test(a.status)) continue;
      items.push({ key: `ad-${a.id}`, kind: 'Ad Agent', title: `${a.action}: ${a.name}`, detail: a.why, at: '', href: '/ops/insights' });
    }
  }

  // Oldest first; items without a timestamp sort after dated ones, in the order found
  return items.map((x, i) => ({ x, i })).sort((a, b) => (a.x.at || '9').localeCompare(b.x.at || '9') || a.i - b.i).map(o => o.x);
}
