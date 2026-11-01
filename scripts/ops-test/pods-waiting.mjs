// The Study pods card on the Ops front page: who is waiting. PGlite stands in for Neon.
// Run: npm i --no-save @electric-sql/pglite && node --import ./scripts/ce-test/register.mjs scripts/ops-test/pods-waiting.mjs
import assert from 'assert/strict';
import { PGlite } from '@electric-sql/pglite';
delete process.env.DATABASE_URL; delete process.env.POSTGRES_URL;
const db = new PGlite(); const run = (s, ...v) => db.sql(s, ...v).then(r => r.rows);
const S = await import('../../lib/pods/store.js'); S._setSql(run);
const W = await import('../../lib/ops/podswaiting.js');
const me = (n) => ({ uid: 'u-' + n, email: n + '@x.com', name: n });
let r = await W.podsWaiting(); assert.deepEqual([r.requests.length, r.needChat.length, r.open], [0, 0, 0], 'nothing yet');
await S.apply(me('maya'), 'I have led study groups for years and would like to lead one on the Yoga Sutras.');
await S.apply(me('sam'), 'I would love to host a pod on the Spanda texts.');
r = await W.podsWaiting(); assert.deepEqual(r.requests.map(x => x.name).sort(), ['maya', 'sam']); assert.match(r.requests[0].note, /lead|host/);
await S.decideLeader('u-maya', true, 'Jacob'); r = await W.podsWaiting(); assert.deepEqual(r.requests.map(x => x.name), ['sam'], 'an approved request is no longer waiting');
const id = await S.createPod(me('maya'), { topic: 'Yoga Sutras close reading', description: 'We will read one pāda a month together.', schedule: 'Sundays' });
r = await W.podsWaiting(); assert.equal(r.open, 1); assert.equal(r.needChat.length, 0, 'an open pod needs no chat yet');
for (const n of ['a', 'b', 'c', 'd']) await S.join(me(n), id);
r = await W.podsWaiting(); assert.equal(r.open, 0); assert.deepEqual(r.needChat.map(p => [p.topic, p.count]), [['Yoga Sutras close reading', 5]], 'five members: it begins and needs a chat link');
await S.setChatUrl(id, 'https://ss.example/chat/1'); r = await W.podsWaiting(); assert.equal(r.needChat.length, 0);
S._setSql(null); assert.equal(await W.podsWaiting(), null, 'no database: the card stays away');
console.log('pods waiting: ok');
