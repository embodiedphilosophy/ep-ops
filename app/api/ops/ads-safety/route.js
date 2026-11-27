import { NextResponse } from 'next/server';
import { currentUser } from '@/lib/ops/auth';
import { canAds } from '@/lib/ops/nav';
import { loadTeam } from '@/lib/calendar';
import { logSettingChange } from '@/lib/ops/store';
import { hasToken, adsMode, managerUrl } from '@/lib/ops/meta-ads';
import { twilioStatus } from '@/lib/ops/twilio';
import { getConfig, saveConfig, ceilingsSet, CONFIG_FIELDS, loadPeopleSettings, resolvePeople, peopleView, saveRecipient, pageAlerts, acknowledge, sendTestAlert, makeDeps } from '@/lib/ops/alerts';
import { getWatchState, heartbeatView, runWatch } from '@/lib/ops/adswatch';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;
const bad = (error, status = 400) => NextResponse.json({ error }, { status });
const who = u => u.name || u.email;
const fieldsOut = () => Object.fromEntries(Object.entries(CONFIG_FIELDS).map(([k, f]) => [k, { label: f[0], help: f[1], min: f[2], max: f[3], kind: f[4] }]));

// The Safety net (Ads safety net PR). Directors and the Ads role, like the rest of Ads; everyone else gets 403.
// GET              → the six checks, the open alerts, the recent alert log, what needs a look, the ceilings and thresholds (to read)
// GET ?settings=1  → the editable settings and the people (directors only); a person's full number is only ever sent to that person
// POST             → ack (snooze an alert), checkNow (read Meta now); directors only: saveConfig, saveRecipient, test (send a test alert to yourself)
// Opening the page only reads what is saved; it makes no table and never calls Meta.
export async function GET(req) {
  const user = await currentUser();
  if (!canAds(user)) return bad('Ads is for directors and the Ads role', 403);
  const q = new URL(req.url).searchParams, now = new Date();
  try {
    const cfg = await getConfig(), team = await loadTeam().catch(() => []), tw = twilioStatus();
    if (q.get('settings')) {
      if (!user.director) return bad('Settings are for directors', 403);
      return NextResponse.json({ config: cfg, fields: fieldsOut(), people: peopleView(resolvePeople(team, await loadPeopleSettings(), cfg), user.email), twilio: { label: tw.label, note: tw.note, sms: tw.sms, whatsapp: tw.whatsapp }, me: user.email });
    }
    const state = await getWatchState().catch(() => null), accountSet = adsMode() !== 'not_connected' || !hasToken();
    const alerts = await pageAlerts().catch(() => ({ open: [], recent: [], error: true }));
    const day = now.getTime() - 86400e3;
    const problems = alerts.recent.flatMap(a => a.deliveries.filter(d => d.status === 'failed' && new Date(d.at).getTime() > day).map(d => ({ at: d.at, alert: a.title, who: d.who, channel: d.channel, detail: d.detail })));
    const hb = { id: 'heartbeat', title: 'The safety net itself', ...heartbeatView(state, cfg, now, { token: hasToken(), accountSet }) };
    return NextResponse.json({
      now: now.toISOString(), token: hasToken(), account_set: accountSet, last_run_at: state?.last_run_at || null, last_ok_at: state?.last_ok_at || null,
      board: [...(state?.board || []).filter(c => c.id !== 'heartbeat'), hb], numbers: state?.numbers || {}, flagged: state?.flagged || [], manager_url: managerUrl(),
      ceilings_set: ceilingsSet(cfg), ceilings: { daily_cents: cfg.daily_ceiling_cents, monthly_cents: cfg.monthly_ceiling_cents }, config: cfg, fields: fieldsOut(),
      alerts, problems, channels: { label: tw.label, sms: tw.sms, whatsapp: tw.whatsapp }, can_edit: !!user.director,
    });
  } catch (e) { console.error('Safety net read failed', String(e.message || e).slice(0, 200)); return bad('Couldn’t read the safety net', 502); }
}

export async function POST(req) {
  const user = await currentUser();
  if (!canAds(user)) return bad('Ads is for directors and the Ads role', 403);
  const b = await req.json().catch(() => ({})), me = who(user), director = () => (user.director ? null : bad('Settings are for directors', 403));
  try {
    if (b.action === 'ack') {
      const r = await acknowledge(String(b.id || ''), me, b.hours);
      return r.ok ? NextResponse.json({ ok: true, hours: r.hours, message: `Acknowledged. It won’t repeat for ${r.hours} hour${r.hours === 1 ? '' : 's'} unless it gets worse.` }) : bad(r.error, r.status || 400);
    }
    if (b.action === 'checkNow') {
      const state = await getWatchState().catch(() => null);
      if (state?.last_run_at && Date.now() - new Date(state.last_run_at).getTime() < 60e3) return NextResponse.json({ ok: true, message: 'It was checked a moment ago.' });
      const r = await runWatch({ team: await loadTeam({ fresh: true }).catch(() => []), base: process.env.OPS_URL || new URL(req.url).origin });
      return NextResponse.json({ ok: true, message: r.notConnected ? 'Meta isn’t connected, so there was nothing to check.' : `Checked. ${r.alerts?.filter(a => a.send).length || 0} message${r.alerts?.filter(a => a.send).length === 1 ? '' : 's'} sent.` });
    }
    if (b.action === 'saveConfig') {
      const no = director(); if (no) return no;
      const r = await saveConfig(b.values, me, logSettingChange);
      return NextResponse.json({ ok: true, config: r, changed: r.changed });
    }
    if (b.action === 'saveRecipient') {
      const no = director(); if (no) return no;
      const team = await loadTeam({ fresh: true }), r = await saveRecipient(b.email, b.patch || {}, me, team, logSettingChange);
      const cfg = await getConfig();
      return NextResponse.json({ ok: true, changed: r.changed, people: peopleView(resolvePeople(team, await loadPeopleSettings(), cfg), user.email) });
    }
    if (b.action === 'test') {
      const no = director(); if (no) return no;
      const cfg = await getConfig(), team = await loadTeam({ fresh: true }), people = resolvePeople(team, await loadPeopleSettings(), cfg), person = people.find(p => p.email === String(user.email).toLowerCase());
      if (!person) return bad('You aren’t on the ads list, so there is nobody to send the test to.');
      const r = await sendTestAlert({ person, people, cfg, base: process.env.OPS_URL || new URL(req.url).origin, deps: makeDeps() });
      return r.ok ? NextResponse.json(r) : bad(r.error, r.status || 400);
    }
    return bad('Unknown request');
  } catch (e) { console.error('Safety net write failed', String(e.message || e).slice(0, 200)); return bad(e.user ? e.message : 'Couldn’t do that. Try again in a moment.', e.user ? 400 : 502); }
}
