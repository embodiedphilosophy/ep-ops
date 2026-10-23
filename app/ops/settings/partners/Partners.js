'use client';
import { useEffect, useMemo, useState } from 'react';
import { suggestGroups, repeatsIn, monthLabel } from '@/lib/ops/partners';

// Pair the mentees for a month: suggest, adjust, save. Groups of two (or three, when the number is odd). Nothing reaches mentees until Save.
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const norm = gs => gs.map(g => [...g].filter(Boolean).sort()).filter(g => g.length).sort((a, b) => a[0].localeCompare(b[0]));

export default function Partners() {
  const [month, setMonth] = useState('');
  const [data, setData] = useState(null);      // { months, cohort, groups, history, missingTab } | { error }
  const [groups, setGroups] = useState([]);    // [[email, email, (email)]] being edited ('' = empty slot)
  const [seed, setSeed] = useState(1);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);        // { ok } | { error }

  const load = async m => {
    setData(null); setMsg(null);
    const res = await fetch(`/api/ops/partners${m ? `?month=${m}` : ''}`).catch(() => null);
    const j = await res?.json().catch(() => ({}));
    if (!res?.ok) { setData({ error: j?.error || 'Couldn’t load the partners. Try again.' }); return; }
    setData(j); setMonth(j.month); setGroups(j.groups.map(g => [...g])); setSeed(1);
  };
  useEffect(() => { load(''); }, []);

  const name = useMemo(() => Object.fromEntries((data?.cohort || []).map(c => [c.email, c.name])), [data]);
  const history = useMemo(() => new Set(data?.history || []), [data]);
  const used = new Set(groups.flat().filter(Boolean));
  const unpaired = (data?.cohort || []).filter(c => !used.has(c.email));
  const saved = data && !data.error ? norm(data.groups) : [];
  const dirty = data && !data.error && !same(norm(groups), saved);
  const repeats = data && !data.error ? repeatsIn(norm(groups).filter(g => g.length > 1), history) : 0;

  const setSlot = (gi, si, email) => setGroups(gs => gs.map((g, i) => i === gi ? g.map((e, j) => j === si ? email : e) : g));
  const suggest = () => {
    if (groups.length && dirty === false && saved.length && !confirm('Replace this month’s pairs with a new suggestion?')) return;
    setGroups(suggestGroups(data.cohort.map(c => c.email), history, seed)); setSeed(seed + 1); setMsg(null);
  };
  const save = async () => {
    setBusy(true); setMsg(null);
    const res = await fetch('/api/ops/partners', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ month, groups: groups.map(g => g.filter(Boolean)).filter(g => g.length > 1) }) }).catch(() => null);
    const j = await res?.json().catch(() => ({}));
    setBusy(false);
    if (!res?.ok) { setMsg({ error: j?.error || 'Couldn’t save. Try again.' }); return; }
    setData(j); setGroups(j.groups.map(g => [...g])); setMsg({ ok: true });
  };

  if (!data) return <p className="ops-empty">Loading…</p>;
  if (data.error) return <p className="ops-empty">{data.error} <button className="chip" onClick={() => load(month)}>Try again</button></p>;
  const pairsCount = groups.filter(g => g.filter(Boolean).length === 2).length, trios = groups.filter(g => g.filter(Boolean).length === 3).length;

  return (
    <section className="ops-partners">
      <p className="ops-empty">Pair the Sahṛdaya Upāya mentees for the month. Each mentee sees their partner (and a button to write to them) on their page in Circle as soon as you save. Nothing changes for them until then.</p>
      {!data.kitOk && <p className="ops-empty" role="alert">The mentee list from Kit didn’t load, so only people already paired are shown. Try again in a moment.</p>}
      <div className="bar" style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', margin: '12px 0' }}>
        <label>Month <select value={month} disabled={busy || dirty} onChange={e => load(e.target.value)} aria-label="Month">{data.months.map(m => <option key={m} value={m}>{monthLabel(m)}</option>)}</select></label>
        <button type="button" className="chip" disabled={busy || data.cohort.length < 2} onClick={suggest}>{groups.length ? 'Suggest again' : 'Suggest pairs'}</button>
        <button type="button" className="chip" disabled={busy} onClick={() => setGroups(gs => [...gs, ['', '']])}>Add a pair</button>
        <button type="button" className="chip primary" disabled={busy || !dirty} onClick={save}>{busy ? 'Saving…' : 'Save for ' + monthLabel(month)}</button>
      </div>
      {dirty && <p className="ops-empty">You have changes that aren’t saved yet.{' '}</p>}
      {msg?.error && <p className="ops-empty" role="alert">{msg.error}</p>}
      {msg?.ok && !dirty && <p className="ops-empty" role="status">Saved. Mentees see these partners now.</p>}
      {data.missingTab && !groups.length && <p className="ops-empty">Nothing is set yet. The partners tab is made for you on the first save.</p>}

      <ul className="ops-site-rows">
        {groups.map((g, gi) => (
          <li key={gi} className="ops-pair" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', padding: '8px 0' }}>
            {g.map((e, si) => (
              <select key={si} value={e} aria-label={`Group ${gi + 1}, person ${si + 1}`} disabled={busy} onChange={ev => setSlot(gi, si, ev.target.value)}>
                <option value="">Choose a mentee…</option>
                {data.cohort.filter(c => c.email === e || !used.has(c.email)).map(c => <option key={c.email} value={c.email}>{c.name}{c.name !== c.email ? ` · ${c.email}` : ''}</option>)}
              </select>
            ))}
            {g.length === 2 && <button type="button" className="chip" disabled={busy} onClick={() => setGroups(gs => gs.map((x, i) => i === gi ? [...x, ''] : x))}>Make it a three</button>}
            {g.length === 3 && <button type="button" className="chip" disabled={busy} onClick={() => setGroups(gs => gs.map((x, i) => i === gi ? x.slice(0, 2) : x))}>Back to two</button>}
            <button type="button" className="chip" disabled={busy} onClick={() => setGroups(gs => gs.filter((_, i) => i !== gi))}>Remove</button>
          </li>
        ))}
      </ul>
      <p className="ops-empty">{pairsCount} {pairsCount === 1 ? 'pair' : 'pairs'}{trios ? `, ${trios} ${trios === 1 ? 'group' : 'groups'} of three` : ''}{unpaired.length ? ` · not yet paired: ${unpaired.map(c => c.name).join(', ')}` : ' · everyone is paired'}
        {repeats ? ` · ${repeats} ${repeats === 1 ? 'pair has' : 'pairs have'} worked together in an earlier month` : ''}</p>
    </section>
  );
}
