// What Ops remembers about Kit emails that Kit itself doesn't hold: which event an email belongs to when Kit's description
// didn't say, and which emails the team has put away. The "Email Links" tab (EP-Programming-Calendar) is made on first use.
import { readPlain, addPlain, updatePlain, createTab, ensureColumns } from './store';

export const LINK_COLS = ['kit_id', 'kit_type', 'event_id', 'archived', 'note', 'updated_by', 'updated_at'];
let ready = false;
export async function linkRows({ light = true } = {}) {
  let t = await readPlain('Email Links', { light: light && ready }).catch(() => null);
  if (!t) { await createTab('Email Links', LINK_COLS, []); t = await readPlain('Email Links'); }
  if (!ready) { await ensureColumns('Email Links', LINK_COLS).catch(() => {}); ready = true; }
  return t.rows;
}
// Set fields on one email's row, adding the row the first time
export async function saveLink(kit_id, fields, who) {
  const rows = await linkRows({ light: false });
  const cur = rows.find(r => String(r.values.kit_id) === String(kit_id));
  const stamp = { ...fields, updated_by: who, updated_at: new Date().toISOString() };
  if (cur) return updatePlain('Email Links', cur.row, stamp, { before: Object.fromEntries(Object.keys(fields).map(k => [k, cur.values[k]])), who });
  return addPlain('Email Links', { kit_id: String(kit_id), kit_type: 'broadcast', ...stamp }, { who });
}
