// The pair-chat job: groups from Mentee Partners rows, only empty chat_url, one chat per group, link stored on every row of the group.
// Circle and the sheet are faked. Run: node --import ./scripts/ce-test/register.mjs scripts/ops-test/pair-chats.mjs
import assert from 'assert/strict';
const P = await import('../../lib/mentee/pairchats.js');
const row = (n, rot, a, b, url = '', extra = {}) => ({ row: n, values: { rotation: String(rot), email_a: a, email_b: b, name_a: a.split('@')[0] + ' Smith', name_b: b.split('@')[0] + ' Jones', chat_url: url, publish: '', ...extra } });
const rows = [row(2, 1, 'a@x.com', 'b@x.com'), row(3, 1, 'a@x.com', 'c@x.com'), row(4, 1, 'b@x.com', 'c@x.com'), row(5, 1, 'd@x.com', 'e@x.com', 'https://hand-pasted'), row(6, 1, 'f@x.com', 'g@x.com'), row(7, 2, 'a@x.com', 'd@x.com'), row(8, 1, 'h@x.com', 'i@x.com', '', { publish: 'FALSE' })];

// groups: a trio from three pairs, a group with a link already, hidden and other-rotation rows left out
const g = P.groupsOf(rows, 1);
assert.deepEqual(g.map(x => x.emails), [['a@x.com', 'b@x.com', 'c@x.com'], ['d@x.com', 'e@x.com'], ['f@x.com', 'g@x.com']]);
assert.deepEqual(g[0].rows, [2, 3, 4]); assert.equal(g[1].chatUrl, 'https://hand-pasted');
assert.equal(P.chatName(1, ['Carolyn Boucher', 'Jim Duffy', 'Lee Lemond']), 'Articulation · Rotation 1 · Carolyn & Jim & Lee');
// link: Circle's own address, else the template, else nothing (never guessed)
assert.equal(P.linkFrom({ url: 'https://ss.example/chat/1' }), 'https://ss.example/chat/1');
assert.equal(P.linkFrom({ uuid: 'abc' }, 'https://ss.example/c/messages/{uuid}'), 'https://ss.example/c/messages/abc'); assert.equal(P.linkFrom({ uuid: 'abc' }, ''), ''); assert.equal(P.linkFrom({ url: 'http://insecure' }, ''), '');

const ids = { 'jacob@embodiedphilosophy.com': 1, 'a@x.com': 11, 'b@x.com': 12, 'c@x.com': 13, 'f@x.com': 16, 'g@x.com': 17 };
const made = [], saved = [];
const deps = { readRows: async () => rows, memberId: async e => ids[e], makeChat: async (by, o) => { made.push([by, o]); return { uuid: 'u' + made.length }; }, save: async (r, link) => saved.push([r, link]) };
process.env.PAIR_CHAT_LINK = 'https://ss.example/c/messages/{uuid}';
assert.deepEqual(await P.runPairChats({ today: '2026-11-02', mode: '', ...deps }), { mode: '', groups: [] }, 'off by default');
let r = await P.runPairChats({ today: '2026-11-02', mode: 'dry', ...deps }); assert.equal(made.length, 0); assert.deepEqual(r.groups.map(x => x.status), ['would create', 'has a chat already', 'would create']);
r = await P.runPairChats({ today: '2026-11-02', mode: 'on', ...deps });
assert.deepEqual(r.groups.map(x => x.status), ['created', 'has a chat already', 'created']); assert.equal(made.length, 2, 'the hand-pasted group is left alone');
assert.deepEqual(made[0][1].memberIds, [1, 11, 12, 13], 'the mentor is in every chat'); assert.match(made[0][1].name, /Rotation 1 · a & b & c/);
assert.deepEqual(saved.map(x => x[0]), [2, 3, 4, 6], 'every row of a group gets the link'); assert.equal(saved[0][1], saved[2][1]);
// a failure (someone not in Circle) leaves that group for tomorrow and does not stop the others
saved.length = 0; made.length = 0; ids['g@x.com'] = undefined;
r = await P.runPairChats({ today: '2026-11-02', mode: 'on', ...deps }); assert.deepEqual(r.groups.map(x => x.status), ['created', 'has a chat already', 'failed']); assert.match(r.groups[2].error, /No Circle member for g@x.com/); assert.deepEqual(saved.map(x => x[0]), [2, 3, 4]);
// no link to store → nothing written, said plainly
delete process.env.PAIR_CHAT_LINK; saved.length = 0; ids['g@x.com'] = 17;
r = await P.runPairChats({ today: '2026-11-02', mode: 'on', ...deps }); assert.equal(saved.length, 0); assert.match(r.groups[0].status, /no link to store/);
// a rotation that has not started: nothing
r = await P.runPairChats({ today: '2026-09-20', mode: 'on', ...deps }); assert.deepEqual(r.groups, []);
// test mode: ONE chat with only the mentor, nothing saved, Circle's reply shown
made.length = 0; saved.length = 0;
r = await P.runPairChats({ today: '2026-11-02', mode: 'test', ...deps, makeChat: async (by, o) => { made.push(o); return { uuid: 'zzz', extra: 1 }; } });
assert.deepEqual(made[0].memberIds, [1]); assert.equal(saved.length, 0); assert.deepEqual(r.test.keys, ['uuid', 'extra']); assert.match(r.test.link, /PAIR_CHAT_LINK/);
console.log('pair chats: ok');
