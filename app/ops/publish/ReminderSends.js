'use client';
import { useEffect, useState } from 'react';
import { Layout, useSide } from '../email/EmailKit';

const when = iso => new Date(iso).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'America/New_York' }) + ' ET';
const STATE = { new: 'Will be made', made: 'Made', exists: 'Already made', skip: 'Skipped' };

// Publish › Reminder sends: the emails the reminder rules will make in the next two weeks (the same list each rule shows under it in Settings),
// all together and in date order. Read only: the rules themselves are edited in Settings › Student reminders.
export default function ReminderSends() {
  const [d, setD] = useState(null), [err, setErr] = useState(''), [panel, setPanel] = useState(false), side = useSide(panel);
  useEffect(() => { fetch('/api/ops/email/reminders').then(async r => { const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || 'Couldn’t read the reminders'); setD(j); }).catch(e => setErr(e.message)); }, []);
  const rows = (d?.upcoming || []).filter(u => u.send_at).sort((a, b) => String(a.send_at).localeCompare(String(b.send_at)));
  return (
    <Layout title={<>Reminder <em>sends</em></>} intro="The reminder emails that are due in the next two weeks, from every rule, in date order. Kit sends nothing from this page: a rule makes each email as a draft unless it is set to schedule itself." panel={panel} setPanel={setPanel} d={side}>
      {err && <p className="hint err" role="alert">{err}</p>}
      {d?.kitError && <p className="em-banner bad" role="status">{d.kitError}</p>}
      {!d && !err ? <p className="ops-empty">Reading the rules…</p> : d && (
        <section className="soc-panel" aria-label="Coming up">
          <div className="ph"><h2>Coming up</h2><a className="soc-btn small" href="/ops/settings?view=templates&s=reminders">Change the rules</a></div>
          {!rows.length ? <p className="ops-empty">No reminders are due. Every rule starts off: switch one on in Settings.</p> : (
            <ul className="em-list">{rows.map(u => <li key={u.key || `${u.rule.id}${u.event.id}${u.send_at}`} className="em-row"><div className="b"><span className="mono meta">{when(u.send_at)}</span> · {u.event.title} <span className="gchip">{STATE[u.state] || u.state}</span>
              <br /><span className="sub">{u.rule.name}{u.rule.enabled ? '' : ' (rule is off)'}{u.why ? ` · ${u.why}` : ''}</span></div></li>)}</ul>)}
        </section>)}
      {d && <section className="soc-panel" aria-label="Handled elsewhere"><div className="ph"><h2>Handled elsewhere</h2><span className="sub">Not rules here, on purpose.</span></div>
        <ul className="em-list">{(d.builtIn || []).map(b => <li key={b.key} className="em-row"><div className="b"><b>{b.name}</b><br /><span className="sub">{b.how}</span></div></li>)}</ul></section>}
    </Layout>);
}
