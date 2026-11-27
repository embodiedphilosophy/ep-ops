'use client';
import { useEffect, useState } from 'react';
import './ads.css';

// Ads safety net settings (directors): the spending ceilings and thresholds, and who is told, how, and at what level. Kept in the dashboard's own database, never in an environment variable;
// every change goes on the Change Log (without any phone number). A phone number is shown in full only to the person it belongs to; for everyone else it shows the last four digits.
const API = '/api/ops/ads-safety';
const post = async body => { const res = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }), j = await res.json().catch(() => ({})); if (!res.ok) throw new Error(j.error || 'That didn’t save. Try again in a moment.'); return j; };
const shown = (f, v) => (f.kind === 'dollars' ? (v ? String(v / 100) : '') : v ?? '');
const GROUPS = [['Spending ceilings', ['daily_ceiling_cents', 'monthly_ceiling_cents']], ['Return', ['target_roas', 'floor_roas', 'floor_min_cents', 'urgent_multiple']], ['Ads that bring nothing', ['zero_days', 'zero_min_cents']],
  ['Spend spikes and silence', ['spike_multiple', 'spike_min_cents', 'heartbeat_hours']], ['How often you hear', ['repeat_gap_min', 'max_repeats_day', 'important_gap_hours', 'worsen_pct']], ['Quiet hours', ['quiet_start', 'quiet_end', 'default_tz']]];
const LEVELS = [['urgent', 'Urgent'], ['important', 'Important']];

function Person({ p, reload }) {
  const [phone, setPhone] = useState(p.phone || ''), [tz, setTz] = useState(p.tz), [em, setEm] = useState(p.email_on), [sms, setSms] = useState(p.sms), [wa, setWa] = useState(p.whatsapp), [msg, setMsg] = useState(''), [err, setErr] = useState(''), [busy, setBusy] = useState(false), [clear, setClear] = useState(false);
  const lv = (c, set) => LEVELS.map(([k, l]) => <label key={k} className="ads-check-in"><input type="checkbox" checked={c.levels.includes(k)} onChange={e => set({ ...c, levels: e.target.checked ? [...c.levels, k] : c.levels.filter(x => x !== k) })} /> {l}</label>);
  const save = async () => {
    setBusy(true); setErr(''); setMsg('');
    try { const patch = { email_on: em, tz, sms, whatsapp: wa, ...(clear ? { phone: '' } : phone.trim() ? { phone } : {}) }; const j = await post({ action: 'saveRecipient', email: p.email, patch }); setMsg(j.changed.length ? 'Saved.' : 'Nothing changed.'); setClear(false); await reload(j.people); }
    catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  return (
    <li className="ads-person" aria-label={`Alerts for ${p.name}`}>
      <div className="top"><b>{p.name}</b>{p.is_me && <span className="ads-pill calm">You</span>}</div>
      <label>Email alerts<span className="ads-check-in"><input type="checkbox" checked={em} onChange={e => setEm(e.target.checked)} /> On (all levels), to {p.email}</span></label>
      <label>Mobile number for text and WhatsApp
        <input type="tel" inputMode="tel" autoComplete="off" value={phone} onChange={e => { setPhone(e.target.value); setClear(false); }} placeholder={p.has_phone && !p.is_me ? `A number is set (ends ${p.phone_masked.slice(-4)}). Type a new one to replace it.` : '+1 555 123 4567'} aria-label={`Mobile number for ${p.name}`} />
        <span className="ads-cap">With the country code. {p.has_phone ? <>Set. <button type="button" className="ads-linkbtn" onClick={() => { setPhone(''); setClear(true); }}>Remove the number</button>{clear ? ' (will be removed when you save)' : ''}</> : 'No number yet, so this person gets email only.'}</span></label>
      <div className="row"><b>Text messages</b><label className="ads-check-in"><input type="checkbox" checked={sms.on} onChange={e => setSms({ ...sms, on: e.target.checked })} /> On</label>{lv(sms, setSms)}</div>
      <div className="row"><b>WhatsApp</b><label className="ads-check-in"><input type="checkbox" checked={wa.on} onChange={e => setWa({ ...wa, on: e.target.checked })} /> On</label>{lv(wa, setWa)}</div>
      <label>Time zone for quiet hours<input value={tz} onChange={e => setTz(e.target.value)} aria-label={`Time zone for ${p.name}`} /></label>
      <div className="soc-act"><button className="soc-btn small primary" type="button" disabled={busy} onClick={save}>{busy ? 'Saving…' : `Save ${p.name.split(' ')[0]}’s alerts`}</button></div>
      {err && <p className="hint err" role="alert">{err}</p>}{msg && <p className="hint" role="status">{msg}</p>}
    </li>);
}

export default function SafetySettings() {
  const [d, setD] = useState(null), [vals, setVals] = useState({}), [err, setErr] = useState(''), [msg, setMsg] = useState(''), [busy, setBusy] = useState(false), [test, setTest] = useState(null);
  const load = () => fetch(`${API}?settings=1`).then(r => r.json().then(j => { if (!r.ok) throw new Error(j.error); setD(j); setVals(Object.fromEntries(Object.entries(j.fields).map(([k, f]) => [k, shown(f, j.config[k])]))); })).catch(e => setErr(e.message || 'Couldn’t read the settings'));
  useEffect(() => { load(); }, []);
  if (err && !d) return <p className="hint err" role="alert">{err}</p>;
  if (!d) return <p className="ops-empty">Reading the settings…</p>;
  const save = async e => {
    e.preventDefault(); setErr(''); setMsg(''); setBusy(true);
    try { const j = await post({ action: 'saveConfig', values: vals }); setMsg(j.changed.length ? 'Saved. The safety net uses these from its next hourly check.' : 'Nothing changed.'); await load(); } catch (x) { setErr(x.message); } finally { setBusy(false); }
  };
  const sendTest = async () => { setErr(''); setTest(null); setBusy(true); try { setTest((await post({ action: 'test' })).lines); } catch (x) { setErr(x.message); } finally { setBusy(false); } };
  const word = { sent: 'sent', skipped: 'skipped', failed: 'did not go' }, ch = { sms: 'Text message', whatsapp: 'WhatsApp', email: 'Email' };
  return (
    <div className="ads ads-set">
      <section className="ads-panel" aria-label="Safety net ceilings and thresholds">
        <div className="ph"><h2>Ads safety net</h2></div>
        <p className="sub">The numbers the safety net judges by. Leave a spending ceiling empty and that check stays off. Starting values are sensible; change them when you know better. Directors only; each change is written on the Change Log.</p>
        <form onSubmit={save} aria-label="Safety net thresholds" noValidate>
          {GROUPS.map(([title, keys]) => (
            <fieldset key={title} className="ads-facts"><legend>{title}</legend>
              {keys.map(k => { const f = d.fields[k]; return (
                <label key={k}><span>{f.label}</span>
                  <input type={f.kind === 'time' ? 'time' : f.kind === 'zone' ? 'text' : 'number'} inputMode={f.kind === 'zone' || f.kind === 'time' ? undefined : 'decimal'} step={f.kind === 'number' ? '0.1' : f.kind === 'dollars' ? '1' : undefined} min={f.kind === 'dollars' ? f.min / 100 : f.min || undefined} max={f.kind === 'dollars' ? f.max / 100 : f.max || undefined}
                    style={f.kind === 'zone' ? { width: 200 } : undefined} value={vals[k] ?? ''} onChange={e => setVals({ ...vals, [k]: e.target.value })} aria-label={f.label} />
                  <span className="ads-cap">{f.help}</span></label>); })}
            </fieldset>))}
          <div className="soc-act"><button className="soc-btn primary" disabled={busy} type="submit">{busy ? 'Saving…' : 'Save'}</button></div>
        </form>
      </section>
      <section className="ads-panel" aria-label="Who is told">
        <div className="ph"><h2>Who is told, and how</h2></div>
        <p className="ads-mode" role="status"><b>{d.twilio.label}.</b> {d.twilio.note}</p>
        <p className="sub">Everyone on the ads list (directors and the Ads role) gets email at every level. A person gets text messages and WhatsApp only when a director gives them a mobile number here. Starting choice for a person with a number: urgent by text and WhatsApp, important by WhatsApp. Numbers are personal: only the person sees their own in full, and no number is ever written in a log or on the Change Log.</p>
        <ul className="ads-people">{d.people.map(p => <Person key={p.email + (p.phone || '')} p={p} reload={async () => { await load(); }} />)}</ul>
        <div className="ads-inline"><button className="soc-btn" type="button" disabled={busy} onClick={sendTest}>Send a test alert</button><span className="ads-cap">Sends a clearly labelled TEST to you, on the ways you have set up (at most 3 an hour). Use it after adding the Twilio settings.</span></div>
        {test && <ul className="ads-facts-list" aria-label="Test result">{test.map((l, i) => <li key={i}><b>{ch[l.channel]}</b><span>{word[l.status]}{l.detail ? `: ${l.detail}` : ''}</span></li>)}</ul>}
        {err && <p className="hint err" role="alert">{err}</p>}{msg && <p className="hint" role="status">{msg}</p>}
      </section>
    </div>);
}
