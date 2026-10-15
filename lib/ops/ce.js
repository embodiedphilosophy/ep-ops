// CE credits ledger. The records live with the website (ep-website: lib/ce/*, Neon), which also sends the
// certificate emails, so the dashboard reads and acts through the site's admin API, server to server.
// Vercel: CE_ADMIN_KEY (the same value as on ep-website), SITE_URL (default https://www.embodiedphilosophy.com).
const site = () => (process.env.SITE_URL || 'https://www.embodiedphilosophy.com').replace(/\/$/, '');
export const ceConfigured = () => !!process.env.CE_ADMIN_KEY;

async function call(path, init = {}) {
  if (!ceConfigured()) throw new Error('CE_ADMIN_KEY is not set');
  const res = await fetch(site() + path, { ...init, cache: 'no-store', headers: { 'x-ce-key': process.env.CE_ADMIN_KEY, 'Content-Type': 'application/json', ...(init.headers || {}) } });
  return res;
}

// { certs, unmatched, counts, pathways } or { off: true } when the site's database isn't connected
export async function ceLedger() {
  const res = await call('/api/ce/admin');
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error || `The website answered ${res.status}`);
  return j;
}

// action: approve | revoke | rename | done
export async function ceAction(body) {
  const res = await call('/api/ce/admin', { method: 'POST', body: JSON.stringify(body) });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) { const e = new Error(j.error || 'Couldn’t save that'); e.status = res.status; throw e; }
  return j;
}

export async function ceCsv() {
  const res = await call('/api/ce/admin/export');
  if (!res.ok) throw new Error(`The website answered ${res.status}`);
  return res.text();
}
