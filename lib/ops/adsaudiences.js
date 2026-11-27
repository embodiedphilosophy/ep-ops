// Audiences for a draft (Ads PR 2). Suggested from the Audience library first (the ads_audiences table: empty until PR 4 fills it), matched on the
// program's topic, ranked Proven first. When the library has too few, Meta's interest search fills the gaps, each labelled "New test".
// Every candidate is { key, audience_id, name, detail, label: 'Proven' | 'New test', result, targeting }. targeting is exactly what an ad set carries.
import { listRows, adsTablesExist } from './adsstore.js';
import { searchInterests, hasToken } from './meta-ads.js';

const GEO = { countries: ['US', 'GB', 'CA', 'AU'] };
const STOP = new Set(['with', 'from', 'that', 'this', 'term', 'winter', 'spring', 'summer', 'fall', 'school', 'enrollment', 'enrolment', 'launch', 'the', 'and', 'for']);
export const interestTargeting = (id, name) => ({ geo_locations: GEO, age_min: 25, age_max: 65, flexible_spec: [{ interests: [{ id, name }] }] });
export const blankAudience = { key: 'blank', audience_id: '', name: 'Choose an audience', detail: 'Swap in one of the suggestions.', label: 'New test', result: '', targeting: {} };
// An ad set has an audience when its targeting says who (interests, or a saved audience)
export const hasAudience = t => !!(t && (t.flexible_spec?.some(f => Object.values(f).some(a => a?.length)) || t.custom_audiences?.length));

const topicWords = text => [...new Set(String(text || '').toLowerCase().split(/[^a-zāīūṛśṣṇṭḍ]+/).filter(w => w.length > 3 && !STOP.has(w)))];
const result = r => r && (r.roas ? `best 90-day return ${Number(r.roas).toFixed(1)}×` : r.cpl_cents ? `best cost per lead $${(r.cpl_cents / 100).toFixed(2)}` : '');

// → { candidates: [ranked], note }
export async function suggestAudiences({ topic = '', want = 5 } = {}) {
  const words = topicWords(topic), out = [], seen = new Set();
  const add = c => { if (!seen.has(c.key)) { seen.add(c.key); out.push(c); } };
  let note = '';
  if (await adsTablesExist().catch(() => false)) {
    const lib = (await listRows('audiences').catch(() => [])).filter(a => a.standing !== 'Retired');
    const fit = a => words.filter(w => (a.tags || []).some(t => String(t).toLowerCase().includes(w)) || a.name.toLowerCase().includes(w)).length;
    const rank = a => ({ Proven: 3, Promising: 2, 'Not tested': 1 }[a.standing] || 0);
    for (const a of lib.sort((x, y) => fit(y) - fit(x) || rank(y) - rank(x))) {
      const proven = a.standing === 'Proven';
      add({ key: `lib:${a.id}`, audience_id: a.id, name: a.name, detail: a.description || '', label: proven ? 'Proven' : 'New test', result: proven ? result(a.best_result) : '', targeting: a.meta_settings?.targeting || a.meta_settings || {} });
    }
  }
  if (hasToken()) {
    const queries = [...words, 'Meditation', 'Yoga', 'Philosophy', 'Tantra', 'Hinduism', 'Mindfulness', 'Spirituality'];
    for (const q of queries) {
      if (out.length >= want + 8) break;
      const r = await searchInterests(q, 5);
      if (!r.ok) { note = r.error || ''; break; }
      for (const i of r.data || []) add({ key: `int:${i.id}`, audience_id: '', name: `Interests · ${i.name}`, detail: 'People interested in ' + i.name.toLowerCase() + ', ages 25–65 · US, UK, Canada, Australia', label: 'New test', result: '', targeting: interestTargeting(i.id, i.name) });
    }
  } else note = 'Meta isn’t connected yet, so there are no interest suggestions. Add the access key in Vercel, or pick audiences by hand later.';
  return { candidates: out, note };
}
