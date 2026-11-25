'use client';
import { useEffect, useRef, useState } from 'react';
import { GROUPS, TEMPLATES, SIZE_KEYS, colourwayOf, nextColourway, boldOk } from '@/lib/ops/templates/registry';

const TAG = { locked: 'Locked', source: '', editable: 'Editable', choice: 'Editable' };

// Make a card from a template, inside the Composer (design: "Template studio" + the composer's template card).
// The words come from a verified Quote Library row and cannot be retyped; people choose the layout, colour, art and size.
//   value: { template, colourway, size, quote_id, art, bold, layout } (the post's saved card, if it has one)
//   onUse(result): the exported card → { image_id, image_url, template_id, colourway, template_fields, quote, credit }
export default function TemplatePanel({ value, recent = [], useView, ImagePicker, onUse, onClose }) {
  const first = Object.values(TEMPLATES)[0];
  const [tpl, setTpl] = useState(value?.template && TEMPLATES[value.template] ? value.template : first.id);
  const t = TEMPLATES[tpl];
  const [cw, setCw] = useState(value?.colourway || nextColourway(t, recent));
  const [size, setSize] = useState(value?.size || t.sizes[0]);
  const [quote, setQuote] = useState(value?.quote_id ? { quote_id: value.quote_id } : null);
  const [art, setArt] = useState(value?.art ? { image_id: value.art } : null);
  const [bold, setBold] = useState(value?.bold || '');
  const [layout, setLayout] = useState(value?.layout || 'overlay');
  const [q, setQ] = useState('');
  const [picking, setPicking] = useState(false);
  const [preview, setPreview] = useState('');
  const [state, setState] = useState('idle'); // idle | loading | error | busy
  const [err, setErr] = useState('');
  const [data] = useView('quotes', q);
  const seq = useRef(0);
  const quotes = (data?.rows || []).filter(r => String(r.values.verified).toUpperCase() === 'TRUE');
  const chosen = quote && (quotes.find(r => r.values.quote_id === quote.quote_id)?.values || quote);
  const boldUse = t.fields.some(f => f.key === 'bold') ? bold.trim() : ''; // only the Tarka card has a bold phrase
  const ready = !!quote && (!t.needs.includes('art') || !!art) && boldOk(chosen?.quote || '', boldUse);

  const pickTemplate = id => { const n = TEMPLATES[id]; setTpl(id); setCw(nextColourway(n, recent)); if (!n.sizes.includes(size)) setSize(n.sizes[0]); };
  const body = extra => ({ template: tpl, colourway: cw, size, quote_id: quote?.quote_id, art: art?.image_id, bold: boldUse, layout, ...extra });
  const call = async extra => fetch('/api/ops/social/render', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body(extra)) });

  // The live preview is the real picture from the same renderer, so it is exactly what gets posted
  useEffect(() => {
    if (!ready) { setPreview(''); return undefined; }
    const my = ++seq.current;
    setState('loading'); setErr('');
    const timer = setTimeout(async () => {
      try {
        const res = await call({});
        if (my !== seq.current) return;
        if (!res.ok) { const j = await res.json().catch(() => ({})); setErr(j.error || 'Couldn’t draw the card'); setState('error'); return; }
        const url = URL.createObjectURL(await res.blob());
        setPreview(old => { if (old) URL.revokeObjectURL(old); return url; }); setState('idle');
      } catch { if (my === seq.current) { setErr('Couldn’t draw the card'); setState('error'); } }
    }, 450);
    return () => clearTimeout(timer);
  }, [tpl, cw, size, quote?.quote_id, art?.image_id, boldUse, layout, ready]);

  const use = async all => {
    setState('busy'); setErr('');
    const res = await call({ export: all ? 'all' : true }), j = await res.json().catch(() => ({}));
    if (!res.ok) { setErr(j.error || 'Couldn’t save the card'); setState('error'); return; }
    const mine = j.exports.find(x => x.size === size) || j.exports[0];
    setState('idle');
    onUse({ image_id: mine.image_id, image_url: mine.image_url, preview, template_id: tpl, colourway: cw, credit: j.credit, quote: j.quote, exports: j.exports,
      template_fields: JSON.stringify({ quote_id: quote.quote_id, size, art: art?.image_id || '', bold: boldUse, layout }) });
  };

  return (
    <div className="ops-tpl">
      <div className="ops-tpl-head"><b>Make a card</b><button type="button" className="chip" onClick={onClose}>Close</button></div>
      {GROUPS.map(g => (
        <div key={g} className="grp"><span className="cap">{g}</span>
          <div className="row">{Object.values(TEMPLATES).filter(x => x.group === g).map(x => (
            <button key={x.id} type="button" className={`chip${x.id === tpl ? ' on' : ''}`} aria-pressed={x.id === tpl} onClick={() => pickTemplate(x.id)}>{x.name}</button>))}</div>
        </div>))}

      <div className="grp"><span className="cap">Quote · locked to the Quote Library</span>
        {chosen?.quote ? (
          <div className="locked"><span className="tag">Locked</span><p>“{chosen.quote}”</p><small>{[chosen.author, chosen.work].filter(Boolean).join(', ')}</small>
            <button type="button" className="chip" onClick={() => { setQuote(null); setBold(''); }}>Choose a different quote</button></div>
        ) : (
          <div className="pick">
            <input placeholder="Search verified quotes by words, author, work…" value={q} onChange={e => setQ(e.target.value)} />
            <ul>{quotes.slice(0, 30).map(r => <li key={r.row}><button type="button" onClick={() => setQuote({ quote_id: r.values.quote_id })}><span className="t">“{r.values.quote}”</span><span className="s">{[r.values.author, r.values.work].filter(Boolean).join(', ')}</span></button></li>)}
              {data && !quotes.length && <li className="hint">No verified quotes match.</li>}</ul>
          </div>)}
      </div>

      {t.needs.includes('art') && (
        <div className="grp"><span className="cap">Art · from the Library (no words on it, reuse OK)</span>
          <div className="row"><button type="button" className="chip" onClick={() => setPicking(x => !x)}>{art ? `Art: ${art.image_id}. Change` : 'Choose art'}</button></div>
          {picking && <ImagePicker onPick={id => { setArt({ image_id: id }); setPicking(false); }} />}
        </div>)}

      {t.fields.some(f => f.key === 'bold') && (
        <div className="grp"><label className="cap" htmlFor="tpl-bold">Bold phrase (optional)</label>
          <input id="tpl-bold" value={bold} onChange={e => setBold(e.target.value)} placeholder="A phrase from the quote" />
          {boldUse && !boldOk(chosen?.quote || '', boldUse) && <span className="hint err">Those words aren’t in the quote.</span>}</div>)}
      {t.fields.some(f => f.key === 'layout') && (
        <div className="grp"><span className="cap">Layout</span><div className="row">{t.fields.find(f => f.key === 'layout').options.map(([k, l]) => <button key={k} type="button" className={`chip${layout === k ? ' on' : ''}`} aria-pressed={layout === k} onClick={() => setLayout(k)}>{l}</button>)}</div></div>)}

      <div className="grp"><span className="cap">Colourway · {cw}</span>
        <div className="row sw">{t.colourways.map(c => <button key={c[0]} type="button" className={c[0] === cw ? 'on' : ''} style={{ background: c[1] }} aria-label={c[0]} aria-pressed={c[0] === cw} onClick={() => setCw(c[0])} />)}</div>
        {t.note && <small className="hint">{t.note}</small>}</div>
      <div className="grp"><span className="cap">Size</span><div className="row">{SIZE_KEYS.filter(k => t.sizes.includes(k)).map(k => <button key={k} type="button" className={`chip mono${size === k ? ' on' : ''}`} aria-pressed={size === k} onClick={() => setSize(k)}>{k}</button>)}</div></div>

      <div className="stage" data-size={size}>
        {!ready ? <p className="hint">{!quote ? 'Choose a quote to see the card.' : t.needs.includes('art') && !art ? 'Choose art to see the card.' : 'Fix the bold phrase to see the card.'}</p>
          : preview ? <img src={preview} alt="Preview of the card" style={{ opacity: state === 'loading' ? .5 : 1 }} /> : <p className="hint">Drawing the card…</p>}
      </div>
      {err && <p className="hint err" role="alert">{err}</p>}
      <ul className="fields">{t.fields.map(f => <li key={f.key}><span>{f.label}</span><span className={`tag ${f.kind}`}>{f.kind === 'locked' ? (/^Locked/.test(f.source) ? f.source : `Locked · ${f.source}`) : f.source}</span></li>)}</ul>
      <div className="row acts">
        <button type="button" className="chip primary" disabled={!ready || state === 'busy' || state === 'loading'} onClick={() => use(false)}>{state === 'busy' ? 'Saving…' : `Use this card (${size})`}</button>
        <button type="button" className="chip" disabled={!ready || state === 'busy' || state === 'loading'} onClick={() => use(true)}>Export {t.sizes.join(' · ')} to Library</button>
      </div>
    </div>
  );
}
