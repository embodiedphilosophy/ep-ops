import { readRange, writeRange, addTab, appendRows, colLetter } from '../google';
import { coverOf, label, PROGRAMMES, ACCESS } from './library';

// Publish copies the public fields of an offering to ONE row of the "catalog" tab of the EP Website Google Sheet.
// That tab is the only thing ep-ops shares with the public site (plus the revalidate call below). The site decides how
// it reads the columns; ep-ops writes them by header name and adds a missing header at the end, never reorders or renames.
export const catalogSheetId = () => process.env.WEBSITE_SHEET_ID || '';
export const CATALOG_TAB = process.env.CATALOG_TAB || 'catalog';
export const CATALOG_COLS = ['offering_id', 'status', 'programme', 'card_label', 'kind', 'format', 'depth', 'topics', 'title', 'teachers', 'cover_url', 'price_label', 'checkout_url',
  'access', 'requires', 'unlock_note', 'length', 'next_date', 'next_session', 'ce_hours', 'description', 'included', 'sessions', 'published_at', 'updated_at',
  'promise', 'live_label', 'when_label', 'sort_order', 'pwyc_amounts'];

// The public fields of an offering as one catalog row (text cells; lists are one per line, teachers/sessions are JSON)
export function catalogRow(o, status = o.status) {
  return {
    offering_id: o.offering_id, status, programme: o.programme, card_label: o.card_label, kind: o.kind, format: o.format, depth: o.depth,
    topics: o.topics.join(' | '), title: o.title, teachers: JSON.stringify(o.teachers.map(t => ({ name: t.name, role: t.role || '', bio: t.bio || '', photo: t.photo || '' }))),
    cover_url: coverOf(o), price_label: o.price_label, checkout_url: o.checkout_url, access: o.access, requires: o.requires || '', unlock_note: o.unlock_note || '',
    length: o.length, next_date: o.next_date, next_session: o.next_session || '', ce_hours: o.ce_hours, description: o.description,
    included: o.included.filter(l => l.trim()).join('\n'), sessions: JSON.stringify(o.sessions.map(s => ({ date: s.date, title: s.title, time: s.time || '' }))),
    published_at: o.published_at, updated_at: new Date().toISOString(),
    promise: o.promise || '', live_label: o.live_label || '', when_label: o.when_label || '', sort_order: o.sort_order || '', pwyc_amounts: o.pwyc_amounts || '',
  };
}

// Write (or update) the offering's row. Returns { row, created }.
export async function writeCatalog(row) {
  const sheet = catalogSheetId();
  if (!sheet) throw new Error('WEBSITE_SHEET_ID is not set: the catalog tab can’t be found');
  const range = `'${CATALOG_TAB}'!A1:AZ2000`;
  let vals;
  try { vals = await readRange(sheet, range, { fresh: true }); }
  catch (e) {
    // Only a missing tab is made. Anything else (no access, not a Google Sheet, quota) is shown as Google said it.
    if (!/unable to parse range|not found/i.test(e.message)) throw new Error(`Couldn’t read the catalog tab: ${e.message}`);
    await addTab(sheet, CATALOG_TAB); vals = [];
  }
  let head = (vals[0] || []).map(h => String(h).trim());
  if (!head.length) { head = [...CATALOG_COLS]; await writeRange(sheet, `'${CATALOG_TAB}'!A1:${colLetter(head.length - 1)}1`, [head]); }
  const missing = CATALOG_COLS.filter(c => !head.includes(c));
  if (missing.length) { await writeRange(sheet, `'${CATALOG_TAB}'!${colLetter(head.length)}1:${colLetter(head.length + missing.length - 1)}1`, [missing]); head = [...head, ...missing]; }
  const idCol = head.indexOf('offering_id');
  const at = vals.slice(1).findIndex(r => String(r[idCol] ?? '').trim() === row.offering_id);
  const line = head.map(h => row[h] ?? '');
  if (at >= 0) {
    const n = at + 2;
    // keep any extra column the site's owner added: only our own columns are overwritten
    const cur = vals[at + 1] || [];
    await writeRange(sheet, `'${CATALOG_TAB}'!A${n}:${colLetter(head.length - 1)}${n}`, [head.map((h, c) => h in row ? row[h] : (cur[c] ?? ''))]);
    return { row: n, created: false };
  }
  const n = Math.max(vals.length, 1) + 1;
  await appendRows(sheet, `'${CATALOG_TAB}'!A1`, [line]);
  return { row: n, created: true };
}

// Ask the site to refresh its course pages now (its POST /api/revalidate-courses, shared secret). If it can't be
// reached the site still picks the change up on its own within a minute or so; staff are told which happened.
export async function revalidateCourses() {
  const secret = process.env.COURSES_REVALIDATE_SECRET || process.env.REVALIDATE_SECRET;
  if (!secret) return { ok: false, note: 'No shared secret set (COURSES_REVALIDATE_SECRET): the site will pick this up on its own schedule.' };
  const site = (process.env.SITE_URL || 'https://www.embodiedphilosophy.com').replace(/\/$/, '');
  try {
    const r = await fetch(`${site}/api/revalidate-courses`, { method: 'POST', headers: { 'x-revalidate-secret': secret }, cache: 'no-store', signal: AbortSignal.timeout(8000) });
    return r.ok ? { ok: true, note: 'The website was asked to refresh. It shows the change within a minute.' } : { ok: false, note: `The website didn’t accept the refresh (${r.status}). It will catch up on its own.` };
  } catch (e) { return { ok: false, note: 'Couldn’t reach the website to refresh it. It will catch up on its own.' }; }
}
export { label, PROGRAMMES, ACCESS };
