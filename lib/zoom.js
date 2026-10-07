// Zoom Server-to-Server OAuth (read-only here: finds join links). Vercel: ZOOM_ACCOUNT_ID, ZOOM_CLIENT_ID, ZOOM_CLIENT_SECRET
let cached = { token: null, exp: 0 };

async function token() {
  if (cached.token && Date.now() < cached.exp) return cached.token;
  const { ZOOM_ACCOUNT_ID, ZOOM_CLIENT_ID, ZOOM_CLIENT_SECRET } = process.env;
  if (!ZOOM_ACCOUNT_ID || !ZOOM_CLIENT_ID || !ZOOM_CLIENT_SECRET) throw new Error('Zoom credentials are not set');
  const res = await fetch(`${process.env.ZOOM_OAUTH_BASE || 'https://zoom.us'}/oauth/token?grant_type=account_credentials&account_id=${ZOOM_ACCOUNT_ID}`, {
    method: 'POST',
    headers: { Authorization: 'Basic ' + Buffer.from(`${ZOOM_CLIENT_ID}:${ZOOM_CLIENT_SECRET}`).toString('base64') },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Zoom auth failed: ${res.status} ${await res.text()}`);
  const j = await res.json();
  cached = { token: j.access_token, exp: Date.now() + (j.expires_in - 60) * 1000 };
  return cached.token;
}

async function zoom(path, init = {}) {
  const res = await fetch(`${process.env.ZOOM_API_BASE || 'https://api.zoom.us/v2'}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${await token()}`, 'Content-Type': 'application/json', ...(init.headers || {}) },
    cache: 'no-store',
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Zoom ${path} failed: ${res.status} ${text}`);
  return text ? JSON.parse(text) : {};
}

// ---------- Meetings created from the EP Website sheet ----------
// Each meeting the site creates carries a tag like [ep:lrl-2026-11] in its agenda, so the site can
// find it again later without storing anything. Host: ZOOM_HOST_EMAIL (or the app's own user).
const host = () => encodeURIComponent(process.env.ZOOM_HOST_EMAIL || 'me');
export const tagFor = id => `[ep:${id}]`;

export async function listUpcoming() {
  const out = []; let token = '';
  do {
    const j = await zoom(`/users/${host()}/meetings?type=upcoming&page_size=300${token ? `&next_page_token=${token}` : ''}`);
    out.push(...(j.meetings || [])); token = j.next_page_token || '';
  } while (token);
  return out;
}

// Upcoming list entries don't always include the agenda, so fetch details for candidates
export async function findTagged(id, upcoming) {
  const tag = tagFor(id);
  const list = upcoming || await listUpcoming();
  for (const m of list) if ((m.agenda || '').includes(tag)) return m;
  for (const m of list) {
    if (m.agenda) continue; // already checked
    const full = await zoom(`/meetings/${m.id}`);
    if ((full.agenda || '').includes(tag)) return full;
  }
  return null;
}

export const getMeeting = id => zoom(`/meetings/${id}`);
