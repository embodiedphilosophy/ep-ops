import { NextResponse } from 'next/server';
import { currentUser } from '@/lib/ops/auth';
import { canEditSocial } from '@/lib/ops/nav';
import { readPlain, addPlain, createTab, ensureColumns } from '@/lib/ops/store';
import { driveUploadConfigured, startUpload, shareFile, ALLOWED, MAX_BYTES } from '@/lib/ops/driveupload';
import { lh3, DRIVE_ID } from '@/lib/ops/socialimages';
import { refreshSite } from '@/lib/ops/refresh';
import { todayET } from '@/lib/events';

export const dynamic = 'force-dynamic';
const SHEET = { sheet: 'social' };
export const LOG_HEAD = ['drive_file_id', 'uploaded_by', 'kind', 'file_name', 'width', 'height', 'duration', 'codec_ok', 'created_at'];
const kindOf = type => ALLOWED.image.includes(type) ? 'image' : ALLOWED.video.includes(type) ? 'video' : '';

// POST { step: 'start', name, size, type }   → { url }  the browser sends the file straight to Drive there
//      { step: 'done', id, name, kind, width, height, duration, codec_ok } → records it (Upload Log; images also join the Image Library)
export async function POST(req) {
  const user = await currentUser();
  if (!canEditSocial(user)) return NextResponse.json({ error: 'Only the social team can upload' }, { status: 403 });
  if (!driveUploadConfigured()) return NextResponse.json({ error: 'Uploads to Drive aren’t set up yet (DRIVE_UPLOAD_USER and SOCIAL_UPLOADS_FOLDER_ID in Vercel).' }, { status: 503 });
  const b = await req.json().catch(() => ({})), who = user.name || user.email;
  try {
    if (b.step === 'start') {
      const kind = kindOf(b.type), size = Number(b.size) || 0;
      if (!kind) return NextResponse.json({ error: 'Use a JPG, PNG or WebP picture, or an MP4 or MOV video' }, { status: 400 });
      if (!size || size > MAX_BYTES[kind]) return NextResponse.json({ error: `That ${kind} is too large (limit ${MAX_BYTES[kind] / 1e6} MB)` }, { status: 413 });
      const name = String(b.name || kind).replace(/[^\w\-. ]+/g, '').trim().slice(0, 100) || kind;
      const { url } = await startUpload({ name: `${name.replace(/\.[a-z0-9]+$/i, '')}-${Date.now().toString(36)}${(name.match(/\.[a-z0-9]+$/i) || [''])[0]}`, size, type: b.type, origin: new URL(req.url).origin });
      return NextResponse.json({ ok: true, url });
    }
    if (b.step === 'done') {
      if (!DRIVE_ID.test(b.id || '')) return NextResponse.json({ error: 'Unknown file' }, { status: 400 });
      const kind = b.kind === 'video' ? 'video' : 'image';
      await shareFile(b.id);
      await ensureLog();
      await addPlain('Upload Log', { drive_file_id: b.id, uploaded_by: who, kind, file_name: String(b.name || '').slice(0, 100), width: b.width, height: b.height, duration: b.duration, codec_ok: b.codec_ok === false ? 'FALSE' : 'TRUE', created_at: new Date().toISOString() }, { who, ...SHEET });
      let image_id = '';
      if (kind === 'image') {
        const lib = await readPlain('Image Library', SHEET);
        image_id = `IMG-${String(Math.max(0, ...lib.rows.map(r => Number(String(r.values.image_id).match(/^IMG-(\d+)$/)?.[1]) || 0)) + 1).padStart(4, '0')}`;
        await addPlain('Image Library', { image_id, file_name: b.name, drive_file_id: b.id, public_url: lh3(b.id), folder: 'Social Uploads', type: 'Upload', drive_link: `https://drive.google.com/file/d/${b.id}/view`,
          year: todayET().slice(0, 4), reuse_ok: 'TRUE', times_used: '0', hidden: 'FALSE', tags: `uploaded by ${who}` }, { who, ...SHEET });
      }
      refreshSite();
      return NextResponse.json({ ok: true, id: b.id, image_id, kind, url: kind === 'image' ? lh3(b.id) : '', preview: `https://drive.google.com/file/d/${b.id}/view` });
    }
    return NextResponse.json({ error: 'Unknown request' }, { status: 400 });
  } catch (e) {
    console.error('Social upload failed', e.message);
    return NextResponse.json({ error: e.message }, { status: 502 });
  }
}

// The Upload Log tab is made the first time it's needed
async function ensureLog() {
  try { await readPlain('Upload Log', SHEET); }
  catch { await createTab('Upload Log', LOG_HEAD, [], SHEET); }
  await ensureColumns('Upload Log', LOG_HEAD, SHEET);
}
