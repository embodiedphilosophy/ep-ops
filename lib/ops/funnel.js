import { readPlain } from './store';
import { kitConfigured, tagCountSince } from '../kit';
import { todayET } from '../events';

export const PERIODS = [['30', 'Last 30 days'], ['90', 'Quarter'], ['365', 'Year']];
const daysAgo = n => new Date(Date.now() - n * 864e5).toISOString();

// Business → Funnel: people who reached each step in the period, from the Kit tag the Settings → Funnel row names.
// A step with no tag, or whose tag isn't in Kit, is left out (listed in `hidden`), never shown as zero.
// → { steps: [{ step, tag, n, ofFirst, ofPrev }], hidden: [{ step, why }], error }
export async function loadFunnel(days = 30) {
  if (!kitConfigured()) return { steps: [], hidden: [], error: 'Kit isn’t connected (KIT_API_KEY).' };
  let rows;
  try { rows = (await readPlain('Funnel', { light: true })).rows; }
  catch (e) { return { steps: [], hidden: [], error: /\(400\)|: 400/.test(e.message) ? '' : 'Couldn’t read the Funnel tab.', missingTab: /\(400\)|: 400/.test(e.message) }; }
  const since = daysAgo(days);
  const out = await Promise.all(rows.filter(r => r.values.step?.trim()).map(async ({ values: v }) => {
    const step = v.step.trim(), tag = (v.kit_tag || '').trim();
    if (!tag) return { step, hidden: 'No Kit tag set' };
    try { const n = await tagCountSince(tag, since); return n === null ? { step, hidden: `Tag “${tag}” isn’t in Kit` } : { step, tag, n }; }
    catch { return { step, hidden: 'Kit didn’t answer' }; }
  }));
  const steps = out.filter(s => !s.hidden);
  steps.forEach((s, i) => { s.ofFirst = steps[0].n ? s.n / steps[0].n : 0; s.ofPrev = i && steps[i - 1].n ? s.n / steps[i - 1].n : null; });
  return { steps, hidden: out.filter(s => s.hidden).map(s => ({ step: s.step, why: s.hidden })), error: '', today: todayET() };
}
