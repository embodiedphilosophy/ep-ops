// Step Status: who has ticked which project step or review check, one-to-one summaries and sent nudges. One tab on EP-Programming-Calendar,
// written only through lib/ops/store.js (so every change is on the Change Log and a stale row is caught). Matching is by lowercased email.
import { readPlain, updatePlain, addPlain, createTab } from '../ops/store';
import { refreshSite } from '../ops/refresh';
import { TABS } from './content';
import { STATUS_HEAD } from './year';

const lower = s => String(s ?? '').trim().toLowerCase();

// Every row as plain objects (a missing tab reads as empty). light = the cached display read.
// strict: a failure other than "the tab isn't made yet" is thrown (the page then says the ticks couldn't be loaded)
export async function statusRows({ light = true, strict = false } = {}) {
  try { return (await readPlain(TABS.status, { light })).rows.map(r => ({ ...r.values, _row: r.row })); }
  catch (e) {
    if (/\(400\)|: 400|Unable to parse range|not found/i.test(e.message)) return [];
    console.error('Step Status read failed', e.message);
    if (strict) throw e;
    return [];
  }
}

// Upsert one (email, step_id) row. status: done | undone | summary | on | off | sent. Returns the row's values.
export async function setStatus({ email, memberId = '', stepId, status, note = '', by = 'mentee' }) {
  const e = lower(email);
  if (!e || !stepId) throw new Error('Missing who or what');
  let tb;
  try { tb = await readPlain(TABS.status); } catch { await createTab(TABS.status, STATUS_HEAD); tb = { rows: [] }; }
  const now = new Date().toISOString();
  const values = { email: e, circle_member_id: String(memberId || ''), step_id: stepId, status, done_at: status === 'done' ? now : '', note: String(note || '').slice(0, 2000), updated_by: by, updated_at: now };
  const hit = tb.rows.find(r => lower(r.values.email) === e && r.values.step_id === stepId);
  if (hit) await updatePlain(TABS.status, hit.row, { ...values, ...(status === 'summary' || status === 'sent' ? {} : { note: hit.values.note }), ...(status === 'done' ? {} : { done_at: hit.values.done_at }), circle_member_id: String(memberId || hit.values.circle_member_id || '') }, { who: by === 'mentee' ? e : by, before: { email: hit.values.email, step_id: hit.values.step_id } });
  else await addPlain(TABS.status, values, { who: by === 'mentee' ? e : by });
  try { refreshSite(); } catch { /* outside a request (scripts) */ }
  return values;
}
