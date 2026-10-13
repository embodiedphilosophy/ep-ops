import { NextResponse } from 'next/server';
import { refreshSite } from '@/lib/ops/refresh';
import { currentUser } from '@/lib/ops/auth';
import { isStaff, canEditSite } from '@/lib/ops/nav';
import { ensureColumns, createTab } from '@/lib/ops/store';
import { readPlain, updatePlain, addPlain, ConflictError } from '@/lib/ops/store';
import { tableOf, typeOf, checkCell, OLD_SITE_SHEET } from '@/lib/ops/sitetables';
import { copyTab } from '@/lib/google';

export const dynamic = 'force-dynamic';

// Website tabs: staff can look, the three editors can save. Settings tabs: directors only.
const canSee = (t, u) => t.scope === 'admin' ? !!u?.director : isStaff(u);
const canSave = (t, u) => t.scope === 'admin' ? !!u?.director : canEditSite(u);

// GET ?tab=links → the tab's rows (columns the dashboard needs are listed even before the tab has them)
export async function GET(req) {
  const user = await currentUser();
  const t = tableOf(new URL(req.url).searchParams.get('tab'));
  if (!t) return NextResponse.json({ error: 'Unknown tab' }, { status: 400 });
  if (!canSee(t, user)) return NextResponse.json({ error: 'Please sign in again' }, { status: 401 });
  try {
    const data = await readPlain(t.title, { light: true });
    const head = [...data.head, ...(t.columns || []).filter(c => !data.head.some(h => h.toLowerCase() === c.toLowerCase()))];
    return NextResponse.json({ ...data, head, canEdit: canSave(t, user) });
  }
  catch (e) {
    const missing = /\(400\)|: 400/.test(e.message);
    return NextResponse.json({ error: missing ? `The "${t.title}" tab isn’t in the calendar sheet yet.` : 'Couldn’t read the sheet. Try again shortly.', missing, canCreate: missing && !!t.create && canSave(t, user), canImport: missing && !!t.importFrom && canSave(t, user) }, { status: missing ? 404 : 502 });
  }
}

// POST { tab, row (omit to add a row), changes: { column: value }, before: { column: value } (the whole row as shown) }
//      { tab, create: true } makes a missing settings tab with its headers
//      { tab, import: true } copies a website tab over from the old EP Website sheet (once)
export async function POST(req) {
  const user = await currentUser();
  const { tab, row, changes = {}, before = {}, create, import: body_import } = await req.json().catch(() => ({}));
  const t = tableOf(tab);
  if (!t) return NextResponse.json({ error: 'Unknown tab' }, { status: 400 });
  if (!canSave(t, user)) return NextResponse.json({ error: t.scope === 'admin' ? 'Only directors can change settings' : 'Only Jacob, Irene and Floss can edit the website' }, { status: 403 });
  if (body_import) {
    if (!t.importFrom) return NextResponse.json({ error: 'Nothing to bring over for this tab' }, { status: 400 });
    try {
      await readPlain(t.title).then(() => { throw new Error(`"${t.title}" is already in the calendar sheet`); }, () => {});
      await copyTab(OLD_SITE_SHEET, t.importFrom, process.env.CALENDAR_SHEET_ID, t.title);
      refreshSite();
      return NextResponse.json({ ok: true });
    } catch (e) { return NextResponse.json({ error: /403/.test(e.message) ? 'The old EP Website sheet isn’t shared with the website.' : e.message }, { status: 502 }); }
  }
  if (create) {
    if (!t.create) return NextResponse.json({ error: 'This tab can’t be created here' }, { status: 400 });
    try { await createTab(t.title, t.columns); return NextResponse.json({ ok: true }); }
    catch (e) { return NextResponse.json({ error: e.message }, { status: 502 }); }
  }
  if (row == null && !t.add) return NextResponse.json({ error: 'Rows can’t be added to this tab' }, { status: 400 });
  const clean = {}, errors = {}, ctx = { ...before, ...changes };
  for (const [col, raw] of Object.entries(changes)) {
    if ((t.locked || []).includes(col)) { errors[col] = 'Can’t be changed here'; continue; }
    const r = checkCell(typeOf(t.key, col, ctx), raw);
    if (r.error) errors[col] = r.error; else clean[col] = r.value;
  }
  if (Object.keys(errors).length) return NextResponse.json({ error: 'Some fields need fixing', errors }, { status: 400 });
  const who = user.name || user.email;
  try {
    if (t.columns) await ensureColumns(t.title, Object.keys(clean).filter(c => t.columns.includes(c)));
    const result = row == null ? { added: await addPlain(t.title, clean, { who }) } : { written: await updatePlain(t.title, Number(row), clean, { before, who }) };
    refreshSite(); // the site and dashboard show it now, not in 5 minutes
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    if (e instanceof ConflictError) return NextResponse.json({ error: e.message, conflict: e.current }, { status: 409 });
    console.error('Site save failed', tab, e.message);
    return NextResponse.json({ error: /^Sheets|^Google/.test(e.message) ? 'Could not save to the sheet. Try again shortly.' : e.message }, { status: 502 });
  }
}
