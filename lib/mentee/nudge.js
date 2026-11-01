// One gentle Circle message from Jacob to both people of a pair that has no articulation session with three weeks or fewer left in the rotation.
// Once per pair per rotation (mentee_nudges). OFF unless MENTEE_NUDGES=on. The Circle direct-message calls are NOT yet checked against the real API
// (docs/sahrdaya-upaya-page.md): a message that fails is not recorded as sent, so it is tried again the next Monday.
import config from '../../data/mentee.json';
import { nudgeTargets, nudgeText, groupKey } from './mentor';
import { markNudged } from './mentorstore';
import { findMember } from '../circle';
import { startDirectChat, sendChatMessage } from '../school/circle';

export const nudgesOn = () => process.env.MENTEE_NUDGES === 'on';
const SENDER = () => (config.mentor_emails || [])[0] || 'jacob@embodiedphilosophy.com';

// Default sender: Jacob starts (or reuses) a direct chat with the person and writes in it.
export async function sendDirect(toEmail, text) {
  const m = await findMember(toEmail);
  if (!m?.id) throw new Error(`no Circle member for ${toEmail}`);
  const uuid = await startDirectChat(SENDER(), m.id);
  if (!uuid) throw new Error('Circle did not return a chat room');
  await sendChatMessage(SENDER(), uuid, text);
}

// tiles: pairHealth() output. send(email, text) may be replaced in tests. Returns what was (or would be) sent.
export async function runNudges({ tiles, rotation, dry = false, send = sendDirect, record = markNudged }) {
  const out = [];
  if (!rotation) return out;
  for (const t of nudgeTargets(tiles)) {
    const msgs = t.people.map(p => ({ email: p.email, name: p.name, text: nudgeText(p.name, t.people.filter(q => q.email !== p.email).map(q => q.name).join(' and '), rotation) }));
    if (dry || !nudgesOn()) { out.push({ key: t.key, sent: false, msgs }); continue; }
    try { for (const m of msgs) await send(m.email, m.text); await record(rotation.n, t.key || groupKey(t.people.map(p => p.email))); out.push({ key: t.key, sent: true, msgs }); }
    catch (e) { console.error('nudge failed', t.key, e.message); out.push({ key: t.key, sent: false, error: e.message, msgs }); }
  }
  return out;
}
