// Gathers everything Jacob's side needs and hands it to the pure functions in mentor.js. Read only, except where noted by the routes.
import config from '../../data/mentee.json';
import { mentees } from '../member/cohort';
import { practiceByEmail, cohortSummary } from '../member/practice';
import { formationAvailable, pendingEntries } from '../member/formation';
import { openSubmissions, menteeAvailable, pairRows } from './store';
import { groupsFrom as pairGroups } from './pairing';
import { fileLink } from './filelink';
import { readTab, TABS, partnerFor, profilesFrom, cohortFrom } from './content';
import { rotationFor, windowFor } from './home';
import { calendlyConfigured, upcomingBookings } from './calendly';
import { mentorStoreAvailable, acks, unrepliedReflections, rotationSessions, nudgedMap } from './mentorstore';
import { queueFrom, queueCounts, pairHealth, wordsFrom, rosterGaps, unbookedFrom, groupKey } from './mentor';

export const mentorEmails = () => (config.mentor_emails || []).map(e => String(e).toLowerCase());

// People paired in the current rotation, as groups (a trio is stored as pairs, so groups are joined up)
export function groupsFrom(rows, today, rotation, profiles) {
  const everyone = cohortFrom(rows, config.season, '').map(p => p.email), parent = {};
  const find = x => (parent[x] === x ? x : (parent[x] = find(parent[x])));
  everyone.forEach(e => { parent[e] = e; });
  for (const e of everyone) {
    const mine = partnerFor(rows, e, config.season, today, { rotation: rotation?.n, profiles });
    for (const p of mine?.partners || []) { if (parent[p.email] === undefined) parent[p.email] = p.email; parent[find(e)] = find(p.email); }
  }
  const by = {};
  for (const e of Object.keys(parent)) (by[find(e)] ||= []).push(e);
  return Object.values(by).filter(g => g.length > 1);
}

export async function loadMentor({ today, now = Date.now() }) {
  const settle = async (p, d) => { try { return await p; } catch (e) { console.error('mentor load', e.message); return d; } };
  const list = await settle(mentees(), []);
  const [logs, hours, handins, refl, ack, partnerRows, profileRows] = await Promise.all([
    settle(practiceByEmail(list.map(m => m.email), today), {}),
    formationAvailable() ? settle(pendingEntries(), []) : [],
    menteeAvailable() ? settle(openSubmissions(), []) : [],
    mentorStoreAvailable() ? settle(unrepliedReflections(mentorEmails()), []) : [],
    mentorStoreAvailable() ? settle(acks(), new Set()) : new Set(),
    settle(readTab(TABS.partners), []),
    settle(readTab(TABS.profiles), []),
  ]);
  const profiles = profilesFrom(profileRows), rotation = rotationFor(config.rotations, today);
  const names = Object.fromEntries(list.map(m => [m.email, m.name]));
  for (const p of cohortFrom(partnerRows, config.season, '')) names[p.email] ||= p.name;
  for (const [e, p] of Object.entries(profiles)) if (p.name) names[e] ||= p.name;

  const queue = queueFrom({ hours, handins: handins.map(x => ({ ...x, fileLink: x.hasFile ? fileLink(x.id) : '' })), reflections: refl, acks: ack, names, now });
  // This month's pairs, chosen by the mentees (lib/mentee/pairing.js); the old assigned rows only if the pairs can't be read
  const month = today.slice(0, 7), monthEnd = new Date(Date.UTC(+month.slice(0, 4), +month.slice(5, 7), 0)).toISOString().slice(0, 10);
  const chosen = menteeAvailable() ? await settle(pairRows(config.season, month), null) : null;
  const groups = chosen ? pairGroups(chosen).map(g => g.members.map(m => m.email)) : groupsFrom(partnerRows, today, rotation, profiles);
  if (chosen) for (const r of chosen) names[r.email] ||= r.name;
  const period = { n: rotation?.n ?? null, from: `${month}-01`, to: monthEnd, weeksLeft: Math.max(0, Math.ceil((Date.parse(`${monthEnd}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 864e5 / 7)) };
  const [sessions, nudged] = await Promise.all([mentorStoreAvailable() ? settle(rotationSessions(period.from, period.to), []) : [], rotation && mentorStoreAvailable() ? settle(nudgedMap(rotation.n), {}) : {}]);
  const tiles = pairHealth({ groups, sessions, rotation: period, nudged, people: Object.fromEntries(Object.entries(names).map(([e, n]) => [e, { name: n, city: profiles[e]?.city || '' }])), target: Number(config.articulation_target) || 1 });

  const win = windowFor(config.windows, today);
  const bookings = calendlyConfigured() && win ? await settle(upcomingBookings(config.calendly_event_type, { days: 60, now }), null) : null;
  const unbooked = bookings ? unbookedFrom({ cohort: list, bookedEmails: new Set(bookings.map(b => String(b.email).toLowerCase())), window: win, today }) : [];
  const roster = rosterGaps(partnerRows.length ? cohortFrom(partnerRows, config.season, '').map(p => p.email) : [], list.map(m => m.email), names);
  const summary = cohortSummary(list, logs, today);
  const words = wordsFrom({ rows: summary.rows, unbooked, roster });
  // Who hasn't chosen an articulation partner this month (shown from the 10th, when most people have paired up)
  const paired = new Set(groups.flat().map(e => String(e).toLowerCase())), mentors = new Set(mentorEmails());
  const unpaired = chosen ? list.filter(m => !paired.has(m.email) && !mentors.has(m.email)).map(m => ({ name: m.name, email: m.email })) : [];
  if (Number(today.slice(8, 10)) >= 10) for (const u of unpaired) words.push({ kind: 'unpaired', name: u.name, email: u.email, why: 'Hasn’t chosen an articulation partner this month' });
  return { today, rotation, queue, counts: queueCounts(queue), tiles, words, unpaired, nudges: nudgesOn() };
}
export const nudgesOn = () => process.env.MENTEE_NUDGES === 'on';
export { groupKey };
