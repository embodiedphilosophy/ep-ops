// The email plan Ops owns: one row per planned email (idea → draft → ready → scheduled → sent), with its copy, audience and Kit link.
// Tabs on EP-Programming-Calendar, made on first use: "Email Plan", "Email Revisions", "Email Comments".
import crypto from 'crypto';
import { readPlain, addPlain, updatePlain, createTab, ensureColumns } from './store';

export const PLAN_COLS = ['id', 'event_id', 'launch_id', 'step', 'type', 'planned_date', 'planned_time_et', 'owner', 'status', 'kit_id', 'kit_type', 'revision', 'last_synced', 'conflict',
  'subject', 'preview_text', 'blocks_json', 'audience_json', 'ops_hash', 'kit_hash', 'synced_ops_hash', 'note', 'updated_by', 'updated_at'];
const TABS = {
  'Email Plan': PLAN_COLS,
  'Email Revisions': ['email_id', 'revision', 'subject', 'preview_text', 'blocks_json', 'by', 'at'],
  'Email Comments': ['email_id', 'by', 'at', 'text'],
};
export const STATUSES = ['Idea', 'Draft', 'Ready for Jake', 'Scheduled', 'Sent', 'Not needed'];
const made = new Set();
async function table(title, { light = true } = {}) {
  let t = await readPlain(title, { light: light && made.has(title) }).catch(() => null);
  if (!t) { await createTab(title, TABS[title], []); t = await readPlain(title); }
  if (!made.has(title)) { await ensureColumns(title, TABS[title]).catch(() => {}); made.add(title); }
  return t;
}
export const planRows = async ({ light = true } = {}) => (await table('Email Plan', { light })).rows;
export const hashOf = (...parts) => crypto.createHash('sha1').update(parts.map(x => String(x ?? '')).join('\u0001')).digest('hex').slice(0, 12);
export const opsHash = v => hashOf(v.subject, v.preview_text, v.blocks_json);
export const nextId = rows => `EM${String(Math.max(0, ...rows.map(r => Number(String(r.values.id).replace('EM', '')) || 0)) + 1).padStart(3, '0')}`;

export async function addPlan(values, who) {
  const rows = await planRows({ light: false }), id = nextId(rows), now = new Date().toISOString();
  const v = { revision: '1', status: 'Draft', kit_type: 'broadcast', ...values, id, updated_by: who, updated_at: now };
  v.ops_hash = opsHash(v);
  const row = await addPlain('Email Plan', v, { who });
  await addRevision(v, who);
  return { id, row };
}
// Change fields on one plan row; a change to the copy counts as a new revision
export async function savePlan(row, current, changes, who) {
  const next = { ...current, ...changes }, copyChanged = opsHash(next) !== opsHash(current);
  const ch = { ...changes, updated_by: who, updated_at: new Date().toISOString() };
  if (copyChanged) { ch.revision = String((Number(current.revision) || 0) + 1); await addRevision({ ...next, revision: ch.revision }, who); }
  ch.ops_hash = opsHash(next);
  await updatePlain('Email Plan', row, ch, { before: Object.fromEntries(Object.keys(changes).map(k => [k, current[k]])), who });
  return { ...next, ...ch };
}
async function addRevision(v, who) {
  await table('Email Revisions');
  await addPlain('Email Revisions', { email_id: v.id, revision: v.revision, subject: v.subject, preview_text: v.preview_text, blocks_json: v.blocks_json, by: who, at: new Date().toISOString() }, { who });
}
export async function revisionsOf(id) { return (await table('Email Revisions', { light: false })).rows.map(r => r.values).filter(r => r.email_id === id).sort((a, b) => Number(b.revision) - Number(a.revision)); }
export async function commentsOf(id) { return (await table('Email Comments', { light: false })).rows.map(r => r.values).filter(r => r.email_id === id).sort((a, b) => a.at.localeCompare(b.at)); }
export async function addComment(id, text, who) { await table('Email Comments'); await addPlain('Email Comments', { email_id: id, by: who, at: new Date().toISOString(), text: String(text).slice(0, 1000) }, { who }); }

export const parse = (s, d) => { try { const j = JSON.parse(s || ''); return j ?? d; } catch { return d; } };

// A sync write: no new revision, no author stamp
export async function savePlanRaw(row, current, changes) {
  await updatePlain('Email Plan', row, { ...changes, last_synced: new Date().toISOString() }, { before: Object.fromEntries(Object.keys(changes).map(k => [k, current[k]])), who: 'Kit sync' });
}
