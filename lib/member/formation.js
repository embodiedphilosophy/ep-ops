// Formation hours toward the 100-hour Sahṛdaya Upāya certificate. Staff (Circle admins) enter the hours; mentees
// see their own record on the Today page (public/circle/today.js). One row per credited block of time.
// Same Neon database as the practice log (DATABASE_URL); the table is made on first use.
import { neon } from '@neondatabase/serverless';

const url = () => process.env.DATABASE_URL || process.env.POSTGRES_URL || '';
let sqlFn = null;
let testSql = null;
const sql = () => { if (testSql) return testSql; if (!url()) throw new Error('The formation record isn’t connected yet'); return (sqlFn ||= neon(url())); };
export const formationAvailable = () => !!testSql || !!url();
export function _setSql(fn) { testSql = fn; ready = null; } // tests only

let ready = null;
function ensure() {
  return (ready ||= (async () => {
    await sql()`CREATE TABLE IF NOT EXISTS member_formation (
      id bigserial PRIMARY KEY, email text NOT NULL, component text NOT NULL, hours numeric(5,2) NOT NULL,
      day date NOT NULL, note text NOT NULL DEFAULT '', by text NOT NULL DEFAULT '', at timestamptz NOT NULL DEFAULT now()
    )`;
    await sql()`CREATE INDEX IF NOT EXISTS member_formation_email ON member_formation (email)`;
    // Mentees log some hours themselves; those wait as 'pending' until Jacob confirms. Existing staff rows stay 'credited'.
    await sql()`ALTER TABLE member_formation ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'credited'`;
    await sql()`ALTER TABLE member_formation ADD COLUMN IF NOT EXISTS kind_detail text NOT NULL DEFAULT ''`;
    // Competencies seen, who co-signs a practice-teaching entry (the current partner), and Jacob's (or the partner's) note when an entry is sent back
    await sql()`ALTER TABLE member_formation ADD COLUMN IF NOT EXISTS competencies text[] NOT NULL DEFAULT '{}'`;
    await sql()`ALTER TABLE member_formation ADD COLUMN IF NOT EXISTS cosigner_email text NOT NULL DEFAULT ''`;
    await sql()`ALTER TABLE member_formation ADD COLUMN IF NOT EXISTS cosigned_at timestamptz`;
    await sql()`ALTER TABLE member_formation ADD COLUMN IF NOT EXISTS return_note text NOT NULL DEFAULT ''`;
  })());
}

export const TOTAL_HOURS = 100;
// The six competencies a mentee notes in observation and practice-teaching
export const COMPETENCIES = [['genealogy', 'Genealogy & diagnosis'], ['attunement', 'Subtle attunement'], ['speech', 'Ethical speech'], ['transmission', 'Experience-based transmission'], ['curriculum', 'Curriculum design'], ['lineage', 'Lineage & creativity']];
// Entry states: credited (counts) · pending (waiting for Jacob) · awaiting_cosign (practice-teaching, waiting for the partner who watched) · returned (sent back with a note)
// The ten components and their target hours, from the Mentee Dashboard design. (The design's targets add up to 101,
// so the total shown is capped at 100; the certificate needs every component complete.)
export const COMPONENTS = [
  { id: 'immersions', name: 'Monthly immersions', what: 'Open Session + Practicum, 8 weekends', type: 'Live contact', target: 40 },
  { id: 'one-to-ones', name: 'One-to-ones with Jacob', what: 'Monthly mentorship', type: 'Live contact', target: 6 },
  { id: 'observation', name: 'Observation hours', what: 'Watching senior teachers lead, with notes', type: 'Self-directed', target: 10 },
  { id: 'practice-teaching', name: 'Practice-teaching', what: 'Teaching or co-holding, credited per session', type: 'Peer-guided', target: 10 },
  { id: 'peer', name: 'Peer articulation', what: 'Partnered and small-group practice between immersions', type: 'Peer-guided', target: 8 },
  { id: 'reflections', name: 'Monthly reflections', what: 'Posts in the Mentorship space', type: 'Self-directed', target: 6 },
  { id: 'retreat', name: 'Retreat practicum', what: 'Summer retreat, in person or online', type: 'Live contact', target: 11 },
  { id: 'assessment', name: 'Final teaching assessment', what: 'Design, rehearse, deliver and record your offering', type: 'Self + live', target: 5 },
  { id: 'report', name: 'Final report', what: 'Positionality and SLBT application essay', type: 'Self-directed', target: 2 },
  { id: 'competency', name: 'Competency check', what: 'Open-book: terminology and frameworks', type: 'Assessment', target: 3 },
];

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const round = n => Math.round(n * 100) / 100;
const lower = e => String(e || '').trim().toLowerCase();

// Pure: rows [{component, hours}] → per-component hours (credited up to each target) and the total
export function summarise(rows) {
  const done = {}, waiting = {};
  for (const r of rows || []) {
    const st = r.status || 'credited';
    if (st === 'credited') done[r.component] = round((done[r.component] || 0) + Number(r.hours || 0));
    else if (st === 'pending' || st === 'awaiting_cosign') waiting[r.component] = round((waiting[r.component] || 0) + Number(r.hours || 0)); // logged, not yet confirmed
  }
  const components = COMPONENTS.map(c => ({ ...c, done: done[c.id] || 0, credited: Math.min(done[c.id] || 0, c.target), pending: waiting[c.id] || 0 }));
  const total = Math.min(TOTAL_HOURS, round(components.reduce((a, c) => a + c.credited, 0)));
  const open = components.filter(c => c.credited < c.target).sort((a, b) => (a.credited / a.target) - (b.credited / b.target));
  return { total, target: TOTAL_HOURS, components, next: open[0] ? open[0].id : null, complete: components.every(c => c.credited >= c.target) };
}

export async function formationFor(email) {
  await ensure();
  const rows = await sql()`SELECT id, component, hours::float AS hours, day::text AS day, note, status, kind_detail, competencies, cosigner_email, return_note, at FROM member_formation WHERE email = ${lower(email)} ORDER BY day DESC, id DESC`;
  return { ...summarise(rows), entries: rows.map(r => ({ id: String(r.id), component: r.component, hours: r.hours, day: r.day, note: r.note, status: r.status || 'credited', detail: r.kind_detail || '', competencies: r.competencies || [], cosigner: r.cosigner_email || '', returnNote: r.return_note || '' })) };
}

// Hours credited per mentee, for the mentor view
export async function formationTotals(emails) {
  await ensure();
  const list = (emails || []).map(lower).filter(Boolean);
  if (!list.length) return {};
  const rows = await sql()`SELECT email, component, hours::float AS hours, status FROM member_formation WHERE email = ANY(${list})`;
  const by = {};
  for (const r of rows) (by[r.email] ||= []).push(r);
  return Object.fromEntries(Object.entries(by).map(([e, rs]) => [e, summarise(rs).total]));
}

export function cleanEntry(b) {
  const component = COMPONENTS.some(c => c.id === b?.component) ? b.component : '';
  const hours = round(Number(b?.hours));
  const day = DAY.test(b?.day || '') ? b.day : '';
  const email = lower(b?.email);
  if (!/^[^@\s]+@[^@\s]+$/.test(email)) throw new Error('Choose a mentee');
  if (!component) throw new Error('Choose which part of the formation this counts toward');
  if (!(hours > 0 && hours <= 40)) throw new Error('Hours should be between a quarter and 40');
  if (!day) throw new Error('Choose the date');
  return { email, component, hours, day, note: String(b?.note ?? '').replace(/\s+/g, ' ').trim().slice(0, 200) };
}

export async function addEntry(by, b) {
  const e = cleanEntry(b);
  await ensure();
  await sql()`INSERT INTO member_formation (email, component, hours, day, note, by) VALUES (${e.email}, ${e.component}, ${e.hours}, ${e.day}, ${e.note}, ${lower(by)})`;
  return formationFor(e.email);
}

export async function removeEntry(email, id) {
  await ensure();
  const n = Number(id);
  if (!Number.isInteger(n)) throw new Error('Couldn’t find that entry');
  await sql()`DELETE FROM member_formation WHERE id = ${n} AND email = ${lower(email)}`;
  return formationFor(email);
}

// What a mentee can log for themselves (the other components are credited by staff or added automatically)
export const SELF_LOGGED = ['observation', 'practice-teaching', 'peer', 'retreat'];

// The checks shared by a new entry and a resent one: competencies (observation needs at least one) and, for practice-teaching, who watched.
// opts.partners: the emails of the mentee's current partners (the only people who can co-sign). b.watcher: a partner's email, 'nobody', or '' (not chosen yet);
// left out entirely (a hand-in that offers hours) it counts as nobody.
function cleanSelf(email, b, opts = {}) {
  const component = SELF_LOGGED.includes(b?.component) ? b.component : '';
  if (!component) throw new Error('Choose observation, practice-teaching or retreat practicum');
  const e = cleanEntry({ ...b, email, component });
  const known = new Set(COMPETENCIES.map(c => c[0]));
  const competencies = [...new Set((Array.isArray(b?.competencies) ? b.competencies : []).filter(c => known.has(c)))];
  // The Log hours form always sends the list (so observation needs at least one); a hand-in that offers hours sends none and is not asked
  if (component === 'observation' && Array.isArray(b?.competencies) && !competencies.length) throw new Error('Choose at least one competency you saw');
  let cosigner = '';
  if (component === 'practice-teaching' && b?.watcher !== undefined) {
    if (!b.watcher) throw new Error('Choose who watched your class, or choose nobody');
    if (b.watcher !== 'nobody') {
      cosigner = lower(b.watcher);
      if (!(opts.partners || []).map(lower).includes(cosigner)) throw new Error('Choose your partner, or nobody');
    }
  }
  return { ...e, competencies, cosigner, detail: String(b?.detail ?? '').replace(/\s+/g, ' ').trim().slice(0, 200), status: cosigner ? 'awaiting_cosign' : 'pending' };
}

// A mentee's own entry: pending until Jacob confirms it, or awaiting the partner's co-sign first (practice-teaching with a partner who watched)
export async function addPending(email, b, opts = {}) {
  const e = cleanSelf(email, b, opts);
  await ensure();
  await sql()`INSERT INTO member_formation (email, component, hours, day, note, by, status, kind_detail, competencies, cosigner_email) VALUES (${e.email}, ${e.component}, ${e.hours}, ${e.day}, ${e.note}, ${e.email}, ${e.status}, ${e.detail}, ${e.competencies}, ${e.cosigner})`;
  return formationFor(e.email);
}

// Edit and resend an entry that was sent back: the same checks, a fresh start (pending, or awaiting the partner's co-sign again)
export async function resendEntry(email, id, b, opts = {}) {
  const n = Number(id);
  if (!Number.isInteger(n)) throw new Error('Couldn’t find that entry');
  const e = cleanSelf(email, b, opts);
  await ensure();
  const [row] = await sql()`SELECT id FROM member_formation WHERE id = ${n} AND email = ${lower(email)} AND status = 'returned'`;
  if (!row) throw new Error('Couldn’t find that entry');
  await sql()`UPDATE member_formation SET component = ${e.component}, hours = ${e.hours}, day = ${e.day}, note = ${e.note}, kind_detail = ${e.detail}, competencies = ${e.competencies}, cosigner_email = ${e.cosigner}, cosigned_at = NULL, return_note = '', status = ${e.status}, at = now() WHERE id = ${n}`;
  return formationFor(email);
}

// What a partner has been asked to confirm: practice-teaching entries that name them as the one who watched
export async function awaitingCosign(email) {
  await ensure();
  const rows = await sql()`SELECT id, email, day::text AS day, hours::float AS hours, kind_detail FROM member_formation WHERE cosigner_email = ${lower(email)} AND status = 'awaiting_cosign' ORDER BY day, id`;
  return rows.map(r => ({ id: String(r.id), by: r.email, day: r.day, hours: r.hours, detail: r.kind_detail || '' }));
}

// The partner confirms (it goes to Jacob as pending) or says it is not right (it goes back to the mentee, with a note)
export async function cosign(email, id, ok) {
  await ensure();
  const n = Number(id);
  if (!Number.isInteger(n)) throw new Error('Couldn’t find that entry');
  const [row] = await sql()`SELECT id FROM member_formation WHERE id = ${n} AND cosigner_email = ${lower(email)} AND status = 'awaiting_cosign'`;
  if (!row) throw new Error('Couldn’t find that entry');
  if (ok) await sql()`UPDATE member_formation SET status = 'pending', cosigned_at = now() WHERE id = ${n}`;
  else await sql()`UPDATE member_formation SET status = 'returned', return_note = 'Your partner said they did not watch this class. Check the date, or choose nobody.' WHERE id = ${n}`;
  return awaitingCosign(email);
}

// Jacob sends a pending entry back with a note; the mentee sees it, edits and resends
export async function returnEntry(id, note) {
  await ensure();
  const n = Number(id);
  if (!Number.isInteger(n)) throw new Error('Couldn’t find that entry');
  await sql()`UPDATE member_formation SET status = 'returned', return_note = ${String(note ?? '').replace(/\s+/g, ' ').trim().slice(0, 400) || 'Please check this entry and send it again.'} WHERE id = ${n} AND status = 'pending'`;
  return pendingEntries();
}

// Mentor view: every entry still waiting for Jacob
export async function pendingEntries() {
  await ensure();
  const rows = await sql()`SELECT id, email, component, hours::float AS hours, day::text AS day, note, kind_detail, competencies, cosigner_email, at FROM member_formation WHERE status = 'pending' ORDER BY day, id`;
  return rows.map(r => ({ id: String(r.id), at: r.at ? new Date(r.at).toISOString() : '', email: r.email, component: r.component, hours: r.hours, day: r.day, note: r.note, detail: r.kind_detail || '', competencies: (r.competencies || []).map(id => (COMPETENCIES.find(c => c[0] === id) || [id, id])[1]), cosigned: !!r.cosigner_email }));
}

// Jacob confirms (counts toward the 100 hours) or declines (removes) a pending entry
export async function resolveEntry(id, confirm) {
  await ensure();
  const n = Number(id);
  if (!Number.isInteger(n)) throw new Error('Couldn’t find that entry');
  if (confirm) await sql()`UPDATE member_formation SET status = 'credited' WHERE id = ${n} AND status = 'pending'`;
  else await sql()`DELETE FROM member_formation WHERE id = ${n} AND status = 'pending'`;
  return pendingEntries();
}

// A mentee can take back an entry of their own that Jacob hasn't confirmed yet
export async function removePending(email, id) {
  await ensure();
  const n = Number(id);
  if (!Number.isInteger(n)) throw new Error('Couldn’t find that entry');
  await sql()`DELETE FROM member_formation WHERE id = ${n} AND email = ${lower(email)} AND status IN ('pending', 'awaiting_cosign', 'returned')`;
  return formationFor(email);
}

// A formation record plus entries counted automatically (see reflectionRows in lib/mentee/home.js). Not stored.
export function withAuto(f, extra) {
  if (!f || !extra?.length) return f;
  const entries = [...f.entries, ...extra].sort((a, b) => String(b.day).localeCompare(String(a.day)));
  return { ...summarise(entries), entries };
}

// Peer articulation (lib/mentee/store.js addArticulation): the hours are credited at once, to each person present, with what was practiced as the note.
// kind_detail ties the entry to the articulation record so it can be taken back with it.
export async function creditArticulation({ by, email, hours, day, note, articulationId }) {
  const e = cleanEntry({ email, component: 'peer', hours, day, note });
  await ensure();
  await sql()`INSERT INTO member_formation (email, component, hours, day, note, by, status, kind_detail) VALUES (${e.email}, 'peer', ${e.hours}, ${e.day}, ${e.note}, ${lower(by)}, 'credited', ${`articulation:${articulationId}`})`;
}
export async function removeArticulationCredits(articulationId) {
  await ensure();
  await sql()`DELETE FROM member_formation WHERE kind_detail = ${`articulation:${articulationId}`}`;
}
