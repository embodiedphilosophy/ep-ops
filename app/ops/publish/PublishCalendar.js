'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { colourOf } from '@/lib/ops/emailprograms';
import { useView } from '../content/SocialEngine';
import { categoryFor, dayState, rhythmWarnings, DEFAULT_RULES } from '@/lib/ops/socialrules';
import SocialCalendar from '../social/SocialCalendar';
import { EmailCalendar } from '../email/EmailCalendar';

// Publish › Calendar (EP Ops 2, step 6): email, social, video cuts and the automatic reminders on one calendar.
// It only READS what the old calendars already read (the email plan and Kit, the Weekly Plan, the reminder rules' next sends, the YouTube
// cuts) and lays it on one grid. Choosing Social or Email opens that kind's full calendar (drag to move, day categories, the grid and feed
// views) exactly as before; the kind chips are links, so a filtered calendar can be bookmarked.

const iso = d => d.toISOString().slice(0, 10);
const at = s => new Date(s + 'T12:00:00Z');
const add = (s, n) => { const d = at(s); d.setUTCDate(d.getUTCDate() + n); return iso(d); };
const mondayOf = s => add(s, -((at(s).getUTCDay() + 6) % 7));
const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
const long = s => at(s).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
const nyDate = isoStr => isoStr ? new Date(isoStr).toLocaleDateString('en-CA', { timeZone: 'America/New_York' }) : '';
const nyTime = isoStr => isoStr ? new Date(isoStr).toLocaleTimeString('en-GB', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }) : '';
const hhmm = t => { const m = String(t || '').match(/^(\d{1,2}):(\d{2})/); return m ? `${m[1].padStart(2, '0')}:${m[2]}` : ''; };

export const KINDS = [['all', 'All'], ['email', 'Email'], ['social', 'Social'], ['video', 'Video'], ['auto', 'Automatic']];
const LABEL = { email: 'Email', social: 'Social', video: 'Video', auto: 'Automatic' };

function range(layout, cursor) {
  if (layout === 'week') { const m = mondayOf(cursor); return [m, add(m, 6)]; }
  const first = cursor.slice(0, 8) + '01', last = iso(new Date(Date.UTC(+cursor.slice(0, 4), +cursor.slice(5, 7), 0, 12)));
  return layout === 'list' ? [first, last] : [mondayOf(first), add(mondayOf(last), 6)];
}
const getJson = async url => { const res = await fetch(url).catch(() => null), j = await res?.json().catch(() => ({})) || {}; return res?.ok ? j : { error: j.error || 'Couldn’t read this' }; };

// What a video cut puts on the calendar: when it goes (or went) to YouTube, else nothing (it waits under "No date yet")
const videoItems = videos => (videos || []).map(c => {
  const when = c.status === 'published' ? c.published_at : c.publish_at;
  return { key: 'v' + c.id, kind: 'video', date: nyDate(when), time: nyTime(when), title: c.yt_title || c.source_title || 'YouTube cut',
    status: c.status === 'published' ? 'On YouTube' : c.status === 'review' ? 'In review' : c.status === 'publishing' ? 'Uploading' : 'Being cut', href: `/ops/publish?view=compose&kind=video&id=${encodeURIComponent(c.id)}` };
});

export default function PublishCalendar({ show = 'all', videos = null, socialProps = null, canVideo = false, initialLayout = 'month' }) {
  const kinds = KINDS.filter(([k]) => k !== 'video' || canVideo);
  const kind = kinds.some(([k]) => k === show) ? show : 'all';
  // One read of the Weekly Plan, shared by the merged grid and the full Social calendar
  const plan = useView('plan');
  const [layout, setLayout] = useState(['month', 'week', 'list'].includes(initialLayout) ? initialLayout : 'month');
  const [cursor, setCursor] = useState(today());
  const [mail, setMail] = useState(null), [rem, setRem] = useState(null);
  const [overlay, setOverlay] = useState(true);
  const [from, to] = range(layout, cursor);
  const merged = kind !== 'social' && kind !== 'email';

  // Email, programming and Kit's automatic emails come from the one email calendar read; the reminder rules' next sends from the reminders read
  const load = useCallback(async () => { setMail(await getJson(`/api/ops/email/plan?what=calendar&from=${from}&to=${to}`)); }, [from, to]);
  useEffect(() => { if (merged) { setMail(null); load(); } }, [merged, load]);
  useEffect(() => { if (merged && rem === null) getJson('/api/ops/email/reminders').then(setRem); }, [merged, rem]);

  const step = n => setCursor(c => layout === 'week' ? add(c, 7 * n) : iso(new Date(Date.UTC(+c.slice(0, 4), +c.slice(5, 7) - 1 + n, 1, 12))));
  const posts = useMemo(() => plan[0] && !plan[0].error ? [...plan[0].rows, ...(plan[0].past || [])].filter((r, i, a) => a.findIndex(x => x.row === r.row) === i).map(r => ({ ...r.values, status: r.display_status || r.values.status, _row: r.row })) : [], [plan[0]]);

  const items = useMemo(() => {
    const out = [];
    for (const i of mail?.items || []) {
      if (i.kind === 'auto') out.push({ key: i.key, kind: 'auto', date: i.date, title: i.title, status: i.status, sub: 'Sent by Kit on its own', href: '/ops/publish?view=email' });
      else out.push({ key: i.key, kind: 'email', date: i.date, title: i.title, status: i.status, program: i.program, conflict: i.conflict, sub: i.audience,
        href: i.kind === 'plan' ? `/ops/publish?view=compose&kind=email&id=${i.id}` : '/ops/publish?view=email' });
    }
    for (const u of rem?.upcoming || []) {
      if (!u.send_at || u.state === 'skip') continue;
      const d = nyDate(u.send_at); if (!d) continue;
      out.push({ key: `r${u.key || u.event?.id}${u.send_at}`, kind: 'auto', date: d, time: nyTime(u.send_at), title: `${u.rule?.name || 'Reminder'} · ${u.event?.title || ''}`.trim(), status: u.state === 'made' || u.state === 'exists' ? 'Made' : 'Will be made', sub: 'Reminder rule', href: '/ops/publish?view=reminders' });
    }
    for (const p of posts) if (p.publish_date && p.status !== 'Deleted') out.push({ key: 's' + p._row, kind: 'social', date: p.publish_date, time: hhmm(p.publish_time_ET), title: String(p.caption || '').split('\n').find(Boolean) || (p.media_kind === 'story' ? 'Story frame' : 'No caption yet'), status: p.status, sub: p.pillar || '', href: `/ops/publish?view=compose&row=${p._row}` });
    out.push(...videoItems(videos).filter(v => v.date));
    return out.filter(i => i.date >= from && i.date <= to && (kind === 'all' || i.kind === kind))
      .sort((a, b) => (a.date + (a.time || '99')).localeCompare(b.date + (b.time || '99')));
  }, [mail, rem, posts, videos, from, to, kind]);
  const undated = kind === 'all' || kind === 'video' ? videoItems(videos).filter(v => !v.date) : [];
  const counts = useMemo(() => {
    const c = { all: 0, email: 0, social: 0, video: 0, auto: 0 };
    for (const i of [...(mail?.items || []).map(x => ({ kind: x.kind === 'auto' ? 'auto' : 'email', date: x.date })), ...(rem?.upcoming || []).filter(u => u.send_at && u.state !== 'skip').map(u => ({ kind: 'auto', date: nyDate(u.send_at) })),
      ...posts.filter(p => p.status !== 'Deleted').map(p => ({ kind: 'social', date: p.publish_date })), ...videoItems(videos)]) { if (i.date >= from && i.date <= to) { c[i.kind]++; c.all++; } }
    return c;
  }, [mail, rem, posts, videos, from, to]);

  const t = today();
  const days = []; for (let x = from; x <= to; x = add(x, 1)) days.push(x);
  const month = cursor.slice(0, 7);
  const title = layout === 'week' ? `${long(from)} – ${long(to)}` : at(cursor).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  const href = k => `/ops/publish${k === 'all' ? '' : `?show=${k}`}`;

  // "Checks across channels": what the old calendars already flagged, in one place (email's same-day and nothing-planned warnings, the
  // social rhythm rule, and weekdays whose standing post category isn't filled). Nothing here is new logic.
  const checks = useMemo(() => {
    const out = [];
    for (const w of mail?.warnings || []) out.push({ date: w.date, text: w.text });
    const d = plan[0];
    if (d && !d.error) {
      const live = posts.filter(p => p.status !== 'Deleted' && p.status !== 'Draft');
      for (const w of rhythmWarnings(live.filter(p => p.publish_date >= t), { ...DEFAULT_RULES, ...(d.rules || {}) }).slice(0, 2)) out.push({ date: '', text: w.text });
      for (const day of days.filter(x => x >= t && x <= add(t, 13))) {
        const cat = categoryFor(day, d.dayCategories || []), ps = live.filter(p => p.publish_date === day);
        if (cat && dayState({ date: day, today: t, posts: ps, category: cat, blockedOf: () => false }).state === 'not-filled') out.push({ date: day, text: `${cat} slot is empty` });
      }
    }
    return out.sort((a, b) => (a.date || '9').localeCompare(b.date || '9')).slice(0, 8);
  }, [mail, plan[0], posts, days.join(), t]);

  const chip = i => {
    const [bg, fg] = i.kind === 'email' ? colourOf(i.program || '') : [null, null];
    return <a key={i.key} className={`pub-it k-${i.kind}${i.conflict ? ' conflict' : ''}`} style={bg ? { background: bg, color: fg } : undefined} href={i.href} title={`${LABEL[i.kind]} · ${i.title} · ${i.status}${i.sub ? ' · ' + i.sub : ''}`}>
      <span className="k">{LABEL[i.kind]}{i.time ? ` · ${i.time}` : ''}</span><span className="t">{i.title}</span><span className="s">{i.status}</span></a>;
  };

  return (
    <div className="pub">
      <div className="pub-bar">
        <div className="pub-chips" role="group" aria-label="Show">
          <span className="pub-cap">Show</span>
          {kinds.map(([k, l]) => <a key={k} className="pub-chip" href={href(k)} aria-current={kind === k ? 'page' : undefined}>{l}{merged && counts[k] ? <span className="n mono">{counts[k]}</span> : null}</a>)}
        </div>
        <span className="pub-new">
          <a className="soc-btn small" href="/ops/publish?view=review">Review &amp; approve</a>
          <details className="pub-menu"><summary className="soc-btn primary">New…</summary>
            <div role="menu"><a role="menuitem" href="/ops/publish?view=compose&kind=email">New email</a><a role="menuitem" href="/ops/publish?view=compose&kind=post">New post</a>{canVideo && <a role="menuitem" href="/ops/publish?view=compose&kind=video">Video cut</a>}</div></details>
        </span>
      </div>

      {kind === 'social' && socialProps && <SocialCalendar {...socialProps} plan={plan} />}
      {kind === 'email' && <EmailCalendar embedded />}

      {merged && <>
        <div className="soc-act pub-nav">
          <button className="soc-btn small" onClick={() => step(-1)} aria-label="Earlier">←</button><b className="mono">{title}</b><button className="soc-btn small" onClick={() => step(1)} aria-label="Later">→</button>
          <button className="soc-btn small" onClick={() => setCursor(today())}>Today</button>
          <span className="pub-seg" role="group" aria-label="View">{['month', 'week', 'list'].map(v => <button key={v} className={`soc-btn small${layout === v ? ' primary' : ''}`} aria-pressed={layout === v} onClick={() => setLayout(v)}>{v[0].toUpperCase() + v.slice(1)}</button>)}</span>
          <label className="pub-ov"><input type="checkbox" checked={overlay} onChange={e => setOverlay(e.target.checked)} /> Programming overlay</label>
        </div>
        {mail?.error && <p className="em-banner bad" role="status">{mail.error}</p>}
        {plan[0]?.error && <p className="em-banner bad" role="status">{plan[0].error}</p>}
        {!mail ? <p className="ops-empty">Reading Kit, the email plan and the social plan…</p> : layout === 'list' ? (
          <section className="soc-panel" aria-label="List">
            {!items.length ? <p className="ops-empty">Nothing is planned this month.</p> : <ul className="pub-list">{items.map(i => <li key={i.key}><span className="mono meta">{long(i.date)}</span>{chip(i)}</li>)}</ul>}
          </section>
        ) : (
          <div className="pub-scroll"><div className={`pub-grid ${layout}`} role="grid" aria-label="Publish calendar">
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(x => <span key={x} className="dow" aria-hidden="true">{x}</span>)}
            {days.map(d => (
              <div key={d} className={`pub-cell${layout === 'month' && d.slice(0, 7) !== month ? ' dim' : ''}${d === t ? ' today' : ''}`} aria-label={long(d)}>
                <div className="dn"><span className="mono">{at(d).getUTCDate()}{layout === 'week' ? ` ${long(d).split(' ')[0]}` : ''}</span></div>
                {overlay && (mail?.events || []).filter(e => e.date === d).map(e => <span key={e.id} className="pub-ev" style={{ borderLeftColor: colourOf(e.program)[0] }} title={e.title}>{e.title}</span>)}
                {items.filter(i => i.date === d).map(chip)}
              </div>))}
          </div></div>)}
        {undated.length > 0 && <section className="soc-panel" aria-label="No date yet"><div className="ph"><h2>No date yet</h2><span className="sub">YouTube cuts waiting for a release date.</span></div><ul className="pub-list">{undated.map(i => <li key={i.key}>{chip(i)}</li>)}</ul></section>}
        {kind === 'video' && <p className="ops-note">Proposals, the review queue and what has gone out are on <a href="/ops/publish?view=video">Video</a>. A cut opens in Compose to edit it.</p>}
        {kind === 'auto' && <p className="ops-note">Kit sends these on its own. The reminder rules are in <a href="/ops/settings?view=reminders">Settings</a>; every coming send is on <a href="/ops/publish?view=reminders">Reminder sends</a>.</p>}
        {kind === 'all' && checks.length > 0 && <section className="soc-panel pub-checks" aria-label="Checks across channels"><div className="ph"><h2>Checks across channels</h2></div>
          <ul className="pub-list">{checks.map((c, i) => <li key={i}>{c.date ? <span className="mono meta">{long(c.date)}</span> : null}<span>{c.text}</span></li>)}</ul></section>}
        <p className="pub-key" aria-label="Key">{Object.entries(LABEL).filter(([k]) => k !== 'video' || canVideo).map(([k, l]) => <span key={k} className={`k-${k}`}><i />{l}</span>)}</p>
      </>}
    </div>);
}
