// Keeps the Email Plan and Kit in step. Called whenever an email screen opens.
//   Kit scheduled or sent        → the plan row says so, with Kit's date
//   Edited in Kit only           → conflict 'kit'   (badge "Edited in Kit")
//   Edited in Ops and Kit        → conflict 'both' (the user picks one version)
//   Email gone from Kit          → conflict 'gone'
import { kitSnapshot } from './emailkit';
import { planRows, hashOf, savePlanRaw } from './emailplan';

export const kitHashOf = b => hashOf(b?.subject, b?.preview_text, b?.content);
const dayET = iso => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });

export async function syncPlan({ fresh = false } = {}) {
  const [rows, snap] = await Promise.all([planRows({ light: !fresh }), kitSnapshot({ fresh })]);
  if (snap.error && !snap.broadcasts.length) return { rows: rows.map(r => r.values), at: snap.at, error: snap.error };
  const byId = Object.fromEntries(snap.broadcasts.map(b => [String(b.id), b])), out = [];
  for (const r of rows) {
    const v = { ...r.values }; out.push(v);
    if (!v.kit_id || v.status === 'Not needed') continue;
    const b = byId[String(v.kit_id)], ch = {};
    if (!b) { if (v.conflict !== 'gone') ch.conflict = 'gone'; }
    else {
      const sent = !!b.published_at, sched = !sent && !!b.send_at;
      if (sent && v.status !== 'Sent') ch.status = 'Sent';
      else if (sched && v.status !== 'Scheduled' && v.status !== 'Sent') ch.status = 'Scheduled';
      else if (!sent && !sched && v.status === 'Scheduled') ch.status = 'Draft'; // unscheduled in Kit
      const kitDay = (b.published_at || b.send_at) && dayET(b.published_at || b.send_at); if (kitDay && kitDay !== v.planned_date) ch.planned_date = kitDay;
      const kitChanged = v.kit_hash && kitHashOf(b) !== v.kit_hash, opsChanged = v.ops_hash !== v.synced_ops_hash;
      const conflict = kitChanged ? (opsChanged ? 'both' : 'kit') : '';
      if (conflict !== (v.conflict || '')) ch.conflict = conflict;
    }
    if (Object.keys(ch).length) { Object.assign(v, ch); await savePlanRaw(r.row, r.values, ch).catch(e => console.error('Plan sync write failed', e.message)); }
  }
  return { rows: out, at: snap.at, error: snap.error, snap };
}
