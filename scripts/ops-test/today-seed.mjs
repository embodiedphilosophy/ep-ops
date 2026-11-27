// Seeds the mock with what Today's new parts read, so they have something to show (mock only; run it on a fresh run.sh, BEFORE the first Today load,
// because the app keeps sheet reads for five minutes): a Change Log with automatic and human lines over the last day, and an Email Plan with one
// email "Ready for Jake". Used by today.cjs and today-reads.mjs (`--seed`).  node scripts/ops-test/today-seed.mjs
const M = process.env.M || 'http://localhost:4555', S = `${M}/v4/spreadsheets/mock-sheet`;
const call = async (url, method, body) => { const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); if (!r.ok && r.status !== 400) throw new Error(`${method} ${url} → ${r.status}`); return r.status; };
const iso = minutesAgo => new Date(Date.now() - minutesAgo * 60e3).toISOString();

export async function seed() {
  // three real session ids from the mock's Schedule tab, so the lines can name them
  const sched = await (await fetch(`${S}/values/${encodeURIComponent("'Schedule'!A4")}`)).json();
  const ids = (sched.values || []).slice(1).map(r => r[0]).filter(x => /^E\d+$/.test(x)).slice(0, 4);
  const ahead = n => new Date(Date.now() + n * 864e5).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  await call(`${S}:batchUpdate`, 'POST', { requests: [{ addSheet: { properties: { title: 'Change Log' } } }] });
  await call(`${S}:batchUpdate`, 'POST', { requests: [{ addSheet: { properties: { title: 'Email Plan' } } }] });
  const log = [['when', 'who', 'tab', 'id', 'field', 'from', 'to'],
    [iso(95), 'Zoom sync', 'Event Details', ids[0], 'Zoom Link', '', 'https://zoom.example/j/1'], [iso(94), 'Zoom sync', 'Event Details', ids[1], 'Zoom Link', '', 'https://zoom.example/j/2'], [iso(93), 'Zoom sync', 'Event Details', ids[2], 'Zoom Link', '', 'https://zoom.example/j/3'],
    [iso(70), 'Instagram sync', 'Social: Post History', 'rows 40–42', '(new rows)', '', '3 from Instagram'],
    [iso(40), 'Floss Harry', 'Event Details', ids[3], 'Public Title', 'Old title', 'New title'],
    [iso(35), 'Jacob Kyle', 'Schedule', ids[3], 'Time', '11am ET', '12pm ET'],   // the director's own change: left out of his own log
    [iso(60 * 72), 'Kit sync', 'Email Plan', 'EM001', 'status', 'Draft', 'Ready for Jake']]; // three days ago: too old
  await call(`${S}/values/${encodeURIComponent(`'Change Log'!A1:G${log.length}`)}`, 'PUT', { values: log });
  const head = ['id', 'event_id', 'launch_id', 'step', 'type', 'planned_date', 'planned_time_et', 'owner', 'status', 'kit_id', 'kit_type', 'revision', 'last_synced', 'conflict', 'subject', 'preview_text', 'blocks_json', 'audience_json', 'ops_hash', 'kit_hash', 'synced_ops_hash', 'note', 'updated_by', 'updated_at'];
  const row = o => head.map(h => o[h] ?? '');
  const plan = [head, row({ id: 'EM001', type: 'broadcast', planned_date: ahead(3), planned_time_et: '9:00', owner: 'Floss', status: 'Ready for Jake', subject: 'Road to Resolution #1', updated_by: 'Floss Harry' }),
    row({ id: 'EM002', type: 'broadcast', planned_date: ahead(5), planned_time_et: '9:00', owner: 'Floss', status: 'Draft', subject: 'Not ready yet', updated_by: 'Floss Harry' })];
  await call(`${S}/values/${encodeURIComponent(`'Email Plan'!A1:X${plan.length}`)}`, 'PUT', { values: plan });
  return { ids };
}
if (import.meta.url === `file://${process.argv[1]}`) console.log('seeded', JSON.stringify(await seed()));
