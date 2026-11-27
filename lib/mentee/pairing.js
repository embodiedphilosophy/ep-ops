// Articulation partners, chosen by the mentees themselves each month (Nov 2026: Jacob's assigned rotations didn't hold, because some
// people never replied). Each mentee picks one partner for the calendar month from the people still free. Anyone left over because the
// cohort is an odd number joins a pair, making a three. Pure helpers; the store is lib/mentee/store.js (mentee_pairs), the route
// app/api/member/this-week/pair. Tested by scripts/member-test/pairing.mjs.
export const MONTH = /^\d{4}-\d{2}$/;
const lower = s => String(s ?? '').trim().toLowerCase();

// rows: [{ group_id, email, name }] for one season and month → [{ id, members: [{ email, name }] }], oldest group first
export function groupsFrom(rows) {
  const by = new Map();
  for (const r of rows || []) {
    const id = String(r.group_id), e = lower(r.email);
    if (!e) continue;
    if (!by.has(id)) by.set(id, { id, members: [] });
    const g = by.get(id);
    if (!g.members.some(m => m.email === e)) g.members.push({ email: e, name: String(r.name || '').trim() || e });
  }
  return [...by.values()].filter(g => g.members.length).sort((a, b) => Number(a.id) - Number(b.id));
}

/**
 * What one mentee sees. me: email; cohort: [{ email, name }] (everyone in the formation, the mentee included or not); rows as above.
 * → { mine: group | null, partners: [{ email, name }] (the others in my group), open: [{ email, name }] people still free (not me),
 *     joinable: [group] pairs I may join as a third (only when I am the one left over), alone: true when I am the only person free }
 */
export function pairingView(me, cohort, rows) {
  const e = lower(me), groups = groupsFrom(rows);
  const grouped = new Set(groups.flatMap(g => g.members.map(m => m.email)));
  const mine = groups.find(g => g.members.some(m => m.email === e)) || null;
  const people = dedupe(cohort);
  const open = people.filter(p => p.email !== e && !grouped.has(p.email));
  const alone = !mine && open.length === 0;
  const joinable = alone ? groups.filter(g => g.members.length === 2) : [];
  return { mine, partners: mine ? mine.members.filter(m => m.email !== e) : [], open, joinable, alone };
}

const dedupe = list => {
  const seen = new Map();
  for (const p of list || []) { const e = lower(p.email); if (e && !seen.has(e)) seen.set(e, { email: e, name: String(p.name || '').trim() || e }); }
  return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
};

// Checks before a write. Each throws a plain-English message the route shows as it is.
export function checkChoose(me, partner, cohort, rows) {
  const e = lower(me), p = lower(partner);
  if (!p || p === e) throw new Error('Choose someone from your cohort');
  const v = pairingView(e, cohort, rows);
  if (v.mine) throw new Error('You already have a partner this month. Leave that pair first to choose someone else');
  if (!dedupe(cohort).some(x => x.email === p)) throw new Error('Choose someone from your cohort');
  if (!v.open.some(x => x.email === p)) throw new Error('That person has just found a partner. Choose someone else');
  return p;
}

export function checkJoin(me, groupId, cohort, rows) {
  const v = pairingView(me, cohort, rows);
  if (v.mine) throw new Error('You already have a partner this month');
  if (!v.alone) throw new Error('There are still people without a partner. Choose one of them first');
  const g = v.joinable.find(x => x.id === String(groupId));
  if (!g) throw new Error('That pair is already a three. Choose another pair');
  return g.id;
}
