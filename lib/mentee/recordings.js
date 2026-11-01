// Recordings on the mentee page: every ended Open Session and Practicum (and the orientation), with the recording where there is one.
// Pure (no network): scripts/member-test/recordings.mjs. The loader (lib/mentee/load.js) passes Circle's events and posts in.
//   sessions   ended events in the mentorship sessions space (data/mentee.json mentorship_sessions_space_id)
//   recordings the posts the Make scenario "EP trimmed recording → Vimeo → Circle" writes (slug recording-YYYY-MM-DD-…) in the Mentorship Circle space,
//              and, for Open Sessions that are filed as Sādhana School, in the season hub; or a Vimeo / replay link on the event page itself
import { normEvent, normPost } from '../school/tabs';

export const WAIT_HOURS = 72; // after this a missing recording is for Jacob's Monday digest, not the mentee's card
const ms = iso => (iso ? new Date(iso).getTime() : NaN);
export const etDay = iso => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date(iso));
const DAY = /^\d{4}-\d{2}-\d{2}$/;

export function recordingsFrom({ events, posts, config, now = Date.now() }) {
  const imms = (config.immersions || []).filter(i => DAY.test(i.sat || '') && DAY.test(i.sun || ''));
  const spaces = new Set([config.mentorship_sessions_space_id].filter(Boolean).map(String));
  const seen = new Set();
  const evs = (events || []).map(normEvent).filter(e => !seen.has(e.id) && seen.add(e.id) && spaces.has(e.spaceId) && !Number.isNaN(ms(e.start)));
  const recs = [], pseen = new Set();
  for (const raw of posts || []) {
    const p = normPost(raw), m = /^recording-(\d{4}-\d{2}-\d{2})(?:-|$)/.exec(p.slug);
    if (!m || pseen.has(p.id)) continue; pseen.add(p.id);
    recs.push({ day: m[1], orient: /orientation/i.test(`${p.title} ${p.slug}`), post: p });
  }
  const items = [], missing = [], o = config.orientation && DAY.test(config.orientation.date || '') ? config.orientation : null;
  for (const e of evs) {
    const endMs = Number.isNaN(ms(e.end)) ? ms(e.start) + 2 * 3600e3 : ms(e.end);
    if (endMs + 30 * 60e3 >= now) continue; // not over yet
    const day = etDay(e.start), imm = imms.find(i => i.sat === day || i.sun === day);
    const kind = /orientation/i.test(e.title) ? 'orientation' : imm ? (day === imm.sun || /practicum/i.test(e.title) ? 'practicum' : 'open') : /practicum/i.test(e.title) ? 'practicum' : /open session/i.test(e.title) ? 'open' : 'other';
    if (kind === 'orientation' && o && o.date === day) continue; // the orientation comes from the data file below
    const rec = recs.find(r => r.day === day && r.orient === (kind === 'orientation'));
    let url = '', duration = null;
    if (rec && rec.post.url) { url = rec.post.url; duration = rec.post.duration; }
    else if (e.replayUrl) { url = e.replayUrl; duration = e.duration; }
    else if (e.pageVideo) { url = e.pageUrl || e.url || ''; duration = e.duration; }
    const title = kind === 'open' ? `Open Session · ${imm.title}` : kind === 'practicum' ? `Practicum${imm ? ` · ${imm.title}` : ''}` : kind === 'orientation' ? 'Orientation' : e.title;
    const sub = imm && kind === 'open' ? `Immersion ${imm.n} · with the whole school` : imm && kind === 'practicum' ? `Immersion ${imm.n} · mentees only` : '';
    const base = { id: e.id, kind, day, at: e.start, title, sub, n: imm ? imm.n : 0 };
    if (url) items.push({ ...base, state: 'ready', url, duration: Number(duration) > 0 ? Math.round(duration) : null });
    else if (now - endMs < WAIT_HOURS * 3600e3) items.push({ ...base, state: 'wait', url: '', duration: null });
    else missing.push({ title, day });
  }
  if (o) items.push({ id: 'orientation', kind: 'orientation', day: o.date, at: `${o.date}T12:00:00Z`, title: o.title || 'Orientation', sub: o.sub || '', n: 0, state: 'ready', url: o.url || '', duration: null });
  items.sort((a, b) => b.at.localeCompare(a.at));
  return { items, count: items.length, missing, after: items.some(i => i.kind === 'open' || i.kind === 'practicum') };
}

// The line for Jacob's Monday digest: "Recording missing: Practicum · Beneath the Pose (15 Nov)"
export const missingLines = r => ((r && r.missing) || []).map(m => `Recording missing: ${m.title} (${new Date(`${m.day}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })})`);
