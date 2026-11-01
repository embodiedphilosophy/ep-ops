import { NextResponse } from 'next/server';
import { currentUser } from '@/lib/ops/auth';
import { canEditSite } from '@/lib/ops/nav';
import { refreshSite } from '@/lib/ops/refresh';
import { readPlain, updatePlain, addPlain, ensureColumns, createTab, ConflictError } from '@/lib/ops/store';
import { PARTNER_TAB, PARTNER_COLUMNS, PROFILE_TAB, PROFILE_COLUMNS, MONTH, monthsFrom, defaultMonth, monthRows, groupsFrom, pairsOf, pairKey, diffPairs, rotationMonths, chatsFrom, groupKey } from '@/lib/ops/partners';
import { validZone } from '@/lib/mentee/window';
import { mentees } from '@/lib/member/cohort';
import { todayET } from '@/lib/events';
import config from '@/data/mentee.json';

export const dynamic = 'force-dynamic';

// Peer partners (Settings → Peer partners). Jacob, Irene and Floss (the editors) can use it. The people come from the Sahṛdaya Upāya tag
// in Kit; pairs are saved to the "Mentee Partners" tab through lib/ops/store.js (change-logged, conflict-checked, nothing deleted).
const deny = (user) => !user ? NextResponse.json({ error: 'Please sign in again' }, { status: 401 }) : !canEditSite(user) ? NextResponse.json({ error: 'Only Jacob, Irene and Floss can set peer partners' }, { status: 403 }) : null;

async function readTab(fresh, tab = PARTNER_TAB) {
  try { return { ...(await readPlain(tab, { light: !fresh })), missing: false }; }
  catch (e) { if (/\(400\)|: 400/.test(e.message)) return { head: [], rows: [], missing: true }; throw e; }
}

async function state(month) {
  const [cohort, tab, prof] = await Promise.all([mentees(), readTab(false), readTab(false, PROFILE_TAB)]);
  const season = config.season;
  const here = monthRows(tab.rows, month, season), others = new Set();
  for (const x of tab.rows) { if (/^(false|no|hide)$/i.test(String(x.values.publish || '').trim())) continue; const a = String(x.values.email_a || '').toLowerCase(), b = String(x.values.email_b || '').toLowerCase(); if (a && b && !here.some(r => r.row === x.row)) others.add(pairKey(a, b)); }
  const people = new Map(cohort.map(m => [m.email, m.name]));
  const groups = groupsFrom(here.filter(r => !r.hidden));
  for (const e of groups.flat()) if (!people.has(e)) people.set(e, e); // someone paired by hand who is no longer in the Kit list is still shown
  const rotation = rotationMonths(config.rotations, month);
  const profiles = prof.rows.map(x => ({ email: String(x.values.email || '').toLowerCase(), city: String(x.values.city || ''), tz: String(x.values.tz || '') })).filter(x => x.email);
  return { month, season, rotation, chats: chatsFrom(here, groups), profiles, months: monthsFrom(todayET()), cohort: [...people].map(([email, name]) => ({ email, name })).sort((a, b) => a.name.localeCompare(b.name)), groups, history: [...others], missingTab: tab.missing, kitOk: cohort.length > 0 };
}

export async function GET(req) {
  const user = await currentUser(), no = deny(user);
  if (no) return no;
  const month = new URL(req.url).searchParams.get('month') || defaultMonth(todayET());
  if (!MONTH.test(month)) return NextResponse.json({ error: 'Unknown month' }, { status: 400 });
  try { return NextResponse.json(await state(month)); }
  catch (e) { console.error('partners GET', e.message); return NextResponse.json({ error: 'Couldn’t read the sheet or the mentee list. Try again shortly.' }, { status: 502 }); }
}

// POST { month: '2026-11', groups: [['a@x.com', 'b@x.com'], ['c@x.com', 'd@x.com', 'e@x.com']], chats: { 'a@x.com|b@x.com': 'https://…' }, both: true }:
// the month (or, with both, every month of its two-month rotation) holds exactly these groups, each with its pair-chat link.
// POST { profiles: [{ email, city, tz }] }: where mentees live (the window that suits a pair is worked out from it).
export async function POST(req) {
  const user = await currentUser(), no = deny(user);
  if (no) return no;
  const body = await req.json().catch(() => ({}));
  if (Array.isArray(body.profiles)) return saveProfiles(body.profiles, user);
  const { month, groups, both } = body;
  if (!MONTH.test(month || '') || !Array.isArray(groups)) return NextResponse.json({ error: 'Choose a month and at least one group' }, { status: 400 });
  let pairs;
  try { pairs = pairsOf(groups.map(g => Array.isArray(g) ? g : [])); } catch (e) { return NextResponse.json({ error: e.message }, { status: 400 }); }
  const chats = {};
  for (const [k, v] of Object.entries(body.chats || {})) {
    const url = String(v || '').trim();
    if (url && !/^https:\/\/\S+$/.test(url)) return NextResponse.json({ error: 'A chat link should start with https://' }, { status: 400 });
    if (url) chats[k] = url;
  }
  const full = groups.map(g => (Array.isArray(g) ? g : []).filter(Boolean)).filter(g => g.length > 1);
  const chatOf = (a, b) => { const g = full.find(x => x.map(e => e.toLowerCase()).includes(a) && x.map(e => e.toLowerCase()).includes(b)); return (g && chats[groupKey(g)]) || ''; };
  const rot = both ? rotationMonths(config.rotations, month) : null;
  const targets = rot ? rot.months : [month];
  try {
    const cohort = await mentees();
    const names = new Map(cohort.map(m => [m.email, m.name]));
    const tab = await readTab(true);
    for (const m of targets) for (const r of monthRows(tab.rows, m, config.season)) { if (!names.has(r.a)) names.set(r.a, r.values.name_a || r.a); if (!names.has(r.b)) names.set(r.b, r.values.name_b || r.b); }
    const stranger = pairs.flat().find(e => !names.has(e));
    if (stranger) return NextResponse.json({ error: `${stranger} isn’t on the Sahṛdaya Upāya list.` }, { status: 400 });
    const rotationN = rotationMonths(config.rotations, month)?.n ?? null;
    const plans = targets.map(m => diffPairs(monthRows(tab.rows, m, config.season), pairs, { ym: m, season: config.season, nameOf: e => names.get(e) || e, rotation: rotationN, chatOf }));
    const who = user.name || user.email;
    if (tab.missing) await createTab(PARTNER_TAB, PARTNER_COLUMNS);
    else if (plans.some(p => p.adds.length) || plans.some(p => p.updates.some(u => 'rotation' in u.changes || 'chat_url' in u.changes))) await ensureColumns(PARTNER_TAB, PARTNER_COLUMNS);
    let added = 0, hidden = 0, restored = 0;
    for (const { updates, adds } of plans) {
      for (const u of updates) await updatePlain(PARTNER_TAB, u.row, u.changes, { before: u.before, who });
      for (const a of adds) await addPlain(PARTNER_TAB, a, { who });
      added += adds.length; hidden += updates.filter(u => u.changes.publish === 'FALSE').length; restored += updates.filter(u => u.changes.publish === '').length;
    }
    refreshSite(); // mentees see it now, not in 5 minutes
    return NextResponse.json({ ok: true, added, hidden, restored, months: targets, ...(await state(month)) });
  } catch (e) {
    if (e instanceof ConflictError) return NextResponse.json({ error: 'Someone changed the partners just now. Reload and try again.' }, { status: 409 });
    console.error('partners POST', e.message);
    return NextResponse.json({ error: 'Could not save to the sheet. Try again shortly.' }, { status: 502 });
  }
}

async function saveProfiles(list, user) {
  const clean = [];
  for (const p of list) {
    const email = String(p?.email || '').trim().toLowerCase(), city = String(p?.city || '').replace(/\s+/g, ' ').trim().slice(0, 60), tz = String(p?.tz || '').trim();
    if (!/^[^@\s]+@[^@\s]+$/.test(email)) continue;
    if (tz && !validZone(tz)) return NextResponse.json({ error: `“${tz}” isn’t a time zone we know. Use a name like Europe/Rome or America/Costa_Rica.` }, { status: 400 });
    clean.push({ email, city, tz });
  }
  try {
    const cohort = await mentees();
    const names = new Map(cohort.map(m => [m.email, m.name]));
    const tab = await readTab(true, PROFILE_TAB);
    const who = user.name || user.email;
    if (tab.missing) await createTab(PROFILE_TAB, PROFILE_COLUMNS); else await ensureColumns(PROFILE_TAB, PROFILE_COLUMNS);
    const byEmail = new Map(tab.rows.map(r => [String(r.values.email || '').toLowerCase(), r]));
    for (const p of clean) {
      const row = byEmail.get(p.email);
      if (row) {
        const changes = {}, before = {};
        for (const k of ['city', 'tz']) if (String(row.values[k] || '') !== p[k]) { changes[k] = p[k]; before[k] = String(row.values[k] || ''); }
        if (Object.keys(changes).length) await updatePlain(PROFILE_TAB, row.row, changes, { before, who });
      } else if (p.city || p.tz) await addPlain(PROFILE_TAB, { email: p.email, name: names.get(p.email) || '', city: p.city, tz: p.tz }, { who });
    }
    refreshSite();
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof ConflictError) return NextResponse.json({ error: 'Someone changed this just now. Reload and try again.' }, { status: 409 });
    console.error('partners profiles', e.message);
    return NextResponse.json({ error: 'Could not save to the sheet. Try again shortly.' }, { status: 502 });
  }
}
