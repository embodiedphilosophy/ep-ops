import { getOffering, saveOffering, setAccess, listOfferings } from './offerings';
import { blankOffering, slugify, canPublish, checklist, circleSnapshot, onboardingSnapshot, PROGRAMMES, ACCESS, KINDS, FORMATS, DEPTHS, TOPICS } from './library';
import { prefill, onboardingContext } from './libraryprefill';
import { applyPrefill } from './librarysync';
import { catalogRow, writeCatalog, revalidateCourses } from './catalog';
import { circleGet, circleConfigured } from '../circle';

// The things staff can do to an offering from the Course Library desk. Each returns { offering, note? } or throws
// an Error whose message is written for staff. Nothing here writes to Circle.
const oneOf = (v, list) => (list.includes(v) ? v : '');
const text = (v, n = 4000) => String(v ?? '').slice(0, n);
const lines = v => (Array.isArray(v) ? v : String(v ?? '').split(/\r?\n/)).map(x => String(x).trim()).filter(Boolean).slice(0, 40);

// Only these fields can be changed from the form. Circle's own fields (title, price, checkout link, Circle status)
// are not here on purpose: staff change them in Circle.
export function cleanChanges(c = {}) {
  const out = {};
  if ('programme' in c) out.programme = oneOf(c.programme, PROGRAMMES.map(p => p[0]));
  if ('access' in c) out.access = oneOf(c.access, ACCESS.map(p => p[0]));
  if ('requires' in c) out.requires = oneOf(c.requires, ['', 'year_long']);
  if ('unlock_note' in c) out.unlock_note = text(c.unlock_note, 300);
  if ('card_label' in c) out.card_label = text(c.card_label, 60);
  if ('kind' in c) out.kind = oneOf(c.kind, KINDS);
  if ('format' in c) out.format = oneOf(c.format, FORMATS);
  if ('depth' in c) out.depth = oneOf(c.depth, DEPTHS);
  if ('topics' in c) out.topics = (c.topics || []).filter(t => TOPICS.includes(t));
  if ('length' in c) out.length = text(c.length, 80);
  if ('next_date' in c) out.next_date = /^\d{4}-\d{2}-\d{2}$/.test(c.next_date) ? c.next_date : '';
  if ('next_session' in c) out.next_session = text(c.next_session, 200);
  if ('ce_hours' in c) out.ce_hours = text(c.ce_hours, 10).replace(/[^0-9.]/g, '');
  if ('description' in c) out.description = text(c.description);
  if ('included' in c) out.included = lines(c.included);
  if ('sessions' in c) out.sessions = (c.sessions || []).slice(0, 60).map(s => ({ id: text(s.id, 20), date: text(s.date, 10), time: text(s.time, 20), title: text(s.title, 200), teacher: text(s.teacher, 120) }));
  if ('teachers' in c) out.teachers = (c.teachers || []).slice(0, 12).map(t => ({ name: text(t.name, 120), role: text(t.role, 120), bio: text(t.bio, 2000), photo: text(t.photo, 500), email: text(t.email, 120) }));
  if ('cover_override' in c) out.cover_override = /^(https:\/\/|\/)/.test(c.cover_override) ? text(c.cover_override, 600) : '';
  if ('price_label' in c && c.manual_price) out.price_label = text(c.price_label, 80);
  if ('checkout_url' in c && c.manual_price) out.checkout_url = /^https:\/\//.test(c.checkout_url) ? text(c.checkout_url, 600) : '';
  if ('director_email' in c) out.director_email = text(c.director_email, 120).toLowerCase();
  return out;
}

const log = (o, who, what) => { o.history = [{ at: new Date().toISOString(), who, what }, ...(o.history || [])].slice(0, 30); };
const need = async id => { const o = await getOffering(id); if (!o) throw new Error('That item isn’t in the Course Library any more. Check Circle again.'); return o; };

export async function save(id, changes, who) {
  const o = await need(id);
  Object.assign(o, cleanChanges(changes));
  for (const k of Object.keys(changes)) if (o.sources[k]) delete o.sources[k];
  log(o, who, 'Saved changes');
  return { offering: await saveOffering(o) };
}
export async function skip(id, who, undo = false) {
  const o = await need(id); o.skipped = !undo; log(o, who, undo ? 'Brought back from Skipped' : 'Skipped');
  return { offering: await saveOffering(o) };
}
export async function link(id, onboardingId, who) {
  const o = await need(id);
  if (!onboardingId) { o.onboarding_id = ''; o.onboarding_source = ''; o.faculty = []; o.onboarding_values = null; log(o, who, 'Unlinked from onboarding'); return { offering: await saveOffering(o) }; }
  const pf = await prefill(onboardingId);
  if (!pf) throw new Error('Couldn’t find that onboarding submission.');
  o.onboarding_id = onboardingId; o.onboarding_source = 'linked by staff';
  o.onboarding_values = null; // staff chose this: fill every empty field
  applyPrefill(o, pf);
  log(o, who, `Linked to onboarding “${pf.title || onboardingId}”`);
  return { offering: await saveOffering(o) };
}

async function freshFaculty(o) {
  if (!o.onboarding_id) return;
  const pf = await prefill(o.onboarding_id, { ctx: await onboardingContext() });
  if (pf) { o.faculty = pf.faculty; o.onboarding_values = { ...pf.values }; }
}

// Publish a new listing, or update a live one (Update also brings in onboarding edits for fields staff haven't changed)
export async function publish(id, who, { update = false } = {}) {
  const o = await need(id);
  const prevVals = o.published_snapshot?.onboarding;
  await freshFaculty(o);
  if (update && prevVals && o.onboarding_values) {
    // Bring in what teachers changed, but only for fields staff haven't edited since the last publish
    const latest = o.onboarding_values; o.onboarding_values = prevVals;
    applyPrefill(o, { values: latest, sources: {}, faculty: o.faculty });
  }
  if (!canPublish(o)) throw new Error('Not ready yet: ' + checklist(o).filter(c => c.required && !c.ok).map(c => c.label).join('; '));
  const now = new Date().toISOString();
  if (!o.published_at) o.published_at = now;
  const wasLive = o.status === 'published';
  const sheet = await writeCatalog(catalogRow({ ...o, status: 'published' }, 'published'));
  o.status = 'published'; o.skipped = false; o.auto_hidden = false;
  o.published_snapshot = { at: now, circle: circleSnapshot(o), onboarding: o.onboarding_values ? { ...o.onboarding_values } : onboardingSnapshot(o) };
  log(o, who, wasLive ? 'Updated listing' : 'Published');
  const saved = await saveOffering(o);
  const site = await revalidateCourses();
  return { offering: saved, note: site.note, sheetRow: sheet.row };
}
export async function unpublish(id, who) {
  const o = await need(id);
  await writeCatalog(catalogRow(o, 'unpublished'));
  o.status = 'unpublished'; log(o, who, 'Unpublished');
  const saved = await saveOffering(o);
  const site = await revalidateCourses();
  return { offering: saved, note: site.note };
}
// "Changed in Circle" is awareness only: mark it as seen without touching the site
export async function markSeen(id, who) {
  const o = await need(id);
  if (o.published_snapshot) o.published_snapshot = { ...o.published_snapshot, circle: circleSnapshot(o) };
  log(o, who, 'Marked Circle change as seen');
  return { offering: await saveOffering(o) };
}

export async function setMap(entry) {
  if (!entry.circle_id) throw new Error('Pick a paywall first');
  await setAccess({ circle_id: String(entry.circle_id), kind: entry.kind || 'paywall', title: text(entry.title, 200), access: oneOf(entry.access, ['', ...ACCESS.map(a => a[0])]), requires: oneOf(entry.requires, ['', 'year_long']), unlock_note: text(entry.unlock_note, 300) });
  return {};
}

// If Circle gives no course list, staff paste a Circle URL. We only check that it resolves.
export async function addByUrl(url, who) {
  if (!circleConfigured()) throw new Error('Circle isn’t connected on this deployment (CIRCLE_API_TOKEN).');
  const m = String(url).match(/circle\.so\/|embodiedphilosophy\.com|ss\.embodiedphilosophy/i) ? String(url).match(/\/(?:c|spaces?)\/([A-Za-z0-9_-]+)/) : null;
  if (!m) throw new Error('That doesn’t look like a Circle course link. Paste the address of the course in Circle.');
  const space = await circleGet(`/spaces/${encodeURIComponent(m[1])}`).catch(e => { throw new Error(e.status === 404 ? 'Circle doesn’t know that course. Check the link.' : `Couldn’t check Circle: ${e.message}`); });
  const s = space.space || space;
  const all = await listOfferings();
  if (all.find(o => String(o.circle_course_id) === String(s.id))) throw new Error('That course is already in the library.');
  const taken = new Set(all.map(o => o.offering_id));
  let base = slugify(s.name || s.title || m[1]) || 'offering', id = base, n = 2; while (taken.has(id)) id = `${base}-${n++}`;
  const o = blankOffering({ offering_id: id, circle_course_id: String(s.id), title: s.name || s.title || m[1], found_at: new Date().toISOString(), circle_status: 'published', cover_url: s.cover_image_url || '' });
  log(o, who, 'Added from a Circle link');
  return { offering: await saveOffering(o) };
}
