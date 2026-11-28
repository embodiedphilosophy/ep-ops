// The hands-on buttons for campaigns not made in Ops (lib/ops/adsmanual.js, with the sums in adsaccountmath.js), in node on an in-process Postgres (PGlite) and the Meta mock (:4556,
// world 'account'). `source env.sh`, run.sh running. Nothing real: Meta is the mock, the database is PGlite.
//   - the sums: +20% (rounded the way the morning rules round), an exact amount shared across ad sets, the $60 ceiling (raising only), what the person typed, the "are you sure?" words
//   - where the budget is: on the campaign, on its running ad sets (each changes, and it says so), a lifetime budget or no daily budget (Pause and Resume only)
//   - the write gate: switch OFF = recorded only, Meta's write log stays empty, an action row says so; switch ON (the mock's live mode) = the mock's campaign or ad sets change
//   - refusals in plain words: above the ceiling, a bad amount, the same amount, lifetime, no budget, a conflict (changed in Meta since the page was read), already paused, archived,
//     made in Ops, not a campaign of this account, a bad id; an ad set refused partway puts the earlier ones back
//   - Reverse: puts it back, refuses when Meta changed again, only once, never a recorded-only entry; the kept look is brought in line (no new look at Meta)
//   - no key or ad account number anywhere (answers, history, the app's own log lines)
process.removeAllListeners('warning');
let bad = 0; const ck = (n, c, x = '') => { if (c) console.log('ok  ', n); else { bad++; console.log('FAIL', n, x); } };
if (process.env.META_ADS_BASE !== 'http://localhost:4556') { console.log('FAIL: source scripts/ops-test/env.sh first'); process.exit(1); }
process.env.ADS_TEST_DB = 'pglite';
const KEY = 'mock-ads-token-for-the-manual-test';
const metaOn = (live = false) => { for (const k of ['META_ADS_TOKEN', 'META_AD_ACCOUNT_ID', 'META_ADS_LIVE']) delete process.env[k]; Object.assign(process.env, { META_ADS_TOKEN: KEY, META_AD_ACCOUNT_ID: 'act_MOCK1', ...(live ? { META_ADS_LIVE: 'live' } : {}) }); };
const logs = []; for (const k of ['log', 'error', 'warn']) { const o = console[k].bind(console); console[k] = (...a) => { const t = a.map(String).join(' '); if (!/^(ok |FAIL|--)/.test(t)) logs.push(t); o(...a); }; }
const MT = 'http://localhost:4556';
const meta = async (q = '') => (await fetch(`${MT}/__log${q}`)).json();
const writes = async () => (await meta()).requests.filter(r => r.write);
const touch = q => fetch(`${MT}/__touch?${q}`), mmode = q => fetch(`${MT}/__mode?${q}`);
const fresh = async () => { await fetch(`${MT}/__reset`); await fetch(`${MT}/__world?name=account`); V.forgetAccountCache(); };

const V = await import('../../lib/ops/adsaccount.js'), M = await import('../../lib/ops/adsaccountmath.js'), A = await import('../../lib/ops/adsmanual.js'), S = await import('../../lib/ops/adsstore.js');
const row = (v, id) => v.rows.find(r => r.id === id);
const press = async (v, id, what, extra = {}) => A.actOnCampaign({ id, what, seen: row(v, id).act.seen, who: 'Jacob', ...extra });
const fromMeta = async id => (await (await fetch(`${MT}/v21.0/${id}`, { headers: { Authorization: 'Bearer x' } })).json());
const history = async () => S.peekMetaActions(new Date(Date.now() - 86400e3).toISOString(), 100);
const answers = [];
const note = r => { answers.push(JSON.stringify(r)); return r; };

console.log('-- the sums (no Meta, no database)');
const sumTo = us => us.reduce((n, u) => n + u.to, 0);
const u2 = [{ id: 'a', name: 'A', cents: 1000 }, { id: 'b', name: 'B', cents: 500 }];
ck('+20% on $30 is $36; on $10 and $5 it is $12 and $6; rounded to the cent', M.raised([{ cents: 3000 }])[0].to === 3600 && M.raised(u2).map(u => u.to).join() === '1200,600' && M.raised([{ cents: 333 }])[0].to === 400);
ck('an exact total is shared out in proportion and always adds up (leftover cents to the biggest)', M.shareOut(u2, 3000).map(u => u.to).join() === '2000,1000' && sumTo(M.shareOut(u2, 1001)) === 1001 && sumTo(M.shareOut([{ cents: 100 }, { cents: 100 }, { cents: 100 }], 1000)) === 1000);
ck('the ceiling is $60 and stops raising only (a lower budget is always allowed)', M.SET_CEILING_CENTS === 6000 && M.overCeiling([{ cents: 5500, to: 6600 }]) && !M.overCeiling([{ cents: 5000, to: 6000 }]) && !M.overCeiling([{ cents: 20000, to: 15000 }]));
ck('what is typed: 40, 40.5, $40.50, 1,200 are read; "", abc, -5, 4.999, 1e3 are not', [['40', 4000], ['40.5', 4050], ['$40.50', 4050], ['1,200', 120000]].every(([t, c]) => M.parseDollars(t) === c) && ['', 'abc', '-5', '4.999', '1e3', null].every(t => M.parseDollars(t) === null));
const plan = { mode: 'campaign', units: [{ id: 'c', name: 'Evergreen', cents: 3000 }] }, rowx = { name: 'Evergreen', d7: { spend_cents: 29400 }, act: { budget: plan } };
ck('Pause asks in plain words with what it is spending: "Pause “Evergreen” (spending $42 a day)?"', M.confirmText('pause', rowx, null).startsWith('Pause “Evergreen” (spending $42 a day)?') && /Meta will stop spending on it/.test(M.confirmText('pause', rowx, null)) && /reverse this afterwards/.test(M.confirmText('pause', rowx, null)));
ck('+20% says from and to; Set says the new amount; with live changes off both say it will only be recorded', /Raise the daily budget of “Evergreen” by 20%, from \$30 to \$36 a day\?/.test(M.confirmText('raise', rowx, M.raised(plan.units))) && /Set the daily budget of “Evergreen” to \$40 a day \(now \$30\)\?/.test(M.confirmText('set', rowx, M.shareOut(plan.units, 4000))) && /only be recorded: Meta will not be changed/.test(M.confirmText('pause', rowx, null, { live: false })));
ck('on ad sets the words list each one', /Its budget sits on its 2 running ad sets/.test(M.confirmText('raise', { name: 'X', act: { budget: { mode: 'adsets', units: u2 } } }, M.raised(u2))) && /A \$10 → \$12, B \$5 → \$6/.test(M.confirmText('raise', { name: 'X', act: { budget: { mode: 'adsets', units: u2 } } }, M.raised(u2))));

console.log('-- where the budget is');
metaOn(false); await fresh();
let v = await V.accountView({ who: 'a' });
const b = id => row(v, id).act.budget;
ck('a campaign with a daily budget of its own: the budget is the campaign\'s', b('W_OPEN').mode === 'campaign' && b('W_OPEN').units[0].cents === 3000 && b('W_OPEN').units[0].id === 'W_OPEN');
ck('a budget on its ad sets: both ad sets, the total is what the list shows', b('W_SETS').mode === 'adsets' && b('W_SETS').units.map(u => u.cents).join() === '1000,500' && row(v, 'W_SETS').budget.cents === 1500);
ck('a lifetime budget: Pause/Resume only, and it says why in plain words', b('W_ZERO').mode === 'none' && /lifetime budget/.test(b('W_ZERO').why));
ck('no daily budget anywhere: Pause/Resume only, and it says so', b('W_OK1').mode === 'none' && /no daily budget/.test(b('W_OK1').why));
ck('running → Pause, paused → Resume, archived → neither', row(v, 'W_OPEN').act.pause && !row(v, 'W_OPEN').act.resume && row(v, 'W_PAUSED').act.resume && !row(v, 'W_ARCH').act.pause && !row(v, 'W_ARCH').act.resume);

console.log('-- switch OFF: recorded only, Meta is not changed');
await meta('?reset=1');
let r = note(await press(v, 'W_OPEN', 'pause'));
ck('Pause is recorded only and says so in plain words', r.ok && r.dryRun && /Recorded only: Meta wasn’t changed because live changes are off/.test(r.message), r.message);
ck('the write gate sent nothing to Meta (no write at the mock) and Meta still shows it running', (await writes()).length === 0 && (await fromMeta('W_OPEN')).status === 'ACTIVE');
let h = await history();
ck('one history row, keyed by the Meta id, marked a dry run, with nothing to reverse', h.length === 1 && h[0].campaign_id === 'W_OPEN' && h[0].kind === 'meta_pause' && h[0].dry_run === true && !h[0].reverse_to && /Recorded only/.test(h[0].detail) && h[0].by === 'Jacob');
ck('a recorded-only entry cannot be reversed', (await A.reverseChange({ actionId: h[0].id, who: 'Jacob' })).status === 409 && !(await A.listChanges())[0].can_reverse);
r = note(await press(v, 'W_OPEN', 'raise'));
ck('+20% (switch off) is recorded only too, with the new amount in the history', r.dryRun && (await writes()).length === 0 && (await history()).some(x => x.kind === 'meta_budget' && x.dry_run && /\$30 → \$36 a day/.test(x.detail)));
ck('the page still shows it as it was (nothing changed, nothing patched)', row(await V.accountView({ who: 'a' }), 'W_OPEN').act.pause === true && row(await V.accountView({ who: 'a' }), 'W_OPEN').budget.cents === 3000);

console.log('-- switch ON (the mock\'s live mode): Meta changes');
metaOn(true); await fresh(); v = await V.accountView({ who: 'a' }); await meta('?reset=1');
r = note(await press(v, 'W_OPEN', 'pause'));
ck('Pause changes the mock campaign, one write through the gate: status only', r.ok && !r.dryRun && /^Paused “Evergreen interest test”/.test(r.message) && (await fromMeta('W_OPEN')).status === 'PAUSED' && (await writes()).length === 1 && JSON.stringify((await writes())[0].body) === '{"status":"PAUSED"}', r.message + JSON.stringify(await writes()));
const n0 = (await meta()).total;
let after = await V.accountView({ who: 'a' });
ck('the kept look now shows it paused, with a Resume button, and Meta was asked nothing more (no new look)', row(after, 'W_OPEN').status === 'paused' && row(after, 'W_OPEN').act.resume && (await meta()).total === n0);
const pausedAt = r.action_id;
ck('the history row is a real change with Reverse available', (await history())[0].dry_run === false && (await A.listChanges())[0].can_reverse && !!pausedAt);
r = note(await A.actOnCampaign({ id: 'W_OPEN', what: 'pause', seen: row(v, 'W_OPEN').act.seen, who: 'Jacob' }));
ck('pressing Pause again on the old page is refused (it was changed since), nothing written', !r.ok && r.status === 409 && /changed in Meta since you opened this page \(it is now paused\)/.test(r.error), r.error);
r = note(await press(after, 'W_OPEN', 'resume'));
ck('Resume starts it again', r.ok && /^Resumed/.test(r.message) && (await fromMeta('W_OPEN')).status === 'ACTIVE');
after = await V.accountView({ who: 'a' });
r = note(await press(after, 'W_OPEN', 'raise'));
ck('+20% on a campaign budget: $30 → $36 on the campaign itself, and the message says so', r.ok && /Raised 20%: the daily budget of “Evergreen interest test” is now \$36 a day \(it was \$30\)/.test(r.message) && (await fromMeta('W_OPEN')).daily_budget === '3600' && JSON.stringify((await writes()).at(-1).body) === '{"daily_budget":"3600"}', r.message);
after = await V.accountView({ who: 'a' });
ck('the kept look shows $36 a day', row(after, 'W_OPEN').budget.cents === 3600 && row(after, 'W_OPEN').act.seen.units[0].cents === 3600);
r = note(await press(after, 'W_OPEN', 'set', { dollars: '45.50' }));
ck('an exact amount: $45.50 on the campaign', r.ok && (await fromMeta('W_OPEN')).daily_budget === '4550' && /is now \$45.50 a day \(it was \$36\)/.test(r.message), r.message);

console.log('-- budgets on ad sets: each one changes, and it says which');
v = await V.accountView({ who: 'a' }); await meta('?reset=1');
r = note(await press(v, 'W_SETS', 'raise'));
ck('+20% raises each running ad set ($10→$12, $5→$6), nothing on the campaign, and says "on its 2 running ad sets"', r.ok && /on its 2 running ad sets/.test(r.message) && (await fromMeta('as_W_SETS_1')).daily_budget === '1200' && (await fromMeta('as_W_SETS_2')).daily_budget === '600' && (await writes()).map(w => w.path).join() === 'as_W_SETS_1,as_W_SETS_2' && !('daily_budget' in (await fromMeta('W_SETS'))), r.message);
v = await V.accountView({ who: 'a' });
ck('the list now shows $18 a day on its ad sets', row(v, 'W_SETS').budget.cents === 1800 && row(v, 'W_SETS').budget.on_ad_sets);
r = note(await press(v, 'W_SETS', 'set', { dollars: '27' }));
ck('an exact $27 is shared out in proportion: $18 and $9', r.ok && (await fromMeta('as_W_SETS_1')).daily_budget === '1800' && (await fromMeta('as_W_SETS_2')).daily_budget === '900', r.message);
console.log('-- an ad set refused partway: the earlier one is put back');
v = await V.accountView({ who: 'a' }); await meta('?reset=1'); await mmode('failWriteId=as_W_SETS_2');
r = note(await press(v, 'W_SETS', 'raise')); await mmode('failWriteId=');
ck('refused in plain words, nothing is left half done (both ad sets are as before)', !r.ok && /Meta said no/.test(r.error) && /put back/.test(r.error) && (await fromMeta('as_W_SETS_1')).daily_budget === '1800' && (await fromMeta('as_W_SETS_2')).daily_budget === '900', r.error);
ck('the failed try is in the history as one that did not go through, with no Reverse', (await A.listChanges()).some(c => c.failed && !c.can_reverse));

console.log('-- refusals, in plain words, with nothing written');
v = await V.accountView({ who: 'a' }); await meta('?reset=1');
r = note(await press(v, 'W_LOW', 'raise'));
ck('+20% above the $60 ceiling: refused, says the numbers and the ceiling', !r.ok && r.status === 409 && /would go from \$60 to \$72 a day, which is above the \$60 a day ceiling/.test(r.error) && /Nothing was changed/.test(r.error), r.error);
r = note(await press(v, 'W_PAST', 'raise'));
ck('$50 → $60 is exactly the ceiling: allowed', r.ok && (await fromMeta('W_PAST')).daily_budget === '6000', r.message);
r = note(await press(v, 'W_LOW', 'set', { dollars: '61' }));
ck('an exact amount above the ceiling: refused', !r.ok && /above the \$60 a day ceiling/.test(r.error));
r = note(await press(v, 'W_LOW', 'set', { dollars: '20' }));
ck('lowering is always allowed, even for one at the ceiling ($60 → $20)', r.ok && (await fromMeta('W_LOW')).daily_budget === '2000');
v = await V.accountView({ who: 'a' });
for (const [t, want] of [['', /Enter the new daily budget in dollars/], ['abc', /Enter the new daily budget in dollars/], ['-5', /Enter the new daily budget in dollars/], ['0.5', /smallest daily budget is \$1/], ['20', /already has a daily budget of \$20/]]) {
  r = note(await press(v, 'W_LOW', 'set', { dollars: t }));
  ck(`an exact amount of “${t}”: refused (${want.source.slice(0, 28)}…)`, !r.ok && want.test(r.error), r.error);
}
r = note(await press(v, 'W_ZERO', 'raise'));
ck('a lifetime budget: refused, plain words', !r.ok && /lifetime budget/.test(r.error), r.error);
r = note(await press(v, 'W_OK1', 'set', { dollars: '10' }));
ck('no daily budget: refused, plain words', !r.ok && /no daily budget/.test(r.error), r.error);
r = note(await press(v, 'W_PAUSED', 'pause'));
ck('Pause on a paused campaign: refused (it is paused already)', !r.ok && /changed in Meta since|isn’t running/.test(r.error), r.error);
r = note(await A.actOnCampaign({ id: 'W_PAUSED', what: 'pause', seen: { status: 'PAUSED', units: [] }, who: 'J' }));
ck('with an honest page it says "isn’t running (it is paused)"', !r.ok && /isn’t running \(it is paused\)/.test(r.error), r.error);
r = note(await A.actOnCampaign({ id: 'W_ARCH', what: 'resume', seen: { status: 'ARCHIVED', units: [] }, who: 'J' }));
ck('an archived campaign: nothing to change', !r.ok && /is archived in Meta/.test(r.error), r.error);
r = note(await A.actOnCampaign({ id: 'W_OPEN', what: 'pause', who: 'J' }));
ck('no "what the page showed": refused rather than guessed', !r.ok && /won’t guess/.test(r.error));
for (const [id, want] of [['as_W_SETS_1', /isn’t a campaign in your ad account/], ['PIX1', /isn’t a campaign|Meta said no|couldn’t check/], ['../act_MOCK1', /doesn’t look like a campaign/], ['W_OPEN?x=1', /doesn’t look like a campaign/], ['', /doesn’t look like a campaign/]]) {
  r = note(await A.actOnCampaign({ id, what: 'pause', seen: { status: 'ACTIVE', units: [] }, who: 'J' }));
  ck(`not a campaign of this account (“${id}”): refused`, !r.ok && want.test(r.error), r.error);
}
ck('a made-up kind of press is refused', (await A.actOnCampaign({ id: 'W_OPEN', what: 'delete', seen: {}, who: 'J' })).status === 400);
ck('none of those refusals wrote anything to Meta', (await writes()).filter(w => !['W_PAST', 'W_LOW'].includes(w.path)).length === 0, JSON.stringify((await writes()).map(w => w.path)));

console.log('-- changed in Meta since the page was read');
v = await V.accountView({ who: 'a' }); await meta('?reset=1');
await touch('id=W_OPEN&daily=3000');
r = note(await press(v, 'W_OPEN', 'raise'));
ck('a budget moved in Meta since: refused, tells the new amount, writes nothing', !r.ok && r.status === 409 && /daily budget of “Evergreen interest test” has been changed in Meta since you opened this page \(it is now \$30 a day\)/.test(r.error) && (await writes()).length === 0, r.error);
await touch('id=W_OPEN&status=PAUSED');
r = note(await press(v, 'W_OPEN', 'pause'));
ck('paused in Meta by someone else since: refused, says it is now paused', !r.ok && /it is now paused/.test(r.error) && (await writes()).length === 0, r.error);
await touch('id=W_OPEN&status=ACTIVE');

console.log('-- made in Ops, and the account number');
v = await V.accountView({ who: 'a' });
await S.createRow('campaigns', { name: 'Built here', meta_campaign_id: 'W_OK2', status: 'live' });
r = note(await press(v, 'W_OK2', 'pause'));
ck('a campaign made in Ops is refused here (it has its own page), nothing written', !r.ok && r.status === 409 && /was made in Ops/.test(r.error) && (await writes()).length === 0, r.error);
metaOn(true); process.env.META_AD_ACCOUNT_ID = 'act_OTHER';
r = note(await A.actOnCampaign({ id: 'W_OPEN', what: 'pause', seen: { status: 'ACTIVE', units: [] }, who: 'J' }));
ck('a campaign that belongs to another ad account is refused', !r.ok && /isn’t a campaign in your ad account/.test(r.error), r.error);
metaOn(true);
delete process.env.META_ADS_TOKEN;
r = note(await A.actOnCampaign({ id: 'W_OPEN', what: 'pause', seen: { status: 'ACTIVE', units: [] }, who: 'J' }));
ck('no key: "Meta isn’t connected yet", nothing done', !r.ok && /isn’t connected yet/.test(r.error)); metaOn(true);

console.log('-- Reverse');
await fresh(); v = await V.accountView({ who: 'a' }); await meta('?reset=1'); await new Promise(r => setTimeout(r, 50)); const t0 = Date.now(); await new Promise(r => setTimeout(r, 50));
const p1 = note(await press(v, 'W_OPEN', 'pause')), v2 = await V.accountView({ who: 'a' }), p2 = note(await press(v2, 'W_OPEN', 'raise'));
ck('two real changes made', p1.ok && p2.ok);
const acts = (await A.listChanges()).filter(a => Date.parse(a.at) >= t0);
r = note(await A.reverseChange({ actionId: acts.find(a => a.kind === 'meta_pause').id, who: 'Jacob' }));
ck('reversing the Pause after a later budget change is fine (a different thing), it is running again', r.ok && /running again/.test(r.message) && (await fromMeta('W_OPEN')).status === 'ACTIVE', r.message || r.error);
r = note(await A.reverseChange({ actionId: acts.find(a => a.kind === 'meta_pause').id, who: 'Jacob' }));
ck('reversing it twice says "Already reversed", and writes nothing more', r.ok && r.already && (await writes()).length === 3, JSON.stringify(await writes()));
await touch('id=W_OPEN&daily=5000');
r = note(await A.reverseChange({ actionId: acts.find(a => a.kind === 'meta_budget').id, who: 'Jacob' }));
ck('the budget moved again since: Reverse refuses, says so, changes nothing', !r.ok && r.status === 409 && /changed again since \(it is now \$50 a day\)/.test(r.error) && (await fromMeta('W_OPEN')).daily_budget === '5000', r.error);
await touch('id=W_OPEN&daily=3600');
r = note(await A.reverseChange({ actionId: acts.find(a => a.kind === 'meta_budget').id, who: 'Jacob' }));
ck('with the budget as it was left, Reverse puts back $30', r.ok && /back to \$30 a day/.test(r.message) && (await fromMeta('W_OPEN')).daily_budget === '3000', r.message || r.error);
const list = (await A.listChanges()).filter(a => Date.parse(a.at) >= t0);
ck('the history shows both as reversed, and a "reverse" entry for each', list.filter(a => a.reversed).length === 2 && list.filter(a => a.kind === 'reverse').length === 2 && list.every(a => !a.can_reverse));
ck('an Ops-campaign action id can\'t be reversed here, nor an unknown one', (await A.reverseChange({ actionId: 'act_nope', who: 'J' })).status === 404);
v = await V.accountView({ who: 'a' });
const sp = note(await press(v, 'W_SETS', 'raise'));
await mmode('failWriteId=as_W_SETS_2');
const rr = note(await A.reverseChange({ actionId: sp.action_id, who: 'Jacob' })); await mmode('failWriteId=');
ck('a Reverse that Meta refuses partway puts the first ad set back as it was and stays reversible', sp.ok && !rr.ok && /Meta said no/.test(rr.error) && (await fromMeta('as_W_SETS_1')).daily_budget === '1200' && (await fromMeta('as_W_SETS_2')).daily_budget === '600' && (await A.listChanges()).some(a => a.id === sp.action_id && a.can_reverse), rr.error);

console.log('-- no secret anywhere');
const all = JSON.stringify(await history()) + answers.join('') + JSON.stringify(await A.listChanges());
ck('the key and the ad account number are in no answer or history row', !all.includes(KEY) && !/act_MOCK1/.test(all));
ck('and in no line the process printed', !logs.some(l => l.includes(KEY) || /act_MOCK1/.test(l)), logs.filter(l => /act_MOCK1/.test(l)).join(' | '));
ck('the key only ever went to Meta as a Bearer header, never in an address', (await meta()).requests.every(q => q.auth && !q.tokenInUrl));
console.log(bad ? `\n${bad} failed` : '\nall ok');
process.exit(bad ? 1 : 0);
