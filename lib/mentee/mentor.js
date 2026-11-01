// Jacob's side of the Sahṛdaya Upāya page: the review queue, pair health, "worth a word", the Monday digest and the pair nudges.
// Pure (no network, no database): scripts/member-test/mentor.mjs. The data comes from lib/mentee/mentorload.js.
const DAY = 86400000;
export const STALE_DAYS = 7;       // an item waiting longer than this shows in terra, and in the digest
export const QUIET_DAYS = 10;      // no practice logged for this long: worth a word
export const NUDGE_WEEKS = 3;      // a pair with no session and this few weeks left gets one gentle message
export const NUDGE_OFF = true;     // nudges stay off until MENTEE_NUDGES=on (lib/mentee/nudge.js)

const ms = iso => Date.parse(iso);
export const ageDays = (at, now) => (Number.isNaN(ms(at)) ? 0 : Math.max(0, Math.floor((now - ms(at)) / DAY)));
const first = n => String(n || '').trim().split(/\s+/)[0] || '';
const day = d => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });

// The component names Jacob sees for an hours entry
const NAMES = { observation: 'Observation', 'practice-teaching': 'Practice-teaching', retreat: 'Retreat practicum', peer: 'Peer articulation' };

/**
 * One list, oldest first. hours: formation.pendingEntries() (with `at`); handins: store.openSubmissions(); reflections: shared reflections with no reply from
 * the mentor yet ({ id, title, authorEmail, author, sharedAt }); acks: Set of refs Jacob marked replied; names: { email: name }.
 */
export function queueFrom({ hours = [], handins = [], reflections = [], acks = new Set(), names = {}, now = Date.now() }) {
  const who = e => names[String(e || '').toLowerCase()] || String(e || '').split('@')[0];
  const items = [
    ...hours.map(h => ({ ref: `h:${h.id}`, kind: 'hours', id: h.id, at: h.at, email: h.email, item: `${NAMES[h.component] || h.component} · ${h.hours} h`, detail: [day(h.day), h.detail, h.note, (h.competencies || []).join(', '), h.cosigned ? 'partner confirmed' : ''].filter(Boolean).join(' · ') })),
    ...handins.map(x => ({ ref: `s:${x.id}`, kind: 'handin', id: x.id, at: x.at, email: x.email, item: x.title, detail: String(x.text || '').replace(/\s+/g, ' ').slice(0, 160), fullText: String(x.text || ''), hasFile: !!x.hasFile, fileLink: x.fileLink || '' })),
    ...reflections.filter(r => !acks.has(`r:${r.id}`)).map(r => ({ ref: `r:${r.id}`, kind: 'reflection', id: r.id, at: r.sharedAt, email: r.authorEmail, item: r.title, detail: 'Shared with the cohort, no reply from you yet' })),
  ].map(x => ({ ...x, mentee: who(x.email), age: ageDays(x.at, now), stale: ageDays(x.at, now) > STALE_DAYS }));
  return items.sort((a, b) => String(a.at).localeCompare(String(b.at)));
}
export const queueCounts = q => ({ all: q.length, hours: q.filter(x => x.kind === 'hours').length, handin: q.filter(x => x.kind === 'handin').length, reflection: q.filter(x => x.kind === 'reflection').length });

/**
 * One tile per group. groups: [[emails]] for this rotation; sessions: [{ day, present: [emails] }] logged in it; rotation: { n, from, to, weeksLeft };
 * nudged: { groupKey: 'YYYY-MM-DD' }; people: { email: { name, city } }; target sessions each (articulation_target, 2).
 */
export const groupKey = g => [...g].map(e => String(e).toLowerCase()).sort().join('|');
export function pairHealth({ groups = [], sessions = [], rotation = null, nudged = {}, people = {}, target = 2 }) {
  return groups.map(g => {
    const set = new Set(g.map(e => String(e).toLowerCase()));
    const count = sessions.filter(s => (s.present || []).filter(e => set.has(String(e).toLowerCase())).length >= 2).length;
    const key = groupKey(g), left = rotation ? rotation.weeksLeft : null, at = nudged[key] || '';
    const state = count >= target ? 'done' : count === 0 && left !== null && left <= NUDGE_WEEKS ? 'behind' : 'on-track';
    const line = `${Math.min(count, target)} of ${target} · ` + (state === 'done' ? 'done' : state === 'behind' ? (at ? `both nudged ${day(at)}` : 'no session yet') : count ? 'on track' : 'not started');
    return { key, people: g.map(e => ({ email: e, name: (people[String(e).toLowerCase()] || {}).name || String(e).split('@')[0], city: (people[String(e).toLowerCase()] || {}).city || '' })), count, target, state, nudgedAt: at, line };
  });
}

// "Worth a word": quiet 10+ days; one-to-ones not booked as the window closes; paired people missing from the Kit list
export function wordsFrom({ rows = [], unbooked = [], roster = [] }) {
  const out = [];
  for (const r of rows) if (r.last === null) out.push({ kind: 'quiet', name: r.name, email: r.email, why: 'Hasn’t logged any practice yet' }); else if (r.daysSince >= QUIET_DAYS) out.push({ kind: 'quiet', name: r.name, email: r.email, why: `No practice logged for ${r.daysSince} days` });
  for (const u of unbooked) out.push({ kind: 'unbooked', name: u.name, email: u.email, why: `One-to-one not booked, the window closes ${day(u.windowTo)}` });
  for (const x of roster) out.push({ kind: 'roster', name: x.name, email: x.email, why: x.why });
  return out;
}

// People paired in Mentee Partners who are not in the Sahṛdaya Upāya Kit tag
export function rosterGaps(partnerEmails, kitEmails, names = {}) {
  const kit = new Set(kitEmails.map(e => String(e).toLowerCase()));
  return [...new Set(partnerEmails.map(e => String(e).toLowerCase()))].filter(e => e && !kit.has(e)).map(e => ({ email: e, name: names[e] || e.split('@')[0], why: 'Paired for articulation but not in the Sahṛdaya Upāya Kit tag' }));
}

// One-to-ones: mentees (from the Kit tag) with no booking in the window that closes within `days`
export function unbookedFrom({ cohort = [], bookedEmails = new Set(), window = null, today, days = 5 }) {
  if (!window || today < window.from) return [];
  const left = Math.round((ms(`${window.to}T00:00:00Z`) - ms(`${today}T00:00:00Z`)) / DAY);
  if (left < 0 || left > days) return [];
  return cohort.filter(m => !bookedEmails.has(m.email)).map(m => ({ name: m.name, email: m.email, windowTo: window.to }));
}

// Pairs to nudge: no session, three weeks or fewer left, not nudged yet
export const nudgeTargets = tiles => tiles.filter(t => t.state === 'behind' && !t.nudgedAt);
export const nudgeText = (name, other, rotation) => `Hi ${first(name)}, a gentle note from Jacob: your articulation session with ${other} for rotation ${rotation.n} hasn't been logged yet, and the rotation ends ${day(rotation.to)}. If you haven't met, the pair chat is a good place to find a time. If you have, log it from your page so it's counted.`;

/**
 * The Monday email: what needs Jacob this week. All figures come from the same data as the page.
 * link: (path) → absolute address of the page.
 */
export function digestFrom({ queue = [], words = [], tiles = [], today, link = p => p }) {
  const stale = queue.filter(x => x.stale), hrs = queue.filter(x => x.kind === 'hours');
  const total = Math.round(hrs.reduce((a, x) => a + (Number(String(x.item).match(/([\d.]+) h$/)?.[1]) || 0), 0) * 100) / 100;
  const behind = tiles.filter(t => t.state === 'behind');
  const lines = [];
  const add = (head, list) => { if (list.length) lines.push({ head, items: list }); };
  add(`Waiting more than ${STALE_DAYS} days (${stale.length})`, stale.map(x => `${x.mentee}: ${x.item} (${x.age} days)`));
  if (hrs.length) lines.push({ head: `Pending hours: ${hrs.length} ${hrs.length === 1 ? 'entry' : 'entries'}, ${total} hrs`, items: [] });
  add(`Quiet ${QUIET_DAYS}+ days`, words.filter(w => w.kind === 'quiet').map(w => `${w.name}: ${w.why}`));
  add('Pairs with no session and little time left', behind.map(t => `${t.people.map(p => p.name).join(' + ')} (${t.line})`));
  add('One-to-ones not booked', words.filter(w => w.kind === 'unbooked').map(w => `${w.name}: ${w.why}`));
  add('Reflections with no reply from you', queue.filter(x => x.kind === 'reflection').map(x => `${x.mentee}: ${x.item} (${x.age} days)`));
  add('Roster', words.filter(w => w.kind === 'roster').map(w => `${w.name}: ${w.why}`));
  const subject = lines.length ? `Sahṛdaya Upāya this week: ${queue.length ? `${queue.length} waiting for you` : 'a few things to look at'}` : 'Sahṛdaya Upāya this week: nothing waiting';
  const text = [`Sahṛdaya Upāya, week of ${day(today)}`, '', ...(lines.length ? lines.flatMap(l => [l.head, ...l.items.map(i => `  - ${i}`), '']) : ['Nothing is waiting for you.', '']), `Open the review queue: ${link('/c/mentorship?view=mentor')}`].join('\n');
  return { subject, lines, text, queueUrl: link('/c/mentorship?view=mentor') };
}
