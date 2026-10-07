import crypto from 'crypto';

// Google service account (private access to the calendar sheet).
// Vercel: GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY
let cached = { token: null, exp: 0 };
const b64u = s => Buffer.from(s).toString('base64url');

export const googleConfigured = () => !!(process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && process.env.GOOGLE_PRIVATE_KEY);

async function token() {
  if (cached.token && Date.now() < cached.exp) return cached.token;
  const now = Math.floor(Date.now() / 1000);
  const head = b64u(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = b64u(JSON.stringify({
    iss: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL, scope: 'https://www.googleapis.com/auth/spreadsheets',
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
  cached = { token: j.access_token, exp: Date.now() + (j.expires_in - 60) * 1000 };
  return cached.token;
}

export async function readRange(sheetId, range, { fresh = false } = {}) {
  const url = `${process.env.SHEETS_BASE || 'https://sheets.googleapis.com'}/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(range)}?valueRenderOption=FORMATTED_VALUE`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${await token()}` }, ...(fresh ? { cache: 'no-store' } : { next: { revalidate: 300 } }) });
  if (!res.ok) throw new Error(`Sheets read failed (${range}): ${res.status}`);
  return (await res.json()).values || [];
}

export async function writeRange(sheetId, range, values) {
  const url = `${process.env.SHEETS_BASE || 'https://sheets.googleapis.com'}/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(range)}?valueInputOption=RAW`;
  const res = await fetch(url, { method: 'PUT', headers: { Authorization: `Bearer ${await token()}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ values }), cache: 'no-store' });
  if (!res.ok) throw new Error(`Sheets write failed (${range}): ${res.status}`);
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
