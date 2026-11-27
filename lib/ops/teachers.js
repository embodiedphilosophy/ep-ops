// Teachers (Teachers & Email, phase 4b). The Teachers tab on EP-Programming-Calendar is the one master record: the website, the
// onboarding flow and now the dashboard all read it. New columns are only ever ADDED (the website reads bio, photo_url and status).
//   bio            = the website bio (onboarding asks for 60–100 words)     short_bio = ~40 words, for emails, the Kit snippet and Social
// A profile goes live on the website when its status is "approved". Approving copies bio and photo into live_bio / live_photo_url,
// so a later resubmission can be shown as a change against what is live.
import { readPlain, ensureColumns } from './store';
import { loadCalendar } from '../calendar';
import { emailsOf, todayET } from '../events';
import { addDays } from './tasks';

export const PROFILE_BASE = ['email', 'name', 'role', 'bio', 'photo_url', 'status', 'updated_on', 'onboarded_on'];
export const EXTRA_COLS = ['short_bio', 'pronouns', 'credentials', 'links_json', 'preferred_name', 'photo_alt', 'photo_credit', 'focal_x', 'focal_y', 'photo_versions_json', 'bio_updated_on', 'live_bio', 'live_photo_url', 'review_note', 'review_by', 'review_at', 'hidden'];
export const EDITABLE = ['name', 'role', 'bio', 'short_bio', 'pronouns', 'credentials', 'preferred_name', 'photo_alt', 'photo_credit'];
const TAB = 'Teachers';
let ready = false;
export async function teacherRows({ fresh = true } = {}) {
  if (!ready) { await ensureColumns(TAB, EXTRA_COLS).catch(() => {}); ready = true; }
  return (await readPlain(TAB, { light: !fresh })).rows;
}
export const lower = s => String(s || '').trim().toLowerCase();
export const words = s => String(s || '').trim().split(/\s+/).filter(Boolean).length;
export const parse = (s, d) => { try { const j = JSON.parse(s || ''); return j ?? d; } catch { return d; } };
const TEST = /\b(test|demo|dummy|lorem|asdf)\b/i;
const daysSince = d => /^\d{4}-\d{2}-\d{2}$/.test(d || '') ? Math.floor((Date.parse(todayET() + 'T12:00:00Z') - Date.parse(d + 'T12:00:00Z')) / 864e5) : null;
export const STALE_DAYS = 365;

// A word-level difference between what is live and what was submitted → [{ t: 'same' | 'add' | 'del', s }]
export function diffWords(a, b) {
  const x = String(a || '').split(/\s+/).filter(Boolean), y = String(b || '').split(/\s+/).filter(Boolean);
  const n = x.length, m = y.length, L = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = x[i] === y[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const out = []; let i = 0, j = 0; const push = (t, s) => { const l = out[out.length - 1]; if (l && l.t === t) l.s += ' ' + s; else out.push({ t, s }); };
  while (i < n && j < m) { if (x[i] === y[j]) { push('same', x[i]); i++; j++; } else if (L[i + 1][j] >= L[i][j + 1]) push('del', x[i++]); else push('add', y[j++]); }
  while (i < n) push('del', x[i++]); while (j < m) push('add', y[j++]);
  return out;
}

// Everyone who has taught or is scheduled, plus everyone with a profile → [{ key, email, name, state, flags, ... }]
export async function directory({ fresh = true } = {}) {
  const [rows, cal] = await Promise.all([teacherRows({ fresh }), loadCalendar().catch(() => [])]);
  const today = todayET(), by = new Map();
  const slot = (email, name) => { const key = lower(email) || `name:${lower(name)}`; if (!by.has(key)) by.set(key, { key, email: lower(email), name: name || '', upcoming: 0, taught: 0, profile: null }); return by.get(key); };
  for (const r of rows) { const e = slot(r.values.email, r.values.name); e.profile = { ...r.values, _row: r.row }; e.name = r.values.name || e.name; }
  for (const ev of cal) {
    if (/cancel/i.test(ev.status)) continue;
    const em = emailsOf(ev), nm = String(ev.teachers || '').split(/,|&| and /).map(s => s.trim()).filter(Boolean);
    const who = em.length ? em.map((x, i) => [x, nm[i] || '']) : nm.map(n => ['', n]);
    for (const [email, name] of who) { const e = by.get(lower(email)) || [...by.values()].find(v => !email && lower(v.name) === lower(name)) || slot(email, name); if (ev.date >= today) e.upcoming++; else e.taught++; }
  }
  return [...by.values()].filter(e => e.name || e.email).map(e => {
    const p = e.profile, flags = [];
    const age = p ? daysSince(p.bio_updated_on || p.updated_on) : null;
    if (p && p.status === 'submitted') flags.push('submission');
    if (!p) flags.push('noprofile'); else { if (!p.photo_url) flags.push('photo'); if (!p.bio) flags.push('bio'); else if (age == null || age > STALE_DAYS) flags.push('update'); }
    const test = !!p && (String(p.hidden).toUpperCase() === 'TRUE' ? 'hidden' : TEST.test(`${p.name} ${lower(p.email).split('@')[0]}`) ? 'test' : '');
    const state = flags.includes('submission') ? 'Submission waiting' : flags.includes('noprofile') ? 'No profile yet' : flags.includes('photo') ? 'Missing headshot' : flags.includes('bio') || flags.includes('update') ? 'Needs update' : 'Current';
    return { key: e.key, email: e.email, name: p?.name || e.name, preferred_name: p?.preferred_name || '', role: p?.role || '', status: p?.status || '', state, flags, upcoming: e.upcoming, taught: e.taught, has_photo: !!p?.photo_url, onboarded: !!p?.onboarded_on, has_profile: !!p, photo_url: p?.photo_url || '', bio_age_days: age, test: test === 'test', hidden: test === 'hidden' };
  }).sort((a, b) => (b.upcoming > 0) - (a.upcoming > 0) || a.name.localeCompare(b.name));
}
// The calendar's sessions a teacher is on (not cancelled): by email on the Teachers column, or by name
export const sessionsFor = (cal, email, name) => cal.filter(e => !/cancel/i.test(e.status) && (lower(e.teacher_host_emails).includes(lower(email)) || lower(e.teachers).includes(lower(name))));
export { addDays };
