'use client';
import { useState } from 'react';
import { useView, api, day, time, kindLabel } from '../content/SocialEngine';
import { POST_TYPES, isFeed, timeKey, readSlides } from '@/lib/ops/socialengine';
import { rhythmWarnings, weekAhead, isTextHeavy, DEFAULT_RULES, WEEKDAYS, categoryFor, dayState, STATE_LABEL, guardrails } from '@/lib/ops/socialrules';

const nyToday = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
const addD = (d, n) => { const x = new Date(d + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const monOf = d => addD(d, -((new Date(d + 'T12:00:00Z').getUTCDay() + 6) % 7));
const long = d => new Date(d + 'T12:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', timeZone: 'UTC' });
const short = d => new Date(d + 'T12:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const dow = d => new Date(d + 'T12:00:00Z').toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'UTC' });
const out = p => ['Posted', 'Manual'].includes(p.status);
const PILLARS = [['Content', '#20302A'], ['Practice', '#B98A3E'], ['Marketing', '#A5432A']];
const dotOf = p => (PILLARS.find(([n]) => n.toLowerCase() === String(p.content_pillar || p.pillar || '').toLowerCase()) || [0, isTextHeavy(p) ? '#20302A' : '#B98A3E'])[1];
const title = p => String(p.caption || '').split('\n').find(Boolean) || (p.media_kind === 'story' ? 'Story frame' : 'No caption yet');
const VIEWS = [['week', 'Week'], ['month', 'Month'], ['list', 'List'], ['grid', 'Grid'], ['feed', 'Feed']];

// The Social calendar: "Week of 23 November at a glance" and everything that hangs off it (the design's Main screen).
export default function SocialCalendar({ cards, reviewCount, dateLine }) {
  const [data, reload] = useView('plan');
  const [mode, setMode] = useState('week');
  const [start, setStart] = useState(monOf(nyToday()));
  const [monthOf, setMonthOf] = useState(nyToday().slice(0, 7));
  const [editing, setEditing] = useState(false);
  const [scope, setScope] = useState('standing');
  const [msg, setMsg] = useState('');
  const [drag, setDrag] = useState(null);
  const t = nyToday();
  const posts = data && !data.error ? [...data.rows, ...(data.past || [])].filter((r, i, a) => a.findIndex(x => x.row === r.row) === i)
    .map(r => ({ ...r.values, status: r.display_status || r.values.status, _row: r.row, _thumb: r.thumb, _raw: r.values })) : [];
  const rules = { ...DEFAULT_RULES, ...(data?.rules || {}) };
  const cats = data?.dayCategories || [];
  const labels = new Set(data?.events || []);
  const blockedOf = p => guardrails(p._raw, { eventLabels: labels }).blocked.length > 0;
  const week = Array.from({ length: 7 }, (_, i) => addD(start, i));
  const live = posts.filter(p => p.status !== 'Deleted' && p.status !== 'Draft');
  const drafts = posts.filter(p => p.status === 'Draft');
  const wk = live.filter(p => p.publish_date >= start && p.publish_date <= addD(start, 6));
  const expired = posts.filter(p => p.status === 'Expired');
  const cell = d => { const ps = live.filter(p => p.publish_date === d).sort((a, b) => timeKey(a.publish_time_ET).localeCompare(timeKey(b.publish_time_ET))); const cat = categoryFor(d, cats); return { d, ps, cat, st: dayState({ date: d, today: t, posts: ps, category: cat, blockedOf }) }; };
  const cells = week.map(cell);
  const filled = cells.filter(c => c.cat && c.st.state.startsWith('filled')).length;
  const warn = rhythmWarnings(live.filter(p => p.publish_date >= t), rules);
  const nextMon = addD(monOf(t), 7), ahead = weekAhead(live, nextMon, 7);
  const perPillar = PILLARS.map(([n, c]) => [n, c, wk.filter(p => isFeed(p) && String(p.content_pillar || p.pillar || '').toLowerCase() === n.toLowerCase()).length]);
  const tagged = perPillar.reduce((s, x) => s + x[2], 0);
  const target = (String(rules.mix || '').match(/\d+/g) || [40, 30, 30]).map(Number);
  const feedDays = new Set(wk.filter(isFeed).map(p => p.publish_date)).size;
  const stories = wk.filter(p => !isFeed(p) || p.media_kind === 'story').length;
  const typesUsed = new Set(wk.map(p => p.pillar).filter(x => POST_TYPES.includes(x))).size;
  const unused = POST_TYPES.filter(x => !live.some(p => p.pillar === x));

  const step = n => mode === 'month' ? setMonthOf(addD(monthOf + '-15', n * 30).slice(0, 7)) : setStart(addD(start, 7 * n));
  const move = async (row, date) => {
    const p = posts.find(x => x._row === row);
    if (!p || p.publish_date === date) return;
    if (out(p)) return setMsg('A post that is already out can’t be moved.');
    if (date < t) return setMsg('Pick today or a day ahead.');
    const j = await api({ view: 'plan', row, changes: { publish_date: date, ...(p.status === 'Draft' ? { status: 'Proposed' } : {}) }, before: p._raw });
    setMsg(j.ok ? `Moved to ${long(date)}.` : j.error); reload();
  };
  const clear = async what => {
    const n = expired.length, list = expired.map(p => ({ row: p._row, before: p._raw }));
    const verb = { delete: 'Delete', skip: 'Archive', draft: 'Move to drafts' }[what];
    if (!confirm(`${verb} ${n} post${n === 1 ? '' : 's'} that weren’t approved in time?`)) return;
    const j = await api({ view: 'plan', [what]: list });
    setMsg(j.ok ? `${j.deleted ?? j.skipped ?? j.drafted} done.` : j.error); reload();
  };
  const setCat = async (weekday, category) => {
    const j = await api({ view: 'plan', dayCategory: { weekday, category, scope, week_of: start } });
    setMsg(j.ok ? `${weekday}: ${category || 'no category'}${scope === 'week' ? ' (this week only)' : ' (every week)'}.` : j.error); reload();
  };

  const card = p => (
    <a key={p._row} href={`/ops/social/compose?row=${p._row}`} className={`soc-post${p.status === 'Proposed' ? ' proposed' : ''}${p.status === 'Expired' ? ' expired' : ''}`}
      draggable={!out(p) && !!data?.canEdit} onDragStart={() => setDrag(p._row)} aria-label={`${time(p.publish_time_ET)} ${p.status}: ${title(p).slice(0, 60)}`}>
      <div className="th">{p._thumb ? <img src={p._thumb} alt="" loading="lazy" referrerPolicy="no-referrer" /> : <span>{title(p).slice(0, 40)}</span>}</div>
      <div className="m"><span className="mono">{time(p.publish_time_ET)} · {kindLabel(p) || (isFeed(p) ? 'Feed' : 'Story')}</span><span className="dot" style={{ background: dotOf(p) }} role="img" aria-label={p.pillar || 'no pillar'} /></div>
      <span className="ti">{title(p)}</span>
      {p.created_by && <span className="by">by {p.created_by.split(' ')[0]}</span>}
      <span className={`soc-badge ${String(p.status).replace(/\s/g, '')}`}>{p.status}</span>
      {blockedOf(p) && p.status === 'Proposed' && <span className="note">Needs its facts before it can be approved</span>}
    </a>
  );

  return (
    <div className="soc">
      <header className="soc-head">
        <div>
          <span className="eyebrow">Content · Social</span>
          <h1>{mode === 'month' ? new Date(monthOf + '-15T12:00:00Z').toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }) : <>Week of {long(start)} <em>at a glance</em></>}</h1>
          <p>{dateLine}</p>
        </div>
        <div className="soc-act">
          <div className="soc-seg" role="group" aria-label="Calendar view">{VIEWS.map(([k, l]) => <button key={k} type="button" aria-pressed={mode === k} onClick={() => setMode(k)}>{l}</button>)}</div>
          <a className="soc-btn" href="/ops/social/review">Review &amp; approve {reviewCount > 0 && <span className="n mono">{reviewCount}</span>}</a>
          {data?.canEdit && <a className="soc-btn primary" href="/ops/social/compose">New post</a>}
        </div>
      </header>

      <section className="soc-cards" aria-label="Status">
        {cards.map(c => <a key={c.label} className={`soc-card${c.alert ? ' alert' : ''}`} href={c.href}><span className="cap">{c.label}</span><b>{c.title}</b><span className={c.late ? 'late' : ''}>{c.sub}</span></a>)}
      </section>

      {!data ? <p className="ops-empty">Loading the calendar…</p> : data.error ? <p className="ops-empty">{data.error}</p> : <>
        <section className="soc-balance" aria-label="Week balance">
          <div className="bar">
            <div className="top"><b>Pillar balance · feed</b><span>target {target.join(' / ')}</span></div>
            {tagged ? <>
              <div className="track">{perPillar.map(([n, c, k]) => <div key={n} style={{ width: `${100 * k / tagged}%`, background: c }} />)}</div>
              <div className="key">{perPillar.map(([n, c, k], i) => { const pc = Math.round(100 * k / tagged), dv = pc - (target[i] ?? 0); return <span key={n}><i style={{ background: c }} />{n} {k} · <span className="mono">{pc}%</span> {Math.abs(dv) >= 10 && <span style={{ color: '#83341F' }}>{dv > 0 ? '+' : '−'}{Math.abs(dv)}</span>}</span>; })}</div>
            </> : <span className="sub" style={{ fontSize: 12, color: '#5A5346' }}>Shows once this week’s feed posts are tagged Content, Practice or Marketing.</span>}
          </div>
          <div className="stats">
            <div className="stat"><span className="v">{feedDays}<small>/7</small></span><span>days with a feed post · daily</span></div>
            <div className="stat"><span className="v">{stories}<small>/{rules.stories_per_week || 4}</small></span><span>stories</span></div>
            <div className="stat"><span className="v">{typesUsed}<small>/{POST_TYPES.length}</small></span><span>post types used</span></div>
          </div>
        </section>

        <section className="soc-two" aria-label="Feed rhythm and readiness">
          <div className={`soc-card${warn.length ? ' warnc' : ''}`}>
            <span className="cap">Feed rhythm</span>
            {warn.length ? <><strong>{warn[0].text}</strong><span>{warn.length > 1 ? warn.slice(1).map(w => w.text).join(' ') : 'Add a different kind of post on one of those days to break the run.'}</span></> : <strong>No runs to worry about</strong>}
            <span className="ru">Rules: no more than {rules.max_text_heavy_run} text-heavy in a row · no {rules.max_promo_run + 1} promos in a row · no same ground colour twice running</span>
          </div>
          <div className="soc-card">
            <span className="cap">A week ahead</span>
            <strong>Next week ({short(nextMon)} – {short(addD(nextMon, 6))}): {ahead.covered} of {ahead.total} days scheduled</strong>
            <span>Planner drafts it on Friday · the team picks images at the Tuesday check-in · whoever schedules the week approves it.</span>
          </div>
          <a className="soc-card dark" href="/ops/events">
            <span className="cap">Coming up</span>
            <strong>{(data.events || []).filter(e => e.slice(-10) >= t).slice(0, 2).map(e => e.replace(/ — \d{4}-\d{2}-\d{2}$/, '')).join(' · ') || 'Nothing on the schedule yet'}</strong>
            <span>See every offering and what is ready →</span>
          </a>
        </section>

        {expired.length > 0 && data.canEdit && (
          <div className="soc-banner" role="status">
            <span><strong>{expired.length} post{expired.length === 1 ? '' : 's'} expired</strong> while still Proposed. {expired.length === 1 ? 'It was' : 'They were'} never posted.</span>
            <span className="b">
              <button type="button" className="soc-btn small" onClick={() => clear('draft')}>Move to drafts</button>
              <button type="button" className="soc-btn small danger" onClick={() => clear('delete')}>Delete all {expired.length}</button>
              <button type="button" className="soc-btn small" onClick={() => clear('skip')}>Archive</button>
            </span>
          </div>)}

        <section className="soc-panel" aria-label="Day categories">
          <div className="ph">
            <div><h2>Day categories</h2><span className="sub">Each day has a standing post category. The calendar shows whether it’s covered.</span></div>
            <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
              <span className="sub"><b className="mono" style={{ color: '#1E1A14' }}>{filled}/7</b> filled this week</span>
              {data.canCategory && <button type="button" className="soc-btn small" aria-pressed={editing} onClick={() => setEditing(x => !x)}>{editing ? 'Done' : 'Edit day categories'}</button>}
            </div>
          </div>
          {editing && <>
            <div className="soc-cats">{WEEKDAYS.map((w, i) => { const cur = categoryFor(addD(start, i), cats); return (
              <label key={w}><span className="cap">{w}</span>
                <select value={cur} onChange={e => setCat(w, e.target.value)}><option value="">No category</option>{[...new Set([...POST_TYPES, cur].filter(Boolean))].map(c => <option key={c}>{c}</option>)}</select></label>); })}</div>
            <div className="soc-scope" role="radiogroup" aria-label="How long this lasts">
              <label><input type="radio" name="scope" checked={scope === 'standing'} onChange={() => setScope('standing')} /> Every week from now on</label>
              <label><input type="radio" name="scope" checked={scope === 'week'} onChange={() => setScope('week')} /> This week only</label>
            </div></>}
          <div className="soc-legend">
            <span><i style={{ background: '#20302A' }} />Filled</span>
            <span><i style={{ background: '#F2E8D6', border: '1px solid #B98A3E' }} />Filled, awaiting approval</span>
            <span><i style={{ border: '1.5px dashed #A5432A' }} />Not filled</span>
            <span><i style={{ background: '#EFE7D8' }} />Missed (day passed)</span>
          </div>
        </section>

        {msg && <p className="hint" role="status" style={{ margin: 0 }}>{msg}</p>}

        <div className="soc-main">
          <div className="view">
            {mode === 'week' && (<>
              <div className="soc-act" style={{ marginBottom: 10 }}>
                <button className="soc-btn small" onClick={() => step(-1)} aria-label="Earlier week">←</button>
                <button className="soc-btn small" onClick={() => setStart(monOf(t))}>This week</button>
                <button className="soc-btn small" onClick={() => step(1)} aria-label="Later week">→</button>
              </div>
              <div className="soc-scroll"><div className="soc-weekgrid">
                {cells.map(({ d, ps, cat, st }) => (
                  <div key={d} className={`soc-day${d === t ? ' today' : ''}`} onDragOver={e => { if (drag != null) e.preventDefault(); }} onDrop={() => { if (drag != null) move(drag, d); setDrag(null); }}>
                    <div className="dh"><b>{dow(d)}</b><span className="mono">{short(d)}</span></div>
                    <div className={`soc-slot ${st.state.startsWith('filled') ? (st.state === 'filled-approved' ? 'filled-approved' : st.state === 'filled-blocked' ? 'filled-blocked' : 'filled-awaiting') : st.state}`}>
                      <span className="t">Day category</span><span className="ty">{cat || 'No category'}</span>
                      {st.state !== 'open' && <span className="st">{STATE_LABEL[st.state]}{st.state === 'not-filled' && st.instead ? ` · has ${st.instead} instead` : ''}</span>}
                    </div>
                    {ps.map(card)}
                    {d >= t && !ps.some(isFeed) && <div className="soc-open"><span className="mono">11:00</span><span>Open feed slot</span><span style={{ fontSize: 11 }}>Drop a draft here</span></div>}
                  </div>))}
              </div></div>
            </>)}

            {mode === 'month' && <MonthView monthOf={monthOf} step={step} live={live} cats={cats} t={t} blockedOf={blockedOf} open={d => { setStart(monOf(d)); setMode('week'); }} />}
            {mode === 'list' && <ListView posts={live.filter(p => p.publish_date >= addD(t, -7)).sort((a, b) => (a.publish_date + timeKey(a.publish_time_ET)).localeCompare(b.publish_date + timeKey(b.publish_time_ET)))} cats={cats} />}
            {mode === 'grid' && <GridView live={live} canEdit={data.canEdit} t={t} reload={reload} setMsg={setMsg} />}
            {mode === 'feed' && <FeedView live={live} t={t} warn={warn} />}
          </div>

          <aside className="soc-tray" aria-label="Unscheduled drafts">
            <div className="hd"><h2>Drafts tray</h2><span className="mono sub">{drafts.length}</span></div>
            <p className="sub" style={{ margin: 0 }}>Made but not scheduled. Drag onto a day.</p>
            {drafts.map(p => (
              <a key={p._row} className="d" href={`/ops/social/compose?row=${p._row}`} draggable={!!data.canEdit} onDragStart={() => setDrag(p._row)}>
                <span className="t">{p._thumb && <img src={p._thumb} alt="" loading="lazy" referrerPolicy="no-referrer" />}</span>
                <span><b>{title(p).slice(0, 50)}</b><br /><small>{[p.pillar, kindLabel(p) || 'Feed'].filter(Boolean).join(' · ')}</small></span>
              </a>))}
            {!drafts.length && <p className="sub" style={{ margin: 0 }}>No drafts right now.</p>}
            <div className="never">
              <span className="cap">Never used yet</span>
              <div className="pills">{unused.map(u => <a key={u} href={`/ops/social/compose?type=${encodeURIComponent(u)}`}>{u}</a>)}</div>
            </div>
          </aside>
        </div>
      </>}
    </div>
  );
}

function MonthView({ monthOf, step, live, cats, t, blockedOf, open }) {
  const first = monthOf + '-01', from = monOf(first);
  const cells = Array.from({ length: 42 }, (_, i) => addD(from, i));
  return (
    <div className="soc-month">
      <div className="nav"><button type="button" aria-label="Previous month" onClick={() => step(-1)}>‹</button><h2>{new Date(first + 'T12:00:00Z').toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })}</h2><button type="button" aria-label="Next month" onClick={() => step(1)}>›</button></div>
      <div className="soc-scroll"><div className="soc-mgrid">
        {WEEKDAYS.map(w => <span key={w} className="dow">{w.slice(0, 3)}</span>)}
        {cells.map(d => { const ps = live.filter(p => p.publish_date === d), cat = categoryFor(d, cats); return (
          <button key={d} type="button" className={`soc-mcell${d.slice(0, 7) !== monthOf ? ' other' : ''}${d === t ? ' today' : ''}`} onClick={() => open(d)} aria-label={`${long(d)}: ${ps.length} post${ps.length === 1 ? '' : 's'}`}>
            <span className="top"><span className="mono" style={{ fontSize: 12 }}>{Number(d.slice(8))}</span>{ps.length > 0 && <span className="big">{ps.length}</span>}</span>
            {cat && <span className="cat">{cat}</span>}
            {ps.slice(0, 2).map(p => <span key={p._row} className="it">{time(p.publish_time_ET)} {title(p).slice(0, 28)}</span>)}
          </button>); })}
      </div></div>
    </div>
  );
}

function ListView({ posts, cats }) {
  return (
    <div className="soc-table"><table>
      <thead><tr><th>When (ET)</th><th>Format</th><th>Pillar</th><th>Post</th><th>Category</th><th>Template</th><th>Status</th></tr></thead>
      <tbody>{posts.map(p => (
        <tr key={p._row}>
          <td className="mono" style={{ whiteSpace: 'nowrap', fontSize: 12 }}>{day(p.publish_date)} {time(p.publish_time_ET)}</td>
          <td>{kindLabel(p) || (isFeed(p) ? 'Feed' : 'Story')}</td><td>{p.pillar || '—'}</td>
          <td><a href={`/ops/social/compose?row=${p._row}`}>{title(p).slice(0, 80)}</a></td>
          <td>{categoryFor(p.publish_date, cats) || '—'}</td><td style={{ color: '#5A5346' }}>{p.template_id || '—'}</td>
          <td><span className={`soc-badge ${String(p.status).replace(/\s/g, '')}`}>{p.status}</span></td>
        </tr>))}
        {!posts.length && <tr><td colSpan={7}>Nothing planned.</td></tr>}</tbody>
    </table></div>
  );
}

function GridView({ live, canEdit, t, reload, setMsg }) {
  const [drag, setDrag] = useState(null);
  const feed = live.filter(isFeed).sort((a, b) => (b.publish_date + timeKey(b.publish_time_ET)).localeCompare(a.publish_date + timeKey(a.publish_time_ET))).slice(0, 18);
  const swap = async (a, b) => {
    if (!a || !b || a._row === b._row || out(a) || out(b)) return;
    const j = await api({ view: 'plan', swap: [{ row: a._row, before: a._raw }, { row: b._row, before: b._raw }] });
    setMsg(j.ok ? 'Swapped their times.' : j.error || 'Couldn’t move it'); reload();
  };
  return (
    <div className="soc-main">
      <div className="soc-phone">
        <div className="who"><i /><span><b>embodiedphilosophy</b><small>profile preview · newest first</small></span></div>
        <ul className="soc-g3">{feed.map(p => (
          <li key={p._row} className={`${p.status === 'Proposed' ? 'prop' : ''}${out(p) ? ' out' : ''}${drag === p._row ? ' drag' : ''}`} draggable={canEdit && !out(p)}
            onDragStart={() => setDrag(p._row)} onDragEnd={() => setDrag(null)} onDragOver={e => { if (drag != null) e.preventDefault(); }} onDrop={() => { swap(feed.find(x => x._row === drag), p); setDrag(null); }}>
            <a href={`/ops/social/compose?row=${p._row}`} aria-label={`${long(p.publish_date)}: ${title(p).slice(0, 40)}`}>{p._thumb ? <img src={p._thumb} alt="" loading="lazy" referrerPolicy="no-referrer" /> : null}<span>{short(p.publish_date)}</span></a>
          </li>))}</ul>
      </div>
      <div className="soc-explain">
        <h2>Grid preview</h2>
        <p>Drag one tile onto another to swap their times. Outlined tiles are still Proposed; faded tiles are already on Instagram.</p>
        <p>The planner avoids putting two of the same ground colour side by side.</p>
      </div>
    </div>
  );
}

function FeedView({ live, t, warn }) {
  const feed = live.filter(isFeed).sort((a, b) => (a.publish_date + timeKey(a.publish_time_ET)).localeCompare(b.publish_date + timeKey(b.publish_time_ET))).filter(p => p.publish_date >= addD(t, -3)).slice(0, 14);
  const stories = live.filter(p => !isFeed(p)).filter(p => p.publish_date >= t).slice(0, 8);
  return (
    <div className="soc-main">
      <div className="soc-phone feed">
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0 16px 10px' }}><b style={{ fontSize: 15 }}>Instagram</b><span className="sub" style={{ fontSize: 11, color: '#5A5346' }}>feed preview · soonest first</span></div>
        <div className="soc-stories">{stories.length ? stories.map(p => <span key={p._row}><i />{short(p.publish_date)}</span>) : <span className="sub">No stories planned</span>}</div>
        <div className="soc-feed">{feed.map(p => (
          <article key={p._row} className={p.status === 'Expired' ? 'out' : ''}>
            <div className="hd"><i /><div><b>embodiedphilosophy</b><small className="mono">{day(p.publish_date)} · {time(p.publish_time_ET)}</small></div><span className={`soc-badge ${String(p.status).replace(/\s/g, '')}`}>{p.status}</span></div>
            <a className="media" href={`/ops/social/compose?row=${p._row}`}>{p._thumb && <img src={p._thumb} alt="" loading="lazy" referrerPolicy="no-referrer" />}</a>
            <div className="body">
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{p.pillar && <span className="pl">{p.pillar}</span>}{isTextHeavy(p) && <span className="tag">Text-heavy</span>}</div>
              <p><b>embodiedphilosophy</b> {title(p).slice(0, 140)}</p>
            </div>
          </article>))}
          {!feed.length && <p className="ops-empty" style={{ padding: 14 }}>Nothing planned.</p>}</div>
      </div>
      <div className="soc-explain">
        <h2>Feed view</h2>
        <p>How the week reads to someone scrolling: posts in order, with stories along the top. Use it to judge pacing. The grid shows how the profile looks; the feed shows how the week flows.</p>
        {warn[0] && <div className="run"><strong>{warn[0].text}</strong><span>The rule is no more than 2 in a row. A different kind of post in between would break the run.</span></div>}
        <p>Faded posts expired without approval and won’t appear on Instagram.</p>
      </div>
    </div>
  );
}
