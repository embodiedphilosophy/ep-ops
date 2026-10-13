// Pictures for social posts. Make publishes from Google Drive (it downloads the file named in a post's
// image_url), and the website's service account can't own Drive files, so new pictures (uploads and crops)
// are saved to Drive by a small Make scenario, "EP Social: Dashboard images ↔ Drive", into the
// "EP Social – Dashboard images" folder. The same scenario hands back a Drive picture's full-size file
// so the crop tool can work on it.
// Vercel: SOCIAL_IMAGES_HOOK (that scenario's webhook address)
const HOOK = () => process.env.SOCIAL_IMAGES_HOOK;
export const lh3 = id => `https://lh3.googleusercontent.com/d/${id}`;
export const DRIVE_ID = /^[A-Za-z0-9_-]{20,80}$/;
export const driveIdOf = url => (String(url || '').match(/\/d\/([A-Za-z0-9_-]{20,})/) || [])[1] || (String(url || '').match(/[?&]id=([A-Za-z0-9_-]{20,})/) || [])[1] || '';

const sniff = buf => {
  const b = new Uint8Array(buf.slice(0, 12));
  if (b[0] === 0xff && b[1] === 0xd8) return 'image/jpeg';
  if (b[0] === 0x89 && b[1] === 0x50) return 'image/png';
  if (b[0] === 0x47 && b[1] === 0x49) return 'image/gif';
  if (b[8] === 0x57 && b[9] === 0x45) return 'image/webp';
  return '';
};

async function viaMake(payload) {
  if (!HOOK()) throw new Error('Picture uploads aren’t set up yet: SOCIAL_IMAGES_HOOK is missing in Vercel');
  const res = await fetch(HOOK(), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), cache: 'no-store', signal: AbortSignal.timeout(40000) });
  if (!res.ok) throw new Error(`Make answered ${res.status}`);
  return res;
}

// A Drive picture at full size → { buf, type }. Public files come straight from Google; others through Make.
export async function readImage(id) {
  try {
    const res = await fetch(`${lh3(id)}=w2400`, { cache: 'no-store', signal: AbortSignal.timeout(6000) });
    const buf = res.ok ? await res.arrayBuffer() : null;
    if (buf && sniff(buf)) return { buf, type: sniff(buf) };
  } catch {}
  const buf = await (await viaMake({ action: 'get', file_id: id })).arrayBuffer();
  if (!sniff(buf)) throw new Error('Drive didn’t send back a picture');
  return { buf, type: sniff(buf) };
}

// A JPEG (base64) → its new Drive file id
export async function saveImage(name, data) {
  const j = await (await viaMake({ action: 'put', name, data })).json().catch(() => ({}));
  if (!DRIVE_ID.test(j.id || '')) throw new Error('Drive didn’t confirm the upload');
  return j.id;
}
