import { NextResponse } from 'next/server';
import { currentUser } from '@/lib/ops/auth';
import { canEditSite } from '@/lib/ops/nav';
import { refreshSite } from '@/lib/ops/refresh';
import { readPlain, updatePlain, addPlain, ensureColumns, createTab, ConflictError } from '@/lib/ops/store';
import { PARTNER_TAB, PARTNER_COLUMNS, MONTH, monthsFrom, defaultMonth, monthRows, groupsFrom, pairsOf, pairKey, diffPairs } from '@/lib/ops/partners';
import { mentees } from '@/lib/member/cohort';
import { todayET } from '@/lib/events';
import config from '@/data/mentee.json';

export const dynamic = 'force-dynamic';

// Peer partners (Settings → Peer partners). Jacob, Irene and Floss (the editors) can use it. The people come from the Sahṛdaya Upāya tag
// in Kit; pairs are saved to the "Mentee Partners" tab through lib/ops/store.js (change-logged, conflict-checked, nothing deleted).
const deny = (user) => !user ? NextResponse.json({ error: 'Please sign in again' }, { status: 401 }) : !canEditSite(user) ? NextResponse.json({ error: 'Only Jacob, Irene and Floss can set peer partners' }, { status: 403 }) : null;

async function readTab(fresh) {
  try { return { ...(await readPlain(PARTNER_TAB, { light: !fresh })), missing: false }; }
  catch (e) { if (/\(400\)|: 400/.test(e.message)) return { head: [], rows: [], missing: true }; throw e; }
}

async function state(month) {
  const [cohort, tab] = await Promise.all([mentees(), readTab(false)]);
  const season = config.season;
  const here = monthRows(tab.rows, month, season), others = new Set();
  for (const x of tab.rows) { if (/^(false|no|hide)$/i.test(String(x.values.publish || '').trim())) continue; const a = String(x.values.email_a || '').toLowerCase(), b = String(x.values.email_b || '').toLowerCase(); if (a && b && !here.some(r => r.row === x.row)) others.add(pairKey(a, b)); }
  const people = new Map(cohort.map(m => [m.email, m.name]));
  const groups = groupsFrom(here.filter(r => !r.hidden));
  for (const e of groups.flat()) if (!people.has(e)) people.set(e, e); // someone paired by hand who is no longer in the Kit list is still shown
  return { month, season, months: monthsFrom(todayET()), cohort: [...people].map(([email, name]) => ({ email, name })).sort((a, b) => a.name.localeCompare(b.name)), groups, history: [...others], missingTab: tab.missing, kitOk: cohort.length > 0 };
}

export async function GET(req) {
  const user = await currentUser(), no = deny(user);
  if (no) return no;
  const month = new URL(req.url).searchParams.get('month') || defaultMonth(todayET());
  if (!MONTH.test(month)) return NextResponse.json({ error: 'Unknown month' }, { status: 400 });
  try { return NextResponse.json(await state(month)); }
  catch (e) { console.error('partners GET', e.message); return NextResponse.json({ error: 'Couldn’t read the sheet or the mentee list. Try again shortly.' }, { status: 502 }); }
}

// POST { month: '2026-11', groups: [['a@x.com', 'b@x.com'], ['c@x.com', 'd@x.com', 'e@x.com']] }: this month holds exactly these groups.
export async function POST(req) {
  const user = await currentUser(), no = deny(user);
  if (no) return no;
  const { month, groups } = await req.json().catch(() => ({}));
  if (!MONTH.test(month || '') || !Array.isArray(groups)) return NextResponse.json({ error: 'Choose a month and at least one group' }, { status: 400 });
  let pairs;
  try { pairs = pairsOf(groups.map(g => Array.isArray(g) ? g : [])); } catch (e) { return NextResponse.json({ error: e.message }, { status: 400 }); }
  try {
    const cohort = await mentees();
    const names = new Map(cohort.map(m => [m.email, m.name]));
    const tab = await readTab(true);
    const here = monthRows(tab.rows, month, config.season);
    for (const r of here) { if (!names.has(r.a)) names.set(r.a, r.values.name_a || r.a); if (!names.has(r.b)) names.set(r.b, r.values.name_b || r.b); }
    const stranger = pairs.flat().find(e => !names.has(e));
    if (stranger) return NextResponse.json({ error: `${stranger} isn’t on the Sahṛdaya Upāya list.` }, { status: 400 });
    const { updates, adds } = diffPairs(here, pairs, { ym: month, season: config.season, nameOf: e => names.get(e) || e });
    const who = user.name || user.email;
    if (tab.missing) await createTab(PARTNER_TAB, PARTNER_COLUMNS);
    else if (adds.length) await ensureColumns(PARTNER_TAB, PARTNER_COLUMNS);
    for (const u of updates) await updatePlain(PARTNER_TAB, u.row, u.changes, { before: u.before, who });
    for (const a of adds) await addPlain(PARTNER_TAB, a, { who });
    refreshSite(); // mentees see it now, not in 5 minutes
    return NextResponse.json({ ok: true, added: adds.length, hidden: updates.filter(u => u.changes.publish === 'FALSE').length, restored: updates.filter(u => u.changes.publish === '').length, ...(await state(month)) });
  } catch (e) {
    if (e instanceof ConflictError) return NextResponse.json({ error: 'Someone changed the partners just now. Reload and try again.' }, { status: 409 });
    console.error('partners POST', e.message);
    return NextResponse.json({ error: 'Could not save to the sheet. Try again shortly.' }, { status: 502 });
  }
}
