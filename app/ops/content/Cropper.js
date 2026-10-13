'use client';
import { useEffect, useRef, useState } from 'react';

// Crop a picture to an Instagram shape: drag it to choose what's in the frame, zoom with the slider (or the
// mouse wheel). The result is a 1080-pixel-wide JPEG, sent back as base64 plus a preview.
export const SHAPES = [['4:5', 4 / 5, 'Feed (4:5)'], ['1:1', 1, 'Square'], ['1.91:1', 1.91, 'Wide'], ['9:16', 9 / 16, 'Story']];
const OUT_W = 1080;

export default function Cropper({ src, initial = '4:5', onDone, onCancel }) {
  const [shape, setShape] = useState(initial);
  const [img, setImg] = useState(null);
  const [err, setErr] = useState('');
  const [zoom, setZoom] = useState(1);
  const [pos, setPos] = useState({ x: 0.5, y: 0.5 }); // centre of the frame, as a share of the picture
  const box = useRef(null), drag = useRef(null);
  const [W, setW] = useState(0);
  const aspect = SHAPES.find(s => s[0] === shape)[1];

  const [url, setUrl] = useState('');
  // Fetch the picture once and draw from a local copy (the full-size file can take a moment to arrive)
  useEffect(() => {
    let local = '', live = true;
    (async () => {
      try {
        if (src.startsWith('data:')) local = src;
        else {
          const res = await fetch(src);
          if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Couldn’t load the picture');
          local = URL.createObjectURL(await res.blob());
        }
        const i = new Image();
        await new Promise((ok, no) => { i.onload = ok; i.onerror = () => no(new Error('Couldn’t open the picture')); i.src = local; });
        if (live) { setImg(i); setUrl(local); }
      } catch (e) { if (live) setErr(`${e.message}. Try again in a moment.`); }
    })();
    return () => { live = false; if (local.startsWith('blob:')) URL.revokeObjectURL(local); };
  }, [src]);
  useEffect(() => {
    const el = box.current; if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth)); ro.observe(el); return () => ro.disconnect();
  }, []);

  // Frame is W × H on screen; the picture is drawn at `scale` so it always covers the frame
  const H = Math.min(W / aspect, 520), FW = H * aspect;
  const scale = img ? Math.max(FW / img.width, H / img.height) * zoom : 1;
  const dw = img ? img.width * scale : 0, dh = img ? img.height * scale : 0;
  const clamp = p => {
    if (!img) return p;
    const hx = FW / 2 / dw, hy = H / 2 / dh;
    return { x: Math.min(1 - hx, Math.max(hx, p.x)), y: Math.min(1 - hy, Math.max(hy, p.y)) };
  };
  const c = clamp(pos);
  const left = FW / 2 - c.x * dw, top = H / 2 - c.y * dh;

  const down = e => { e.currentTarget.setPointerCapture(e.pointerId); drag.current = { x: e.clientX, y: e.clientY, p: c }; };
  const move = e => { const d = drag.current; if (!d) return; setPos(clamp({ x: d.p.x - (e.clientX - d.x) / dw, y: d.p.y - (e.clientY - d.y) / dh })); };
  const up = () => { drag.current = null; };
  const wheel = e => { e.preventDefault(); setZoom(z => Math.min(4, Math.max(1, z * (e.deltaY < 0 ? 1.08 : 1 / 1.08)))); };
  useEffect(() => {
    const el = box.current?.querySelector('.frame'); if (!el) return;
    el.addEventListener('wheel', wheel, { passive: false }); return () => el.removeEventListener('wheel', wheel);
  });
  const nudge = (dx, dy) => setPos(p => clamp({ x: p.x + dx / dw, y: p.y + dy / dh }));

  const finish = () => {
    const oh = Math.round(OUT_W / aspect), cv = document.createElement('canvas');
    cv.width = OUT_W; cv.height = oh;
    const g = cv.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, OUT_W, oh); g.imageSmoothingQuality = 'high';
    g.drawImage(img, -left / scale, -top / scale, FW / scale, H / scale, 0, 0, OUT_W, oh);
    const url = cv.toDataURL('image/jpeg', 0.92);
    onDone({ data: url.split(',')[1], preview: url, shape, small: Math.min(FW / scale, img.width) < OUT_W * 0.75 });
  };

  return (
    <div className="ops-crop" ref={box}>
      <div className="shapes" role="group" aria-label="Shape">
        {SHAPES.map(([k, , l]) => <button key={k} type="button" className={`chip${k === shape ? ' on' : ''}`} aria-pressed={k === shape} onClick={() => { setShape(k); setZoom(1); }}>{l}</button>)}
      </div>
      {err ? <p className="hint">{err}</p> : !img ? <p className="hint">Loading the full-size picture…</p> : (<>
        <div className="frame" style={{ width: FW, height: H }} tabIndex={0} aria-label="Drag to choose what’s in the frame; arrow keys move it"
          onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
          onKeyDown={e => { const k = { ArrowLeft: [-10, 0], ArrowRight: [10, 0], ArrowUp: [0, -10], ArrowDown: [0, 10] }[e.key]; if (k) { e.preventDefault(); nudge(...k); } }}>
          <img src={url} alt="" draggable={false} style={{ width: dw, height: dh, transform: `translate(${left}px, ${top}px)` }} />
          <span className="grid" aria-hidden="true" />
        </div>
        <label className="zoom">Zoom <input type="range" min="1" max="4" step="0.01" value={zoom} onChange={e => setZoom(Number(e.target.value))} /></label>
        <p className="hint">Drag the picture to choose what’s in the frame.</p>
      </>)}
      <div className="acts">
        <button type="button" className="chip primary" disabled={!img} onClick={finish}>Use this crop</button>
        <button type="button" className="chip" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

// A chosen file → a JPEG no larger than `max` pixels on its long side, as { data (base64), preview }
export async function shrink(file, max = 2048) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => no(new Error('That file isn’t a picture the browser can open')); i.src = url; });
    const k = Math.min(1, max / Math.max(img.width, img.height));
    const cv = document.createElement('canvas'); cv.width = Math.round(img.width * k); cv.height = Math.round(img.height * k);
    const g = cv.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, cv.width, cv.height); g.imageSmoothingQuality = 'high';
    g.drawImage(img, 0, 0, cv.width, cv.height);
    const out = cv.toDataURL('image/jpeg', 0.9);
    return { data: out.split(',')[1], preview: out, width: img.width, height: img.height };
  } finally { URL.revokeObjectURL(url); }
}
