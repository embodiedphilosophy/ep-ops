// Small tables the Social workspace keeps in the EP Social Engine sheet (made on first use, like Upload Log and Comments):
// Coming Up, Campaigns, Campaign Steps, Clip Requests, Reads and writes go through lib/ops/store.js.
import { readPlain, addPlain, updatePlain, createTab, ensureColumns } from './store';

const SHEET = { sheet: 'social' };
export const TABLES = {
  'Coming Up': ['event_id', 'title', 'date', 'promote_state', 'set_by', 'note', 'kind'],
  'Campaigns': ['id', 'name', 'event_id', 'phases_json', 'link_url', 'notes', 'status', 'updated_by'],
  'Campaign Steps': ['campaign_id', 'step', 'date', 'time_et', 'theme', 'teacher', 'plan_post_id', 'clip_request_id'],
  'Clip Requests': ['id', 'for_post_id', 'campaign_id', 'teacher', 'source', 'ask', 'length', 'aspect', 'edit_notes', 'owner', 'requested_by', 'status', 'due', 'drive_file_id'],
};
const made = new Set();
// The table, made with its headers the first time. Missing headers are added, never reordered.
export async function table(title, { light = true } = {}) {
  let t = await readPlain(title, { ...SHEET, light: light && made.has(title) }).catch(() => null);
  if (!t) { await createTab(title, TABLES[title], [], SHEET); t = await readPlain(title, SHEET); }
  if (!made.has(title)) { await ensureColumns(title, TABLES[title], SHEET).catch(() => {}); made.add(title); }
  return t;
}
export const rowsOf = async title => (await table(title)).rows;
export const add = (title, values, who) => addPlain(title, values, { who, ...SHEET });
export const update = (title, row, changes, before, who) => updatePlain(title, row, changes, { before, who, ...SHEET });
export const nextId = (rows, col, prefix) => `${prefix}${String(Math.max(0, ...rows.map(r => Number(String(r.values[col]).replace(prefix, '')) || 0)) + 1).padStart(3, '0')}`;
