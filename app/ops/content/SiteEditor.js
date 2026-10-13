'use client';
import { useEffect, useState } from 'react';
import { SITE_TABLES, ADMIN_TABLES, SCAFFOLDING, SCAFFOLDING_STATUSES, tableOf, typeOf, RULE_OPTIONS, TYPE_OPTIONS, NEWSLETTER_OPTIONS } from '@/lib/ops/sitetables';

const SELECTS = { rule: RULE_OPTIONS, teamtype: TYPE_OPTIONS, newsletter: NEWSLETTER_OPTIONS, scaffstatus: SCAFFOLDING_STATUSES };
const RULE_LABEL = { '': 'Worked out from the wording', bio: 'Bio and headshot are in', title: 'Public title and summary are in', blurbs: 'Promo blurbs are in', readings: 'Readings shared up front', video_id: 'Replay link (or Vimeo ID) is in', manual: 'Only by hand' };

const label = h => h.replace(/_/g, ' ').replace(/^./, c => c.toUpperCase());
const yes = v => String(v).toUpperCase() !== 'FALSE';

// Content → Website (scope 'site'), Content → Email (scope 'email': the Weekly Scaffolding) and
// Admin → Settings (scope 'admin'): sheet tabs as lists, each row edited as a short form.
// base: the page's own address, for the tab links.
// scope 'settings' (Settings): the operations tables (directors) and the website tables, in two groups.
export default function SiteEditor({ initial = 'links', scope = 'site', base = '/ops/settings?', director = false }) {
  const GROUPS = scope === 'settings' ? [...(director ? [['Operations', ADMIN_TABLES]] : []), ['Website', SITE_TABLES]] : null;
  const TABLES = GROUPS ? GROUPS.flatMap(g => g[1]) : scope === 'admin' ? ADMIN_TABLES : scope === 'email' ? [SCAFFOLDING] : SITE_TABLES;
  const [tab, setTab] = useState(initial);
  const [data, setData] = useState(null);     // { head, rows, locked, canEdit } | { error }
  const [sel, setSel] = useState(null);       // row number, 'new', or null
  const t = tableOf(tab);

  const load = async (k = tab) => {
    setData(null);
    const res = await fetch(`/api/ops/site?tab=${k}`).catch(() => null);
    const j = await res?.json().catch(() => ({}));
    setData(res?.ok ? j : { ...j, error: j?.error || 'Couldn’t load this tab' });
  };
  useEffect(() => { load(tab); }, [tab]);
  const go = k => { setTab(k); setSel(null); try { history.replaceState(null, '', `${base}t=${k}`); } catch {} };
  const create = async (how = 'create') => {
    setData(null);
    const res = await fetch('/api/ops/site', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tab, [how]: true }) }).catch(() => null);
    const j = await res?.json().catch(() => ({}));
    if (!res?.ok) setData({ error: j?.error || 'Couldn’t do that. Try again.' }); else load();
  };

  return (
    <section className="ops-site">
      {GROUPS ? (
        <div className="ops-set-nav">
          {GROUPS.map(([name, list]) => (
            <nav key={name} aria-label={name}>
              <span className="g">{name}</span>
              {list.map(x => <a key={x.key} href={`${base}t=${x.key}`} aria-current={x.key === tab ? 'page' : undefined} onClick={e => { e.preventDefault(); go(x.key); }}>{x.label}</a>)}
            </nav>
          ))}
        </div>
      ) : TABLES.length > 1 && <nav className="ops-filters ops-site-tabs" aria-label="Website content">
        {TABLES.map(x => <a key={x.key} href={`${base}t=${x.key}`} aria-current={x.key === tab ? 'page' : undefined} onClick={e => { e.preventDefault(); go(x.key); }}>{x.label}</a>)}
      </nav>}
      <p className="ops-empty">{t.help}</p>
      {!data ? <p className="ops-empty">Loading…</p> : data.error ? <p className="ops-empty">{data.error} {data.canCreate && <button className="chip" onClick={() => create()}>Create it</button>}
        {data.canImport && <button className="chip primary" onClick={() => create('import')}>Bring it over from the old EP Website sheet</button>}</p> : (<>
        {data.canEdit && t.add && sel !== 'new' && <p><button className="chip" onClick={() => setSel('new')}>Add a row</button></p>}
        {sel === 'new' && <RowForm t={t} head={data.head} locked={data.locked} row={null} values={{}} onDone={() => { setSel(null); load(); }} />}
        <ul className="ops-site-rows">
          {data.rows.map(r => (
            <li key={r.row} className={'publish' in r.values && !yes(r.values.publish) ? 'is-hidden' : ''}>
              {sel === r.row ? <RowForm t={t} head={data.head} locked={data.locked} row={r.row} values={r.values} canEdit={data.canEdit} onDone={changed => { setSel(null); if (changed) load(); }} /> : (
                <button className="ops-site-row" onClick={() => setSel(r.row)}>
                  <span className="n">{t.name(r.values) || `Row ${r.row}`}{'publish' in r.values && !yes(r.values.publish) && <span className="off"> · hidden</span>}</span>
                  {t.sub(r.values) && <span className="s">{String(t.sub(r.values)).slice(0, 140)}</span>}
                </button>
              )}
            </li>
          ))}
        </ul>
      </>)}
    </section>
  );
}

// The table's own sections (columns not listed go in a last "Other" section), or one plain list
function groupsOf(t, head) {
  const cols = head.filter(Boolean);
  if (!t.groups) return [['', cols]];
  const listed = new Set(t.groups.flatMap(([, c]) => c));
  const out = t.groups.map(([g, c]) => [g, c.filter(h => cols.includes(h))]).filter(([, c]) => c.length);
  const rest = cols.filter(h => !listed.has(h));
  return rest.length ? [...out, ['Other', rest]] : out;
}

// Weekly Scaffolding: preview the email, list what's still blank, build the Kit draft (never sends)
function Newsletter({ date, dirty, canEdit }) {
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const call = async (method, q) => {
    setBusy(true); setMsg(null);
    const res = await fetch(`/api/ops/scaffolding${method === 'GET' ? `?date=${date}&check=1` : ''}`, method === 'GET' ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ date }) }).catch(() => null);
    const j = await res?.json().catch(() => ({}));
    setBusy(false); setMsg(j || { error: 'Couldn’t reach the server' });
  };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) return null;
  return (
    <div className="ops-news">
      <p className="hint">{dirty ? 'Save your changes first, then preview or build.' : 'The week’s events come from the schedule. Building makes or updates the Kit draft; sending stays in Kit.'}</p>
      <div className="bar">
        <a className="chip" href={`/api/ops/scaffolding?date=${date}`} target="_blank" rel="noopener" aria-disabled={dirty}>Preview the email ↗</a>
        <button type="button" className="chip" disabled={busy || dirty} onClick={() => call('GET')}>What’s still blank?</button>
        {canEdit && <button type="button" className="chip primary" disabled={busy || dirty} onClick={() => { if (confirm('Build (or rebuild) this issue’s Kit draft? A rebuild replaces edits made inside Kit.')) call('POST'); }}>{busy ? 'Working…' : 'Build Kit draft'}</button>}
      </div>
      {msg && (
        <div className="ops-news-out">
          {msg.error || msg.skipped ? <p>{msg.error || msg.skipped}</p> : null}
          {msg.draft && <p>Draft {msg.action || 'ready'}: <a href={msg.draft} target="_blank" rel="noopener">open it in Kit ↗</a></p>}
          {msg.blanks && <p>{msg.blanks.length ? <>Still blank: {msg.blanks.join(', ')}</> : 'Nothing is blank.'}</p>}
          {msg.events && <p>Events that week: {msg.events.length ? msg.events.join(' · ') : 'none'}</p>}
        </div>
      )}
    </div>
  );
}

function RowForm({ t, head, locked = [], row, values, canEdit = true, onDone }) {
  const [vals, setVals] = useState(values);
  const [orig, setOrig] = useState(values);
  const [errors, setErrors] = useState({});
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const changed = head.filter(h => h && String(vals[h] ?? '') !== String(orig[h] ?? ''));
  const ro = h => !canEdit || locked.includes(h) || (t.locked || []).includes(h);

  const save = async () => {
    setBusy(true); setErrors({}); setMsg('');
    const changes = Object.fromEntries(changed.map(h => [h, vals[h] ?? '']));
    const res = await fetch('/api/ops/site', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tab: t.key, row, changes, before: row == null ? {} : orig }) }).catch(() => null);
    const j = await res?.json().catch(() => ({}));
    setBusy(false);
    if (res?.ok) return onDone(true);
    if (res?.status === 409) { setMsg(`${j.error}. Their version is shown now; make your change again.`); setOrig(j.conflict); setVals(j.conflict); return; }
    setErrors(j?.errors || {}); setMsg(j?.error || 'Couldn’t save. Try again.');
  };
  const input = h => {
    const v = vals[h] ?? '', type = typeOf(t.key, h, vals), id = `s-${h.replace(/\W+/g, '-')}`, set = x => setVals(s => ({ ...s, [h]: x }));
    if (type === 'bool') return <select id={id} value={String(v).toUpperCase()} disabled={ro(h) || busy} onChange={e => set(e.target.value)}><option value="">{['website', 'teachers'].includes(h) ? 'No (blank)' : 'Yes (blank)'}</option><option value="TRUE">Yes</option><option value="FALSE">No</option></select>;
    if (SELECTS[type]) return <select id={id} value={v} disabled={ro(h) || busy} onChange={e => set(e.target.value)}>{[...new Set([...(type === 'rule' ? [] : ['']), ...SELECTS[type], v])].map(o => <option key={o} value={o}>{type === 'rule' ? RULE_LABEL[o] || o : o || '—'}</option>)}</select>;
    if (type === 'color') return <input id={id} value={v} disabled={ro(h) || busy} onChange={e => set(e.target.value)} placeholder="#1E4772" style={{ borderLeft: /^#[0-9a-f]{6}$/i.test(v) ? `14px solid ${v}` : undefined }} />;
    if (type === 'long') return <textarea id={id} rows={Math.min(8, Math.max(3, Math.ceil(String(v).length / 70)))} value={v} disabled={ro(h) || busy} onChange={e => set(e.target.value)} />;
    return <input id={id} value={v} disabled={ro(h) || busy} type={type === 'date' ? 'date' : 'text'} inputMode={type === 'number' ? 'decimal' : undefined} onChange={e => set(e.target.value)} />;
  };
  return (
    <form className="ops-edit" onSubmit={e => { e.preventDefault(); save(); }}>
      <p className="ops-edit-title">{row == null ? `New ${t.label.toLowerCase().replace(/s$/, '')}` : t.name(orig) || `Row ${row}`}</p>
      {groupsOf(t, head).map(([g, cols]) => (
        <fieldset key={g || 'all'}>
          {g && <legend>{g}</legend>}
          {cols.map(h => (
            <div key={h} className={`row${errors[h] ? ' bad' : ''}${changed.includes(h) ? ' changed' : ''}`}>
              <label htmlFor={`s-${h.replace(/\W+/g, '-')}`}>{h === 'publish' ? 'Show on the website' : h === 'done_when' ? 'Done when' : h === 'PS' ? 'P.S.' : label(h)}</label>
              {input(h)}
              {errors[h] && <span className="hint">{errors[h]}</span>}
            </div>
          ))}
        </fieldset>
      ))}
      {t.key === 'scaffolding' && row != null && <Newsletter date={orig['Send Date']} dirty={changed.length > 0} canEdit={canEdit} />}
      <div className="bar">
        {canEdit && <button type="submit" className="chip primary" disabled={busy || !changed.length}>{busy ? 'Saving…' : row == null ? 'Add' : changed.length ? `Save ${changed.length} change${changed.length === 1 ? '' : 's'}` : 'No changes'}</button>}
        <button type="button" className="chip" disabled={busy} onClick={() => onDone(false)}>{canEdit ? 'Cancel' : 'Close'}</button>
        {msg && <span className="hint">{msg}</span>}
      </div>
    </form>
  );
}
