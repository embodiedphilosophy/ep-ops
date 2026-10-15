// Contractor pay: what EP owes faculty and staff contractors, month by month. It lives on a dashboard-owned tab
// of EP-Programming-Calendar, "Contractor Payables", which the finance sheets can read (data flows one way).
// Two sources:
//   faculty  a signed invitation's fee (Faculty → Invitations), owed once each session has been taught
//            (or, for a flat fee, after the last session)
//   hours    a staff contractor submits a month of clocked hours (Hours → Submit), at their Team tab hourly_rate
// Finance → To pay lists what is due; "Mark paid" records it once paid in Gusto.
import { readPlain, addPlain, updatePlain, createTab, ensureColumns } from './store';
import { loadInvites, earnings } from './faculty';
import { todayET } from '../events';

export const PAYABLES = 'Contractor Payables';
export const PAY_COLS = ['key', 'month', 'date', 'name', 'email', 'what', 'amount', 'source', 'status', 'submitted_at', 'paid_on', 'paid_by'];

async function ensureTab() {
  try { await readPlain(PAYABLES, { light: false }); await ensureColumns(PAYABLES, PAY_COLS); }
  catch { await createTab(PAYABLES, PAY_COLS); }
}
export async function loadPayables({ light = true } = {}) {
  try { return (await readPlain(PAYABLES, { light })).rows.map(r => ({ row: r.row, ...r.values })).filter(r => r.key); }
  catch { return []; }
}

// Faculty fees owed by today that aren't on the tab yet
async function newFacultyRows(have) {
  const today = todayET();
  const out = [];
  for (const inv of await loadInvites({ light: false })) {
    for (const e of earnings(inv)) {
      if (e.date > today || have.has(e.key)) continue;
      out.push({ key: e.key, month: e.date.slice(0, 7), date: e.date, name: inv.signer_name || inv.name, email: inv.email, what: e.what, amount: String(e.amount), source: 'faculty', status: 'due' });
    }
  }
  return out;
}

// Everything to show on Finance → To pay: the tab, plus taught sessions not yet written to it (marked new)
export async function payablesView() {
  const rows = await loadPayables({ light: false });
  const have = new Set(rows.map(r => r.key));
  const fresh = (await newFacultyRows(have).catch(() => [])).map(r => ({ ...r, unsaved: true }));
  return [...rows, ...fresh].sort((a, b) => String(a.date).localeCompare(String(b.date)));
}

// Daily job (and the "Update" button): write newly owed faculty fees to the tab
export async function syncPayables({ who = 'dashboard' } = {}) {
  const rows = await loadPayables({ light: false });
  const add = await newFacultyRows(new Set(rows.map(r => r.key)));
  if (!add.length) return 0;
  await ensureTab();
  for (const r of add) await addPlain(PAYABLES, r, { who });
  return add.length;
}

// A staff contractor submits a month of hours (their invoice to EP)
export async function submitHours(member, month, hours, { who = '' } = {}) {
  const key = `hours:${member.email}:${month}`;
  await ensureTab();
  const rows = await loadPayables({ light: false });
  const rate = Number(String(member.hourly_rate || '').replace(/[^0-9.]/g, '')) || 0;
  const amount = rate ? String(Math.round(rate * hours * 100) / 100) : '';
  const what = `${hours} hours in ${month}${rate ? ` at $${rate}/h` : ' (no hourly rate on the Team tab yet)'}`;
  const cur = rows.find(r => r.key === key);
  if (cur?.status === 'paid') throw new Error('That month is already paid');
  const values = { key, month, date: `${month}-28`, name: member.name, email: member.email, what, amount, source: 'hours', status: 'due', submitted_at: new Date().toISOString() };
  if (cur) await updatePlain(PAYABLES, cur.row, values, { before: { status: cur.status }, who });
  else await addPlain(PAYABLES, values, { who });
  return { amount, what };
}

// Director: record payments made in Gusto (writes unsaved faculty rows first)
export async function markPaid(keys, who) {
  await ensureTab();
  const today = todayET();
  let rows = await loadPayables({ light: false });
  const missing = (await newFacultyRows(new Set(rows.map(r => r.key)))).filter(r => keys.includes(r.key));
  for (const r of missing) await addPlain(PAYABLES, { ...r, status: 'paid', paid_on: today, paid_by: who }, { who });
  rows = await loadPayables({ light: false });
  let n = missing.length;
  for (const r of rows.filter(r => keys.includes(r.key) && r.status !== 'paid' && !missing.some(m => m.key === r.key))) {
    await updatePlain(PAYABLES, r.row, { status: 'paid', paid_on: today, paid_by: who }, { before: { status: r.status }, who });
    n++;
  }
  return n;
}
