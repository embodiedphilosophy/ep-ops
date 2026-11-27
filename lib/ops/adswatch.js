// The ad safety net's watchdog (Ads safety net PR). Every hour it READS Meta (the client's read functions only: no write, no pausing, nothing is created, changed or started in
// Meta) across the WHOLE ad account, not only the campaigns Ops built, and says in plain English when money is at risk. It needs only META_ADS_TOKEN and the ad account.
//
// Six checks (each a card on the Safety page, green / amber / red):
//   1. Spending against the daily and monthly ceilings a director set in Settings (a check stays off until its ceiling is set).
//   2. Ads that should be off: running after their end time; an Ops campaign past its end date; running with no end and no cap; spending with no purchases or sign-ups for
//      N days; return under the floor over the last 3 full days.
//   3. A spend spike: today, worked out for the whole day, against the last 7 days' average.
//   4. Tracking: Meta's pixel has not fired for a day while ads are running (spending blind).
//   5. Payment and account: the account is not active, a payment has failed or there is no payment method, ads are rejected.
//   6. The safety net itself: if the hourly read has not completed for more than 3 hours (or Meta can't be read, or there is no token), that is itself an alert.
// The alerts go through lib/ops/alerts.js (levels, quiet hours, repeats, acknowledge, resolve). A person pauses anything: Ops-built campaigns have Pause and Reverse on their own
// page (Ads PR 2 and 3); others open in Meta's own tool. "Pause it for me" is a later, explicit decision, not part of this.
import { hasToken, getAccount, getPixel, hasPaymentMethod, listAllCampaigns, listAllAdSets, listAdsWithIssues, getAccountInsights, managerUrl } from './meta-ads.js';
import { peekRows } from './adsstore.js';
import { getConfig, ceilingsSet, readSettingValue, writeSetting, resolvePeople, loadPeopleSettings, makeDeps, raiseAlert, resolveAlerts, flushQueued, localMinutes } from './alerts.js';
import { usd } from './adsrules.js';

const HOUR = 3600e3, STATE_KEY = 'watch_state', NY = 'America/New_York';
export const dayIn = (d, tz = NY) => new Date(d).toLocaleDateString('en-CA', { timeZone: tz });
const plusDays = (date, n) => { const x = new Date(`${date}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const when = (iso, tz = NY) => new Date(iso).toLocaleString('en-US', { timeZone: tz, weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) + (tz === NY ? ' ET' : '');
const ago = ms => { const h = ms / HOUR; return h < 1 ? `${Math.max(1, Math.round(h * 60))} minutes` : h < 48 ? `${Math.round(h * 10) / 10} hours` : `${Math.round(h / 24)} days`; };
const sum = (rows, f) => rows.reduce((n, r) => n + (r[f] || 0), 0);
const list = (names, max = 4) => (names.length <= max ? names : [...names.slice(0, max), `and ${names.length - max} more`]).join('; ');
const ACCOUNT_STATUS = { 2: 'disabled', 3: 'has an unsettled payment', 7: 'under risk review', 8: 'waiting on a payment to settle', 9: 'in a grace period after a failed payment', 100: 'about to close', 101: 'closed', 201: 'not active', 202: 'closed' };
const PAYMENT_STATUS = [3, 8, 9];
const RESULT_GOALS = /SALES|LEADS|CONVERSIONS|LEAD_GENERATION|CATALOG/i;   // campaigns that are expected to bring purchases or sign-ups (not traffic, reach or awareness)
const SAFETY = '/ops/ads?view=safety';

// The checks and the keys of the alerts each can raise (a check that couldn't run leaves its open alerts alone; they are only closed by a check that ran and found nothing)
export const CHECKS = {
  spend: ['Spending against your ceilings', ['pacing-daily', 'pacing-month']],
  forgotten: ['Ads that should be off', ['past-end', 'past-ops-end', 'open-ended', 'zero-results', 'low-return']],
  spike: ['A sudden jump in spending', ['spike']],
  tracking: ['Tracking: is Meta counting results?', ['pixel', 'pixel-early']],
  account: ['Payment and account', ['account', 'payment', 'ad-issues']],
  heartbeat: ['The safety net itself', ['heartbeat']],
};
export const keysOf = ids => new Set(ids.flatMap(i => CHECKS[i][1]));

// ---- The saved state: when the last read finished, the board and what needed a look (the Safety page reads this; it never calls Meta itself)
export const getWatchState = async () => (await readSettingValue(STATE_KEY, null)) || null;

// ---- Reading (Meta, read only)
async function collect(now) {
  const account = await getAccount(), tz = (account.ok && account.timezone_name) || NY, today = dayIn(now, tz), month = today.slice(0, 8) + '01', since = plusDays(today, -8);
  const [pixel, campaigns, adsets, issues, acct, camp] = await Promise.all([getPixel(), listAllCampaigns(), listAllAdSets(), listAdsWithIssues(),
    getAccountInsights({ level: 'account', since: month < since ? month : since, until: today }), getAccountInsights({ level: 'campaign', since, until: today })]);
  const ops = (await peekRows('campaigns', {}, { limit: 300 }).catch(() => [])).filter(c => c.meta_campaign_id && !c.meta_campaign_id.startsWith('dryrun-'));
  return { account, pixel, campaigns, adsets, issues, acct, camp, ops, tz, today };
}
const firstError = snap => ['account', 'campaigns', 'acct'].map(k => snap[k]).find(r => !r.ok);

// ---- Judging (pure: no Meta, no database)
export function evaluate(snap, cfg, now) {
  const tz = snap.tz || NY, today = snap.today || dayIn(now, tz), t = new Date(now).getTime();
  const alerts = [], board = [], checked = new Set(), flagged = new Map(), numbers = {};
  const opsBy = new Map((snap.ops || []).map(c => [c.meta_campaign_id, c]));
  const camps = snap.campaigns?.ok ? snap.campaigns.data || [] : [], byId = new Map(camps.map(c => [c.id, c]));
  const active = camps.filter(c => c.effective_status === 'ACTIVE'), nameOf = id => byId.get(id)?.name || `Campaign ${id}`;
  const link = ids => (ids.length === 1 && opsBy.get(ids[0]) ? `/ops/ads/${opsBy.get(ids[0]).id}` : SAFETY);
  const flag = (id, why) => { const o = opsBy.get(id), f = flagged.get(id) || { id, name: nameOf(id), ops_id: o?.id || '', manager_url: managerUrl(id), problems: [] }; f.problems.push(why); flagged.set(id, f); };
  const push = a => alerts.push(a);
  const status = ids => { const mine = alerts.filter(a => keysOf([ids]).has(a.key)); return mine.some(a => a.level === 'urgent') ? 'red' : mine.length ? 'amber' : 'green'; };
  const card = (id, headline, detail = '') => board.push({ id, title: CHECKS[id][0], status: status(id), headline, detail });
  const unknown = id => board.push({ id, title: CHECKS[id][0], status: 'grey', headline: 'Couldn’t be checked this time (Meta didn’t answer fully). The last result stands until the next hour.', detail: '' });

  // account-wide daily rows and campaign daily rows
  const acctRows = snap.acct?.ok ? snap.acct.rows : null, campRows = snap.camp?.ok ? snap.camp.rows : null;
  let spentToday = 0, mtd = 0, avg7 = 0, projected = 0;
  if (acctRows) {
    const by = d => sum(acctRows.filter(r => r.date === d), 'spend_cents'), month = today.slice(0, 8) + '01';
    spentToday = by(today); mtd = sum(acctRows.filter(r => r.date >= month && r.date <= today), 'spend_cents');
    avg7 = Math.round(Array.from({ length: 7 }, (_, i) => by(plusDays(today, -(i + 1)))).reduce((a, b) => a + b, 0) / 7);
    const dim = new Date(Date.UTC(+today.slice(0, 4), +today.slice(5, 7), 0)).getUTCDate(), left = dim - +today.slice(8, 10);
    projected = mtd - spentToday + Math.max(spentToday, avg7) + avg7 * left;
    Object.assign(numbers, { spent_today_cents: spentToday, mtd_cents: mtd, avg7_cents: avg7, projected_cents: Math.round(projected), daily_ceiling_cents: cfg.daily_ceiling_cents, monthly_ceiling_cents: cfg.monthly_ceiling_cents });
  }
  const todayByCamp = campRows ? Object.entries(campRows.filter(r => r.date === today).reduce((m, r) => ((m[r.campaign_id] = (m[r.campaign_id] || 0) + r.spend_cents), m), {})).sort((a, b) => b[1] - a[1]) : [];
  const topToday = todayByCamp.slice(0, 3).map(([id, c]) => `${nameOf(id)} (${usd(c)})`);

  // 1. Pacing
  if (acctRows) {
    checked.add('pacing-daily'); checked.add('pacing-month');
    const dc = cfg.daily_ceiling_cents, mc = cfg.monthly_ceiling_cents, act = 'What to do: open the Safety net page, find what is spending the most, and pause it. Campaigns built in Ops have a Pause button; any others open in Meta Ads Manager from that page.';
    if (dc > 0 && spentToday >= dc * 0.8) {
      const over = spentToday > dc;
      push({ key: 'pacing-daily', level: over ? 'urgent' : 'important', title: over ? 'Today’s ad spending is past your daily ceiling' : 'Today’s ad spending is close to your daily ceiling', measure: spentToday, link: SAFETY,
        short: `Ads have spent ${usd(spentToday)} today. Your daily ceiling is ${usd(dc)}.`, numbers: { spent_today_cents: spentToday, ceiling_cents: dc },
        body: `The ad account has spent ${usd(spentToday)} so far today. Your daily ceiling is ${usd(dc)} (${Math.round((spentToday / dc) * 100)}% of it).${topToday.length ? `\nSpending the most today: ${topToday.join('; ')}.` : ''}\n${act}` });
    }
    if (mc > 0 && (mtd >= mc * 0.8 || projected > mc)) {
      const over = projected > mc || mtd > mc;
      push({ key: 'pacing-month', level: over ? 'urgent' : 'important', title: mtd > mc ? 'This month’s ad spending is past your monthly ceiling' : over ? 'This month is on course to pass your monthly ceiling' : 'This month’s ad spending has reached 80% of your monthly ceiling', measure: Math.max(projected, mtd), link: SAFETY,
        short: `Ads have spent ${usd(mtd)} this month; on course for ${usd(Math.round(projected))}. Ceiling ${usd(mc)}.`, numbers: { mtd_cents: mtd, projected_cents: Math.round(projected), ceiling_cents: mc },
        body: `So far this month the ad account has spent ${usd(mtd)}. At the pace of the last 7 days (${usd(avg7)} a day) the month would end at about ${usd(Math.round(projected))}. Your monthly ceiling is ${usd(mc)}.\n${act}` });
    }
    const dcOn = dc > 0, mcOn = mc > 0;
    card('spend', !dcOn && !mcOn ? 'Not set. Set your ceilings so the safety net can watch spending.' : `${usd(spentToday)} spent today${dcOn ? ` of ${usd(dc)}` : ''}; ${usd(mtd)} this month${mcOn ? ` of ${usd(mc)} (on course for about ${usd(Math.round(projected))})` : ''}.`);
    if (!dcOn || !mcOn) { const c = board.at(-1); if (c.status === 'green') c.status = 'amber'; c.detail = `${!dcOn ? 'No daily ceiling set. ' : ''}${!mcOn ? 'No monthly ceiling set.' : ''}`.trim(); }
  } else unknown('spend');

  // 2. Ads that should be off
  if (snap.campaigns?.ok && campRows) {
    ['past-end', 'past-ops-end', 'open-ended', 'zero-results', 'low-return'].forEach(k => checked.add(k));
    const past = [], now2 = t - 2 * HOUR;   // Meta stops delivery at the end time; allow two hours for it to catch up
    for (const c of active) if (c.stop_time && new Date(c.stop_time).getTime() < now2) past.push({ id: c.id, text: `${c.name} (its end time was ${when(c.stop_time, tz)})` });
    const setsOf = id => (snap.adsets?.ok ? snap.adsets.data : []).filter(s => s.campaign_id === id);
    for (const s of snap.adsets?.ok ? snap.adsets.data : []) if (s.effective_status === 'ACTIVE' && s.end_time && new Date(s.end_time).getTime() < now2 && byId.get(s.campaign_id)?.effective_status === 'ACTIVE') past.push({ id: s.campaign_id, text: `${s.name} in ${nameOf(s.campaign_id)} (ad set end time was ${when(s.end_time, tz)})` });
    if (past.length) {
      const ids = [...new Set(past.map(p => p.id))], spentNow = ids.reduce((n, id) => n + (todayByCamp.find(([x]) => x === id)?.[1] || 0), 0);
      past.forEach(p => flag(p.id, 'Still running after its end time'));
      push({ key: 'past-end', level: 'urgent', title: `${ids.length === 1 ? 'An ad is' : `${ids.length} campaigns are`} still running after ${ids.length === 1 ? 'its' : 'their'} end time`, measure: ids.length * 1000 + spentNow / 100, link: link(ids), numbers: { campaigns: ids.length, spent_today_cents: spentNow },
        short: `${ids.length} campaign${ids.length === 1 ? ' is' : 's are'} still running past ${ids.length === 1 ? 'its' : 'their'} end time (${usd(spentNow)} spent today).`,
        body: `Still running after the end time they were given: ${list(past.map(p => p.text))}. Together they have spent ${usd(spentNow)} today.\nWhat to do: pause ${ids.length === 1 ? 'it' : 'them'}. ${ids.length === 1 && opsBy.get(ids[0]) ? 'This one was built in Ops: open it and press Pause.' : 'Open them from the Safety net page (a button opens each in Meta Ads Manager).'}` });
    }
    const late = []; // Ops-built campaigns whose own end date (the launch's closing day) has passed
    for (const c of active) { const o = opsBy.get(c.id); if (o?.end_date && today > o.end_date && !past.some(p => p.id === c.id)) late.push({ c, o }); }
    if (late.length) {
      late.forEach(({ c }) => flag(c.id, 'Still running after the date it was built to end'));
      push({ key: 'past-ops-end', level: 'urgent', title: `${late.length === 1 ? 'A campaign built in Ops is' : `${late.length} campaigns built in Ops are`} still running after ${late.length === 1 ? 'its' : 'their'} end date`, measure: late.length, link: link(late.map(l => l.c.id)),
        numbers: { campaigns: late.length }, short: `${late.map(l => l.c.name).join(', ')} should have ended (end date passed).`,
        body: `These were built in Ops to end on a date that has now passed, and Meta still has them running: ${list(late.map(l => `${l.c.name} (was to end ${l.o.end_date})`))}.\nWhat to do: open ${late.length === 1 ? 'it' : 'each'} from the Safety net page and press Pause. Reverse is there if you pause by mistake.` });
    }
    const open = active.filter(c => !c.stop_time && !Number(c.lifetime_budget) && !Number(c.spend_cap) && !setsOf(c.id).some(s => s.effective_status === 'ACTIVE' && (s.end_time || Number(s.lifetime_budget))) && !past.some(p => p.id === c.id));
    numbers.open_ended = open.length;
    if (open.length) {
      open.forEach(c => flag(c.id, 'Running with no end date and no spending cap'));
      push({ key: 'open-ended', level: 'important', title: `${open.length} running campaign${open.length === 1 ? ' has' : 's have'} no end date and no cap`, measure: open.length, link: link(open.map(c => c.id)), numbers: { campaigns: open.length },
        short: `${open.length} campaign${open.length === 1 ? '' : 's'} could run forever: ${open.map(c => c.name).slice(0, 2).join(', ')}.`,
        body: `These are running with no end date and no lifetime cap, so nothing would ever stop them: ${list(open.map(c => c.name))}.\nIf one is meant to run for good, press Acknowledge on the Safety net page. If not, give it an end date in Meta or pause it.` });
    }
    // Spending and bringing nothing / returning too little, from the full days before today
    const days = (a, b) => campRows.filter(r => r.date >= plusDays(today, -a) && r.date <= plusDays(today, -b)), zero = [], low = [];
    const zrows = days(cfg.zero_days, 1), lrows = days(3, 1);
    for (const c of active) {
      if (!RESULT_GOALS.test(c.objective || '')) continue;
      const z = zrows.filter(r => r.campaign_id === c.id), zs = sum(z, 'spend_cents'), zDays = new Set(z.filter(r => r.spend_cents > 0).map(r => r.date)).size;
      if (zDays >= cfg.zero_days && zs >= cfg.zero_min_cents && sum(z, 'purchases') + sum(z, 'leads') === 0) zero.push({ c, spend: zs });
      const l = lrows.filter(r => r.campaign_id === c.id), ls = sum(l, 'spend_cents'), lr = sum(l, 'revenue_cents');
      if (ls >= cfg.floor_min_cents && (sum(l, 'purchases') > 0 || lr > 0) && lr / ls < cfg.floor_roas) low.push({ c, spend: ls, roas: lr / ls });
    }
    if (zero.length) {
      const total = sum(zero.map(z => ({ s: z.spend })), 's'), urgent = zero.some(z => z.spend >= cfg.urgent_multiple * cfg.zero_min_cents);
      zero.forEach(z => flag(z.c.id, `Spent ${usd(z.spend)} in ${cfg.zero_days} days with nothing to show`));
      push({ key: 'zero-results', level: urgent ? 'urgent' : 'important', title: `${zero.length === 1 ? 'A campaign has' : `${zero.length} campaigns have`} spent ${usd(total)} with no purchases or sign-ups`, measure: total, link: link(zero.map(z => z.c.id)), numbers: { campaigns: zero.length, spent_cents: total },
        short: `${zero.length} campaign${zero.length === 1 ? '' : 's'} spent ${usd(total)} in ${cfg.zero_days} days with no results.`,
        body: `In the last ${cfg.zero_days} days these spent money and brought no purchases or sign-ups: ${list(zero.map(z => `${z.c.name} (${usd(z.spend)})`))}.\nWhat to do: look at the ad and the page it sends people to, and pause ${zero.length === 1 ? 'it' : 'them'} if you can’t see why. Tracking being broken would also cause this: see the tracking card.` });
    }
    if (low.length) {
      const total = sum(low.map(z => ({ s: z.spend })), 's'), urgent = low.some(z => z.spend >= cfg.urgent_multiple * cfg.floor_min_cents);
      low.forEach(z => flag(z.c.id, `Return ${z.roas.toFixed(2)}× on ${usd(z.spend)}`));
      push({ key: 'low-return', level: urgent ? 'urgent' : 'important', title: `${low.length === 1 ? 'A campaign is' : `${low.length} campaigns are`} bringing back less than ${cfg.floor_roas}× what ${low.length === 1 ? 'it spends' : 'they spend'}`, measure: total, link: link(low.map(z => z.c.id)), numbers: { campaigns: low.length, spent_cents: total },
        short: `${low.length} campaign${low.length === 1 ? '' : 's'} returning under ${cfg.floor_roas}× (${usd(total)} spent in 3 days).`,
        body: `Over the last 3 full days: ${list(low.map(z => `${z.c.name} returned ${z.roas.toFixed(2)}× on ${usd(z.spend)}`))}. Your lowest acceptable return is ${cfg.floor_roas}× and the aim is ${cfg.target_roas}× or more.\nWhat to do: pause ${low.length === 1 ? 'it' : 'them'}, or lower the budget, until the ad is better.` });
    }
    const here = alerts.filter(a => CHECKS.forgotten[1].includes(a.key));
    card('forgotten', here.length ? `${here.length} thing${here.length === 1 ? '' : 's'} to look at: ${here.map(a => a.title.replace(/^\d+ /, '')).slice(0, 2).join('; ')}.` : `Nothing forgotten: ${active.length} campaign${active.length === 1 ? ' is' : 's are'} running, all with an end or a cap.`, snap.campaigns.truncated || snap.camp?.truncated ? 'The account is so big that part of it was not read this time.' : '');
  } else unknown('forgotten');
  numbers.active_campaigns = active.length; numbers.campaigns_total = camps.length;

  // 3. Spike
  if (acctRows && campRows) {
    checked.add('spike');
    const hours = Math.max(localMinutes(now, tz) / 60, 0.01), proj = cents => cents * 24 / hours, spikes = [];
    if (hours >= 4) {
      for (const [id, spent] of todayByCamp) {
        const avg = Math.round(sum(campRows.filter(r => r.campaign_id === id && r.date >= plusDays(today, -7) && r.date <= plusDays(today, -1)), 'spend_cents') / 7);
        if (avg > 0 && spent >= cfg.spike_min_cents && proj(spent) > cfg.spike_multiple * avg) spikes.push({ id, spent, avg });
      }
      if (avg7 > 0 && spentToday >= cfg.spike_min_cents && proj(spentToday) > cfg.spike_multiple * avg7 && !spikes.length) spikes.push({ id: '', spent: spentToday, avg: avg7 });
    }
    if (spikes.length) {
      spikes.filter(s => s.id).forEach(s => flag(s.id, `Spent ${usd(s.spent)} so far today against a usual ${usd(s.avg)} a day`));
      const spent = sum(spikes, 'spent');
      push({ key: 'spike', level: 'urgent', title: spikes[0].id ? `${spikes.length === 1 ? 'A campaign is' : `${spikes.length} campaigns are`} spending far more than usual today` : 'The ad account is spending far more than usual today', measure: spent, link: link(spikes.map(s => s.id).filter(Boolean)), numbers: { spent_today_cents: spent },
        short: `Ads are spending about ${cfg.spike_multiple}× or more than a usual day (${usd(spentToday)} so far today).`,
        body: `At this hour the account has spent ${usd(spentToday)} today; a usual day is about ${usd(avg7)}. ${spikes.some(s => s.id) ? `Furthest above its usual: ${list(spikes.filter(s => s.id).map(s => `${nameOf(s.id)} (${usd(s.spent)} so far, usually ${usd(s.avg)} a day)`))}.` : ''}\nWhat to do: open the Safety net page, find what changed (a budget raised, a new ad set, a fast-spending ad) and pause it if it isn’t meant.` });
    }
    card('spike', spikes.length ? 'Spending today is well above a usual day.' : hours < 4 ? 'Too early in the day to judge a spike. Checked again each hour.' : `Today is in line with the last 7 days (about ${usd(avg7)} a day).`);
  } else unknown('spike');

  // 4. Tracking
  if (snap.pixel && (snap.pixel.ok || !snap.pixel.notConnected) && snap.campaigns?.ok) {
    const px = snap.pixel;
    if (px.ok) {
      checked.add('pixel'); checked.add('pixel-early');
      const age = px.last_fired_time ? (t - new Date(px.last_fired_time).getTime()) / HOUR : Infinity;
      numbers.pixel_last_fired = px.last_fired_time || ''; numbers.pixel_hours = Number.isFinite(age) ? Math.round(age * 10) / 10 : null;
      if (active.length && (age >= 24 || px.is_unavailable)) {
        push({ key: 'pixel', level: 'urgent', title: 'Meta’s tracking pixel has gone quiet while ads are running', measure: Number.isFinite(age) ? age : 999, link: SAFETY, numbers: { hours: numbers.pixel_hours, active: active.length },
          short: `The tracking pixel hasn’t fired ${Number.isFinite(age) ? `for ${ago(age * HOUR)}` : 'at all'} and ${active.length} campaign${active.length === 1 ? ' is' : 's are'} running. Spending blind.`,
          body: `The pixel (what tells Meta a purchase or sign-up happened) ${Number.isFinite(age) ? `last fired ${ago(age * HOUR)} ago (${when(px.last_fired_time, tz)})` : 'has never fired'}${px.is_unavailable ? ' and Meta says it is unavailable' : ''}, and ${active.length} campaign${active.length === 1 ? ' is' : 's are'} still running. Meta can’t learn who buys, so the money is being spent blind.\nWhat to do: check the website’s checkout and thank-you pages still carry the pixel (someone may have changed a page or a plugin), and consider pausing the ads until it is counting again.` });
      } else if (active.length && age >= 12) {
        push({ key: 'pixel-early', level: 'routine', title: 'The tracking pixel has been quiet for half a day', measure: age, link: SAFETY, numbers: { hours: numbers.pixel_hours }, short: '', body: `The pixel last fired ${ago(age * HOUR)} ago. That can just be a quiet night, but if it passes a day you will be told urgently.` });
      }
      card('tracking', !active.length ? 'No ads are running, so there is nothing to track.' : age >= 24 ? `The pixel last fired ${Number.isFinite(age) ? ago(age * HOUR) + ' ago' : 'never'}.` : `The pixel fired ${ago(age * HOUR)} ago.`);
    } else unknown('tracking');
  } else if (snap.pixel?.notConnected) board.push({ id: 'tracking', title: CHECKS.tracking[0], status: 'amber', headline: 'The pixel (META_PIXEL_ID) isn’t set in Vercel, so tracking can’t be watched.', detail: '' });
  else unknown('tracking');

  // 5. Payment and account
  const ac = snap.account;
  if (ac?.ok || snap.issues?.ok) {
    if (ac?.ok) {
      ['account', 'payment'].forEach(k => checked.add(k));
      const st = Number(ac.account_status), good = st === 1;
      numbers.account_status = good ? 'Active' : (ACCOUNT_STATUS[st] || `status ${st}`);
      if (!good) {
        const pay = PAYMENT_STATUS.includes(st);
        push({ key: pay ? 'payment' : 'account', level: 'urgent', title: pay ? 'Meta says there is a payment problem on the ad account' : `The ad account is ${ACCOUNT_STATUS[st] || `not active (status ${st})`}`, measure: 1, link: SAFETY, numbers: { account_status: st },
          short: `The ad account ${ACCOUNT_STATUS[st] || 'is not active'}.${pay ? ' Ads may stop, or run up an unpaid bill.' : ''}`,
          body: `Meta reports the ad account as ${ACCOUNT_STATUS[st] || `not active (status ${st})`}${ac.disable_reason ? ` (reason code ${ac.disable_reason})` : ''}. ${pay ? 'Ads can stop without warning, and what has been spent may be unpaid.' : 'Ads will not run until it is fixed.'}\nWhat to do: open Meta Ads Manager (button on the Safety net page), look at Billing and Account quality, and fix what it says.` });
      } else if (!hasPaymentMethod(ac)) {
        push({ key: 'payment', level: 'urgent', title: 'The ad account has no payment method on file', measure: 1, link: SAFETY, numbers: {}, short: 'The ad account has no payment method.', body: 'Meta shows no payment method on the ad account, so ads will stop (or already have).\nWhat to do: open Meta Ads Manager (button on the Safety net page) and add a card under Billing.' });
      }
    }
    if (snap.issues?.ok) {
      checked.add('ad-issues');
      const bad = snap.issues.data || [];
      numbers.ads_with_issues = bad.length;
      if (bad.length) {
        bad.forEach(a => a.campaign_id && flag(a.campaign_id, 'Has an ad Meta rejected or flagged'));
        push({ key: 'ad-issues', level: 'important', title: `${bad.length} ad${bad.length === 1 ? ' is' : 's are'} rejected or flagged by Meta`, measure: bad.length, link: SAFETY, numbers: { ads: bad.length },
          short: `${bad.length} ad${bad.length === 1 ? '' : 's'} rejected or flagged by Meta.`,
          body: `Meta has rejected or flagged: ${list(bad.map(a => `${a.name || a.id} in ${nameOf(a.campaign_id)}${a.effective_status === 'DISAPPROVED' ? ' (rejected)' : ' (has issues)'}`))}.\nWhat to do: open it in Meta Ads Manager and read what Meta says, then change the words or the picture, or leave it off.` });
      }
    }
    const here = alerts.filter(a => CHECKS.account[1].includes(a.key));
    card('account', here.length ? here.map(a => a.title).slice(0, 2).join('; ') + '.' : `The account is ${numbers.account_status || 'active'} with a payment method${snap.issues?.ok ? ' and no rejected ads' : ''}.`);
  } else unknown('account');

  return { alerts, board, checked, flagged: [...flagged.values()], numbers };
}

// The sixth card, computed from the saved state and the clock (so the Safety page can show it without calling Meta, and a dead cron shows red on its own)
export function heartbeatView(state, cfg, now, { token = hasToken(), accountSet = true } = {}) {
  const t = new Date(now).getTime();
  if (!token) return { status: 'red', headline: 'No Meta token set. The safety net can’t see your ad account at all.', detail: 'Add META_ADS_TOKEN in Vercel (Settings › Connections and jobs shows what is missing).' };
  if (!accountSet) return { status: 'red', headline: 'No ad account set (META_AD_ACCOUNT_ID). The safety net can’t see your ad account.', detail: '' };
  const ok = state?.last_ok_at ? new Date(state.last_ok_at).getTime() : 0;
  if (!ok) return state?.last_error ? { status: 'red', headline: `Meta couldn’t be read: ${state.last_error}`, detail: 'No check has completed yet.' } : { status: 'amber', headline: 'Waiting for the first hourly check. Nothing has been read from Meta yet.', detail: '' };
  const hrs = (t - ok) / HOUR;
  if (hrs >= cfg.heartbeat_hours) return { status: 'red', headline: `The safety net hasn’t been able to check your account since ${when(state.last_ok_at)}.`, detail: state.last_error ? `Meta said: ${state.last_error}` : 'The hourly check has not completed.' };
  return { status: 'green', headline: `Checked ${ago(t - ok)} ago.`, detail: state.last_error ? `Last problem: ${state.last_error}` : '' };
}

// The alert for "I can't read Meta / the check hasn't run" (key heartbeat). Urgent once the silence passes the limit.
export function heartbeatAlert({ state, cfg, now, error = '' }) {
  const t = new Date(now).getTime(), ref = state?.last_ok_at || state?.first_fail_at || new Date(now).toISOString(), hrs = (t - new Date(ref).getTime()) / HOUR, urgent = hrs >= cfg.heartbeat_hours;
  const since = state?.last_ok_at ? when(state.last_ok_at) : null;
  return { key: 'heartbeat', level: urgent ? 'urgent' : 'important', measure: Math.max(hrs, 0.01), link: SAFETY, numbers: { hours: Math.round(hrs * 10) / 10 },
    title: urgent ? `The ad safety net hasn’t been able to check your account since ${since || when(ref)}` : 'Meta couldn’t be read just now',
    short: urgent ? `The ad safety net can’t see your account (${ago(hrs * HOUR)} without a check). Overspending would go unnoticed.` : `The ad safety net couldn’t read Meta: ${error || 'no answer'}.`,
    body: `${urgent ? `The safety net has not completed a read of your ad account for ${ago(hrs * HOUR)}. While it can’t see, overspending or a forgotten ad would go unnoticed.` : 'The safety net asked Meta about your ad account and could not read it.'}${error ? ` Meta said: “${error}”.` : ''}\nWhat to do: open Meta Ads Manager and look at the account yourself today, and tell whoever looks after Ops (the access key may have expired or been taken away).` };
}

// ---- The hourly run
// preview: reads and judges, says what it would tell whom, records and sends nothing and makes no table. team: the Team tab (the route reads it).
export async function runWatch({ now = new Date(), preview = false, team = [], base = 'https://ops.embodiedphilosophy.com', deps: d0 } = {}) {
  const deps = makeDeps(d0), at = new Date(now).toISOString(), state = (await getWatchState().catch(() => null)) || {};
  const out = { preview, at, token: hasToken() };
  if (!hasToken() && !state.last_ok_at) return { ...out, notConnected: true, note: 'Meta isn’t connected (no ads access key), so there is nothing to watch yet.' };
  const cfg = await getConfig(), people = resolvePeople(team, await loadPeopleSettings(), cfg), ctx = { now, preview, cfg, people, deps, base };
  const snap = await collect(now), bad = firstError(snap), readOk = !bad;
  const ev = evaluate(snap, cfg, now), alerts = [...ev.alerts], checked = new Set(ev.checked);
  const next = { ...state, last_run_at: at, ceilings_set: ceilingsSet(cfg), tz: snap.tz };
  if (readOk) { next.last_ok_at = at; next.last_error = ''; next.first_fail_at = ''; checked.add('heartbeat'); }
  else { next.last_error = bad.notConnected ? bad.error : String(bad.error || 'no answer').slice(0, 200); next.first_fail_at = state.first_fail_at || at; alerts.push(heartbeatAlert({ state: next, cfg, now, error: next.last_error })); }
  const board = ev.board.concat({ id: 'heartbeat', title: CHECKS.heartbeat[0], ...heartbeatView(next, cfg, now, { accountSet: !snap.account?.notConnected }) });
  Object.assign(next, { board, numbers: ev.numbers, flagged: ev.flagged });
  out.board = board; out.numbers = ev.numbers; out.flagged = ev.flagged.length;
  if (preview) {
    out.flushed = await flushQueued(ctx);
    out.alerts = []; for (const a of alerts) out.alerts.push(await raiseAlert(a, ctx));
    out.resolved = await resolveAlerts({ active: new Set(alerts.map(a => a.key)), scope: k => checked.has(k), ctx });
    return out;
  }
  try {
    out.flushed = await flushQueued(ctx);
    out.alerts = []; for (const a of alerts) out.alerts.push(await raiseAlert(a, ctx));
    out.resolved = await resolveAlerts({ active: new Set(alerts.map(a => a.key)), scope: k => checked.has(k), ctx });
    await writeSetting(STATE_KEY, next, 'safety net');
  } catch (e) {
    // The notes can't be kept (the database). Never silent: tell the people directly, without the usual hourly dedupe.
    console.error('ads-watch storage', String(e.message || e).slice(0, 200));
    out.storageFailed = true;
    if (deps.emailReady()) for (const p of people.filter(x => x.email_on)) { try { await deps.sendEmail({ to: p.email, subject: '[URGENT] Ads: the ad safety net can’t save its notes', html: `<p>The ad safety net could not save its notes just now, so it can’t remember what it has already told you. ${alerts.length ? `It is seeing: ${alerts.map(a => a.title).join('; ')}.` : ''} Please look at the Ads safety net page and ask whoever looks after Ops to check the database.</p>` }); } catch {} }
  }
  return out;
}

// The daily job's check that the hourly one is alive (the Safety page does the same sum on load). Reads only the saved state: no Meta, no table made.
export async function runHeartbeat({ now = new Date(), preview = false, team = [], base = 'https://ops.embodiedphilosophy.com', deps: d0 } = {}) {
  if (!hasToken()) return { stale: false, note: 'No Meta token.' };
  const state = await getWatchState().catch(() => null);
  if (!state?.last_ok_at) return { stale: false, note: 'The hourly check has not completed yet.' };
  const cfg = await getConfig(), hrs = (new Date(now).getTime() - new Date(state.last_ok_at).getTime()) / HOUR;
  if (hrs < cfg.heartbeat_hours) return { stale: false, hours: Math.round(hrs * 10) / 10 };
  const people = resolvePeople(team, await loadPeopleSettings(), cfg), r = await raiseAlert(heartbeatAlert({ state, cfg, now, error: state.last_error || '' }), { now, preview, cfg, people, deps: makeDeps(d0), base });
  return { stale: true, hours: Math.round(hrs * 10) / 10, alert: r };
}
