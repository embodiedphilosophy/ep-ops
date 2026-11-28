'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { usd, Pill, ModeNote, TYPES } from './Campaigns';

const API = '/api/ops/ads';
const post = async body => { const res = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); const j = await res.json().catch(() => ({})); if (!res.ok) { const e = new Error(j.error || 'Couldn’t save that'); e.body = j; throw e; } return j; };
const day = d => d ? new Date(d + 'T12:00:00Z').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }) : 'no date';
const cents = v => Math.round(Number(String(v).replace(/[$,\s]/g, '') || 0) * 100);
const dollars = c => String((c || 0) / 100);
const RATIOS = [['9:16', 'stories and reels'], ['4:5', 'feed'], ['1:1', 'square'], ['1.91:1', 'landscape']];
const SHAPE = { '9:16': [27, 48], '4:5': [32, 40], '1:1': [36, 36], '1.91:1': [48, 25] };
const STEPS = ['Audiences', 'Creative and copy', 'Budget and rules', 'Check and start'];
const sizesOf = x => (x.kind === 'video' ? ['9:16', '4:5'] : RATIOS.map(r => r[0]));
const ready = x => sizesOf(x).every(k => /^(https?:|data:image)/.test(x.images?.[k] || ''));
const CTA = Object.fromEntries([['LEARN_MORE', 'Learn more'], ['SIGN_UP', 'Sign up'], ['SHOP_NOW', 'Shop now'], ['GET_OFFER', 'Get offer'], ['SUBSCRIBE', 'Subscribe']]);

export default function Draft({ id }) {
  const [d, setD] = useState(null), [err, setErr] = useState(''), [msg, setMsg] = useState(''), [busy, setBusy] = useState(''), [step, setStepState] = useState(1), [result, setResult] = useState(null);
  const stepRef = useRef(1);
  const load = useCallback(async (s = stepRef.current) => {
    const res = await fetch(`${API}?id=${encodeURIComponent(id)}${s === 2 ? '&art=1' : ''}${s === 4 ? '&checks=1' : ''}`).catch(() => null), j = await res?.json().catch(() => ({})) || {};
    if (!res?.ok) { setErr(j.error || 'Couldn’t read this draft'); return; }
    setErr(''); setD(prev => ({ ...(prev || {}), ...j, art: j.art || prev?.art, checks: j.checks || (s === 4 ? j.checks : undefined) }));
  }, [id]);
  const go = useCallback(s => { stepRef.current = s; setStepState(s); setResult(null); try { history.replaceState(null, '', `?step=${s}`); } catch {} setD(x => x && { ...x, checks: undefined }); load(s); }, [load]);
  useEffect(() => { const s = Number(new URLSearchParams(window.location.search).get('step')) || 1; stepRef.current = Math.min(4, Math.max(1, s)); setStepState(stepRef.current); load(stepRef.current); }, [load]);
  if (!d) return err ? <p className="hint err" role="alert">{err}</p> : <p className="ops-empty">Opening the draft…</p>;
  const c = d.campaign, locked = c.status !== 'draft', test = c.structure === 'test';
  // run one save, then refresh quietly
  const act = async (body, ok = '', key = 'save') => { setErr(''); setMsg(''); setBusy(key); try { const j = await post(body); await load(); if (ok) setMsg(ok); return j; } catch (e) { setErr(e.message); } finally { setBusy(''); } };
  const upd = (changes, ok) => act({ action: 'update', id, changes }, ok);
  const refresh = () => { if (confirm('Refresh the draft? Words, pictures and audiences you have not edited are drafted again from what the launch has now. Anything you edited stays.')) act({ action: 'refresh', id, what: 'all' }, 'The draft was refreshed.', 'refresh').then(j => j?.notes?.length && setMsg(j.notes.join(' '))); };
  const swapType = () => { const to = test ? 'advantage' : 'test'; if (confirm(`Switch to ${TYPES[to]}? The pictures, words and rules stay; only the audiences change.`)) act({ action: 'setStructure', id, structure: to }, `Switched to ${TYPES[to]}.`, 'type'); };
  const adsetCount = d.adsets.length, ownNotes = (c.meta_settings.notes || []).filter(Boolean);
  const shared = { d, c, locked, act, upd, id, setMsg, go };
  return (
    <div className="ads ads-draft">
      <p className="crumb"><a href="/ops/ads">Ads</a> / {locked ? 'In Meta' : 'Drafts'}</p>
      <div className="ads-head">
        <div><h2>{c.name}</h2>
          <p className="sub">{c.goal} · {TYPES[c.structure]}, {adsetCount} ad set{adsetCount === 1 ? '' : 's'}, {d.ads.length} ads · {c.start_date ? `${day(c.start_date)} to ${day(c.end_date)}` : 'no dates yet'}{c.dates_follow_launch && d.launch ? ` · dates follow the launch “${d.launch.name}”` : ''} <Pill status={c.status} /></p></div>
        {!locked && <div className="soc-act"><button className="soc-btn small" disabled={!!busy} onClick={swapType}>{test ? 'Switch to Advantage+' : 'Switch to targeting test'}</button><button className="soc-btn small primary" disabled={!!busy} onClick={refresh}>{busy === 'refresh' ? 'Refreshing…' : 'Refresh draft'}</button></div>}
      </div>
      <ModeNote d={d} />
      {c.meta_settings.relaunched_from && <p className="ads-mode warn" role="status"><b>Relaunched from <a href={`/ops/ads/${c.meta_settings.relaunched_from.id}`}>{c.meta_settings.relaunched_from.name}</a>.</b>{!locked && ' This is a draft. Nothing has gone to Meta. Read the new words before you send it.'}{!locked && !c.start_date && ' Set the dates on step 3.'}</p>}
      {locked && <p className="ads-mode" role="status">This campaign is already in Meta{c.status === 'sent_paused' ? ' (paused)' : ''}. It is read-only here; changes are made in Meta.</p>}
      <nav className="ads-steps" aria-label="The four steps">{STEPS.map((l, i) => <button key={l} type="button" aria-current={step === i + 1 ? 'step' : undefined} onClick={() => go(i + 1)}>{i + 1} · {l}</button>)}</nav>
      {err && <p className="hint err" role="alert">{err}</p>}{msg && <p className="hint" role="status">{msg}</p>}
      {step === 1 && ownNotes.length > 0 && <p className="ads-mode" role="note">{ownNotes.join(' ')}</p>}
      {step === 1 && <Audiences {...shared} test={test} />}
      {step === 2 && <Creative {...shared} />}
      {step === 3 && <Budget {...shared} test={test} />}
      {step === 4 && <Check {...shared} result={result} setResult={setResult} busy={busy} setBusy={setBusy} setErr={setErr} load={load} />}
      <div className="soc-act ads-next">
        {step > 1 && <button className="soc-btn" onClick={() => go(step - 1)}>Back</button>}
        {step < 4 && <button className="soc-btn primary" onClick={() => go(step + 1)}>Next: {STEPS[step].toLowerCase()}</button>}
      </div>
    </div>);
}

// ---------- 1 · Audiences ----------
function Audiences({ d, c, locked, act, test }) {
  const [target, setTarget] = useState(''), [open, setOpen] = useState(''), used = new Set(d.adsets.map(a => a.audience_name));
  const others = (c.meta_settings.pool || []).filter(p => !used.has(p.name));
  const labelOf = a => a.label === 'Proven' ? `Proven${a.targeting?._result ? ` · ${a.targeting._result}` : ''}` : 'New test';
  const use = key => act({ action: 'swapAudience', id: c.id, adset_id: target, key }, 'Swapped.').then(() => setTarget(''));
  const edit = (a, ch) => act({ action: 'editAdset', id: c.id, adset_id: a.id, changes: ch });
  return (
    <div className="ads-cols">
      <section className="ads-panel" aria-label="Ad sets">
        <div className="ph"><h2>{test ? '5 ad sets, one audience each' : 'One campaign, one ad set, five ads'}</h2><span className="sub">{test ? 'every ad set runs the same 5 ads' : 'Meta finds who sees it'}</span></div>
        {test ? <ol className="ads-sets">{d.adsets.map(a => (
          <li key={a.id} className={target === a.id ? 'on' : ''}>
            <span className="no">{a.position}</span>
            <div className="b"><b>{a.audience_name}</b><span className="sub">{a.targeting?._detail || (a.targeting?.age_min ? `Ages ${a.targeting.age_min}–${a.targeting.age_max}` : 'No audience yet')}</span>
              {open === a.id && !locked && <div className="ads-inline"><label>Name<input defaultValue={a.audience_name} onBlur={e => e.target.value !== a.audience_name && edit(a, { audience_name: e.target.value })} /></label>
                <label>Youngest<input type="number" min="13" max="65" defaultValue={a.targeting?.age_min || ''} onBlur={e => e.target.value && edit(a, { age_min: e.target.value })} /></label>
                <label>Oldest<input type="number" min="13" max="65" defaultValue={a.targeting?.age_max || ''} onBlur={e => e.target.value && edit(a, { age_max: e.target.value })} /></label></div>}</div>
            <span className={`ads-pill ${a.label === 'Proven' ? 'good' : 'calm'}`}>{labelOf(a)}</span>
            {!locked && <span className="acts"><button className="soc-btn small" aria-expanded={open === a.id} onClick={() => setOpen(open === a.id ? '' : a.id)}>Edit</button><button className="soc-btn small" aria-pressed={target === a.id} onClick={() => setTarget(target === a.id ? '' : a.id)}>Swap</button></span>}
          </li>))}</ol> : <AdvantageSet d={d} c={c} locked={locked} act={act} others={others} edit={edit} />}
        {test && <p className="sub">Press Swap on a row, then Use on a suggestion. “Proven” audiences are ranked by the Ad Agent’s results; “New test” fills the rest, so every launch also teaches something.</p>}
        <div className="ads-tiles" aria-label="The five ads">{d.creatives.map(x => <span key={x.id} className="ads-tile"><b>Ad {x.position} · {x.kind === 'video' ? 'Video' : 'Image'}</b><span className="sub">{ready(x) ? (x.kind === 'video' ? '9:16 and 4:5' : '4 sizes') : 'needs pictures'}</span></span>)}</div>
      </section>
      {test && <aside className="ads-panel" aria-label="Other suggestions">
        <div className="ph"><h2>Other suggestions</h2></div>
        {!others.length ? <p className="ops-empty">No other suggestions yet. {d.mode === 'not_connected' ? 'Meta isn’t connected, so interest ideas can’t be fetched.' : 'Try “Refresh draft”.'}</p> :
          <ul className="ads-others">{others.slice(0, 12).map(p => <li key={p.key}><div><b>{p.name}</b><span className="sub">{p.label === 'Proven' ? `Proven${p.result ? ` · ${p.result}` : ''}` : 'New test'}</span></div>
            <button className="soc-btn small" disabled={!target || locked} title={target ? '' : 'Press Swap on a row first'} onClick={() => use(p.key)}>Use</button></li>)}</ul>}
        <p className="ads-note-in">Where suggestions come from: audiences EP has tried (the Audience library, filling in soon), then new interests from Meta. “Proven” means it worked before; “New test” fills the rest.</p>
      </aside>}
    </div>);
}
function AdvantageSet({ d, c, locked, act, others, edit }) {
  const a = d.adsets[0], interests = a?.targeting?.flexible_spec?.[0]?.interests || [];
  if (!a) return <p className="ops-empty">No ad set yet. Try “Refresh draft”.</p>;
  return (
    <div className="ads-adv">
      <div className="cap">Ad set · Advantage+ audience <span className="ads-pill calm">Meta chooses who sees it</span></div>
      <p className="sub">Suggestions Meta starts from (it may go beyond them):</p>
      <p className="chips">{interests.map(i => <span key={i.id} className="ads-chip">{i.name}{!locked && <button aria-label={`Remove ${i.name}`} onClick={() => act({ action: 'removeHint', id: c.id, adset_id: a.id, interest_id: i.id })}>×</button>}</span>)}{!interests.length && <span className="sub">None yet.</span>}
        {!locked && others.length > 0 && <select aria-label="Add a suggestion" value="" onChange={e => e.target.value && act({ action: 'addHint', id: c.id, adset_id: a.id, key: e.target.value })}><option value="">Add a suggestion…</option>{others.filter(p => p.targeting?.flexible_spec).slice(0, 12).map(p => <option key={p.key} value={p.key}>{p.name}</option>)}</select>}</p>
      <div className="ads-inline"><label>Ages from<input type="number" min="13" max="65" defaultValue={a.targeting?.age_min || ''} disabled={locked} onBlur={e => e.target.value && edit(a, { age_min: e.target.value })} /></label>
        <label>to<input type="number" min="13" max="65" defaultValue={a.targeting?.age_max || ''} disabled={locked} onBlur={e => e.target.value && edit(a, { age_max: e.target.value })} /></label>
        <label className="wide">Leave out (a note for now)<input defaultValue={a.targeting?._exclusions || ''} disabled={locked} onBlur={e => edit(a, { exclusions_note: e.target.value })} placeholder="e.g. current members" /></label></div>
      <p className="sub">Each ad carries the same 5 copy sets, as in a targeting test.</p>
    </div>);
}

// ---------- 2 · Creative and copy ----------
function Creative({ d, c, locked, act, upd }) {
  const [sel, setSel] = useState(1), [setN, setSetN] = useState(1), [view, setView] = useState('feed'), [up, setUp] = useState('');
  const cr = d.creatives.find(x => x.position === sel) || d.creatives[0], cp = d.copysets.find(x => x.position === setN) || d.copysets[0];
  const pic = cr && (view === 'feed' ? cr.images?.['4:5'] : cr.images?.['9:16']);
  const upload = file => {
    if (!file) return; if (file.size > 6e6) { setUp('That picture is over 6 MB.'); return; }
    const r = new FileReader(); setUp('Cutting the four sizes…');
    r.onload = async () => { const data = String(r.result).split(',')[1]; await act({ action: 'chooseArt', id: c.id, creative_id: cr.id, data }, 'The picture was cut to four sizes.'); setUp(''); };
    r.readAsDataURL(file);
  };
  return (
    <div className="ads-cols">
      <div className="stack">
        <section className="ads-panel" aria-label="The five ads">
          <div className="ph"><h2>The 5 ads</h2><span className="sub">each image in Meta’s four sizes: stories and reels 9:16, feed 4:5, square 1:1, landscape 1.91:1</span></div>
          <ul className="ads-cards">{d.creatives.map(x => (
            <li key={x.id}><button type="button" aria-pressed={sel === x.position} onClick={() => setSel(x.position)} aria-label={`Ad ${x.position}`}>
              <span className="sizes">{sizesOf(x).map(k => { const [w, h] = SHAPE[k]; return x.images?.[k] ? <img key={k} src={x.images[k]} alt={`${k} crop`} style={{ width: w, height: h }} /> : <span key={k} className="blank" style={{ width: w, height: h }}>{k}</span>; })}</span>
              <b>Ad {x.position} · {x.kind === 'video' ? 'Video' : 'Image'}</b><span className="sub">{x.source || 'No picture yet'}</span>
              <span className={`ads-pill ${ready(x) ? 'good' : 'warn'}`}>{ready(x) ? (x.kind === 'video' ? 'Ready' : '4 sizes ready') : 'needs pictures'}</span></button></li>))}</ul>
          {cr && !locked && <div className="ads-pick" aria-label={`Ad ${cr.position} picture`}>
            <div className="ads-seg" role="group" aria-label="Picture or video"><button type="button" aria-pressed={cr.kind === 'image'} onClick={() => cr.kind !== 'image' && act({ action: 'editCreative', id: c.id, creative_id: cr.id, kind: 'image' })}>Picture</button><button type="button" aria-pressed={cr.kind === 'video'} onClick={() => cr.kind !== 'video' && act({ action: 'editCreative', id: c.id, creative_id: cr.id, kind: 'video' })}>Video (9:16 and 4:5 only)</button></div>
            {cr.kind === 'image' ? <>
              <label>Choose from the library<select value="" aria-label="Choose from the image library" onChange={e => e.target.value && act({ action: 'chooseArt', id: c.id, creative_id: cr.id, image_id: e.target.value }, 'The picture was cut to four sizes.')}><option value="">{d.art ? 'Pick a picture…' : 'Loading…'}</option>{(d.art || []).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
              <label>Or upload one<input type="file" accept="image/jpeg,image/png" aria-label="Upload a picture" onChange={e => upload(e.target.files?.[0])} /></label></> :
              ['9:16', '4:5'].map(k => <label key={k}>Video file link, {k}<input defaultValue={cr.images?.[k] || ''} placeholder="https://…" onBlur={e => e.target.value !== (cr.images?.[k] || '') && act({ action: 'editCreative', id: c.id, creative_id: cr.id, images: { ...cr.images, [k]: e.target.value } })} /></label>)}
            {up && <span className="sub" role="status">{up}</span>}
          </div>}
          <p className="sub">Pulled from the launch’s art and the EP image library in Drive. Video comes from Drive or an upload.</p>
        </section>
        <section className="ads-panel" aria-label="The five copy sets">
          <div className="ph"><h2>The 5 copy sets</h2><span className="sub">every ad carries all five; Meta tests them against each other</span></div>
          <div className="ads-scroll"><table className="ads-table copy"><thead><tr><th>#</th><th>Main text</th><th>Headline</th><th>Taken from</th></tr></thead>
            <tbody>{d.copysets.map(s => (
              <tr key={s.id} className={setN === s.position ? 'on' : ''} onClick={() => setSetN(s.position)}>
                <td className="num">{s.position}</td>
                <td><textarea aria-label={`Main text ${s.position}`} rows={3} defaultValue={s.main_text} key={s.main_text} disabled={locked} onBlur={e => e.target.value !== s.main_text && act({ action: 'editCopy', id: c.id, copy_id: s.id, main_text: e.target.value, headline: s.headline })} /></td>
                <td><input aria-label={`Headline ${s.position}`} defaultValue={s.headline} key={s.headline} disabled={locked} onBlur={e => e.target.value !== s.headline && act({ action: 'editCopy', id: c.id, copy_id: s.id, main_text: s.main_text, headline: e.target.value })} /></td>
                <td><span className={`ads-pill ${s.is_placeholder ? 'warn' : 'calm'}`} title={s.source_text}>{s.source_ref || 'No source'}</span></td>
              </tr>))}</tbody></table></div>
          <div className="ads-inline"><label>Button<select value={c.cta} disabled={locked} onChange={e => upd({ cta: e.target.value })}>{(d.cta_list || []).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
            <label className="wide">Landing page<input defaultValue={c.landing_url} disabled={locked} onBlur={e => e.target.value !== c.landing_url && upd({ landing_url: e.target.value })} placeholder="https://…" /></label></div>
          <p className="sub">The ad opens: <span className="mono">{d.link || 'nothing yet: add the landing page address'}</span></p>
        </section>
      </div>
      <aside className="ads-panel" aria-label="Preview">
        <div className="ph"><h2>Preview</h2><div className="ads-seg" role="group" aria-label="Where it shows"><button type="button" aria-pressed={view === 'feed'} onClick={() => setView('feed')}>Feed</button><button type="button" aria-pressed={view === 'stories'} onClick={() => setView('stories')}>Stories</button></div></div>
        <div className={`ads-phone ${view}`}>
          <div className="who"><span className="av" aria-hidden="true" /><span><b>Embodied Philosophy</b><span className="sub">Sponsored</span></span></div>
          <div className="pic">{pic ? <img src={pic} alt={`Ad ${sel} in ${view === 'feed' ? '4:5' : '9:16'}`} /> : <span>No {view === 'feed' ? '4:5' : '9:16'} picture yet</span>}</div>
          <div className="foot"><div><b>{cp?.headline}</b></div><span className="btn">{CTA[c.cta] || 'Learn more'}</span></div>
          <p className="txt">{cp?.main_text}</p>
        </div>
        <p className="sub">Showing ad {sel} with copy set {setN}. Click any ad or copy set to preview it.</p>
        <p className="ads-note-in">Copy is drafted only from EP’s own launch emails, course page and real testimonials. Anything without a source stays a [placeholder] and blocks Start, the same rule as social.</p>
      </aside>
    </div>);
}

// ---------- 3 · Budget and rules ----------
function Budget({ d, c, locked, act, upd, test }) {
  const total = d.total_cents, r = d.rules, lead = c.goal === 'Lead', traffic = c.goal === 'Traffic';
  const rule = patch => act({ action: 'saveRules', id: c.id, rules: patch });
  const s = Object.fromEntries((d.settings || []).map(x => [x.name, x.set]));
  const unit = lead ? 'cost per lead' : 'return on ad spend', x = v => (lead ? `$${v}` : `${v}×`);
  return (
    <div className="ads-cols">
      <div className="stack">
        <section className="ads-panel" aria-label="Budget">
          <div className="ph"><h2>Budget</h2></div>
          <div className="ads-choices two" role="radiogroup" aria-label="Budget type">
            <button type="button" role="radio" aria-checked={c.budget_mode === 'campaign'} disabled={locked} onClick={() => upd({ budget_mode: 'campaign' })}><b>Campaign budget</b><span>One daily amount; Meta moves it to the ad sets doing best.</span></button>
            <button type="button" role="radio" aria-checked={c.budget_mode === 'per_adset'} disabled={locked} onClick={() => upd({ budget_mode: 'per_adset' })}><b>Ad set budgets</b><span>Each audience gets its own amount, so the test is fair.{test ? ' Suggested for 5 × 5.' : ''}</span></button>
          </div>
          {c.budget_mode === 'campaign' ? <div className="ads-inline"><label>Campaign budget / day<input inputMode="decimal" aria-label="Campaign budget per day" defaultValue={dollars(c.daily_budget_cents)} disabled={locked} onBlur={e => cents(e.target.value) !== c.daily_budget_cents && upd({ daily_budget_cents: cents(e.target.value) })} /></label></div>
            : <div className="ads-inline">{d.adsets.map(a => <label key={a.id}>{a.position} · {a.audience_name.replace(/^Interests · /, '').slice(0, 22)}<input inputMode="decimal" aria-label={`Budget per day, ad set ${a.position}`} defaultValue={dollars(a.daily_budget_cents)} disabled={locked} onBlur={e => cents(e.target.value) !== a.daily_budget_cents && act({ action: 'editAdset', id: c.id, adset_id: a.id, changes: { daily_budget_cents: cents(e.target.value) } })} /></label>)}</div>}
          <div className="ads-inline"><b>Total {usd(total)} / day</b>
            <label className="wide">Never spend more than<input inputMode="decimal" aria-label="Lifetime spending cap" defaultValue={c.spend_cap_cents ? dollars(c.spend_cap_cents) : ''} placeholder="no cap" disabled={locked} onBlur={e => cents(e.target.value) !== c.spend_cap_cents && upd({ spend_cap_cents: cents(e.target.value) })} /></label><span className="sub">on this campaign</span></div>
          <div className="ads-inline"><label>Starts<input type="date" aria-label="Start date" value={c.start_date} disabled={locked} onChange={e => upd({ start_date: e.target.value })} /></label>
            <label>Ends<input type="date" aria-label="End date" value={c.end_date} disabled={locked} onChange={e => upd({ end_date: e.target.value })} /></label>
            {c.launch_id && !c.dates_follow_launch && !locked && <button className="soc-btn small" onClick={() => upd({ dates_follow_launch: true }, 'The dates follow the launch again.')}>Follow the launch’s dates</button>}
            {c.dates_follow_launch && <span className="sub">Following the launch’s key dates.</span>}</div>
        </section>
        <section className="ads-panel" aria-label="Automatic rules">
          <div className="ph"><h2>Automatic rules</h2><span className="sub">judged per ad set, on a 72-hour average</span></div>
          {traffic ? <p className="ops-empty">Traffic campaigns have no automatic rules.</p> : !r ? <p className="ops-empty">Rules appear once the draft is saved.</p> : <>
            <div className="ads-rule"><label className="ads-toggle"><input type="checkbox" aria-label="Rules on" checked={c.rules_on} disabled={locked} onChange={e => act({ action: 'saveRules', id: c.id, rules: {}, rules_on: e.target.checked })} /> <b>Switch these rules on for this campaign</b></label>
              <span className="sub">Applied each morning once the campaign is running, and only if this is switched on. They start as a dry run beside Make’s Ad Agent, and nothing changes in Meta from this page.</span></div>
            <div className="ads-inline"><b>Raise the budget by</b><input aria-label="Raise by percent" type="number" min="1" max="100" defaultValue={r.raise_pct} disabled={locked} onBlur={e => rule({ raise_pct: e.target.value })} />%<b>every</b><input aria-label="Every hours" type="number" min="24" max="168" defaultValue={r.raise_every_hours} disabled={locked} onBlur={e => rule({ raise_every_hours: e.target.value })} />hours
              <b>{lead ? 'while cost per lead is at most' : 'while return on ad spend is at least'}</b><input aria-label="Raise while threshold" inputMode="decimal" defaultValue={r.raise_threshold} disabled={locked} onBlur={e => rule({ raise_threshold: e.target.value })} /></div>
            <div className="ads-inline"><b>but never above</b><input aria-label="Ceiling per ad set" inputMode="decimal" defaultValue={dollars(r.ceiling_cents)} disabled={locked} onBlur={e => rule({ ceiling_cents: cents(e.target.value) })} /><span className="sub">a day for one ad set</span></div>
            <div className="ads-inline"><b>Turn an ad set off when {unit} {lead ? 'rises above' : 'falls below'}</b><input aria-label="Turn off threshold" inputMode="decimal" defaultValue={r.off_threshold} disabled={locked} onBlur={e => rule({ off_threshold: e.target.value })} /><b>after it has spent</b><input aria-label="Minimum spend" inputMode="decimal" defaultValue={dollars(r.off_min_spend_cents)} disabled={locked} onBlur={e => rule({ off_min_spend_cents: cents(e.target.value) })} /></div>
            <div className="ads-inline"><b>Pause the weakest ad in each set after</b><input aria-label="Pause weakest after days" type="number" min="0" max="60" defaultValue={r.pause_weakest_after_days} disabled={locked} onBlur={e => rule({ pause_weakest_after_days: e.target.value })} /><span className="sub">days (0 means off)</span></div>
            <p className="sub">Defaults match the current Ad Agent: return on ad spend {x(1.5)}, cost per lead $1–2, 20% steps every 48 hours. Every change will appear on the campaign and in the daily ad digest, with a Reverse link.</p></>}
        </section>
        <section className="ads-panel" aria-label="Meta settings">
          <div className="ph"><h2>Meta settings</h2><span className="sub">filled in from Settings, rarely changed</span></div>
          <ul className="ads-facts-list">
            <li><span>Conversion</span><b>{s.META_PIXEL_ID ? 'The EP pixel' : 'Pixel not set up'} · {c.goal === 'Purchase' ? 'Purchase' : c.goal === 'Lead' ? 'Lead' : 'Landing page views'}</b></li>
            <li><span>Facebook Page</span><b>{s.META_PAGE_ID ? 'Set' : 'Not set up'}</b></li>
            <li><span>Instagram account</span><b>{s.META_IG_USER_ID ? 'Set' : 'Not set up'}</b></li></ul>
          <div className="ads-inline"><label>Placements<select value={c.meta_settings.placements} disabled={locked} onChange={e => upd({ meta_settings: { placements: e.target.value } })}><option value="advantage">Advantage+ placements (all)</option><option value="feeds_stories">Feeds and Stories only</option></select></label>
            <label className="wide">Campaign name in Meta<input aria-label="Campaign name in Meta" defaultValue={c.meta_settings.campaign_name} disabled={locked} onBlur={e => e.target.value !== c.meta_settings.campaign_name && upd({ meta_settings: { campaign_name: e.target.value } })} /></label></div>
        </section>
      </div>
      <aside className="ads-panel" aria-label="What this costs"><div className="ph"><h2>At a glance</h2></div>
        <ul className="ads-facts-list"><li><span>Per day</span><b>{usd(total)}</b></li><li><span>Spending cap</span><b>{c.spend_cap_cents ? usd(c.spend_cap_cents) : 'none'}</b></li><li><span>Runs</span><b>{c.start_date ? `${day(c.start_date)} to ${day(c.end_date)}` : 'no dates'}</b></li></ul>
        <p className="sub">Nothing here spends anything. Money is only spent after you press Start on the next step.</p></aside>
    </div>);
}

// ---------- 4 · Check and start ----------
function Check({ d, c, locked, id, result, setResult, busy, setBusy, setErr, load, go }) {
  const ch = d.checks, dry = d.mode !== 'live';
  const run = async (action, ask) => {
    if (!confirm(ask)) return; setErr(''); setResult(null); setBusy(action);
    try { const j = await post({ action, id, confirm: true }); setResult(j); await load(4); } catch (e) { setErr(e.message); }
    setBusy('');
  };
  const w = result?.would;
  return (
    <div className="ads-cols">
      <section className="ads-panel" aria-label="Check and start">
        <div className="ph"><h2>Check and start</h2></div>
        {!ch ? <p className="ops-empty">Checking the draft, the landing page, the pixel and the ad account…</p> : <ul className="ads-checks">{ch.items.map(i => (
          <li key={i.key} className={i.ok ? 'ok' : 'no'}><span className="mark" aria-hidden="true">{i.ok ? '✓' : '✕'}</span><span className="t"><span className="sr">{i.ok ? 'Passed: ' : 'Not yet: '}</span>{i.label}</span>
            {!i.ok && i.step < 4 && !locked && <button className="lnk" onClick={() => go(i.step)}>Fix</button>}{!i.ok && i.key === 'landing' && i.link && <a className="lnk" href={i.link} target="_blank" rel="noopener noreferrer">Open</a>}</li>))}</ul>}
        {!locked && <div className="ads-go">
          <button className="soc-btn" disabled={!ch?.canSend || !!busy} onClick={() => run('sendToMeta', dry ? 'Send to Meta, paused?\n\nThe safety switch is off, so this is a dry run: nothing is sent.' : 'Send this campaign to Meta, paused?\n\nEverything is made paused so Meta can review the ads. Nothing spends until you press Start.')}>{busy === 'sendToMeta' ? 'Sending…' : 'Send to Meta, paused'}</button>
          <button className="soc-btn primary" disabled={!ch?.canStart || !!busy} onClick={() => run('start', dry ? 'Start the campaign?\n\nThe safety switch is off, so this is a dry run: nothing is sent.' : 'Start this campaign now?\n\nIt will begin spending your daily budget.')}>{busy === 'start' ? 'Starting…' : `Start${c.start_date ? ` on ${day(c.start_date)}` : ''}`}</button>
        </div>}
        <p className="sub">“Paused” builds everything in Meta so it can pass Meta’s ad review early; nothing spends until Start. Starting needs every check above to pass.</p>
        {ch && !ch.canStart && !locked && <p className="sub" role="status">Start is switched off until every check passes.</p>}
        {result && <div className={`ads-result ${result.dryRun ? 'dry' : ''}`} role="status"><b>{result.message}</b>
          {w && <ul><li>{w.campaign}</li><li>1 campaign, {w.adsets} ad set{w.adsets === 1 ? '' : 's'}, {w.ads} ads ({w.creatives} pictures or videos, {w.images} image sizes, {w.copy_sets} copy sets each)</li><li>{usd(w.daily_budget_cents)} a day {w.budget_mode === 'campaign' ? '(campaign budget)' : '(split over the ad sets)'} · {w.start ? `${day(w.start)} to ${day(w.end)}` : 'no dates'}</li><li>Link: <span className="mono">{w.link}</span></li><li>Audiences: {w.audiences.join(' · ')}</li></ul>}
          {result.dryRun && <p className="sub">This is what would have been sent. Nothing was created, changed or started in Meta.</p>}</div>}
        {c.meta_settings.last_dry_run && !result && <p className="sub">Last dry run: {new Date(c.meta_settings.last_dry_run.at).toLocaleString('en-GB')}, nothing was sent.</p>}
        {c.meta_settings.partial && <p className="hint err" role="alert">A send stopped part-way: Meta made a campaign ({c.meta_settings.partial.adsets} ad sets, {c.meta_settings.partial.ads} ads) that is not marked as sent. Remove it in Meta before trying again.</p>}
      </section>
      <aside className="ads-panel" aria-label="What each check means"><div className="ph"><h2>Before it can start</h2></div>
        <p className="sub">The pictures, words and audiences must be complete before Meta can take the ads at all. The landing page, pixel and payment method are what keep money from being spent on something that cannot work.</p></aside>
    </div>);
}
