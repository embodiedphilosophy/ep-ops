// A Circle group chat for each articulation group, made when its rotation starts, with the link written into the chat_url column of Mentee Partners
// (so the pair card on the Sahṛdaya Upāya page shows its chat button). PAIR_CHATS: unset = off, `dry` = lists what it would do, `test` = makes ONE chat
// containing only the mentor and shows Circle's raw reply (no sheet writes), `on` = real. Only groups with an EMPTY chat_url are touched, so a chat link
// you paste by hand is never replaced, and a group that failed is simply tried again the next day.
// The Circle calls are NOT yet checked against the real API (lib/school/circle.js startGroupChat), and neither is the link's address: see linkFrom.
import config from '../../data/mentee.json';
import { readPlain, updatePlain } from '../ops/store';
import { TABS } from './content';
import { rotationFor } from './home';
import { startGroupChat, sendChatMessage } from '../school/circle';
import { findMember } from '../circle';

export const chatMode = () => (['on', 'dry', 'test'].includes(process.env.PAIR_CHATS) ? process.env.PAIR_CHATS : '');
const lower = s => String(s ?? '').trim().toLowerCase();
const shown = v => !/^(false|no|hide)$/i.test(String(v.publish || '').trim());
const first = n => String(n || '').trim().split(/\s+/)[0];

// Rows of one rotation → groups [{ emails, names, rows: [row numbers], chatUrl }]; people linked by pairs are one group (three people = three pairs)
export function groupsOf(tabRows, n) {
  const mine = tabRows.filter(r => String(r.values.rotation || '').trim() === String(n) && shown(r.values) && lower(r.values.email_a) && lower(r.values.email_b));
  const parent = new Map(), names = new Map();
  const find = x => { while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x))); x = parent.get(x); } return x; };
  for (const r of mine) {
    const a = lower(r.values.email_a), b = lower(r.values.email_b);
    for (const [e, nm] of [[a, r.values.name_a], [b, r.values.name_b]]) { if (!parent.has(e)) parent.set(e, e); if (nm) names.set(e, nm); }
    parent.set(find(a), find(b));
  }
  const by = new Map();
  for (const e of parent.keys()) (by.get(find(e)) || by.set(find(e), []).get(find(e))).push(e);
  return [...by.values()].map(emails => {
    emails.sort();
    const rows = mine.filter(r => emails.includes(lower(r.values.email_a)));
    return { emails, names: emails.map(e => names.get(e) || e.split('@')[0]), rows: rows.map(r => r.row), chatUrl: rows.map(r => String(r.values.chat_url || '').trim()).find(Boolean) || '', rowValues: rows.map(r => r.values) };
  }).sort((a, b) => a.emails[0].localeCompare(b.emails[0]));
}
// Circle only makes a chat once its first message is sent, so the job sends one short opening line (PAIR_CHAT_OPENING, {n} = rotation number). Chats cannot be named from Circle's own screens; the name is sent in case the API takes it.
export const openingLine = n => (process.env.PAIR_CHAT_OPENING || 'Your articulation chat for rotation {n}.').replace('{n}', String(n));
export const chatName = (n, names) => `Articulation · Rotation ${n} · ${names.map(first).join(' & ')}`;

// The address to store: the one Circle gives back, else PAIR_CHAT_LINK with {uuid} filled in; with neither we do not guess (→ '')
export function linkFrom(reply, template = process.env.PAIR_CHAT_LINK || '') {
  const r = reply || {};
  const url = [r.url, r.share_url, r.web_url, r.chat_room?.url, r.chat_room?.web_url].find(u => /^https:\/\//.test(String(u || '')));
  if (url) return url;
  const uuid = r.uuid || r.chat_room?.uuid || r.id;
  return template && uuid ? template.replace('{uuid}', String(uuid)) : '';
}

/**
 * today: 'YYYY-MM-DD'. Returns { mode, rotation, groups: [{ names, status, link?, error? }], test? }.
 * Injectable for tests: readRows, makeChat(email, { name, memberIds }), memberId(email), save(row, link).
 */
export async function runPairChats({
  today, mode = chatMode(), mentor = (config.mentor_emails || [])[0] || 'jacob@embodiedphilosophy.com',
  readRows = async () => (await readPlain(TABS.partners)).rows,
  makeChat = startGroupChat, sendMessage = sendChatMessage, memberId = async e => (await findMember(e))?.id,
  save = (row, link, values) => updatePlain(TABS.partners, row, { chat_url: link }, { before: { email_a: values.email_a, email_b: values.email_b }, who: 'pair chats job' }),
} = {}) {
  if (!mode) return { mode: '', groups: [] };
  const rot = rotationFor(config.rotations, today);
  if (!rot) return { mode, groups: [] };
  if (mode === 'test') { // one chat with only the mentor: shows Circle's reply, writes nothing
    const id = await memberId(mentor);
    if (!id) return { mode, rotation: rot.n, groups: [], error: `No Circle member found for ${mentor}` };
    try { const reply = await makeChat(mentor, { name: 'Test · pair chat (delete me)', memberIds: [id] }); const uuid = reply?.uuid || reply?.chat_room?.uuid; let sent = 'no chat id in the reply, so no message was sent'; if (uuid) { await sendMessage(mentor, uuid, 'Test: you can delete this chat.'); sent = 'a test line was sent (Circle makes the chat when the first message goes)'; } return { mode, rotation: rot.n, groups: [], test: { keys: Object.keys(reply || {}), message: sent, link: linkFrom(reply) || '(no link in the reply: set PAIR_CHAT_LINK, e.g. https://ss.embodiedphilosophy.com/c/messages/{uuid})', reply } }; }
    catch (e) { return { mode, rotation: rot.n, groups: [], error: e.message }; }
  }
  // chats are made when the rotation starts (and in the days after, for any that failed); never for a rotation that has not begun
  if (today < rot.from) return { mode, rotation: rot.n, groups: [], note: `Rotation ${rot.n} starts ${rot.from}` };
  const out = [];
  for (const g of groupsOf(await readRows(), rot.n)) {
    if (g.chatUrl) { out.push({ names: g.names, status: 'has a chat already' }); continue; }
    if (mode === 'dry') { out.push({ names: g.names, status: 'would create', name: chatName(rot.n, g.names) }); continue; }
    try {
      const ids = []; for (const e of [mentor, ...g.emails]) { const id = await memberId(e); if (!id) throw new Error(`No Circle member for ${e}`); ids.push(id); }
      const reply = await makeChat(mentor, { name: chatName(rot.n, g.names), memberIds: [...new Set(ids)] });
      const uuid = reply?.uuid || reply?.chat_room?.uuid;
      if (uuid) await sendMessage(mentor, uuid, openingLine(rot.n));
      const link = linkFrom(reply);
      if (!link) { out.push({ names: g.names, status: 'created, but no link to store', error: 'Circle gave no address; set PAIR_CHAT_LINK' }); continue; }
      for (let i = 0; i < g.rows.length; i++) await save(g.rows[i], link, g.rowValues[i]);
      out.push({ names: g.names, status: 'created', link });
    } catch (e) { out.push({ names: g.names, status: 'failed', error: e.message }); }
  }
  return { mode, rotation: rot.n, groups: out };
}
