// Draws a template to a picture on the server (Satori through next/og), at 1080 wide. The same function makes the live preview and the export,
// so what people see is exactly what is posted. Brand fonts are bundled in lib/ops/fonts.
import fs from 'node:fs/promises';
import path from 'node:path';
import { ImageResponse } from 'next/og';
import { SIZES, templateOf, colourwayOf } from './registry';

const FONT_DIR = path.join(process.cwd(), 'lib/ops/fonts');
const FONTS = [
  // [family, weight, style, files (first has the glyphs we need most, the rest are fallbacks for diacritics)]
  ['Cormorant', 500, 'normal', ['cormorant-garamond-latin-500-normal', 'cormorant-garamond-latin-ext-500-normal']],
  ['Cormorant', 600, 'normal', ['cormorant-garamond-latin-600-normal', 'cormorant-garamond-latin-ext-600-normal']],
  ['Cormorant', 500, 'italic', ['cormorant-garamond-latin-500-italic', 'cormorant-garamond-latin-ext-500-italic']],
  ['Cormorant', 600, 'italic', ['cormorant-garamond-latin-600-italic', 'cormorant-garamond-latin-ext-600-italic']],
  ['Inter', 400, 'normal', ['inter-latin-400-normal', 'inter-latin-ext-400-normal']],
  ['Inter', 500, 'normal', ['inter-latin-500-normal', 'inter-latin-ext-500-normal']],
  ['Inter', 600, 'normal', ['inter-latin-600-normal', 'inter-latin-ext-600-normal']],
  ['Devanagari', 400, 'normal', ['noto-serif-devanagari-devanagari-400-normal']],
  ['Devanagari', 600, 'normal', ['noto-serif-devanagari-devanagari-600-normal', 'noto-serif-devanagari-latin-ext-600-normal']],
];
let fontsCache = null;
async function loadFonts() {
  if (fontsCache) return fontsCache;
  const list = [];
  for (const [name, weight, style, files] of FONTS) for (const f of files) list.push({ name, weight, style, data: await fs.readFile(path.join(FONT_DIR, `${f}.woff`)) });
  return (fontsCache = list);
}

// Font sizes step down for long quotes so the words always fit (the words are never cut)
const fit = (len, base) => base * (len > 700 ? .5 : len > 520 ? .58 : len > 380 ? .68 : len > 260 ? .8 : len > 160 ? .92 : 1);
const SERIF = 'Cormorant, Devanagari, serif', SANS = 'Inter, Devanagari, sans-serif';
const hexToRgb = h => { const n = parseInt(h.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
const dark = hex => { const [r, g, b] = hexToRgb(hex); return (0.299 * r + 0.587 * g + 0.114 * b) < 140; };

// The quote with its bold phrase (if any) shown in bold. Words are laid out one by one so spaces survive; the words themselves are never changed.
function QuoteText({ quote, bold, style }) {
  const i = bold ? quote.indexOf(bold) : -1;
  if (i < 0) return <div style={{ display: 'flex', ...style }}>{quote}</div>;
  let at = 0;
  const words = quote.split(' ').map(w => { const start = at; at += w.length + 1; return { w, on: start < i + bold.length && start + w.length > i }; });
  return <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', columnGap: '0.28em', ...style }}>
    {words.map((x, k) => <div key={k} style={{ display: 'flex', fontWeight: x.on ? 600 : style.fontWeight }}>{x.w}</div>)}
  </div>;
}

function Tarka({ d, cw, w, h }) {
  const [, bg, fg, ac] = cw, tall = h > w * 1.5, q = d.quote;
  return (
    <div style={{ width: w, height: h, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', background: bg, color: fg, padding: `${h * .09}px ${w * .11}px ${h * .07}px`, fontFamily: SANS }}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: 52, textAlign: 'center' }}>
        {d.author && <div style={{ display: 'flex', fontSize: 32, fontWeight: 600, letterSpacing: 10, textTransform: 'uppercase', color: ac }}>{d.author}</div>}
        <QuoteText quote={q} bold={d.bold} style={{ fontSize: fit(q.length, tall ? 62 : 70), fontWeight: 500, lineHeight: 1.35, textAlign: 'center' }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', paddingTop: 34, borderTop: `2px solid ${ac}`, color: ac }}>
        <div style={{ display: 'flex', fontFamily: SERIF, fontSize: 56, fontWeight: 600, letterSpacing: 8 }}>TARKA</div>
        <div style={{ display: 'flex', fontSize: 31 }}>{d.label || ''}</div>
      </div>
    </div>
  );
}

function Chit({ d, cw, w, h }) {
  const [, bg, fg] = cw, q = d.quote;
  return (
    <div style={{ width: w, height: h, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', background: bg, color: fg, padding: `${h * .12}px ${w * .1}px ${h * .08}px`, fontFamily: SANS }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 44, textAlign: 'center', paddingTop: h * .06 }}>
        <div style={{ display: 'flex', fontFamily: SERIF, fontSize: fit(q.length, h > w * 1.5 ? 76 : 68), lineHeight: 1.22, textAlign: 'center', justifyContent: 'center' }}>{q}</div>
        <div style={{ display: 'flex', fontSize: 34 }}>— {[d.author, d.label].filter(Boolean).join(' · ')}</div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div style={{ display: 'flex', width: 217, height: 217, border: `5px solid ${fg}`, borderRadius: 109 }} />
        <div style={{ display: 'flex', fontWeight: 600, fontSize: 63, letterSpacing: -1 }}>CHITHEADS</div>
      </div>
    </div>
  );
}

function QuoteArt({ d, cw, w, h, art }) {
  const [, bg, fg, ac] = cw, q = d.quote, layout = d.layout === 'panel' ? 'panel' : 'overlay', isDark = dark(bg);
  const mark = <div style={{ display: 'flex', width: 118, height: 118, borderRadius: 59, border: `4px solid ${fg}`, alignItems: 'center', justifyContent: 'center', fontFamily: SERIF, fontWeight: 600, fontSize: 44, color: fg }}>EP</div>;
  if (layout === 'panel') {
    const artH = Math.round(h * (h > w * 1.5 ? .52 : .56));
    return (
      <div style={{ width: w, height: h, display: 'flex', flexDirection: 'column', background: bg, color: fg }}>
        <div style={{ display: 'flex', width: w, height: artH, background: '#EADDC6' }}>{art && <img src={art} width={w} height={artH} style={{ objectFit: 'cover' }} />}</div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: `${h * .04}px ${w * .09}px ${h * .035}px` }}>
          <div style={{ display: 'flex', fontFamily: SERIF, fontWeight: 600, fontSize: fit(q.length, 62), lineHeight: 1.18 }}>{q}</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontFamily: SANS, fontSize: 28 }}>
              <div style={{ display: 'flex', fontWeight: 600, letterSpacing: 6, textTransform: 'uppercase', color: ac }}>{d.author || ''}</div>
              {d.label && <div style={{ display: 'flex', fontStyle: 'italic' }}>{d.label}</div>}
            </div>
            {mark}
          </div>
        </div>
      </div>
    );
  }
  // overlay: the art fills the picture; a colour wash (the colourway's ground) keeps the words readable
  const [r, g, b] = hexToRgb(bg), wash = `rgba(${r},${g},${b},${isDark ? .62 : .5})`;
  return (
    <div style={{ width: w, height: h, display: 'flex', position: 'relative', background: bg, color: fg }}>
      {art && <img src={art} width={w} height={h} style={{ position: 'absolute', left: 0, top: 0, objectFit: 'cover' }} />}
      <div style={{ position: 'absolute', left: 0, top: 0, width: w, height: h, display: 'flex', background: wash }} />
      <div style={{ position: 'absolute', left: 0, top: 0, width: w, height: h, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: `${h * .08}px ${w * .1}px ${h * .06}px` }}>
        <div style={{ display: 'flex', fontFamily: SANS, fontSize: 28, fontWeight: 600, letterSpacing: 8, textTransform: 'uppercase', color: ac }}>{d.author || ''}</div>
        <div style={{ display: 'flex', justifyContent: 'center', textAlign: 'center', fontFamily: SERIF, fontWeight: 600, fontSize: fit(q.length, h > w * 1.5 ? 84 : 78), lineHeight: 1.16 }}>{q}</div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', fontFamily: SANS, fontSize: 28 }}>
          <div style={{ display: 'flex', fontStyle: 'italic' }}>{d.label || ''}</div>
          {mark}
        </div>
      </div>
    </div>
  );
}

function Sanskrit({ d, cw, w, h }) {
  const [, bg, fg] = cw, frame = Math.round(w * .036), q = d.quote.replace(/ (\|\|?|।|॥)\s*$/, '\u00A0$1'); // the closing mark stays with the last word
  const long = q.length > 90;
  return (
    <div style={{ width: w, height: h, display: 'flex', background: bg, padding: Math.round(w * .047) }}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 40, background: '#F6EEDC', border: `${frame}px solid ${bg}`, padding: `${h * .07}px ${w * .09}px`, color: '#1E1A14' }}>
        <div style={{ display: 'flex', fontFamily: SANS, fontSize: 29, fontWeight: 600, letterSpacing: 7, textTransform: 'uppercase', color: fg }}>Sanskrit practice</div>
        {d.devanagari && <div style={{ display: 'flex', fontFamily: 'Devanagari, serif', fontWeight: 600, fontSize: fit(d.devanagari.length * 2, 74), lineHeight: 1.35, color: fg }}>{d.devanagari}</div>}
        <div style={{ display: 'flex', fontFamily: SANS, fontWeight: 600, fontSize: fit(q.length * (long ? 1.4 : 1.1), 62), lineHeight: 1.25, color: fg }}>{q}</div>
        {d.translation && <div style={{ display: 'flex', fontFamily: SERIF, fontWeight: 500, fontSize: fit(d.translation.length, 53), lineHeight: 1.3 }}>{d.translation}</div>}
        <div style={{ display: 'flex', fontFamily: SANS, fontSize: 31, color: '#5A5346' }}>{d.author ? `— ${d.author}${d.label ? `, ${d.label}` : ''}` : ''}</div>
      </div>
    </div>
  );
}

const LAYOUTS = { tarka: Tarka, chit: Chit, quoteart: QuoteArt, sanskrit: Sanskrit };

// → { buffer, type, width, height }.  d: { quote, author, label, bold, devanagari, translation, layout }, art: a picture as a data URL
export async function renderTemplate({ template, colourway, size = '4:5', data, art = '', jpeg = false }) {
  const t = templateOf(template), Layout = LAYOUTS[template];
  if (!t || !Layout) throw new Error('Unknown template');
  if (!t.sizes.includes(size)) throw new Error(`${t.name} isn’t made at ${size}`);
  const { w, h } = SIZES[size], cw = colourwayOf(t, colourway);
  const res = new ImageResponse(<Layout d={data} cw={cw} w={w} h={h} art={art} />, { width: w, height: h, fonts: await loadFonts() });
  let buffer = Buffer.from(await res.arrayBuffer());
  if (jpeg) { const sharp = (await import('sharp')).default; buffer = await sharp(buffer).flatten({ background: cw[1] }).jpeg({ quality: 92, mozjpeg: true }).toBuffer(); }
  return { buffer, type: jpeg ? 'image/jpeg' : 'image/png', width: w, height: h };
}
