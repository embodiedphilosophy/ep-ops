'use client';
import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { fillCopy } from '@/lib/teachcopy-defaults';
import { upload } from '@vercel/blob/client';

// ---------- small helpers ----------
const addDays = (d, n) => { const x = new Date(d + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const fmt = (d, o = { weekday: 'short', month: 'short', day: 'numeric' }) => d ? new Date(d + 'T12:00:00Z').toLocaleDateString('en-US', { ...o, timeZone: 'UTC' }) : '';
const long = d => fmt(d, { weekday: 'long', month: 'long', day: 'numeric' });
const words = s => (String(s || '').trim().match(/\S+/g) || []).length;
const initials = n => { const a = String(n || '?').trim().split(/\s+/); return (a[0]?.[0] || '?') + (a.length > 1 ? a[a.length - 1][0] : ''); };
const lines = s => String(s || '').split('\n').map(x => x.trim()).filter(Boolean);
const PROGRAM = { wisdom: 'Wisdom School', sadhana: 'Sādhana School', seasonal: 'Seasonal Sādhana', lrl: 'Living Room Lectures', chitheads: 'CHITHEADS Live' };
const programOf = o => PROGRAM[o.program] || o.host || 'Embodied Philosophy';
const has = (o, kind) => o.deliverables.some(d => d.kind === kind);
const hasClip = o => o.deliverables.some(d => /clip|video/i.test(d.task));
const dateRange = o => o.end && o.end !== o.start ? `${fmt(o.start)} – ${fmt(o.end)}` : fmt(o.start);
// The words on every screen come from Ops (Faculty → Onboarding → the Onboarding Copy tab), with defaults in lib/teachcopy-defaults.js
const CopyCtx = createContext({});
const useT = () => { const c = useContext(CopyCtx); return (k, v) => fillCopy(c, k, v); };

async function post(path, body) {
  const res = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).catch(() => null);
  const j = res ? await res.json().catch(() => ({})) : {};
  if (!res || !res.ok) throw new Error(j.error || 'Something went wrong. Please try again.');
  return j;
}

function Avatar({ name, photo, size = 150 }) {
  return <div className="t-avatar" style={{ width: size, height: size, fontSize: size / 3.2 }}>{photo ? <img src={photo} alt={name} /> : initials(name)}</div>;
}

// ---------- the flow ----------
// embedded: shown inside Ops (Faculty → Onboarding) as a preview: no header or demo bar, every step open, onStep says which one
export default function Onboarding({ data, embedded = false, onStep }) {
  const as = data.actingAs || undefined;
  const pendingOfferings = data.offerings.filter(o => !['submitted', 'published'].includes(String(o.page?.status || '').toLowerCase()));
  const anyCircle = data.offerings.some(o => o.circle);

  const steps = useMemo(() => {
    const s = [{ key: 'welcome', label: 'Welcome' }];
    // The agreement step shows while there's an agreement to sign (it stays in the list once they've signed it here)
    if (data.agreement?.status === 'needed') s.push({ key: 'agreement', label: 'Agreement' });
    s.push({ key: 'profile', label: 'Bio & headshot' });
    pendingOfferings.forEach((o, i) => {
      const suffix = pendingOfferings.length > 1 ? ` ${i + 1}` : '';
      s.push({ key: `course:${o.key}`, label: `Your offering${suffix}`, offering: o.key }, { key: `preview:${o.key}`, label: `Course page${suffix}`, offering: o.key });
    });
    if (anyCircle) s.push({ key: 'circle', label: 'Circle teaching space' });
    s.push({ key: 'dashboard', label: 'Your dashboard' }, { key: 'emails', label: 'Emails to expect' }, { key: 'done', label: 'All set' });
    return s;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const startAt = data.needed || embedded ? 0 : steps.length - 1;
  const [step, setStep] = useState(startAt);
  const [reached, setReached] = useState(data.needed && !embedded ? 0 : steps.length - 1);
  const [toast, setToast] = useState('');
  const top = useRef(null);
  const say = m => { setToast(m); clearTimeout(say.t); say.t = setTimeout(() => setToast(''), 2800); };
  const go = i => { setStep(i); setReached(r => Math.max(r, i)); requestAnimationFrame(() => top.current?.scrollIntoView({ block: 'start' })); };
  const next = () => go(step + 1);
  // On phones the step list scrolls sideways: keep the current step in view
  useEffect(() => { document.querySelector('.t-rail li.cur')?.scrollIntoView({ block: 'nearest', inline: 'center' }); }, [step]);

  // profile state
  const [profile, setProfile] = useState({
    name: data.onFile?.name || data.nameGuess || '', bio: data.onFile?.bio || '', photo: data.onFile?.photo_url || '',
    role: data.onFile?.role || 'Guest teacher', updating: !data.onFile, saved: data.profileDone,
  });

  const [agreement, setAgreement] = useState(data.agreement || { status: 'none' });

  // course pages, keyed by offering
  const [pages, setPages] = useState(() => Object.fromEntries(data.offerings.map(o => [o.key, {
    title: o.page?.title || '', subtitle: o.page?.subtitle || '', summary: o.page?.summary || o.summary || '', explore: o.page?.explore || '',
    audience: o.page?.audience || '', readings_mode: o.page?.readings_mode || '', readings: o.page?.readings || '',
    promo_1: o.page?.promo_1 || '', promo_2: o.page?.promo_2 || '', promo_3: o.page?.promo_3 || '', promo_clip: o.page?.promo_clip || '',
    submitted: ['submitted', 'published'].includes(String(o.page?.status || '').toLowerCase()),
  }])));
  const setPage = (key, patch) => setPages(p => ({ ...p, [key]: { ...p[key], ...patch, submitted: patch.submitted ?? false } }));

  const cur = steps[Math.min(step, steps.length - 1)];
  useEffect(() => { onStep?.(cur.key.split(':')[0]); }, [cur.key]); // eslint-disable-line react-hooks/exhaustive-deps
  const offering = cur.offering ? data.offerings.find(o => o.key === cur.offering) : null;
  const name = profile.name || data.nameGuess || '';
  const first = name.split(' ')[0] || 'there';

  const view = {
    welcome: () => <Welcome data={data} first={first} next={next} />,
    agreement: () => <Agreement data={data} agreement={agreement} setAgreement={setAgreement} name={name} first={first} as={as} next={next} say={say} />,
    profile: () => <Profile data={data} profile={profile} setProfile={setProfile} as={as} next={next} say={say} />,
    course: () => <Course o={offering} page={pages[offering.key]} setPage={p => setPage(offering.key, p)} as={as} next={next} say={say} />,
    preview: () => <Preview o={offering} page={pages[offering.key]} profile={profile} as={as} say={say}
      onApproved={() => { setPages(p => ({ ...p, [offering.key]: { ...p[offering.key], submitted: true } })); next(); }}
      onEdit={() => go(step - 1)} />,
    circle: () => <Circle data={data} pages={pages} as={as} next={next} />,
    dashboard: () => <Dashboard data={data} first={first} pages={pages} next={next} />,
    emails: () => <Emails data={data} pages={pages} next={next} />,
    done: () => <Done data={data} first={first} profile={profile} pages={pages} agreement={agreement} as={as} steps={steps} go={go} />,
  }[cur.key.split(':')[0]];

  return (
    <CopyCtx.Provider value={data.copy || {}}>
    <div className={`t-wrap${embedded ? ' t-embedded' : ''}`}>
      {data.actingAs && !embedded && <div className="t-demo">Trying it out as <b>{data.actingAs}</b>. Nothing is saved or sent. <a href="/teach">Back to the teacher list</a></div>}
      {!embedded && <header className="t-top" ref={top}>
        <a href="/" className="ops-logo"><img src="/brand/ep-mark-black.png" alt="Embodied Philosophy" width="34" height="36" /><span>Teachers</span></a>
        <div className="t-who">{name ? `${name} · ` : ''}{data.email} · <a href="/api/ops/logout">Sign out</a></div>
      </header>}
      <div className="t-shell">
        <nav className="t-rail" aria-label="Onboarding steps">
          <ol>
            {steps.map((s, i) => (
              <li key={s.key} className={i === step ? 'cur' : i < reached || (!data.needed) ? 'done' : ''}>
                <button type="button" onClick={() => go(i)} disabled={i > reached} aria-current={i === step ? 'step' : undefined}>
                  <span className="dot">{(i < reached || !data.needed) && i !== step ? '✓' : i + 1}</span><span>{s.label}</span>
                </button>
              </li>
            ))}
          </ol>
          <p className="note">Your progress saves as you go. Come back any time from the sign-in link.</p>
        </nav>
        <main className="t-main">{view()}</main>
      </div>
      <div className={`t-toast ${toast ? 'on' : ''}`} role="status" aria-live="polite">{toast}</div>
    </div>
    </CopyCtx.Provider>
  );
}

// ---------- steps ----------
// Read and sign the General Teaching Agreement (typed name + consent). Only shown when one is still to sign.
function Agreement({ data, agreement, setAgreement, name, first, as, next, say }) {
  const t = useT();
  const [signer, setSigner] = useState(''), [agree, setAgree] = useState(false), [busy, setBusy] = useState(false), [err, setErr] = useState('');
  const when = iso => iso ? new Date(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : '';
  if (agreement.status === 'signed') return (
    <div className="t-stack">
      <div><span className="eyebrow">Agreement</span><h1 className="t-h1">{t('agreement_signed_title', { first })}</h1>
        <p className="t-lede">Signed by {agreement.signer} on {when(agreement.signed_at)} and countersigned by {agreement.countersigned_by} for Embodied Philosophy.{data.actingAs ? ' (Trying it out: nothing was saved.)' : ' A copy is on its way to your inbox.'}</p></div>
      <div className="t-actions">
        <button className="btn btn-primary" onClick={next}>Continue to your bio</button>
        {agreement.link && <a className="btn btn-ghost" href={agreement.link} target="_blank" rel="noreferrer">Read or print it</a>}
      </div>
    </div>
  );
  const ok = signer.trim().length >= 3 && agree;
  const sign = async e => {
    e.preventDefault(); if (!ok) return;
    setBusy(true); setErr('');
    try { const j = await post('/api/teach/agreement', { as, name: signer, agree }); setAgreement(j.agreement); say('Agreement signed'); }
    catch (x) { setErr(x.message); } finally { setBusy(false); }
  };
  return (
    <div className="t-stack">
      <div><span className="eyebrow">Agreement</span><h1 className="t-h1">{t('agreement_title', { first })}</h1>
        <p className="t-lede">{t('agreement_lede', { first })}</p></div>
      <div className="t-card t-contract" tabIndex={0} aria-label="The agreement">{agreement.text}</div>
      <form className="t-stack" style={{ gap: 14 }} onSubmit={sign}>
        <div className="t-field"><label htmlFor="t-sig">Type your full name to sign</label>
          <input id="t-sig" type="text" value={signer} onChange={e => setSigner(e.target.value)} placeholder={name} autoComplete="name" /></div>
        <label className="t-consent"><input type="checkbox" checked={agree} onChange={e => setAgree(e.target.checked)} /> <span>I have read this agreement and agree to it. Typing my name counts as my signature.</span></label>
        {err && <p className="t-error">{err}</p>}
        <div className="t-actions"><button className="btn btn-primary" type="submit" disabled={busy || !ok}>{busy ? 'Signing…' : 'Sign the agreement'}</button></div>
        <p className="t-small t-muted">Questions about anything in it? Reply to your onboarding email before you sign and we’ll talk it through.</p>
      </form>
    </div>
  );
}

function Welcome({ data, first, next }) {
  const t = useT();
  if (!data.offerings.length) return (
    <div className="t-stack">
      <div><span className="eyebrow">Welcome</span><h1 className="t-h1">Hello, {first}</h1>
        <p className="t-lede">{t('welcome_none', { first })}</p></div>
      <div className="t-actions"><button className="btn btn-primary" onClick={next}>Review my profile</button></div>
    </div>
  );
  return (
    <div className="t-stack">
      <div><span className="eyebrow">{data.onFile ? 'Welcome back' : 'Welcome'}</span>
        <h1 className="t-h1">{t(data.onFile ? 'welcome_title_back' : 'welcome_title', { first })}</h1>
        <p className="t-lede">{t('welcome_lede', { first })}</p></div>
      {data.offerings.map(o => (
        <div key={o.key} className="t-card">
          <dl className="t-offer">
            <div><dt>Offering</dt><dd>{o.page?.title || o.title}</dd></div>
            <div><dt>Program</dt><dd>{programOf(o)}</dd></div>
            <div><dt>When</dt><dd>{dateRange(o)}{o.time ? ` · ${o.time}` : ''}{o.sessions.length > 1 ? ` · ${o.sessions.length} sessions` : ''}</dd></div>
            <div><dt>Course host</dt><dd>{o.course_host || 'EP team'}</dd></div>
          </dl>
          <h3 className="t-h3">What we need from you</h3>
          <ul className="t-tasks">
            {o.deliverables.map(d => (
              <li key={d.task}>
                <div><div className="t">{d.task}</div><div className="d">{d.perSession ? (d.offset < 0 ? `${-d.offset} day${d.offset === -1 ? '' : 's'} before each session · first due ${fmt(d.due)}` : `The day after each session · first due ${fmt(d.due)}`) : `Due ${fmt(d.due)}`}</div></div>
                {['bio', 'confirm', 'promo'].includes(d.kind) || (d.kind === 'readings') ? <span className="t-pill terra">{d.kind === 'readings' ? 'Can be done here' : 'Done here'}</span> : <span className="t-pill">Later, from your dashboard</span>}
              </li>
            ))}
            {!o.deliverables.length && <li><div className="t">Your course details</div><span className="t-pill terra">Done here</span></li>}
          </ul>
          {String(o.page?.status).toLowerCase() === 'submitted' && <p className="t-small" style={{ marginTop: 10 }}><span className="t-pill ok">Course page sent</span> We have your course page for this one.</p>}
        </div>
      ))}
      <div className="t-actions"><button className="btn btn-primary" onClick={next}>Let’s begin</button></div>
    </div>
  );
}

function Profile({ data, profile, setProfile, as, next, say }) {
  const t = useT();
  const [busy, setBusy] = useState(false), [err, setErr] = useState(''), [photoMsg, setPhotoMsg] = useState(''), [over, setOver] = useState(false);
  const fileRef = useRef(null);
  const P = profile, set = patch => setProfile(p => ({ ...p, ...patch }));
  const w = words(P.bio);

  const save = async keep => {
    setBusy(true); setErr('');
    try {
      await post('/api/teach/profile', keep ? { as, keep: true, name: P.name } : { as, name: P.name, bio: P.bio, photo_url: P.photo });
      set({ saved: true, updating: false }); say(keep ? 'Thanks for confirming' : 'Profile saved'); next();
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };

  const pick = async file => {
    if (!file) return;
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) { setPhotoMsg('Please choose a JPG, PNG or WebP image.'); return; }
    const dims = await new Promise(res => { const img = new Image(); img.onload = () => res([img.width, img.height]); img.onerror = () => res([0, 0]); img.src = URL.createObjectURL(file); });
    setPhotoMsg('Uploading…');
    try {
      const ext = file.type.split('/')[1].replace('jpeg', 'jpg');
      const blob = await upload(`teachers/${(P.name || 'teacher').toLowerCase().replace(/[^a-z0-9]+/g, '-')}.${ext}`, file, { access: 'public', handleUploadUrl: '/api/teach/upload' });
      set({ photo: blob.url });
      const notes = [];
      if (dims[0] && Math.abs(dims[0] - dims[1]) / Math.max(...dims) > 0.08) notes.push('It isn’t square, so it will be cropped to the centre as shown.');
      if (dims[0] && Math.min(...dims) < 800) notes.push(`It’s ${dims[0]} × ${dims[1]} px; 800 px or more looks sharper.`);
      setPhotoMsg(notes.length ? notes.join(' ') : 'Looks good.');
    } catch (e) { setPhotoMsg(`Upload didn’t work: ${e.message}`); }
  };

  const nameField = (
    <div className="t-field"><label htmlFor="t-name">Your name as it should appear</label>
      <input id="t-name" type="text" value={P.name} onChange={e => set({ name: e.target.value })} autoComplete="name" /></div>
  );

  if (data.onFile && !P.updating) return (
    <div className="t-stack">
      <div><span className="eyebrow">Bio & headshot</span><h1 className="t-h1">{t('profile_onfile_title')}</h1>
        <p className="t-lede">{t('profile_onfile_lede')}</p></div>
      <div className="t-card t-onfile"><Avatar name={P.name} photo={P.photo} size={96} />
        <div><h3 className="t-h3">{P.name}</h3><div className="t-role">{P.role}</div><p className="t-muted">{P.bio}</p>
          {!P.photo && <p className="t-small" style={{ marginTop: 10 }}><span className="t-pill warn">No headshot on file</span> Your initials show until you add one.</p>}</div></div>
      {err && <p className="t-error">{err}</p>}
      <div className="t-actions">
        <button className="btn btn-primary" disabled={busy || !P.name} onClick={() => save(true)}>{busy ? 'Saving…' : 'This is still right'}</button>
        <button className="btn btn-ghost" onClick={() => set({ updating: true })}>Update my bio or photo</button>
      </div>
    </div>
  );

  const ok = P.name.trim() && w >= 60 && w <= 100 && P.photo;
  return (
    <div className="t-stack">
      <div><span className="eyebrow">Bio & headshot</span><h1 className="t-h1">{data.onFile ? 'Update your profile' : t('profile_title')}</h1>
        <p className="t-lede">{t('profile_lede')}</p></div>
      {nameField}
      <div className="t-card t-shot">
        <Avatar name={P.name} photo={P.photo} />
        <div className="t-stack" style={{ gap: 10 }}>
          <button type="button" className={`t-drop ${over ? 'over' : ''}`} onClick={() => fileRef.current?.click()}
            onDragOver={e => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
            onDrop={e => { e.preventDefault(); setOver(false); pick(e.dataTransfer.files[0]); }}>
            <b>{P.photo ? 'Replace headshot' : 'Add a headshot'}</b>
            <span className="t-small t-muted">{t('profile_photo_hint')}</span>
          </button>
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={e => pick(e.target.files[0])} />
          {photoMsg && <div className="t-small t-muted">{photoMsg}</div>}
        </div>
      </div>
      <div className="t-field"><label htmlFor="t-bio">Short bio</label>
        <span className="hint">{t('profile_bio_hint')}</span>
        <textarea id="t-bio" rows={6} value={P.bio} onChange={e => set({ bio: e.target.value })} />
        <span className={`t-count ${w === 0 ? '' : w < 60 || w > 100 ? 'bad' : 'good'}`}>{w} words{w && w < 60 ? ' · a little more, please' : ''}{w > 100 ? ' · please trim to 100' : ''}</span>
      </div>
      {err && <p className="t-error">{err}</p>}
      <div className="t-actions">
        <button className="btn btn-primary" disabled={!ok || busy} onClick={() => save(false)}>{busy ? 'Saving…' : 'Save and continue'}</button>
        {data.onFile && <button className="btn t-link" onClick={() => setProfile(p => ({ ...p, updating: false, bio: data.onFile.bio, photo: data.onFile.photo_url }))}>Keep what’s on file</button>}
        {!ok && <span className="t-small t-muted">{!P.name.trim() ? 'Add your name. ' : ''}{!P.photo ? 'Add a headshot. ' : ''}{w >= 60 && w <= 100 ? '' : 'Bio should be 60–100 words.'}</span>}
      </div>
    </div>
  );
}

function Field({ id, label, hint, children }) {
  return <div className="t-field"><label htmlFor={id}>{label}</label>{hint && <span className="hint">{hint}</span>}{children}</div>;
}

function Course({ o, page, setPage, as, next, say }) {
  const t = useT();
  const [err, setErr] = useState(''), [busy, setBusy] = useState(false), [up, setUp] = useState('');
  const fileRef = useRef(null);
  const needsReadings = has(o, 'readings'), needsPromo = has(o, 'promo'), clip = hasClip(o);
  const bind = k => ({ id: `c-${k}`, value: page[k], onChange: e => setPage({ [k]: e.target.value }) });
  const multi = o.sessions.length > 1;

  const addReading = async file => {
    if (!file) return;
    setUp('Uploading…');
    try {
      const blob = await upload(`readings/${o.key}/${file.name}`, file, { access: 'public', handleUploadUrl: '/api/teach/upload' });
      setPage({ readings: [page.readings, `${file.name}: ${blob.url}`].filter(Boolean).join('\n') }); setUp('');
    } catch (e) { setUp(`Upload didn’t work: ${e.message}`); }
  };

  const saveDraft = async () => { try { await post('/api/teach/course', { as, offering: o.key, fields: page, submit: false }); say('Draft saved'); } catch (e) { setErr(e.message); } };
  const toPreview = async () => {
    setErr(''); const m = [];
    if (!page.title.trim()) m.push('a public title');
    if (!page.subtitle.trim()) m.push('a one-line subtitle');
    if (words(page.summary) < 25 || words(page.summary) > 90) m.push('a 2–3 sentence description');
    if (lines(page.explore).length < 3) m.push('at least three things students will explore');
    if (!page.audience.trim()) m.push('who it’s for');
    if (needsReadings && !page.readings_mode) m.push('how you’ll share readings');
    if (needsReadings && page.readings_mode === 'all' && !page.readings.trim()) m.push('your readings');
    if (needsPromo && [page.promo_1, page.promo_2, page.promo_3].some(x => words(x) < 30)) m.push('three promotional email blurbs (30+ words each)');
    if (m.length) { setErr(`Still needed: ${m.join(', ')}.`); return; }
    setBusy(true); await saveDraft().catch(() => {}); setBusy(false); next();
  };

  return (
    <div className="t-stack">
      <div><span className="eyebrow">Your offering</span><h1 className="t-h1">{t('course_title')}</h1>
        <p className="t-lede">{t('course_lede', { emails: needsPromo ? '' : ' and the description in our emails' })}</p></div>
      <div className="t-card t-slim"><span className="t-small t-muted">From the calendar:</span> <b>{programOf(o)}</b> · {multi ? `${o.sessions.length} sessions, ${dateRange(o)}` : long(o.start)}{o.time ? ` · ${o.time}` : ''}{o.price ? ` · ${o.price}` : ''}
        <br /><span className="t-small t-muted">Dates, times and price are set by the EP team. Reply to any of our emails if something looks wrong.</span></div>
      <Field id="c-title" label="Public title" hint={t('course_title_hint')}><input type="text" {...bind('title')} placeholder={o.title} /></Field>
      <Field id="c-subtitle" label="One-line subtitle"><input type="text" {...bind('subtitle')} /></Field>
      <Field id="c-summary" label="Description (2–3 sentences)" hint={t('course_summary_hint')}>
        <textarea {...bind('summary')} /><span className="t-count">{words(page.summary)} words</span></Field>
      <div className="t-grid2">
        <Field id="c-explore" label="What we’ll explore" hint={t('course_explore_hint')}><textarea {...bind('explore')} /></Field>
        <Field id="c-audience" label="Who it’s for" hint={t('course_audience_hint')}><textarea {...bind('audience')} /></Field>
      </div>

      {needsReadings && (
        <fieldset className="t-card t-fieldset">
          <legend className="t-h3">Readings</legend>
          <p className="t-small t-muted">{t('readings_intro', { when: multi ? 'each session' : 'the course' })}</p>
          <div className="t-radios">
            {[['all', multi ? 'I’ll share all readings now' : 'I’ll share the readings now'], ['weekly', multi ? 'I’ll send them a week before each session' : 'I’ll send them a week before'], ['none', 'There are no readings']].map(([v, l]) => (
              <label key={v}><input type="radio" name={`rm-${o.key}`} checked={page.readings_mode === v} onChange={() => setPage({ readings_mode: v })} /> {l}</label>
            ))}
          </div>
          {page.readings_mode === 'all' && (<>
            <Field id="c-readings" label={multi ? 'Readings for every session' : 'Readings'} hint={multi ? 'Links or uploaded files, grouped by session (e.g. “Session 1: …”).' : 'Links or uploaded files, one per line.'}><textarea {...bind('readings')} /></Field>
            <div className="t-row"><button type="button" className="btn btn-ghost" onClick={() => fileRef.current?.click()}>Upload a file</button><span className="t-small t-muted">{up || 'PDF, Word, image or audio.'}</span></div>
            <input ref={fileRef} type="file" hidden onChange={e => addReading(e.target.files[0])} />
          </>)}
        </fieldset>
      )}

      {needsPromo && (
        <fieldset className="t-card t-fieldset">
          <legend className="t-h3">Three promotional emails</legend>
          <p className="t-small t-muted">{t('promo_intro')}</p>
          {[1, 2, 3].map(n => [t(`promo_${n}_label`), t(`promo_${n}_hint`)]).map(([l, h], i) => (
            <Field key={i} id={`c-promo_${i + 1}`} label={l} hint={h}><textarea {...bind(`promo_${i + 1}`)} /><span className="t-count">{words(page[`promo_${i + 1}`])} words</span></Field>
          ))}
        </fieldset>
      )}

      {clip && <Field id="c-promo_clip" label="Promo video link" hint={t('clip_hint')}><input type="url" placeholder="https://" {...bind('promo_clip')} /></Field>}

      {err && <p className="t-error">{err}</p>}
      <div className="t-actions"><button className="btn btn-primary" disabled={busy} onClick={toPreview}>Preview my page</button><button className="btn t-link" onClick={saveDraft}>Save draft</button></div>
    </div>
  );
}

export function CoursePageView({ o, page, profile, cta }) {
  const list = lines(page.explore);
  return (
    <div className="t-lp">
      <div className="t-lp-hero">
        <span className="eyebrow">{programOf(o)} · Live online</span>
        <h2>{page.title || o.title}</h2>
        {page.subtitle && <p className="sub">{page.subtitle}</p>}
        <div className="t-lp-meta"><b>{o.end && o.end !== o.start ? `${fmt(o.start, { month: 'long', day: 'numeric' })} – ${fmt(o.end, { month: 'long', day: 'numeric' })}` : long(o.start)}</b>{o.time && <span>{o.time}</span>}{o.price && <span>{o.price}</span>}<span>With {(profile.others || [profile]).map(p => p.name).join(' & ')}</span></div>
        {cta ? <a className="btn btn-primary" href={cta}>{o.program === 'wisdom' ? 'Join →' : 'Enroll →'}</a> : <span className="btn btn-primary" aria-disabled="true">{o.program === 'wisdom' ? 'Join →' : 'Enroll →'}</span>}
      </div>
      <div className="t-lp-body">
        <div className="t-stack" style={{ gap: 20 }}>
          <div><h4>About</h4><p>{page.summary}</p></div>
          {list.length > 0 && <div><h4>What we’ll explore</h4><ul>{list.map(x => <li key={x}>{x}</li>)}</ul></div>}
          {page.audience && <div><h4>Who it’s for</h4><p>{page.audience}</p></div>}
          {o.sessions.length > 1 && <div><h4>Sessions</h4><ul>{o.sessions.map(s => <li key={s.id}>{long(s.date)}{s.time ? `, ${s.time}` : ''}</li>)}</ul></div>}
        </div>
        <aside className="t-stack" style={{ gap: 16, alignSelf: 'start' }}>{(profile.others || [profile]).map(p => (
          <div key={p.name} className="t-lp-teacher"><Avatar name={p.name} photo={p.photo} size={64} /><h5>{p.name}</h5><div className="t-role">{p.role}</div><p className="t-small t-muted">{p.bio}</p></div>))}</aside>
      </div>
    </div>
  );
}

function Preview({ o, page, profile, as, say, onApproved, onEdit }) {
  const t = useT();
  const [busy, setBusy] = useState(false), [err, setErr] = useState('');
  const approve = async () => {
    if (page.submitted) { onApproved(); return; }
    setBusy(true); setErr('');
    try { await post('/api/teach/course', { as, offering: o.key, fields: page, submit: true }); say('Sent to the EP team for review'); onApproved(); }
    catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  return (
    <div className="t-stack">
      <div><span className="eyebrow">Course page</span><h1 className="t-h1">{t('preview_title')}</h1>
        <p className="t-lede">{t('preview_lede')}</p></div>
      <div className="t-browser"><div className="bar"><i /><i /><i /><span>embodiedphilosophy.com/courses/…</span></div>
        <CoursePageView o={o} page={page} profile={profile} /></div>
      {err && <p className="t-error">{err}</p>}
      <div className="t-actions"><button className="btn btn-primary" disabled={busy} onClick={approve}>{busy ? 'Sending…' : page.submitted ? 'Continue' : 'This looks right'}</button><button className="btn btn-ghost" onClick={onEdit}>Make changes</button></div>
    </div>
  );
}

function Circle({ data, pages, as, next }) {
  const t = useT();
  const offerings = data.offerings.filter(o => o.circle);
  const [state, setState] = useState({});
  const run = async o => {
    setState(s => ({ ...s, [o.key]: { busy: true } }));
    try { const j = await post('/api/teach/circle', { as, offering: o.key }); setState(s => ({ ...s, [o.key]: { steps: j.steps || [] } })); }
    catch (e) { setState(s => ({ ...s, [o.key]: { error: e.message } })); }
  };
  useEffect(() => { (async () => { for (const o of offerings) await run(o); })(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const done = offerings.every(o => state[o.key] && !state[o.key].busy);
  const host = offerings[0]?.course_host || 'your course host';
  return (
    <div className="t-stack">
      <div><span className="eyebrow">Circle teaching space</span><h1 className="t-h1">{t('circle_title')}</h1>
        <p className="t-lede">{t('circle_lede')}</p></div>
      {offerings.map(o => {
        const st = state[o.key] || { busy: true };
        return (
          <div key={o.key} className="t-card"><h3 className="t-h3">{pages[o.key]?.title || o.title}</h3>
            {st.busy && <p className="t-muted t-small">Setting up your access…</p>}
            {st.error && <p className="t-error">{st.error}</p>}
            {st.steps && <ul className="t-checks">{st.steps.map(s => <li key={s.step} className={s.ok ? 'on' : ''}><span className="tick">{s.ok ? '✓' : '·'}</span><span>{s.note}</span></li>)}</ul>}
          </div>
        );
      })}
      {done && <p className="t-small">If Circle sent you an invitation, accept it to set your password, then sign in at <b>{data.circleHost}</b>.</p>}
      <h2 className="t-h2">How to teach in Circle</h2>
      <div className="t-guide">
        {[1, 2, 3, 4].map(n => <div key={n} className="t-card"><div className="when">{t(`circle_${n}_when`)}</div><h3 className="t-h3">{t(`circle_${n}_title`)}</h3><p className="t-small t-muted">{t(`circle_${n}_body`, { host })}</p></div>)}
      </div>
      <div className="t-actions"><button className="btn btn-primary" onClick={next}>Continue</button></div>
    </div>
  );
}

const TOUR = [['Past due', 'tour_1', 'late'], ['This week', 'tour_2', 'week'], ['Coming up', 'tour_3', 'up'], ['Teaching & meetings', 'tour_4', 'meet'], ['Recently done', 'tour_5', 'done']];
function Dashboard({ data, first, pages, next }) {
  const T = useT();
  const [i, setI] = useState(0);
  const t = data.tasks, lit = z => (TOUR[i][2] === z ? 'lit' : '');
  const List = ({ items, done }) => items.length ? <ul className="t-mtasks">{items.slice(0, 5).map(x => <li key={x.id} className={done ? 'is-done' : ''}><span className="n">{x.name}</span><span className="m">{fmt(x.due)}</span></li>)}</ul> : <p className="t-small t-muted">Nothing here.</p>;
  const o = data.offerings[0];
  return (
    <div className="t-stack">
      <div><span className="eyebrow">Your dashboard</span><h1 className="t-h1">{T('dash_title')}</h1>
        <p className="t-lede">{T('dash_lede')}</p></div>
      <div className="t-tour"><div className="num">{i + 1}</div><div><h3>{TOUR[i][0]}</h3><p>{T(TOUR[i][1])}</p>
        <div className="t-row" style={{ marginTop: 12 }}>{i > 0 && <button className="btn btn-outline-light" onClick={() => setI(i - 1)}>Back</button>}{i < TOUR.length - 1 ? <button className="btn btn-primary" onClick={() => setI(i + 1)}>Next</button> : <span className="t-small">That’s the tour.</span>}<span className="t-small" style={{ opacity: .7 }}>{i + 1} of {TOUR.length}</span></div></div></div>
      <div className="t-mock" aria-label="Your dashboard">
        <div className="mhead"><span>Embodied Philosophy</span><span>Sign out</span></div>
        <h4>Hello, {first}</h4>
        <div className="t-mgrid">
          <div>
            <div className={`t-zone late ${lit('late')}`}><h5>Past due <small>{t.pastDue.length}</small></h5><List items={t.pastDue} /></div>
            <div className={`t-zone ${lit('week')}`}><h5>This week <small>{t.thisWeek.length}</small></h5><List items={t.thisWeek} /></div>
            <div className={`t-zone ${lit('up')}`}><h5>Coming up</h5><List items={t.upcoming} /></div>
            <div className={`t-zone ${lit('done')}`}><h5>Recently done</h5><List items={t.done} done /></div>
          </div>
          <div className={`t-zone ${lit('meet')}`}><h5>Teaching & meetings</h5>
            {o ? <div className="t-mmeet"><div className="t-small t-muted">{long(o.start)}{o.time ? ` · ${o.time}` : ''}</div><div className="t">{pages[o.key]?.title || o.title}</div><div className="t-small t-muted">Zoom link shows here</div></div> : <p className="t-small t-muted">No sessions yet.</p>}
            <p className="t-small t-muted" style={{ marginTop: 8 }}>Sessions appear here three weeks ahead.</p></div>
        </div>
      </div>
      <div className="t-actions"><button className="btn btn-primary" onClick={next}>Continue</button></div>
    </div>
  );
}

function Emails({ data, pages, next }) {
  const t = useT();
  const [copied, setCopied] = useState('');
  const rows = [];
  const today = data.today;
  if (!data.onboarded) rows.push({ when: today, what: 'Welcome to the faculty', who: 'From us, when you finish here, with a link to your dashboard' });
  if (data.offerings.some(o => o.circle)) rows.push({ when: today, what: 'Invitation to join Circle', who: 'From Circle, if you’re not a member yet' });
  for (const o of data.offerings) {
    const t = pages[o.key]?.title || o.title;
    const slides = o.deliverables.some(d => d.kind === 'slides');
    for (const s of o.sessions.slice(0, 2)) {
      const label = o.sessions.length > 1 ? `${t} (${fmt(s.date)})` : t;
      if (addDays(s.date, -7) >= today) rows.push({ when: addDays(s.date, -7), what: `One week to go: ${label}`, who: 'With your Zoom link and anything still to send' });
      if (addDays(s.date, -1) >= today) rows.push({ when: addDays(s.date, -1), what: `Tomorrow: ${label}`, who: 'With your Zoom link' });
      rows.push({ when: s.date, what: `Today: ${label}`, who: 'The morning of, with your Zoom link', event: true });
      if (slides) rows.push({ when: addDays(s.end_date || s.date, 1), what: `Slides request: ${label}`, who: 'The day after: reply with your slides as a PDF, if you used any' });
    }
    if (o.sessions.length > 2) rows.push({ when: o.sessions[2].date, what: `…and the same for each of the other ${o.sessions.length - 2} sessions`, who: '' });
  }
  rows.sort((a, b) => a.when.localeCompare(b.when));
  const addr = 'team@embodiedphilosophy.com';
  const copy = () => { navigator.clipboard?.writeText(addr).then(() => setCopied('Copied'), () => setCopied('Select it and copy')); };
  return (
    <div className="t-stack">
      <div><span className="eyebrow">Emails to expect</span><h1 className="t-h1">{t('emails_title')}</h1>
        <p className="t-lede">{t('emails_lede')}</p></div>
      <div className="t-card"><ol className="t-timeline">{rows.map((r, i) => (
        <li key={i} className={r.event ? 'event' : ''}><span className="when">{r.when === today ? 'Today' : fmt(r.when, { month: 'short', day: 'numeric' })}</span><span className="node" /><div><div className="what">{r.what}</div>{r.who && <div className="t-small t-muted">{r.who}</div>}</div></li>
      ))}</ol></div>
      <div className="t-card"><h3 className="t-h3">Make sure they reach you</h3><p className="t-small t-muted" style={{ marginBottom: 10 }}>{t('emails_contacts')}</p>
        <div className="t-row"><code className="t-code">{addr}</code><button className="btn btn-ghost" onClick={copy}>Copy</button><span className="t-small t-muted">{copied}</span></div></div>
      <div className="t-actions"><button className="btn btn-primary" onClick={next}>Continue</button></div>
    </div>
  );
}

function Done({ data, first, profile, pages, agreement, as, steps, go }) {
  const t = useT();
  const [state, setState] = useState(data.onboarded ? 'done' : 'idle'), [err, setErr] = useState('');
  const finish = async () => { setState('busy'); try { await post('/api/teach/finish', { as }); setState('done'); } catch (e) { setErr(e.message); setState('idle'); } };
  useEffect(() => { if (state === 'idle' && profile.saved) finish(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const profileIdx = steps.findIndex(s => s.key === 'profile');
  return (
    <div className="t-stack">
      <div><span className="eyebrow">All set</span><h1 className="t-h1">{t('done_title', { first })}</h1>
        <p className="t-lede">{t('done_lede')}</p></div>
      <div className="t-card"><ul className="t-checks">
        {data.agreement?.status === 'needed' && <li className={agreement.status === 'signed' ? 'on' : ''}><span className="tick">{agreement.status === 'signed' ? '✓' : ''}</span><span><b>Teaching agreement</b> · <span className="t-muted">{agreement.status === 'signed' ? 'Signed and countersigned' : 'Not signed yet'}</span></span></li>}
        <li className={profile.saved ? 'on' : ''}><span className="tick">{profile.saved ? '✓' : ''}</span><span><b>Bio & headshot</b> · <span className="t-muted">{profile.saved ? 'Saved' : 'Not saved yet'}</span></span></li>
        {data.offerings.map(o => <li key={o.key} className={pages[o.key]?.submitted ? 'on' : ''}><span className="tick">{pages[o.key]?.submitted ? '✓' : ''}</span><span><b>{pages[o.key]?.title || o.title}</b> · <span className="t-muted">{pages[o.key]?.submitted ? 'Course page sent for review' : 'Course page not sent yet'}</span></span></li>)}
        {data.offerings.length > 0 && <li className="on"><span className="tick">✓</span><span><b>Reminders</b> · <span className="t-muted">First one {addDays(data.offerings[0].start, -7) >= data.today ? `arrives ${fmt(addDays(data.offerings[0].start, -7), { month: 'long', day: 'numeric' })}` : 'is on its way'}</span></span></li>}
      </ul></div>
      {err && <p className="t-error">{err}</p>}
      <div className="t-row"><a className="btn btn-primary" href={data.actingAs ? '/teach' : '/ops?skip=1'}>{data.actingAs ? 'Back to the teacher list' : 'Open your dashboard'}</a>
        <button className="btn t-link" onClick={() => go(profileIdx)}>Update my bio or photo</button></div>
    </div>
  );
}
