// Study pods that are waiting for staff, for the Ops front page: students who asked to lead a pod, and running pods that still need a chat link.
// (The full page is Settings → Study pods.) Quiet when the database isn't connected.
import { podsAvailable, leaders, listPods } from '../pods/store';

export async function podsWaiting() {
  if (!podsAvailable()) return null;
  const [ls, { pods, membersBy }] = await Promise.all([leaders(), listPods({ all: true })]);
  return {
    requests: ls.filter(l => l.status === 'applied').map(l => ({ uid: l.uid, name: l.name || l.email, email: l.email, note: String(l.note || ''), at: l.applied_at })),
    needChat: pods.filter(p => p.status === 'active' && !p.chat_url).map(p => ({ id: String(p.id), topic: p.topic, leader: p.leader_name, count: (membersBy[String(p.id)] || []).length })),
    open: pods.filter(p => p.status === 'open').length,
  };
}
