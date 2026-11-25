'use client';
import { useEffect, useRef, useState } from 'react';
import { GROUPS, TEMPLATES, SIZE_KEYS, nextColourway, boldOk, MAX_CAROUSEL_SLIDES } from '@/lib/ops/templates/registry';

const blankSlide = story => (story ? { body: '', art: '' } : { heading: '', body: '' });
const useFacts = (what, on) => {
  const [rows, setRows] = useState(null);
  useEffect(() => { if (!on) return; let live = true; fetch(`/api/ops/social/render?what=${what}`).then(r => r.json()).then(j => live && setRows(j[what] || [])).catch(() => live && setRows([])); return () => { live = false; }; }, [what, on]);
  return rows;
};

// Make a card or a set of slides from a template, inside the Composer (design: "Template studio" and the composer's template card).
// Words come from a verified quote, the Master Schedule or teacher onboarding and can't be retyped; only layout, colour, art and size are chosen.
// Carousels have editable text. kind: 'single' | 'carousel' (which templates to offer).
//   value: the post's saved card; onUse(result): the exported card(s)
export default function TemplatePanel({ kind = 'single', value, recent = [], useView, ImagePicker, onUse, onClose }) {
  const offered = Object.values(TEMPLATES).filter(x => !x.auto && !!x.carousel === (kind === 'carousel'));
  const saved = value?.template && offered.some(x => x.id === value.template) ? value : null;
  const [tpl, setTpl] = useState(saved?.template || offered[0].id);
  const t = TEMPLATES[tpl];
  const [cw, setCw] = useState(saved?.colourway || nextColourway(t, recent));
  const [size, setSize] = useState(saved?.size || t.sizes[0]);
  const [quote, setQuote] = useState(saved?.quote_id ? { quote_id: saved.quote_id } : null);
  const [art, setArt] = useState(saved?.art ? { image_id: saved.art } : null);
  const [bold, setBold] = useState(saved?.bold || '');
  const [layout, setLayout] = useState(saved?.layout || 'overlay');
  const [eventId, setEventId] = useState(saved?.event_id || '');
  const [teacher, setTeacher] = useState(saved?.teacher_email || '');
  const [program, setProgram] = useState(saved?.program || '');
  const [car, setCar] = useState(saved?.carousel || { title: '', subtitle: '', cta: '', keyword: '', slides: [blankSlide(false), blankSlide(false)] });
  const [q, setQ] = useState('');
  const [picking, setPicking] = useState(null); // 'art' | slide index
  const [previews, setPreviews] = useState([]);
  const [state, setState] = useState('idle'); // idle | loading | busy
  const [err, setErr] = useState('');
  const [data] = useView('quotes', q);
  const events = useFacts('events', t.needs.includes('event'));
  const teachers = useFacts('teachers', t.needs.includes('teacher'));
  const seq = useRef(0);
  const quotes = (data?.rows || []).filter(r => String(r.values.verified).toUpperCase() === 'TRUE');
  const chosen = quote && (quotes.find(r => r.values.quote_id === quote.quote_id)?.values || quote);
  const ev = events?.find(e => e.id === eventId), tc = teachers?.find(x => x.email === teacher);
  const boldUse = t.fields.some(f => f.key === 'bold') ? bold.trim() : '';
  const slides = car.slides || [];

  // what is still missing before a card can be drawn, in words
  const why = (() => {
    if (t.needs.includes('quote')) { if (!quote) return 'Choose a quote to see the card.'; if (!boldOk(chosen?.quote || '', boldUse)) return 'Fix the bold phrase to see the card.'; if (t.needs.includes('art') && !art) return 'Choose art to see the card.'; }
    if (t.needs.includes('event')) { if (!eventId) return 'Choose an event to see the card.'; if (ev?.missing?.length) return `The Master Schedule is missing: ${ev.missing.join(', ')}. Add ${ev.missing.length === 1 ? 'it' : 'them'} in Programming.`; }
    if (t.needs.includes('teacher')) { if (!teacher) return 'Choose a teacher to see the card.'; if (tc && (!tc.has_photo || !tc.has_bio)) return `This teacher’s profile is missing: ${[!tc.has_photo && 'headshot', !tc.has_bio && 'bio'].filter(Boolean).join(', ')}.`; }
    if (t.carousel) { if (!car.title.trim()) return 'Write the cover title to see the slides.'; if (!slides.length || slides.some(s => !(s.body || '').trim() && !(tpl === 'story' && s.art))) return 'Every slide needs its words.'; if (tpl === 'story' && slides.some(s => !s.art)) return 'Every slide needs art.'; if (t.keyword && !car.keyword.trim()) return 'Add the campaign keyword.'; }
    return '';
  })();
  const ready = !why;

  const pickTemplate = id => { const n = TEMPLATES[id]; setTpl(id); setCw(nextColourway(n, recent)); if (!n.sizes.includes(size)) setSize(n.sizes[0]);
    if (n.carousel) setCar(c => ({ ...c, slides: (c.slides || []).map(s => ({ ...blankSlide(id === 'story'), ...s })) })); setPreviews([]); };
  const body = extra => ({ template: tpl, colourway: cw, size, quote_id: quote?.quote_id, art: art?.image_id, bold: boldUse, layout, event_id: eventId, teacher_email: teacher, program, carousel: t.carousel ? car : undefined, ...extra });
  const call = async extra => fetch('/api/ops/social/render', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body(extra)) });
  const sig = JSON.stringify(body({}));

  // The live preview is the real picture from the same renderer, so it is exactly what gets posted (a carousel shows every slide)
  useEffect(() => {
    if (!ready) { setPreviews([]); return undefined; }
    const my = ++seq.current;
    setState('loading'); setErr('');
    const timer = setTimeout(async () => {
      try {
        const urls = []; let total = 1;
        for (let i = 0; i < total; i++) {
          const res = await call({ slide: i });
          if (my !== seq.current) return;
          if (!res.ok) { const j = await res.json().catch(() => ({})); setErr(j.error || 'Couldn’t draw the card'); setState('idle'); return; }
          total = Number(res.headers.get('X-Slides')) || 1;
          urls.push(URL.createObjectURL(await res.blob()));
        }
        setPreviews(old => { old.forEach(u => URL.revokeObjectURL(u)); return urls; }); setState('idle');
      } catch { if (my === seq.current) { setErr('Couldn’t draw the card'); setState('idle'); } }
    }, 500);
    return () => clearTimeout(timer);
  }, [sig, ready]);

  const use = async all => {
    setState('busy'); setErr('');
    const res = await call({ export: all ? 'all' : true }), j = await res.json().catch(() => ({}));
    if (!res.ok) { setErr(j.error || 'Couldn’t save the card'); setState('idle'); return; }
    const mine = j.exports.find(x => x.size === size) || j.exports[0];
    setState('idle');
    onUse({ image_id: mine.image_id, image_url: mine.image_url, preview: previews[0], template_id: tpl, colourway: cw, credit: j.credit, quote: j.quote, exports: j.exports, carousel: j.carousel, keyword: j.keyword,
      template_fields: JSON.stringify({ quote_id: quote?.quote_id || '', size, art: art?.image_id || '', bold: boldUse, layout, event_id: eventId, teacher_email: teacher, program, carousel: t.carousel ? car : undefined }) });
  };
  const setSlide = (i, patch) => setCar(c => ({ ...c, slides: c.slides.map((s, k) => k === i ? { ...s, ...patch } : s) }));
  const moveSlide = (i, d) => setCar(c => { const a = c.slides.slice(), j = i + d; if (j < 0 || j >= a.length) return c; a.splice(j, 0, a.splice(i, 1)[0]); return { ...c, slides: a }; });

  return (
    <div className="ops-tpl">
      <div className="ops-tpl-head"><b>{kind === 'carousel' ? 'Make slides from a template' : 'Make a card'}</b><button type="button" className="chip" onClick={onClose}>Close</button></div>
      {GROUPS.map(g => { const list = offered.filter(x => x.group === g); return list.length ? (
        <div key={g} className="grp"><span className="cap">{g}</span>
          <div className="row">{list.map(x => <button key={x.id} type="button" className={`chip${x.id === tpl ? ' on' : ''}`} aria-pressed={x.id === tpl} onClick={() => pickTemplate(x.id)}>{x.name}</button>)}</div>
        </div>) : null; })}

      {t.needs.includes('quote') && (
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
        </div>)}
      {t.needs.includes('art') && (
        <div className="grp"><span className="cap">Art · from the Library (no words on it, reuse OK)</span>
          <div className="row"><button type="button" className="chip" onClick={() => setPicking(p => p === 'art' ? null : 'art')}>{art ? `Art: ${art.image_id}. Change` : 'Choose art'}</button></div>
          {picking === 'art' && <ImagePicker onPick={id => { setArt({ image_id: id }); setPicking(null); }} />}
        </div>)}
      {t.fields.some(f => f.key === 'bold') && (
        <div className="grp"><label className="cap" htmlFor="tpl-bold">Bold phrase (optional)</label>
          <input id="tpl-bold" value={bold} onChange={e => setBold(e.target.value)} placeholder="A phrase from the quote" />
          {boldUse && !boldOk(chosen?.quote || '', boldUse) && <span className="hint err">Those words aren’t in the quote.</span>}</div>)}
      {t.fields.some(f => f.key === 'layout') && (
        <div className="grp"><span className="cap">Layout</span><div className="row">{t.fields.find(f => f.key === 'layout').options.map(([k, l]) => <button key={k} type="button" className={`chip${layout === k ? ' on' : ''}`} aria-pressed={layout === k} onClick={() => setLayout(k)}>{l}</button>)}</div></div>)}

      {t.needs.includes('event') && (
        <div className="grp"><label className="cap" htmlFor="tpl-event">Event · from the Master Schedule</label>
          <select id="tpl-event" value={eventId} onChange={e => setEventId(e.target.value)}><option value="">{events ? 'Choose an event' : 'Loading…'}</option>
            {(events || []).map(e => <option key={e.id} value={e.id}>{e.date} · {e.title}{e.missing.length ? ` (missing ${e.missing.join(', ')})` : ''}</option>)}</select>
          {ev?.missing?.length > 0 && <span className="hint err">Missing in the Master Schedule: {ev.missing.join(', ')}. This card won’t be drawn until it’s added in Programming.</span>}</div>)}
      {t.needs.includes('teacher') && (
        <div className="grp"><label className="cap" htmlFor="tpl-teacher">Teacher · from onboarding</label>
          <select id="tpl-teacher" value={teacher} onChange={e => setTeacher(e.target.value)}><option value="">{teachers ? 'Choose a teacher' : 'Loading…'}</option>
            {(teachers || []).map(x => <option key={x.email} value={x.email}>{x.name}{!x.has_photo || !x.has_bio ? ' (incomplete)' : ''}</option>)}</select>
          <label className="cap" htmlFor="tpl-prog">Program (optional)</label><input id="tpl-prog" value={program} onChange={e => setProgram(e.target.value)} placeholder="e.g. Wisdom School" />
          {tc && tc.status !== 'approved' && <span className="hint">Their profile is “{tc.status || 'not reviewed'}”. The teacher should OK this post before it goes out.</span>}</div>)}

      {t.carousel && (
        <div className="grp car">
          <label className="cap" htmlFor="car-title">Cover title</label><input id="car-title" value={car.title} onChange={e => setCar({ ...car, title: e.target.value })} maxLength={120} />
          <label className="cap" htmlFor="car-sub">Cover line (optional)</label><input id="car-sub" value={car.subtitle} onChange={e => setCar({ ...car, subtitle: e.target.value })} maxLength={140} />
          {t.keyword && <><label className="cap" htmlFor="car-kw">Keyword people comment</label><input id="car-kw" value={car.keyword} onChange={e => setCar({ ...car, keyword: e.target.value })} maxLength={24} placeholder="TWELVE" /></>}
          <span className="cap">Slides ({slides.length} of {MAX_CAROUSEL_SLIDES})</span>
          <ol className="slides">{slides.map((s, i) => (
            <li key={i}>
              <span className="n">{i + 1}</span>
              <div className="f">
                {tpl !== 'story' && <input aria-label={`Slide ${i + 1} heading`} placeholder="Heading" value={s.heading || ''} onChange={e => setSlide(i, { heading: e.target.value })} maxLength={90} />}
                <textarea aria-label={`Slide ${i + 1} words`} placeholder={tpl === 'story' ? 'One narrative line' : 'Words for this slide'} rows={3} value={s.body || ''} onChange={e => setSlide(i, { body: e.target.value })} maxLength={420} />
                {tpl === 'story' && <><button type="button" className="chip" onClick={() => setPicking(p => p === i ? null : i)}>{s.art ? `Art: ${s.art}. Change` : 'Choose art'}</button>
                  {picking === i && <ImagePicker onPick={id => { setSlide(i, { art: id }); setPicking(null); }} />}</>}
              </div>
              <span className="a"><button type="button" className="chip" disabled={i === 0} onClick={() => moveSlide(i, -1)} aria-label={`Move slide ${i + 1} earlier`}>↑</button>
                <button type="button" className="chip" disabled={i === slides.length - 1} onClick={() => moveSlide(i, 1)} aria-label={`Move slide ${i + 1} later`}>↓</button>
                <button type="button" className="chip" disabled={slides.length <= 1} onClick={() => setCar({ ...car, slides: slides.filter((_, k) => k !== i) })} aria-label={`Remove slide ${i + 1}`}>Remove</button></span>
            </li>))}</ol>
          <div className="row"><button type="button" className="chip" disabled={slides.length >= MAX_CAROUSEL_SLIDES} onClick={() => setCar({ ...car, slides: [...slides, blankSlide(tpl === 'story')] })}>+ Add a slide</button></div>
          <label className="cap" htmlFor="car-cta">Closing line</label><input id="car-cta" value={car.cta} onChange={e => setCar({ ...car, cta: e.target.value })} maxLength={200} placeholder="Details and registration are at the link in our bio." />
        </div>)}

      <div className="grp"><span className="cap">Colourway · {cw}</span>
        <div className="row sw">{t.colourways.map(c => <button key={c[0]} type="button" className={c[0] === cw ? 'on' : ''} style={{ background: c[1] }} aria-label={c[0]} aria-pressed={c[0] === cw} onClick={() => setCw(c[0])} />)}</div>
        {t.note && <small className="hint">{t.note}</small>}</div>
      {t.sizes.length > 1 && <div className="grp"><span className="cap">Size</span><div className="row">{SIZE_KEYS.filter(k => t.sizes.includes(k)).map(k => <button key={k} type="button" className={`chip mono${size === k ? ' on' : ''}`} aria-pressed={size === k} onClick={() => setSize(k)}>{k}</button>)}</div></div>}

      <div className={`stage${previews.length > 1 ? ' strip' : ''}`} data-size={size}>
        {!ready ? <p className="hint">{why}</p>
          : previews.length ? previews.map((u, i) => <img key={i} src={u} alt={`Preview ${previews.length > 1 ? `slide ${i + 1}` : 'of the card'}`} style={{ opacity: state === 'loading' ? .5 : 1 }} />) : <p className="hint">Drawing…</p>}
      </div>
      {err && <p className="hint err" role="alert">{err}</p>}
      <ul className="fields">{t.fields.map(f => <li key={f.key}><span>{f.label}</span><span className={`tag ${f.kind}`}>{f.kind === 'locked' ? (/^Locked/.test(f.source) ? f.source : `Locked · ${f.source}`) : f.source}</span></li>)}</ul>
      <div className="row acts">
        <button type="button" className="chip primary" disabled={!ready || state !== 'idle'} onClick={() => use(false)}>{state === 'busy' ? 'Saving…' : t.carousel ? `Use these ${slides.length + 2} slides` : `Use this card${t.sizes.length > 1 ? ` (${size})` : ''}`}</button>
        {!t.carousel && t.sizes.length > 1 && <button type="button" className="chip" disabled={!ready || state !== 'idle'} onClick={() => use(true)}>Export {t.sizes.join(' · ')} to Library</button>}
      </div>
    </div>
  );
}
