import { NextResponse } from 'next/server';
import { currentUser } from '@/lib/ops/auth';
import { canEditSocial } from '@/lib/ops/nav';
import { readPlain, addPlain } from '@/lib/ops/store';
import { readImage, saveImage, lh3, driveIdOf } from '@/lib/ops/socialimages';
import { renderTemplate } from '@/lib/ops/templates/render';
import { templateOf, boldOk } from '@/lib/ops/templates/registry';
import { refreshSite } from '@/lib/ops/refresh';
import { todayET } from '@/lib/events';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;
const SHOW = { sheet: 'social', light: true };
const T = v => String(v ?? '').trim().toUpperCase() === 'TRUE';

// POST { template, colourway, size, quote_id, art?: image_id, bold?, layout?, export?: true | 'all' }
//   preview  → the picture itself (PNG) so the screen shows exactly what will be posted
//   export   → JPEG(s) saved to Drive and the Image Library (type Design) → { exports: [{ size, image_id, image_url }], quote, credit }
// The words come from the Quote Library row, never from the request: a card can only say what a verified quote says.
export async function POST(req) {
  const user = await currentUser();
  if (!canEditSocial(user)) return NextResponse.json({ error: 'Only the social team can make cards' }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const t = templateOf(b.template);
  if (!t) return NextResponse.json({ error: 'Pick a template' }, { status: 400 });
  const size = t.sizes.includes(b.size) ? b.size : t.sizes[0];
  try {
    // 1. the quote (locked): verified rows only, copied exactly
    const qrows = (await readPlain('Quote Library', SHOW)).rows;
    const q = qrows.find(r => r.values.quote_id === b.quote_id)?.values;
    if (!q) return NextResponse.json({ error: 'Pick a quote from the Quote Library' }, { status: 400 });
    if (!T(q.verified)) return NextResponse.json({ error: 'Only verified quotes can go on a card' }, { status: 400 });
    if (!boldOk(q.quote, b.bold)) return NextResponse.json({ error: 'The bold phrase has to be words that are in the quote' }, { status: 400 });
    const data = { quote: q.quote, author: q.author || '', label: q.work || q.publication || '', bold: b.bold || '', layout: b.layout === 'panel' ? 'panel' : 'overlay',
      devanagari: q.devanagari || '', translation: q.translation || '' };
    // 2. the art (only Art with reuse OK and no words on it)
    let art = '', credit = '';
    if (t.needs.includes('art')) {
      const img = (await readPlain('Image Library', SHOW)).rows.find(r => r.values.image_id === b.art)?.values;
      if (!img) return NextResponse.json({ error: 'Choose a picture from the Library' }, { status: 400 });
      if (!T(img.reuse_ok) || T(img.hidden) || T(img.has_text)) return NextResponse.json({ error: 'That picture can’t be used (it isn’t marked OK to reuse, or it has words on it)' }, { status: 400 });
      const id = img.drive_file_id || driveIdOf(img.public_url);
      if (!id) return NextResponse.json({ error: 'That picture has no file in Drive' }, { status: 400 });
      const { buf, type } = await readImage(id);
      const sharp = (await import('sharp')).default;
      const small = await sharp(Buffer.from(buf)).resize({ width: 1600, withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer();
      art = `data:image/jpeg;base64,${small.toString('base64')}`; void type;
      credit = img.credit_line || '';
    }
    // 3. preview
    if (!b.export) {
      const { buffer, type } = await renderTemplate({ template: b.template, colourway: b.colourway, size, data, art });
      return new NextResponse(buffer, { headers: { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Credit': encodeURIComponent(credit) } });
    }
    // 4. export: one size, or every size the template is made in
    const sizes = b.export === 'all' ? t.sizes : [size], who = user.name || user.email, out = [];
    const lib = await readPlain('Image Library', { sheet: 'social' });
    let n = Math.max(0, ...lib.rows.map(r => Number(String(r.values.image_id).match(/^IMG-(\d+)$/)?.[1]) || 0));
    for (const s of sizes) {
      const { buffer, width, height } = await renderTemplate({ template: b.template, colourway: b.colourway, size: s, data, art, jpeg: true });
      const file = `${t.id}-${q.quote_id}-${s.replace(':', 'x')}-${Date.now().toString(36)}.jpg`;
      const id = await saveImage(file, buffer.toString('base64'));
      const image_id = `IMG-${String(++n).padStart(4, '0')}`;
      await addPlain('Image Library', { image_id, file_name: file, drive_file_id: id, public_url: lh3(id), folder: 'Designs', type: 'Design', category: 'Designed', drive_link: `https://drive.google.com/file/d/${id}/view`,
        year: todayET().slice(0, 4), reuse_ok: 'FALSE', has_text: 'TRUE', hidden: 'FALSE', times_used: '0', tags: `${t.name} · ${b.colourway} · ${s}`, width: String(width), height: String(height) }, { who, sheet: 'social' });
      out.push({ size: s, image_id, image_url: lh3(id) });
    }
    refreshSite();
    return NextResponse.json({ ok: true, exports: out, quote: { quote_id: q.quote_id, quote_text: q.quote, quote_source: [q.author, q.work].filter(Boolean).join(', ') }, credit });
  } catch (e) {
    console.error('Card render failed', e.message);
    return NextResponse.json({ error: /SOCIAL_IMAGES_HOOK/.test(e.message) ? e.message : `Couldn’t make the card (${e.message})` }, { status: 502 });
  }
}
