// The Ads account buttons at API level (/api/ops/ads-account, POST act and reverse), against the running app (:3100, started by ads-manual.sh) and the Meta mock (world 'account'). `source env.sh`, then:
//   node ads-manual-api.mjs dry    Meta key set, safety switch OFF (as in production): a press is only recorded, Meta's write log stays empty
//   node ads-manual-api.mjs live   the safety switch ON at the mock only (MOCK_ADS=live): a press changes the mock; Reverse puts it back
// Roles: the director and Rebecka (Ads role) can; Floss, Irene, Ichha, Carolyn, Stephanie and a teacher get 403 for a read, a press and a Reverse, and nothing happens at Meta. A press needs confirm: true.
// No key or ad account number in any answer or app log line. Mock only.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const PHASE = process.argv[2] || 'dry';
const B = 'http://localhost:3100', META = 'http://localhost:4556';
const here = path.dirname(fileURLToPath(import.meta.url));
const cookie = who => execFileSync('node', [path.join(here, 'cookie.mjs'), who]).toString().trim();
const DIR = fs.readFileSync(path.join(here, 'out/cookie.txt'), 'utf8').trim().replace(/^ep_ops=/, '');
let bad = 0;
const ck = (n, c, x = '') => { if (c) console.log('ok  ', n); else { bad++; console.log('FAIL', n, x); } };
const call = async (method, url, ck_ = DIR, body) => { const r = await fetch(B + url, { method, redirect: 'manual', headers: { Cookie: `ep_ops=${ck_}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined }), text = await r.text(); let j = null; try { j = JSON.parse(text); } catch { /* not json */ } return { status: r.status, j, text }; };
const get = c => call('GET', '/api/ops/ads-account', c), post = (b, c) => call('POST', '/api/ops/ads-account', c, b);
const meta = async (q = '') => (await fetch(`${META}/__log${q}`)).json();
const writes = async () => (await meta()).requests.filter(r => r.write);
const mine = async id => (await (await fetch(`${META}/v21.0/${id}`, { headers: { Authorization: 'Bearer x' } })).json());
const KEYS = /mock-ads-token-for-the-settings-test|mock-ads-token-for-the-safety-test/;
const seen = [];
const rb = cookie('rebecka@example.com');
await fetch(`${META}/__reset`); await fetch(`${META}/__world?name=account`);

const first = await get(); seen.push(first.text);
const rowOf = (j, id) => j.rows.find(r => r.id === id);
ck('the read says who may act and whether live changes are on, and has a (so far empty) list of changes', first.j.can_act === true && first.j.live === (PHASE === 'live') && Array.isArray(first.j.changes) && first.j.changes.length === 0);
ck('each row says what a press may do: a running one can be paused, a paused one resumed, an archived one neither; where the budget is', rowOf(first.j, 'W_OPEN').act.pause && rowOf(first.j, 'W_PAUSED').act.resume && !rowOf(first.j, 'W_ARCH').act.pause && !rowOf(first.j, 'W_ARCH').act.resume && rowOf(first.j, 'W_OPEN').act.budget.mode === 'campaign' && rowOf(first.j, 'W_SETS').act.budget.mode === 'adsets' && rowOf(first.j, 'W_ZERO').act.budget.mode === 'none');
const seenOpen = rowOf(first.j, 'W_OPEN').act.seen;

console.log('-- who may press');
await fetch(`${META}/__log?reset=1`);
const W0 = (await writes()).length;
for (const [who, email] of [['Floss', 'floss@example.com'], ['Irene', 'irene@example.com'], ['Ichha', 'ichha@example.com'], ['Carolyn (Publisher)', 'carolyn@example.com'], ['Stephanie', 'stephanie@example.com'], ['a teacher', 'abha@example.com']]) {
  const c = cookie(email);
  const a = await post({ action: 'act', id: 'W_OPEN', what: 'pause', seen: seenOpen, confirm: true }, c), r = await post({ action: 'reverse', action_id: 'act_x', confirm: true }, c), g = await get(c);
  ck(`${who}: a press, a Reverse and a read are all 403, with no rows and no error detail`, a.status === 403 && r.status === 403 && g.status === 403 && !/"rows"|W_OPEN/.test(a.text + r.text + g.text));
}
ck('nothing was sent to Meta by any of them, and nothing was recorded', (await writes()).length === W0 && (await get()).j.changes.length === 0);
console.log('-- a press needs a yes, and a real request');
ck('without confirm: refused, nothing done', (await post({ action: 'act', id: 'W_OPEN', what: 'pause', seen: seenOpen }, DIR)).status === 400 && (await post({ action: 'reverse', action_id: 'x' }, DIR)).status === 400 && (await writes()).length === 0);
ck('an unknown kind of press is a plain 400', (await post({ action: 'act', id: 'W_OPEN', what: 'delete', seen: seenOpen, confirm: true }, DIR)).status === 400);
ck('"confirm" must be true, not a word', (await post({ action: 'act', id: 'W_OPEN', what: 'pause', seen: seenOpen, confirm: 'yes' }, DIR)).status === 400);
ck('an id that could change the address is refused', (await post({ action: 'act', id: '../act_MOCK1', what: 'pause', seen: seenOpen, confirm: true }, DIR)).status === 400 && (await writes()).length === 0);

if (PHASE === 'dry') {
  console.log('-- switch OFF: recorded only');
  const p = await post({ action: 'act', id: 'W_OPEN', what: 'pause', seen: seenOpen, confirm: true }, DIR); seen.push(p.text);
  ck('a director\'s Pause answers 200, "Recorded only: Meta wasn’t changed because live changes are off"', p.status === 200 && p.j.dryRun === true && /Recorded only: Meta wasn’t changed because live changes are off/.test(p.j.message), p.text);
  ck('Meta saw no write, and the campaign is still running at the mock', (await writes()).length === 0 && (await mine('W_OPEN')).status === 'ACTIVE');
  const g = await get(DIR); seen.push(g.text);
  ck('the change is listed as recorded only, with no Reverse', g.j.changes.length === 1 && g.j.changes[0].dry_run && !g.j.changes[0].can_reverse && /Recorded only/.test(g.j.changes[0].detail));
  const r = await post({ action: 'act', id: 'W_OPEN', what: 'raise', seen: seenOpen, confirm: true }, rb); seen.push(r.text);
  ck('Rebecka (Ads role) can press too: +20% recorded only', r.status === 200 && r.j.dryRun && (await writes()).length === 0 && (await get(DIR)).j.changes.length === 2);
  ck('the history names who pressed', (await get(DIR)).j.changes.map(c => c.by).sort().join() !== '' && (await get(DIR)).j.changes.length === 2);
  const rv = await post({ action: 'reverse', action_id: g.j.changes[0].id, confirm: true }, DIR);
  ck('Reverse on a recorded-only entry says there is nothing to reverse (409)', rv.status === 409 && /only recorded/.test(rv.j.error));
}

if (PHASE === 'live') {
  console.log('-- switch ON at the mock: a press changes Meta');
  const p = await post({ action: 'act', id: 'W_OPEN', what: 'pause', seen: seenOpen, confirm: true }, DIR); seen.push(p.text);
  ck('the director\'s Pause changes the campaign at the mock, in plain words', p.status === 200 && !p.j.dryRun && /^Paused “Evergreen interest test”/.test(p.j.message) && (await mine('W_OPEN')).status === 'PAUSED', p.text);
  const g = await get(rb); seen.push(g.text);
  ck('Rebecka\'s read shows it paused with a Resume button and the change with Reverse', rowOf(g.j, 'W_OPEN').act.resume && g.j.changes.length === 1 && g.j.changes[0].can_reverse && g.j.live === true);
  const again = await post({ action: 'act', id: 'W_OPEN', what: 'pause', seen: seenOpen, confirm: true }, rb);
  ck('Rebecka pressing Pause from the old page: 409, "changed in Meta since you opened this page"', again.status === 409 && /changed in Meta since you opened this page/.test(again.j.error) && !/"rows"/.test(again.text));
  const up = await post({ action: 'act', id: 'W_LOW', what: 'raise', seen: rowOf(g.j, 'W_LOW').act.seen, confirm: true }, rb);
  ck('+20% above the ceiling: 409 with the numbers; the budget at the mock is unchanged', up.status === 409 && /above the \$60 a day ceiling/.test(up.j.error) && (await mine('W_LOW')).daily_budget === '6000');
  const ex = await post({ action: 'act', id: 'W_OPEN', what: 'set', dollars: 'abc', seen: rowOf(g.j, 'W_OPEN').act.seen, confirm: true }, DIR);
  ck('a bad exact amount: 400 in plain words', ex.status === 400 && /Enter the new daily budget in dollars/.test(ex.j.error));
  const rv = await post({ action: 'reverse', action_id: g.j.changes[0].id, confirm: true }, rb); seen.push(rv.text);
  ck('Rebecka reverses it: running again at the mock, the history shows it reversed', rv.status === 200 && /running again/.test(rv.j.message) && (await mine('W_OPEN')).status === 'ACTIVE' && (await get(DIR)).j.changes.some(c => c.reversed));
  const rv2 = await post({ action: 'reverse', action_id: g.j.changes[0].id, confirm: true }, DIR);
  ck('a second Reverse is told it is already done, and nothing more is written', rv2.status === 200 && rv2.j.already && (await writes()).length === 2, JSON.stringify((await writes()).map(w => w.path)));
}

console.log('-- no secret anywhere');
ck('the key and the ad account number are in no answer', !seen.some(s => KEYS.test(s) || /act_MOCK1/.test(s)));
let log = ''; try { log = fs.readFileSync(path.join(here, 'out/next.log'), 'utf8'); } catch { /* none */ }
ck('and in no line of the app\'s own log', !KEYS.test(log) && !/act_MOCK1/.test(log));
ck('the key only went to Meta as a header', (await meta()).requests.every(r => r.auth && !r.tokenInUrl));
console.log(bad ? `\n${bad} failed` : '\nall ok');
process.exit(bad ? 1 : 0);
