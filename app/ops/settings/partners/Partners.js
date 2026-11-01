'use client';
import { useEffect, useMemo, useState } from 'react';
import { suggestGroups, repeatsIn, monthLabel, groupKey } from '@/lib/ops/partners';

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
  const [both, setBoth] = useState(true);      // save for both months of the rotation
  const [chats, setChats] = useState({});       // { groupKey: https link } the pair's Circle group chat
  const [places, setPlaces] = useState({});     // { email: { city, tz } } where each mentee lives
  const [pmsg, setPmsg] = useState(null);

  const load = async m => {
    setData(null); setMsg(null);
    const res = await fetch(`/api/ops/partners${m ? `?month=${m}` : ''}`).catch(() => null);
    const j = await res?.json().catch(() => ({}));
    if (!res?.ok) { setData({ error: j?.error || 'Couldn’t load the partners. Try again.' }); return; }
    setData(j); setMonth(j.month); setGroups(j.groups.map(g => [...g])); setSeed(1); setChats(j.chats || {});
    setPlaces(Object.fromEntries((j.profiles || []).map(x => [x.email, { city: x.city, tz: x.tz, start: x.start || '' }])));
  };
  useEffect(() => { load(''); }, []);

  const name = useMemo(() => Object.fromEntries((data?.cohort || []).map(c => [c.email, c.name])), [data]);
  const history = useMemo(() => new Set(data?.history || []), [data]);
  const used = new Set(groups.flat().filter(Boolean));
  const unpaired = (data?.cohort || []).filter(c => !used.has(c.email));
  const saved = data && !data.error ? norm(data.groups) : [];
  const chatsDirty = data && !data.error && JSON.stringify(Object.fromEntries(groups.filter(g => g.filter(Boolean).length > 1).map(g => [groupKey(g), chats[groupKey(g)] || '']).filter(([, v]) => v))) !== JSON.stringify(data.chats || {});
  const dirty = data && !data.error && (!same(norm(groups), saved) || chatsDirty);
  const repeats = data && !data.error ? repeatsIn(norm(groups).filter(g => g.length > 1), history) : 0;

  const setSlot = (gi, si, email) => setGroups(gs => gs.map((g, i) => i === gi ? g.map((e, j) => j === si ? email : e) : g));
  const suggest = () => {
    if (groups.length && dirty === false && saved.length && !confirm('Replace this month’s pairs with a new suggestion?')) return;
    setGroups(suggestGroups(data.cohort.map(c => c.email), history, seed)); setSeed(seed + 1); setMsg(null);
  };
  const save = async () => {
    setBusy(true); setMsg(null);
    const res = await fetch('/api/ops/partners', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ month, both: both && !!data.rotation, groups: groups.map(g => g.filter(Boolean)).filter(g => g.length > 1), chats }) }).catch(() => null);
    const j = await res?.json().catch(() => ({}));
    setBusy(false);
    if (!res?.ok) { setMsg({ error: j?.error || 'Couldn’t save. Try again.' }); return; }
    setData(j); setGroups(j.groups.map(g => [...g])); setChats(j.chats || {}); setMsg({ ok: true });
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
        <button type="button" className="chip primary" disabled={busy || !dirty} onClick={save}>{busy ? 'Saving…' : 'Save for ' + (both && data.rotation ? data.rotation.label || 'the rotation' : monthLabel(month))}</button>
        {data.rotation && <label style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={both} disabled={busy} onChange={e => setBoth(e.target.checked)} /> Save for both months of the rotation{data.rotation.label ? ` (${data.rotation.label})` : ''}</label>}
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
            {g.filter(Boolean).length > 1 && <input type="url" placeholder="Pair chat link (https://…)" aria-label={`Group ${gi + 1} chat link`} disabled={busy} value={chats[groupKey(g)] || ''} onChange={ev => setChats(c => ({ ...c, [groupKey(g)]: ev.target.value }))} style={{ minWidth: 220 }} />}
            <button type="button" className="chip" disabled={busy} onClick={() => setGroups(gs => gs.filter((_, i) => i !== gi))}>Remove</button>
          </li>
        ))}
      </ul>
      <p className="ops-empty">{pairsCount} {pairsCount === 1 ? 'pair' : 'pairs'}{trios ? `, ${trios} ${trios === 1 ? 'group' : 'groups'} of three` : ''}{unpaired.length ? ` · not yet paired: ${unpaired.map(c => c.name).join(', ')}` : ' · everyone is paired'}
        {repeats ? ` · ${repeats} ${repeats === 1 ? 'pair has' : 'pairs have'} worked together in an earlier month` : ''}</p>
      <h3 style={{ marginTop: 28 }}>Where everyone lives</h3>
      <p className="ops-empty">Mentees see where their partner is and a two-hour window that suits you both. Use a time zone name like Europe/Rome or America/Costa_Rica.</p>
      <datalist id="ops-zones">{(typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : []).map(z => <option key={z} value={z} />)}</datalist>
      <ul className="ops-site-rows">
        {data.cohort.map(c => (
          <li key={c.email} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', padding: '6px 0' }}>
            <span style={{ minWidth: 150 }}>{c.name}</span>
            <input aria-label={`City for ${c.name}`} placeholder="City" value={places[c.email]?.city || ''} onChange={e => setPlaces(p => ({ ...p, [c.email]: { ...p[c.email], city: e.target.value } }))} />
            <input aria-label={`Time zone for ${c.name}`} list="ops-zones" placeholder="Time zone" value={places[c.email]?.tz || ''} onChange={e => setPlaces(p => ({ ...p, [c.email]: { ...p[c.email], tz: e.target.value } }))} />
            <input type="month" aria-label={`Start month for ${c.name} (leave blank for the cohort's first month)`} title="The month they began. Leave blank for the cohort's first month." value={places[c.email]?.start || ''} onChange={e => setPlaces(p => ({ ...p, [c.email]: { ...p[c.email], start: e.target.value } }))} />
          </li>
        ))}
      </ul>
      <button type="button" className="chip primary" disabled={busy} onClick={async () => {
        setBusy(true); setPmsg(null);
        const res = await fetch('/api/ops/partners', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ profiles: data.cohort.map(c => ({ email: c.email, city: places[c.email]?.city || '', tz: places[c.email]?.tz || '', start: places[c.email]?.start || '' })) }) }).catch(() => null);
        const j = await res?.json().catch(() => ({}));
        setBusy(false);
        if (!res?.ok) { setPmsg({ error: j?.error || 'Couldn’t save. Try again.' }); return; }
        setPmsg({ ok: true }); load(month);
      }}>Save places</button>
      {pmsg?.error && <p className="ops-empty" role="alert">{pmsg.error}</p>}
      {pmsg?.ok && <p className="ops-empty" role="status">Saved. Mentees see the new places now.</p>}
    </section>
  );
}
