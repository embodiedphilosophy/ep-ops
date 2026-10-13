import { NextResponse } from 'next/server';
import { currentUser } from '@/lib/ops/auth';
import { canEditSite } from '@/lib/ops/nav';
import { refreshSite } from '@/lib/ops/refresh';
import { readPlain, updatePlain, addPlain, ensureColumns, createTab, ConflictError } from '@/lib/ops/store';
import { getBroadcast, isEditableDraft } from '@/lib/kit';
import { PROMO_TAB, PROMO_COLS, PROMO_FIELDS, checkPromo, runPromo, kitIdOf, isSkip } from '@/lib/ops/promo';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;
const EVENT = /^E\d{3,}$/i;

// GET ?row=N → that promo email as a web page (nothing is created)
export async function GET(req) {
  const user = await currentUser();
  if (!canEditSite(user)) return NextResponse.json({ error: 'Please sign in again' }, { status: 401 });
  const row = Number(new URL(req.url).searchParams.get('row'));
  if (!row) return NextResponse.json({ error: 'Pick an email' }, { status: 400 });
  const r = await runPromo({ row, mode: 'preview' });
  if (r.html) return new NextResponse(r.html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  return NextResponse.json(r.json, { status: r.status });
}

// POST, by action:
//   save    { event, row?, changes: { column: value }, before }  write an email (row omitted: a new row; the tab is made if needed)
//   skip    { event, email, row?, before }   a planned email isn't needed for this event (Status Skip)
//   restore { row, before }                  bring a skipped email back
//   remove  { row, before }                  delete an added email (Status Removed; the row stays on the sheet)
//   build   { row }                          make or update its Kit draft (never scheduled or sent)
export async function POST(req) {
  const user = await currentUser();
  if (!canEditSite(user)) return NextResponse.json({ error: 'Only Jacob, Irene and Floss can change promo emails' }, { status: 403 });
  const { action, event, email, row, changes = {}, before = {} } = await req.json().catch(() => ({}));
  const who = user.name || user.email;
  try {
    if (action === 'build') {
      if (!Number(row)) return NextResponse.json({ error: 'Save the email first' }, { status: 400 });
      const r = await runPromo({ row: Number(row), mode: 'build', who });
      refreshSite();
      return NextResponse.json(r.json, { status: r.status });
    }

    // Skipping or deleting an email Kit has already scheduled or sent would hide a real send: refuse it
    if ((action === 'skip' || action === 'remove') && before['Kit Draft']) {
      const b = await getBroadcast(kitIdOf(before['Kit Draft'])).catch(() => null);
      if (b && !isEditableDraft(b)) return NextResponse.json({ error: 'Kit has already scheduled or sent this one. Unschedule it in Kit first.' }, { status: 409 });
    }

    let values;
    if (action === 'save') {
      const clean = {}, errors = {};
      for (const [col, raw] of Object.entries(changes)) {
        if (!PROMO_FIELDS.includes(col)) { errors[col] = 'Can’t be changed here'; continue; }
        const c = checkPromo(col, raw);
        if (c.error) errors[col] = c.error; else clean[col] = c.value;
      }
      if (row == null && !('Email' in clean)) errors.Email = checkPromo('Email', '').error;
      if (Object.keys(errors).length) return NextResponse.json({ error: 'Some fields need fixing', errors }, { status: 400 });
      values = clean;
    } else if (action === 'skip') values = { Status: 'Skip', ...(row == null ? { Email: String(email || '').trim() } : {}) };
    else if (action === 'restore') values = { Status: '' };
    else if (action === 'remove') values = { Status: 'Removed' };
    else return NextResponse.json({ error: 'Unknown action' }, { status: 400 });

    if (row == null) {
      if (action !== 'save' && action !== 'skip') return NextResponse.json({ error: 'Pick an email' }, { status: 400 });
      if (!EVENT.test(String(event || ''))) return NextResponse.json({ error: 'This event has no ID on the schedule' }, { status: 400 });
      await ensureTab();
      const added = await addPlain(PROMO_TAB, { 'Event ID': String(event).toUpperCase(), ...values }, { who });
      refreshSite();
      return NextResponse.json({ ok: true, row: added });
    }
    if (action === 'restore' && !isSkip(before)) return NextResponse.json({ error: 'That email isn’t skipped' }, { status: 400 });
    await ensureColumns(PROMO_TAB, Object.keys(values));
    const written = await updatePlain(PROMO_TAB, Number(row), values, { before, who });
    refreshSite();
    return NextResponse.json({ ok: true, row: Number(row), written });
  } catch (e) {
    if (e instanceof ConflictError) return NextResponse.json({ error: `${e.message}. Reload the page to see their version.`, conflict: e.current }, { status: 409 });
    console.error('Promo email save failed', action, e.message);
    return NextResponse.json({ error: /^Kit/.test(e.message) ? 'Couldn’t reach Kit. Try again shortly.' : 'Couldn’t save to the sheet. Try again shortly.' }, { status: 502 });
  }
}

// The Promo Emails tab, made with its headers the first time anything is saved
async function ensureTab() {
  try { await readPlain(PROMO_TAB); await ensureColumns(PROMO_TAB, PROMO_COLS); }
  catch (e) { if (/\(400\)|: 400|Unable to parse/i.test(e.message)) await createTab(PROMO_TAB, PROMO_COLS); else throw e; }
}
