// The daily ad digest (Ads PR 3): after the morning rules, one plain-English email for the people who may use Ads (directors and the Ads role): what each running
// campaign did yesterday, and what the rules did, or would have done, each change with a link to its Reverse button. Sent only when there is something to report.
// Built here, sent by the route through the same Resend mail the other digests use; nothing in this file sends.
import { resultTotals, listRows } from './adsstore.js';
import { nyDate, addDays } from './adssync.js';
import { valueOf, usd } from './adsrules.js';
import { layout, button, esc } from './email.js';

export const adsRecipients = team => [...new Set((team || []).filter(m => m.email && (m.director || (m.roles || []).some(r => /^ads$/i.test(String(r).trim())))).map(m => m.email.trim().toLowerCase()))];

const yesterdayText = (c, t) => {
  if (!t.spend) return 'Nothing was spent yesterday.';
  const part = c.goal === 'Lead' ? `${t.leads} lead${t.leads === 1 ? '' : 's'}` : `${t.purchases} purchase${t.purchases === 1 ? '' : 's'}`, v = valueOf(c.goal === 'Lead' ? 'cpl' : 'roas', t);
  return `Yesterday it spent ${usd(t.spend)} and brought ${part}${v == null ? '' : c.goal === 'Lead' ? (v === Infinity ? '' : `, ${usd(Math.round(v * 100))} a lead`) : `, a return on ad spend of ${+v.toFixed(2)}×`}.`;
};

// run: what runMorningRules returned. Returns null when there is nothing to report.
export async function buildDigest({ run, base, now = new Date() }) {
  const yday = addDays(nyDate(now), -1), sections = [];
  const live = (await listRows('campaigns')).filter(c => ['live', 'paused'].includes(c.status));
  for (const c of live) {
    const t = (await resultTotals({ campaignId: c.id, since: yday, until: yday })).reduce((n, r) => ({ spend: n.spend + r.spend_cents, revenue: n.revenue + r.revenue_cents, purchases: n.purchases + r.purchases, leads: n.leads + r.leads }), { spend: 0, revenue: 0, purchases: 0, leads: 0 });
    const ds = (run.campaigns.find(x => x.id === c.id)?.decisions) || [], changes = ds.filter(d => d.kind !== 'hold'), held = ds.length - changes.length;
    if (!t.spend && !changes.length) continue;
    sections.push({ id: c.id, name: c.name, yesterday: yesterdayText(c, t), spent_cents: t.spend, held,
      changes: changes.map(d => ({ id: d.id, applied: d.applied, failed: d.failed, text: `${d.applied || d.failed ? '' : '(Dry run, nothing changed) '}${d.detail}`, reverse: d.applied && d.id ? `${base}/ops/ads/${c.id}#change-${d.id}` : '' })) });
  }
  if (!sections.length) return null;
  const made = sections.flatMap(s => s.changes).filter(x => x.applied).length, would = sections.flatMap(s => s.changes).filter(x => !x.applied).length, spent = sections.reduce((n, s) => n + s.spent_cents, 0);
  const subject = made ? `Ads this morning: ${made} change${made === 1 ? '' : 's'} made by the rules` : would ? `Ads this morning: ${would} change${would === 1 ? '' : 's'} the rules would have made (dry run)` : `Ads yesterday: ${usd(spent)} spent`;
  const body = (run.locks && !run.locks.open && would ? `<p style="background:#F4E3C4;padding:10px 12px"><b>${esc(run.locks.text)}.</b> These are what Ops’ rules would have done, shown beside Make’s Ad Agent.</p>` : '')
    + sections.map(s => `<h2 style="font-size:18px;margin:18px 0 4px"><a href="${esc(`${base}/ops/ads/${s.id}`)}" style="color:#1E1A14">${esc(s.name)}</a></h2><p style="margin:0 0 6px">${esc(s.yesterday)}</p>`
      + (s.changes.length ? `<ul>${s.changes.map(x => `<li>${esc(x.text)}${x.reverse ? ` <a href="${esc(x.reverse)}">Reverse</a>` : ''}</li>`).join('')}</ul>` : '')
      + (s.held ? `<p style="margin:0;color:#6b6358">${s.held} ad set${s.held === 1 ? ' was' : 's were'} left as ${s.held === 1 ? 'it was' : 'they were'}.</p>` : '')).join('')
    + button(`${base}/ops/ads`, 'Open Ads');
  return { subject, sections, html: layout(subject, body), made, would };
}
