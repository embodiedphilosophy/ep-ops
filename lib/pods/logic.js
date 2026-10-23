// Study pods (self-organising study groups for Sādhana School students). Pure rules, shared by the API and the tests.
//  - Anyone with Sādhana School (a season or the full year, and mentees) can join a pod or ask to lead one.
//  - Staff approve leaders. An approved leader opens a pod on a topic.
//  - A pod needs `min` people (the leader counts as one) to begin, and holds up to `max`. When it begins its members get a small-group chat
//    (staff open it in Circle and paste the link in Ops: Circle does not let the API create group chats) and organise their own meetups in Circle's live rooms.
import config from '@/data/pods.json';

// Study pods stay hidden until switched on: set STUDY_PODS=on in Vercel (or "enabled": true in data/pods.json)
export const podsEnabled = () => process.env.STUDY_PODS === 'on' || config.enabled === true;
export const MIN = Number(config.min) || 5;
export const MAX = Number(config.max) || 10;
export const MAX_OPEN_PER_LEADER = Number(config.max_open_per_leader) || 2;
export const LIVE_ROOMS_URL = /^https:\/\/\S+$/.test(config.live_rooms_url || '') ? config.live_rooms_url : '';

// Who counts as a Sādhana School student: a season, the full year, or a mentee (Circle admins always)
export const ELIGIBLE_TIERS = ['ss_season', 'ss_year', 'mentee'];
export const eligible = (tier, admin) => !!admin || ELIGIBLE_TIERS.includes(tier);

const clean = (s, max) => String(s ?? '').replace(/\r/g, '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim().slice(0, max);

// → { topic, description, schedule } or throws a plain-English message
export function cleanPod(b) {
  const topic = clean(b?.topic, 80).replace(/\s*\n\s*/g, ' '), description = clean(b?.description, 1000), schedule = clean(b?.schedule, 200).replace(/\s*\n\s*/g, ' ');
  if (topic.length < 4) throw new Error('Give your pod a topic (a few words).');
  if (description.length < 20) throw new Error('Say a little about what the pod will study (a sentence or two).');
  return { topic, description, schedule };
}
export const cleanNote = b => { const n = clean(b?.note, 800); if (n.length < 10) throw new Error('Tell us a little about why you would like to lead a pod.'); return n; };

// What one pod looks like to the member asking. members: [{ uid, name }]. The chat link is only ever given to the pod's own members.
export function podView(pod, members, me) {
  const mine = members.some(m => m.uid === me.uid);
  const count = members.length, leader = pod.leader_uid === me.uid;
  return {
    id: String(pod.id), topic: pod.topic, description: pod.description, schedule: pod.schedule || '', leader: pod.leader_name || 'A student',
    status: pod.status, count, min: MIN, max: MAX, spots: Math.max(0, MAX - count), needs: Math.max(0, MIN - count), started: pod.status === 'active',
    mine, isLeader: leader,
    names: mine ? members.map(m => m.name) : [],
    chatUrl: mine && pod.chat_url ? pod.chat_url : '', chatPending: mine && pod.status === 'active' && !pod.chat_url,
    canJoin: !mine && ['open', 'active'].includes(pod.status) && count < MAX, canLeave: mine && !leader && ['open', 'active'].includes(pod.status), canCancel: leader && pod.status === 'open',
  };
}
export const podsFor = (pods, membersBy, me) => pods.map(p => podView(p, membersBy[p.id] || [], me));
