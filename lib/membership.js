// Who gets which Kit tag, and which Kit tag opens which Circle group.
// Flow: Uscreen / SamCart → /api/members/uscreen|samcart → Kit tags → (Kit webhook) /api/members/kit → Circle.
// Edit the maps below when products, plans or Circle groups change.

export const TAG = {
  wisdom: 24287365,        // Member: Wisdom School
  wisdomPlus: 24372169,    // Member: Wisdom School Plus
  meditation: 24287364,    // Member: Meditation Pass
  yoga: 24363464,          // Member: Yoga Pass
  ssStudent: 24360185,     // SS 26-27 · Student
  ssYear: 24360186,        // SS 26-27 · Year-long
  ssFall: 24360187,        // SS 26-27 · Fall
  ssWinter: 24360188,      // SS 26-27 · Winter
  ssSpring: 24360189,      // SS 26-27 · Spring
  ssSummer: 24360190,      // SS 26-27 · Summer
  mentorship: 24360191,    // SLBT · Mentorship
  hold: 24363585,          // Hold: Not yet welcomed
};

// ---- Uscreen: by plan title (the "Subscription Plan" name) ----
export function uscreenTags(plan = '') {
  const p = String(plan).trim();
  if (!p || /basic/i.test(p) || /meditation resolution 2024/i.test(p)) return [];
  const tags = new Set();
  const wsSs = /^wisdom school \+ sadhana school/i.test(p) || /^sadhana school \+ wisdom school/i.test(p);
  if (/^wisdom school/i.test(p) || /premium/i.test(p) || wsSs) tags.add(TAG.wisdom);
  if (/^wisdom school plus/i.test(p)) tags.add(TAG.wisdomPlus);
  if (wsSs) { tags.add(TAG.ssStudent); tags.add(TAG.ssYear); } // these plans are the 2026-27 year
  if (/^meditation pass/i.test(p)) tags.add(TAG.meditation);
  if (/yoga pass/i.test(p)) tags.add(TAG.yoga);
  return [...tags];
}

// ---- SamCart: by product id ----
const YEAR_LONG = ['1117439', '1117467', '1117948', '1122728', '1122730', '1132501', '1133001', '1133002', '1133003', '1133005'];
const SAMCART = {
  ...Object.fromEntries(YEAR_LONG.map(id => [id, [TAG.ssStudent, TAG.ssYear]])),
  '1117471': [TAG.ssStudent, TAG.ssFall],    // Sadhana School Fall 2026
  '1117473': [TAG.ssStudent, TAG.ssWinter],  // Winter 2027
  '1117474': [TAG.ssStudent, TAG.ssSpring],  // Spring 2027
  '1117476': [TAG.ssStudent, TAG.ssSummer],  // Summer Retreat 2027
  '1132505': [TAG.mentorship],               // Sahṛdaya Upāya Teacher Formation (full)
  '1132512': [TAG.mentorship],               // Sahṛdaya Upāya Teacher Formation (payment plan)
};
export const samcartTags = productId => SAMCART[String(productId)] || [];

// ---- Circle: Kit tag → Circle access groups (by name; ids are looked up in Circle) ----
// Override with CIRCLE_GROUPS_JSON, e.g. {"24287365":["Wisdom School"]}
// Circle access group names, exactly as in Circle (Settings > Access groups); matched ignoring case/diacritics.
const SS_COMMONS = 'SS 26-27 · Commons';
const SS_SEASONS = ['SS 26-27 · Fall · The Heart of Recognition', 'SS 26-27 · Winter · Poetry as Philosophy', 'SS 26-27 · Spring · The Many Faces of Kālī', 'SS 26-27 · Summer · Being With the Heart'];
const CIRCLE_DEFAULT = {
  [TAG.wisdom]: ['Wisdom School'],
  [TAG.wisdomPlus]: ['Wisdom School Plus'],
  [TAG.meditation]: ['Meditation Pass'],
  // Year-long: tier marker + Commons + all four seasons
  [TAG.ssYear]: ['SS 26-27 · Year-long (tier marker)', SS_COMMONS, ...SS_SEASONS],
  // Sahṛdaya Upāya mentorship: everything year-long students get, plus Mentorship
  [TAG.mentorship]: ['Sahṛdaya Upāya · Mentorship', 'SS 26-27 · Year-long (tier marker)', SS_COMMONS, ...SS_SEASONS],
  // Season-only students: Commons + their season
  [TAG.ssFall]: [SS_COMMONS, SS_SEASONS[0]],
  [TAG.ssWinter]: [SS_COMMONS, SS_SEASONS[1]],
  [TAG.ssSpring]: [SS_COMMONS, SS_SEASONS[2]],
  [TAG.ssSummer]: [SS_COMMONS, SS_SEASONS[3]],
};
export function circleMap() {
  try { if (process.env.CIRCLE_GROUPS_JSON) return JSON.parse(process.env.CIRCLE_GROUPS_JSON); } catch {}
  return CIRCLE_DEFAULT;
}
// Every Circle group a set of Kit tag ids should open
export function circleGroupsFor(tagIds) {
  const map = circleMap(), out = new Set();
  for (const id of tagIds) for (const g of map[String(id)] || []) out.add(g);
  return [...out];
}

// Until MEMBERS_GO_LIVE=1, new subscribers from purchases also get the Hold tag,
// and nobody with the Hold tag is put into Circle (so Circle sends no invites).
export const goLive = () => process.env.MEMBERS_GO_LIVE === '1';
