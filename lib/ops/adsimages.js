// Pictures for ads (Ads PR 2): five pictures from the launch's own art and the Drive image library (the Art tab: no words on the picture, reuse OK, not hidden),
// each cut to the four sizes Meta places ads in (stories and reels 9:16, feed 4:5, square 1:1, landscape 1.91:1) and kept in the existing Vercel Blob store.
// Video ads are offered at 9:16 and 4:5 only (Jake's decision): a video is not cropped here, it comes as one file per size.
//
// Storage: Vercel Blob (BLOB_READ_WRITE_TOKEN, the store teacher uploads use). ADS_TEST_BLOB=inline is for tests only: with no Blob token, the
// picture is kept as a data address instead. Read only when set; not set in production.
import sharp from 'sharp';
import { readPlain } from './store';
import { readImage, driveIdOf, DRIVE_ID } from './socialimages';
import { listOfferings } from './offerings';
import { libraryFor } from './programindex';
import { coverOf } from './library';

export const SIZES = { '9:16': [1080, 1920], '4:5': [1080, 1350], '1:1': [1080, 1080], '1.91:1': [1200, 628] };
export const VIDEO_SIZES = ['9:16', '4:5'];
const yes = v => String(v ?? '').trim().toUpperCase() === 'TRUE';

// The art to choose from, best match first → [{ id, name, drive_id, source }]
export async function artChoices({ ev, limit = 60 } = {}) {
  const lib = await readPlain('Image Library', { sheet: 'social', light: true }).catch(() => ({ rows: [] }));
  const words = String([ev?.program, ev?.series, ev?.title, ev?.program_name].filter(Boolean).join(' ')).toLowerCase().split(/[^a-zāīūṛśṣṇṭḍ]+/).filter(w => w.length > 3);
  const rows = lib.rows.map(r => r.values).filter(v => !yes(v.has_text) && yes(v.reuse_ok) && !yes(v.hidden) && (v.drive_file_id || v.public_url) && String(v.type || '') !== 'Design');
  const score = v => { const hay = `${v.program} ${v.tags} ${v.category} ${v.file_name}`.toLowerCase(); return words.filter(w => hay.includes(w)).length; };
  return rows.map((v, i) => ({ v, i, s: score(v) })).sort((a, b) => b.s - a.s || a.i - b.i).slice(0, limit)
    .map(({ v }) => ({ id: v.image_id, name: v.file_name || v.image_id, drive_id: DRIVE_ID.test(v.drive_file_id || '') ? v.drive_file_id : driveIdOf(v.public_url), source: `Image library · ${v.file_name || v.image_id}` }));
}

// The launch's own art: the cover on the program's Course Library listing, when there is one
export async function launchArt({ ev }) {
  if (!ev) return null;
  try {
    const o = libraryFor({ program: ev.series, key: ev.series || ev.id, title: ev.title, program_name: ev.program_name }, [ev], await listOfferings())[0];
    const url = o && coverOf(o);
    return /^https?:\/\//.test(url || '') ? { id: `cover:${o.offering_id}`, name: `${o.title} cover`, url, source: `Course Library cover · ${o.title}` } : null;
  } catch { return null; }
}

async function bytesOf(a) {
  if (a.url) { const r = await fetch(a.url, { signal: AbortSignal.timeout(15000), cache: 'no-store' }); if (!r.ok) throw new Error('Couldn’t read that picture'); return Buffer.from(await r.arrayBuffer()); }
  if (!a.drive_id) throw new Error('That picture has no Drive file');
  return Buffer.from((await readImage(a.drive_id)).buf);
}

async function keep(path, buf) {
  if (process.env.BLOB_READ_WRITE_TOKEN) { const { put } = await import('@vercel/blob'); return (await put(path, buf, { access: 'public', addRandomSuffix: true, contentType: 'image/jpeg' })).url; }
  if (process.env.ADS_TEST_BLOB === 'inline') return `data:image/jpeg;base64,${buf.toString('base64')}`;
  throw new Error('Picture storage isn’t connected here (BLOB_READ_WRITE_TOKEN).');
}

// One picture → its four sizes, kept → { '9:16': url, '4:5': url, '1:1': url, '1.91:1': url }
export async function cropAll(buf, folder) {
  const out = {};
  for (const [ratio, [w, h]] of Object.entries(SIZES)) {
    const jpeg = await sharp(buf).rotate().resize(w, h, { fit: 'cover', position: 'attention' }).jpeg({ quality: 82 }).toBuffer();
    out[ratio] = await keep(`ads/${folder}/${ratio.replace(':', 'x')}.jpg`, jpeg);
  }
  return out;
}
export const cropFrom = async (art, folder) => cropAll(await bytesOf(art), folder);
export const cropUpload = (base64, folder) => cropAll(Buffer.from(base64, 'base64'), folder);

// Five pictures for a draft: the launch's art first, then the best matches in the library → [{ name, source, images }]; a picture that can't be cut is left empty
export async function pickFive({ ev, folder }) {
  const cover = await launchArt({ ev }), art = [...(cover ? [cover] : []), ...(await artChoices({ ev, limit: 8 }))].slice(0, 5);
  const out = [];
  for (const [i, a] of art.entries()) {
    try { out.push({ name: a.name, source: a.source, images: await cropFrom(a, `${folder}/${i + 1}`) }); } catch { out.push({ name: a.name, source: a.source, images: {} }); }
  }
  return out;
}
