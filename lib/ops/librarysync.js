import { readCircle, paywallFor } from './circlecatalog';
import { listOfferings, saveOffering, listAccessMap, persistent, setMeta } from './offerings';
import { blankOffering, slugify, circleSnapshot, ONBOARDING_FIELDS } from './library';
import { onboardingContext, autoLink, prefill } from './libraryprefill';
import { catalogRow, writeCatalog, revalidateCourses, catalogSheetId } from './catalog';

// The Course Library sync: Circle → offering records. Runs every hour (cron) and from "Check Circle now".
// Reads Circle (never writes to it), then:
//   1. a Circle course with no offering record becomes a draft ("New from Circle")
//   2. drafts are matched to teacher onboarding by Circle ID; staff link the rest by hand
//   3. a published offering whose Circle title, price, cover or status changed keeps the new Circle values on its
//      record and gets a "Changed in Circle" flag (the flag is derived by comparing with what was last published)
//   4. a published offering whose Circle course was unpublished or removed is hidden on the site at this sync
//   5. onboarding edits after publishing show as "Changed in onboarding"; nothing goes live until staff press Update
const STATE_KEY = '__epLibrarySync';
export const lastSync = () => globalThis[STATE_KEY] || null;

const uniqueId = (base, taken) => { let id = base || 'offering', n = 2; while (taken.has(id)) id = `${base}-${n++}`; taken.add(id); return id; };
const empty = v => v === '' || v == null || (Array.isArray(v) && !v.length);
const same = (a, b) => JSON.stringify(a ?? '') === JSON.stringify(b ?? '');

// Put onboarding values on the form: always for a fresh draft; for later runs only into fields staff haven't changed
export function applyPrefill(o, pf) {
  const prev = o.onboarding_values || {};
  const sources = { ...o.sources };
  for (const f of [...ONBOARDING_FIELDS, 'next_session']) {
    const v = pf.values[f];
    if (v === undefined) continue;
    if (empty(o[f]) || same(o[f], prev[f])) { o[f] = v; if (!empty(v)) sources[f] = pf.sources[f] || 'Onboarding'; }
  }
  o.sources = sources; o.onboarding_values = { ...pf.values }; o.faculty = pf.faculty;
  return o;
}

export async function runLibrarySync({ manual = false } = {}) {
  const t0 = Date.now();
  const circle = await readCircle();
  const result = { checkedAt: new Date().toISOString(), manual, persistent: persistent(), circle: { configured: circle.configured, courses: circle.courses.length, paywalls: circle.paywalls.length }, created: 0, updated: 0, linked: 0, hidden: 0, notes: [...circle.notes] };
  if (!circle.configured) { globalThis[STATE_KEY] = result; await setMeta({ sync: result }).catch(() => {}); return result; }

  const [offerings, map] = await Promise.all([listOfferings(), listAccessMap()]);
  const ctx = await onboardingContext().catch(e => { result.notes.push(`Couldn’t read teacher onboarding: ${e.message}`); return null; });
  const byCourse = new Map(offerings.filter(o => o.circle_course_id).map(o => [o.circle_course_id, o]));
  const taken = new Set(offerings.map(o => o.offering_id));
  const access = id => map.find(m => m.circle_id === String(id));
  const seen = new Set();

  for (const c of circle.courses) {
    seen.add(c.id);
    const pw = paywallFor(c, circle.paywalls);
    const fresh = { title: c.title, cover_url: c.cover_url, circle_status: c.status, price_label: pw?.price_label || '', checkout_url: pw?.checkout_url || '', circle_paywall_id: pw?.id || '' };
    let o = byCourse.get(c.id), isNew = false;
    if (!o) {
      isNew = true;
      o = blankOffering({ offering_id: uniqueId(slugify(c.title), taken), circle_course_id: c.id, found_at: new Date().toISOString(), ...fresh });
    }
    const before = JSON.stringify(circleSnapshot(o));
    // Price and checkout link follow Circle when Circle gives them; otherwise whatever staff typed stays
    Object.assign(o, { title: fresh.title, cover_url: fresh.cover_url, circle_status: fresh.circle_status, circle_paywall_id: fresh.circle_paywall_id || o.circle_paywall_id });
    if (fresh.price_label) o.price_label = fresh.price_label;
    if (fresh.checkout_url) o.checkout_url = fresh.checkout_url;
    const m = access(o.circle_paywall_id) || access(c.id);
    if (m?.access && !o.access) { o.access = m.access; o.requires = m.requires || ''; o.unlock_note = m.unlock_note || ''; }
    if (ctx) {
      if (!o.onboarding_id) { const id = await autoLink(c.id, ctx); if (id) { o.onboarding_id = id; o.onboarding_source = 'matched by Circle ID'; result.linked++; } }
      if (o.onboarding_id) { const pf = await prefill(o.onboarding_id, { ctx }); if (pf) { if (o.status === 'published') { o.onboarding_values = { ...pf.values }; o.faculty = pf.faculty; } else applyPrefill(o, pf); } }
    }
    // A published offering whose Circle course is no longer live is hidden on the site now
    if (o.status === 'published' && o.circle_status !== 'published') {
      try { if (catalogSheetId()) { await writeCatalog(catalogRow(o, 'unpublished')); } o.status = 'unpublished'; o.auto_hidden = true; result.hidden++; }
      catch (e) { result.notes.push(`Couldn’t hide ${o.title} on the site: ${e.message}`); }
    }
    if (isNew) result.created++; else if (before !== JSON.stringify(circleSnapshot(o))) result.updated++;
    await saveOffering(o);
  }
  // Offerings whose Circle course has gone: hide, and show as unpublished
  for (const o of offerings) {
    if (!o.circle_course_id || seen.has(o.circle_course_id) || o.circle_status === 'removed') continue;
    o.circle_status = 'removed';
    if (o.status === 'published') { try { if (catalogSheetId()) await writeCatalog(catalogRow(o, 'unpublished')); o.status = 'unpublished'; o.auto_hidden = true; result.hidden++; } catch (e) { result.notes.push(`Couldn’t hide ${o.title}: ${e.message}`); } }
    await saveOffering(o);
  }
  if (result.hidden) await revalidateCourses();
  result.ms = Date.now() - t0;
  globalThis[STATE_KEY] = result;
  await setMeta({ sync: result }).catch(() => {});
  return result;
}
