// Launches (Teachers & Email, phase 4a): a launch groups everything around one moment (an enrolment, a festival, an offer):
// its emails, social posts, landing page and tasks, from a playbook of steps counted from key dates.
// Tabs on EP-Programming-Calendar, made on first use: "Launches" and "Playbooks".
import { readPlain, addPlain, updatePlain, createTab, ensureColumns } from './store';

export const LAUNCH_COLS = ['id', 'name', 'event_id', 'kind', 'status', 'playbook_id', 'dates_json', 'steps_json', 'audience_json', 'landing_url', 'tag_name', 'notes', 'created_by', 'updated_by', 'updated_at'];
export const PLAYBOOK_COLS = ['id', 'name', 'about', 'anchors_json', 'steps_json'];
const T = { Launches: LAUNCH_COLS, Playbooks: PLAYBOOK_COLS };
export const LANES = [['email', 'Emails'], ['social', 'Social'], ['page', 'Landing page'], ['task', 'Tasks']];

// Steps count from key dates ("anchors"). A step may carry an exact date instead (used for the Meditation Resolution Mondays).
const e = (step, anchor, days, time = '09:00', extra = {}) => ({ type: 'email', step, anchor, days, time, ...extra });
export const SEED_PLAYBOOKS = [
  { id: 'PB-event', name: 'Event promo', about: 'Three emails and two posts around one event or course.', anchors: [['event', 'The event']],
    steps: [{ type: 'page', step: 'Landing page is live', anchor: 'event', days: -28 }, e('Promo #1', 'event', -21), { type: 'social', step: 'Announcement post', anchor: 'event', days: -14 }, e('Promo #2', 'event', -7), e('Promo #3', 'event', -2), { type: 'social', step: 'Tomorrow post', anchor: 'event', days: -1 }] },
  { id: 'PB-enrol', name: 'Enrollment', about: 'Doors open to doors close, then the welcome. Counted from three dates.', anchors: [['open', 'Doors open'], ['close', 'Doors close'], ['term', 'Term starts']],
    steps: [{ type: 'page', step: 'Landing page is live', anchor: 'open', days: -14 }, e('Coming soon', 'open', -7), e('Doors open', 'open', 0), { type: 'social', step: 'Doors open post', anchor: 'open', days: 0 }, e('A student’s story', 'open', 7), e('One week left', 'close', -7), { type: 'social', step: 'Closing soon post', anchor: 'close', days: -2 }, e('Last three days', 'close', -3), e('Last day', 'close', 0), e('Welcome', 'term', -1, '09:00', { audience: 'enrolled' }), { type: 'task', step: 'Prepare the welcome pack', anchor: 'term', days: -10 }] },
  { id: 'PB-countdown', name: 'Countdown to a day', about: 'Meditation Resolution 2027: four Mondays of emails (30 Nov, 14, 21 and 28 Dec). None on 7 Dec (the Practice Report) or 31 Dec.', anchors: [['event', 'The day itself']],
    steps: [e('Road to Resolution 1', 'event', -32, '09:00', { date: '2026-11-30' }), e('Road to Resolution 2', 'event', -18, '09:00', { date: '2026-12-14' }), e('Road to Resolution 3', 'event', -11, '09:00', { date: '2026-12-21' }), e('Road to Resolution 4', 'event', -4, '09:00', { date: '2026-12-28' }), { type: 'social', step: 'Countdown posts', anchor: 'event', days: -5 }] },
  { id: 'PB-festival', name: 'Festival or season', about: 'A longer lead for a festival such as Navarātri.', anchors: [['event', 'First day']],
    steps: [{ type: 'page', step: 'Landing page is live', anchor: 'event', days: -35 }, e('Save the date', 'event', -28), e('Promo #1', 'event', -14), { type: 'social', step: 'Announcement post', anchor: 'event', days: -10 }, e('Promo #2', 'event', -5), e('Starts tomorrow', 'event', -1)] },
  { id: 'PB-offer', name: 'Offer week', about: 'A short offer such as Cyber Week.', anchors: [['open', 'Offer starts'], ['close', 'Offer ends']],
    steps: [e('Offer is live', 'open', 0), { type: 'social', step: 'Offer post', anchor: 'open', days: 0 }, e('A reminder', 'open', 3), e('Last day', 'close', 0)] },
];
// Launches Jake listed that don't exist yet (Cyber Week and the Practice Report aren't on Programming)
export const SUGGESTED = [
  { name: 'Cyber Week · The Open Library', kind: 'Offer', playbook_id: 'PB-offer', dates: { open: '2026-11-30', close: '2026-12-04' }, note: 'Not on Programming yet' },
  { name: 'Practice Report', kind: 'Offer', playbook_id: 'PB-event', dates: { event: '2026-12-07' }, note: 'Not on Programming yet' },
  { name: 'Meditation Resolution 2027', kind: 'Event', playbook_id: 'PB-countdown', dates: { event: '2027-01-01' }, match: /meditation resolution/i },
  { name: 'Enrollment · Winter 2027', kind: 'Enrollment', playbook_id: 'PB-enrol', dates: { open: '2027-01-06', close: '2027-01-26', term: '2027-01-27' } },
  { name: 'Vasanta Navarātri', kind: 'Festival', playbook_id: 'PB-festival', dates: { event: '2027-03-22' } },
  { name: 'Enrollment · Spring 2027', kind: 'Enrollment', playbook_id: 'PB-enrol', dates: { open: '2027-03-31' } },
];

let ready = {};
async function table(title, seed = []) {
  let t = await readPlain(title, { light: !!ready[title] }).catch(() => null);
  if (!t) { await createTab(title, T[title], seed); t = await readPlain(title); }
  if (!ready[title]) { await ensureColumns(title, T[title]).catch(() => {}); ready[title] = true; }
  return t.rows;
}
const seedRow = p => ({ id: p.id, name: p.name, about: p.about, anchors_json: JSON.stringify(p.anchors), steps_json: JSON.stringify(p.steps) });
export const playbookRows = async () => (await table('Playbooks', SEED_PLAYBOOKS.map(seedRow))).map(r => ({ ...r.values, anchors: parse(r.values.anchors_json, []), steps: parse(r.values.steps_json, []), _row: r.row }));
export const launchRows = async () => (await table('Launches')).map(r => ({ ...r.values, dates: parse(r.values.dates_json, {}), steps: parse(r.values.steps_json, []), audience: parse(r.values.audience_json, { include: [], exclude: [] }), _row: r.row }));
export const parse = (s, d) => { try { const j = JSON.parse(s || ''); return j ?? d; } catch { return d; } };
const addDays = (d, n) => { const x = new Date(d + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };

// The dated steps a playbook makes for the key dates given → [{ type, step, date, time, audience }] (steps with no key date are left out and named)
export function generate(playbook, dates) {
  const steps = [], missing = new Set();
  for (const s of playbook.steps) {
    const base = dates?.[s.anchor];
    const date = s.date || (/^\d{4}-\d{2}-\d{2}$/.test(base || '') ? addDays(base, s.days || 0) : '');
    if (!date) { missing.add(s.anchor); continue; }
    steps.push({ type: s.type, step: s.step, date, time: s.time || '09:00', audience: s.audience || 'main' });
  }
  return { steps: steps.sort((a, b) => a.date.localeCompare(b.date) || a.step.localeCompare(b.step)), missing: [...missing] };
}
export async function addLaunch(v, who) {
  const rows = await launchRows(), id = `L${String(Math.max(0, ...rows.map(r => Number(String(r.id).replace('L', '')) || 0)) + 1).padStart(3, '0')}`;
  await addPlain('Launches', { status: 'Planning', ...v, id, created_by: who, updated_by: who, updated_at: new Date().toISOString() }, { who });
  return id;
}
export async function saveLaunch(row, changes, before, who) {
  return updatePlain('Launches', row, { ...changes, updated_by: who, updated_at: new Date().toISOString() }, { before, who });
}
export async function addPlaybook(p, who) { await table('Playbooks', SEED_PLAYBOOKS.map(seedRow)); return addPlain('Playbooks', seedRow(p), { who }); }
