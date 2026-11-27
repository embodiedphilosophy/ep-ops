// What the campaign page and the Ads list show once a campaign is in Meta (Ads PR 3): results per ad set and per ad, the trend of the last 72 hours, the rules in
// plain English, and the changes the Ad Agent made (with Reverse where it can be pressed). Reads only. The same numbers the morning rules judge on.
import { listResults, resultTotals, listActionsSince } from './adsstore.js';
import { nyDate, addDays } from './adssync.js';
import { WINDOW_DAYS, totalOf, valueOf, canReverse, usd } from './adsrules.js';

const LABEL = {
  raise_budget: ['Raised the budget', 'Would have raised the budget'], hold: ['Held', 'Would have held'], turn_off: ['Turned an ad set off', 'Would have turned an ad set off'],
  pause_ad: ['Paused an ad', 'Would have paused an ad'], reverse: ['Reversed a change', 'Reversed a change'], start: ['Started the campaign', 'Would have started the campaign'],
  pause: ['Paused the campaign', 'Would have paused the campaign'], send_to_meta: ['Sent to Meta, paused', 'Would have sent it to Meta, paused'],
};
// What counts as the Ad Agent's work (the rules, and a person reversing them); sending, starting and pausing are the person's own and are history, not "today"
const AGENT = ['raise_budget', 'hold', 'turn_off', 'pause_ad', 'reverse'];
// One change as the page shows it
export function actionView(a, adsets = []) {
  const set = adsets.find(s => s.id === a.adset_id), failed = !!a.after?.failed;
  return { id: a.id, campaign_id: a.campaign_id, at: a.at, kind: a.kind, label: (LABEL[a.kind] || [a.kind, a.kind])[a.dry_run ? 1 : 0], by: a.by === 'rules' ? 'The rules' : a.by, dry_run: a.dry_run, failed,
    detail: a.detail, adset: set?.position || null, can_reverse: canReverse(a), reversed: !!a.reversed_at, reversed_by: a.reversed_by || '' };
}

// The rules in force, one plain sentence each
export function ruleLines(rule, goal) {
  if (goal === 'Traffic') return ['Traffic campaigns have no automatic rules. Nothing here is changed on its own.'];
  if (!rule) return ['No rules are saved for this campaign.'];
  const lead = rule.metric === 'cpl', name = lead ? 'cost per lead' : 'return on ad spend', x = v => (lead ? `$${+Number(v).toFixed(2)}` : `${+Number(v).toFixed(2)}×`);
  const lines = [
    `Every morning, each ad set is judged on its last ${WINDOW_DAYS} days (a 72-hour average), one ad set at a time.`,
    `Raise an ad set’s daily budget by ${rule.raise_pct}% every ${rule.raise_every_hours} hours while its ${name} is ${lead ? 'at most' : 'at least'} ${x(rule.raise_threshold)}${rule.ceiling_cents ? `, never above ${usd(rule.ceiling_cents)} a day` : ''}.`,
    `Turn an ad set off when its ${name} ${lead ? 'rises above' : 'falls below'} ${x(rule.off_threshold)}${rule.off_min_spend_cents ? `, once it has spent at least ${usd(rule.off_min_spend_cents)}` : ''}.`,
    rule.pause_weakest_after_days > 0 ? `Pause the weakest ad in each ad set after ${rule.pause_weakest_after_days} days.` : 'The weakest ad in each ad set is left alone.',
  ];
  return lines;
}

const ofWindow = (rows, from, to) => rows.filter(r => r.date >= from && r.date <= to);
const trendOf = (rows, metric, dates) => dates.map(d => { const t = totalOf(rows.filter(r => r.date === d)); return { date: d, spend_cents: t.spend, value: valueOf(metric, t) }; });

export async function liveView(t, now = new Date()) {
  const c = t.campaign, today = nyDate(now), from = addDays(today, -WINDOW_DAYS), to = addDays(today, -1), metric = t.rules?.metric === 'cpl' || c.goal === 'Lead' ? 'cpl' : 'roas';
  const dates = Array.from({ length: WINDOW_DAYS }, (_, i) => addDays(from, i));
  const [rows, life] = await Promise.all([listResults(c.id, addDays(today, -14)), resultTotals({ campaignId: c.id })]);
  const spent = life.reduce((s, r) => s + r.spend_cents, 0), revenue = life.reduce((s, r) => s + r.revenue_cents, 0);
  const win = ofWindow(rows, from, to), whole = totalOf(win.filter(r => !r.ad_id));
  const adsets = [...t.adsets].sort((a, b) => a.position - b.position).map(a => {
    const mine = rows.filter(r => r.adset_id === a.id && !r.ad_id), w = totalOf(ofWindow(mine, from, to));
    return { id: a.id, position: a.position, name: a.audience_name, label: a.label, status: a.status, daily_budget_cents: a.daily_budget_cents, spent_cents: life.find(l => l.adset_id === a.id)?.spend_cents || 0,
      spend72_cents: w.spend, value72: valueOf(metric, w), purchases72: w.purchases, leads72: w.leads, revenue72_cents: w.revenue, trend: trendOf(mine, metric, dates),
      ads: t.ads.filter(x => x.adset_id === a.id).sort((p, q) => p.position - q.position).map(x => { const y = totalOf(ofWindow(rows.filter(r => r.ad_id === x.id), from, to)); return { id: x.id, name: x.name, status: x.status, spend72_cents: y.spend, value72: valueOf(metric, y), purchases72: y.purchases, leads72: y.leads }; }) };
  });
  const acts = t.actions.map(a => actionView(a, t.adsets)).sort((a, b) => b.at.localeCompare(a.at));
  return { metric, window: { from, to }, spent_cents: spent, cap_cents: c.spend_cap_cents || 0, revenue_cents: revenue, value72: valueOf(metric, whole), spend72_cents: whole.spend,
    synced: c.meta_settings?.sync || null, adsets, rule_lines: ruleLines(t.rules, c.goal),
    today: acts.filter(a => nyDate(a.at) === today && AGENT.includes(a.kind)), earlier: acts.filter(a => nyDate(a.at) !== today && a.kind !== 'hold').slice(0, 30) };
}

// The Ads list: each campaign in Meta with what it has spent and how the last three days went, and what the Ad Agent did today across all of them
export async function listSummary(campaigns, now = new Date()) {
  const today = nyDate(now), from = addDays(today, -WINDOW_DAYS), to = addDays(today, -1);
  const inMeta = campaigns.filter(c => ['live', 'paused', 'sent_paused', 'ended'].includes(c.status));
  if (!inMeta.length) return { byCampaign: {}, today: [] };
  const [life, recent, acts] = await Promise.all([resultTotals({}), resultTotals({ since: from, until: to }), listActionsSince(new Date(new Date(now) - 40 * 3600e3).toISOString())]);
  const byCampaign = {};
  for (const c of inMeta) {
    const metric = c.goal === 'Lead' ? 'cpl' : 'roas', mine = rs => rs.filter(r => r.campaign_id === c.id), sum = rs => rs.reduce((t, r) => ({ spend: t.spend + r.spend_cents, revenue: t.revenue + r.revenue_cents, purchases: t.purchases + r.purchases, leads: t.leads + r.leads }), { spend: 0, revenue: 0, purchases: 0, leads: 0 });
    const w = sum(mine(recent));
    byCampaign[c.id] = { spent_cents: sum(mine(life)).spend, metric, value72: valueOf(metric, w), spend72_cents: w.spend };
  }
  const names = Object.fromEntries(campaigns.map(c => [c.id, c.name]));
  return { byCampaign, today: acts.filter(a => nyDate(a.at) === today && names[a.campaign_id] && AGENT.includes(a.kind) && a.kind !== 'hold').map(a => ({ ...actionView(a), campaign: names[a.campaign_id] })), holds: acts.filter(a => nyDate(a.at) === today && a.kind === 'hold').length };
}
