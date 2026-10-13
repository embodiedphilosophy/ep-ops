import crypto from 'crypto';

// Google service account (private access to the calendar sheet).
// Vercel: GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY
const SHEETS_SCOPE = 'https://www.googleapis.com/auth/spreadsheets';
const cache = new Map(); // scope → { token, exp }
const b64u = s => Buffer.from(s).toString('base64url');

export const googleConfigured = () => !!(process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && process.env.GOOGLE_PRIVATE_KEY);

async function token(scope = SHEETS_SCOPE) {
  const cached = cache.get(scope);
  if (cached && Date.now() < cached.exp) return cached.token;
  const now = Math.floor(Date.now() / 1000);
  const head = b64u(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = b64u(JSON.stringify({
    iss: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL, scope,
    aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600,
  }));
  const key = process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n');
  const sig = crypto.createSign('RSA-SHA256').update(`${head}.${claim}`).sign(key).toString('base64url');
  const res = await fetch(process.env.GOOGLE_TOKEN_URL || 'https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, next: { revalidate: 3000 },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${head}.${claim}.${sig}` }),
  });
  if (!res.ok) throw new Error(`Google auth failed: ${res.status} ${await res.text()}`);
  const j = await res.json();
  cache.set(scope, { token: j.access_token, exp: Date.now() + (j.expires_in - 60) * 1000 });
  return j.access_token;
}

// Every cached sheet read carries this tag, so a dashboard save can expire them all at once (lib/ops/refresh.js)
export const SHEET_TAG = 'sheet';

// render: FORMATTED_VALUE (what people see) or FORMULA (shows "=…" for formula cells)
export async function readRange(sheetId, range, { fresh = false, render = 'FORMATTED_VALUE' } = {}) {
  const url = `${process.env.SHEETS_BASE || 'https://sheets.googleapis.com'}/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(range)}?valueRenderOption=${render}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${await token()}` }, ...(fresh ? { cache: 'no-store' } : { next: { revalidate: 300, tags: [SHEET_TAG] } }) });
  if (!res.ok) throw new Error(`Sheets read failed (${range}): ${res.status}`);
  return (await res.json()).values || [];
}

export async function writeRange(sheetId, range, values) {
  const url = `${process.env.SHEETS_BASE || 'https://sheets.googleapis.com'}/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(range)}?valueInputOption=RAW`;
  const res = await fetch(url, { method: 'PUT', headers: { Authorization: `Bearer ${await token()}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ values }), cache: 'no-store' });
  if (!res.ok) throw new Error(`Sheets write failed (${range}): ${res.status}`);
}

// Write several single cells in one request: [{ range: "'Tab'!C12", value }]
// typed: write as if a person typed it (so "2026-10-21" becomes a real date); otherwise exactly as given
export async function writeCells(sheetId, cells, { typed = false } = {}) {
  const url = `${process.env.SHEETS_BASE || 'https://sheets.googleapis.com'}/v4/spreadsheets/${sheetId}/values:batchUpdate`;
  const res = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${await token()}`, 'Content-Type': 'application/json' }, cache: 'no-store',
    body: JSON.stringify({ valueInputOption: typed ? 'USER_ENTERED' : 'RAW', data: cells.map(c => ({ range: c.range, values: [[c.value]] })) }) });
  if (!res.ok) throw new Error(`Sheets write failed: ${res.status}`);
}

// Copy one tab (by its numeric sheet id) from another spreadsheet into this one, then name it
export async function copyTab(fromSheetId, tabId, toSheetId, title) {
  const base = process.env.SHEETS_BASE || 'https://sheets.googleapis.com';
  const auth = { Authorization: `Bearer ${await token()}`, 'Content-Type': 'application/json' };
  const res = await fetch(`${base}/v4/spreadsheets/${fromSheetId}/sheets/${tabId}:copyTo`, { method: 'POST', headers: auth, cache: 'no-store', body: JSON.stringify({ destinationSpreadsheetId: toSheetId }) });
  if (!res.ok) throw new Error(`Couldn’t copy the tab: ${res.status}`);
  const { sheetId } = await res.json();
  const ren = await fetch(`${base}/v4/spreadsheets/${toSheetId}:batchUpdate`, { method: 'POST', headers: auth, cache: 'no-store',
    body: JSON.stringify({ requests: [{ updateSheetProperties: { properties: { sheetId, title }, fields: 'title' } }] }) });
  if (!ren.ok) throw new Error(`Copied, but couldn’t rename it to "${title}": ${ren.status}`);
}

// Add a tab (no-op if Google says it already exists)
export async function addTab(sheetId, title) {
  const url = `${process.env.SHEETS_BASE || 'https://sheets.googleapis.com'}/v4/spreadsheets/${sheetId}:batchUpdate`;
  const res = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${await token()}`, 'Content-Type': 'application/json' }, cache: 'no-store',
    body: JSON.stringify({ requests: [{ addSheet: { properties: { title } } }] }) });
  if (!res.ok && !/already exists/i.test(await res.text())) throw new Error(`Could not add the "${title}" tab: ${res.status}`);
}

// Make sure a tab has at least `rows` rows (a new row past the end of the grid can't be written otherwise)
export async function ensureRows(sheetId, title, rows) {
  const base = process.env.SHEETS_BASE || 'https://sheets.googleapis.com';
  const auth = { Authorization: `Bearer ${await token()}`, 'Content-Type': 'application/json' };
  const meta = await fetch(`${base}/v4/spreadsheets/${sheetId}?fields=sheets.properties`, { headers: auth, cache: 'no-store' });
  if (!meta.ok) throw new Error(`Sheets read failed (tab sizes): ${meta.status}`);
  const tab = ((await meta.json()).sheets || []).map(s => s.properties).find(p => p.title === title);
  if (!tab) throw new Error(`No "${title}" tab`);
  const have = tab.gridProperties?.rowCount || 0;
  if (have >= rows) return;
  const res = await fetch(`${base}/v4/spreadsheets/${sheetId}:batchUpdate`, { method: 'POST', headers: auth, cache: 'no-store',
    body: JSON.stringify({ requests: [{ appendDimension: { sheetId: tab.sheetId, dimension: 'ROWS', length: Math.max(rows - have, 50) } }] }) });
  if (!res.ok) throw new Error(`Couldn’t add rows to "${title}": ${res.status}`);
}

// Rows → objects, using the first row as headers (lower-cased, spaces → _)
export function toObjects(values) {
  const [head, ...rows] = values;
  if (!head) return [];
  const keys = head.map(h => String(h).trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, ''));
  return rows.map((r, i) => Object.fromEntries([...keys.map((k, j) => [k, String(r[j] ?? '').trim()]), ['_row', i + 2]]));
}

// Add rows under the last row of a tab
export async function appendRows(sheetId, range, values) {
  const url = `${process.env.SHEETS_BASE || 'https://sheets.googleapis.com'}/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(range)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`;
  const res = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${await token()}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ values }), cache: 'no-store' });
  if (!res.ok) throw new Error(`Sheets append failed (${range}): ${res.status}`);
}

// Column letter for a 0-based index (0 → A, 26 → AA)
export const colLetter = i => { let s = ''; i += 1; while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };

// Events on a Google Calendar shared with the service account ("See all event details").
// Recurring events are expanded; results are cached for 5 minutes.
export async function calendarEvents(calendarId, timeMin, timeMax) {
  const q = new URLSearchParams({ singleEvents: 'true', orderBy: 'startTime', timeMin, timeMax, maxResults: '250' });
  const url = `${process.env.CALENDAR_API_BASE || 'https://www.googleapis.com'}/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${q}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${await token('https://www.googleapis.com/auth/calendar.readonly')}` }, next: { revalidate: 300 } });
  if (!res.ok) {
    let why = ''; try { why = (await res.json()).error?.message || ''; } catch {}
    throw new Error(`Calendar read failed: ${res.status} ${why}`.trim());
  }
  return (await res.json()).items || [];
}
