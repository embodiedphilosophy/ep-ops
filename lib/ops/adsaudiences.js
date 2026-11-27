// Audiences for a draft (Ads PR 2, library-first since Ads PR 4). Suggested from the Audience library first, in this order: audiences whose tags (course types and topics) match the
// launch's program come first, and within those, Proven (with their past result), then Promising, then Not tested; audiences that don't match follow in the same order as a
// fallback. Retired audiences are never suggested. When the library has too few, Meta's interest search fills the gaps, each labelled "New test".
// Every candidate is { key, audience_id, name, detail, label: 'Proven' | 'New test', standing, result, targeting }. targeting is exactly what an ad set carries.
import { listRows, adsTablesExist } from './adsstore.js';
import { searchInterests, hasToken } from './meta-ads.js';

const GEO = { countries: ['US', 'GB', 'CA', 'AU'] };
const STOP = new Set(['with', 'from', 'that', 'this', 'term', 'winter', 'spring', 'summer', 'fall', 'school', 'enrollment', 'enrolment', 'launch', 'the', 'and', 'for']);
export const interestTargeting = (id, name) => ({ geo_locations: GEO, age_min: 25, age_max: 65, flexible_spec: [{ interests: [{ id, name }] }] });
export const blankAudience = { key: 'blank', audience_id: '', name: 'Choose an audience', detail: 'Swap in one of the suggestions.', label: 'New test', result: '', targeting: {} };
// An ad set has an audience when its targeting says who (interests, or a saved audience)
export const hasAudience = t => !!(t && (t.flexible_spec?.some(f => Object.values(f).some(a => a?.length)) || t.custom_audiences?.length));

export const topicWords = text => [...new Set(String(text || '').toLowerCase().split(/[^a-zāīūṛśṣṇṭḍ]+/).filter(w => w.length > 3 && !STOP.has(w)))];
const result = r => r && (r.roas ? `best return ${Number(r.roas).toFixed(1)}×` : r.cpl_cents ? `best cost per lead $${(r.cpl_cents / 100).toFixed(2)}` : '');
export const STANDING_RANK = { Proven: 3, Promising: 2, 'Not tested': 1 };

// A library row as an ad set can carry it. Proven ones say so, with their past result; every other label is "New test" (the ad set label has two values).
export function libraryCandidate(a) {
  const proven = a.standing === 'Proven';
  return { key: `lib:${a.id}`, audience_id: a.id, name: a.name, detail: a.description || '', label: proven ? 'Proven' : 'New test', standing: a.standing, result: proven ? result(a.best_result) : '', targeting: a.meta_settings?.targeting || a.meta_settings || {} };
}
// How well a library row's tags (and name) match the launch's topic and course type words. A short word must match a tag exactly; a longer one may sit inside it.
const words4 = text => String(text || '').toLowerCase().split(/[^a-zāīūṛśṣṇṭḍ]+/).filter(w => w.length > 1);
const said = (t, w) => t === w || (w.length > 3 && t.length > 3 && (t.includes(w) || w.includes(t)));
export const tagFit = (a, words) => words.filter(w => (a.tags || []).some(t => said(String(t).toLowerCase(), w)) || (w.length > 3 && a.name.toLowerCase().includes(w))).length;
// The library, best fit first: matched on tags, then Proven → Promising → Not tested, then the best past result. Retired never.
export function rankLibrary(rows, words) {
  const best = a => Number(a.best_result?.roas || 0) || (a.best_result?.cpl_cents ? 1000 / a.best_result.cpl_cents : 0);
  const rank = a => STANDING_RANK[a.standing] || 0;
  return rows.filter(a => a.standing !== 'Retired').sort((x, y) => (tagFit(y, words) > 0) - (tagFit(x, words) > 0) || rank(y) - rank(x) || tagFit(y, words) - tagFit(x, words) || best(y) - best(x) || x.name.localeCompare(y.name));
}

// → { candidates: [ranked], note }.   topic: the program, series and launch names; types: its course type words (Enrollment, SS …). Both are matched against tags.
export async function suggestAudiences({ topic = '', types = '', want = 5 } = {}) {
  const words = topicWords(topic), fitWords = [...new Set([...words, ...words4(types)])], out = [], seen = new Set();
  const add = c => { if (!seen.has(c.key)) { seen.add(c.key); out.push(c); } };
  let note = '';
  const known = { ids: new Set(), names: new Set() };   // what the library already holds, of any standing: a Meta interest the library has (a Retired one too) is never offered again as "New test"
  if (await adsTablesExist().catch(() => false)) {
    const rows = await listRows('audiences').catch(() => []);
    for (const a of rows) { known.names.add(a.name.toLowerCase()); for (const f of (a.meta_settings?.targeting || a.meta_settings || {}).flexible_spec || []) for (const i of f.interests || []) known.ids.add(String(i.id)); }
    for (const a of rankLibrary(rows, fitWords)) add(libraryCandidate(a));
  }
  if (hasToken()) {
    const queries = [...words, 'Meditation', 'Yoga', 'Philosophy', 'Tantra', 'Hinduism', 'Mindfulness', 'Spirituality'];
    for (const q of queries) {
      if (out.length >= want + 8) break;
      const r = await searchInterests(q, 5);
      if (!r.ok) { note = r.error || ''; break; }
      for (const i of r.data || []) if (!known.ids.has(String(i.id)) && !known.names.has(`interests · ${i.name}`.toLowerCase())) add({ key: `int:${i.id}`, audience_id: '', name: `Interests · ${i.name}`, detail: 'People interested in ' + i.name.toLowerCase() + ', ages 25–65 · US, UK, Canada, Australia', label: 'New test', standing: '', result: '', targeting: interestTargeting(i.id, i.name) });
    }
  } else note = 'Meta isn’t connected yet, so there are no interest suggestions. Add the access key in Vercel, or pick audiences by hand later.';
  return { candidates: out, note };
}
