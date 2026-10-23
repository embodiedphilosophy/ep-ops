import { NextResponse } from 'next/server';
import { currentUser } from '@/lib/ops/auth';
import { canEditSite } from '@/lib/ops/nav';
import { podsAvailable, leaders, listPods, decideLeader, cancelPod, setChatUrl } from '@/lib/pods/store';
import { MIN, MAX, podsEnabled } from '@/lib/pods/logic';

export const dynamic = 'force-dynamic';

// Study pods for staff (Settings → Study pods): leader requests to approve, every pod with its members, and the pods that need a chat link.
//   GET → { leaders, pods: [{ id, topic, leader, status, count, chatUrl, needsChat, members: [name] }] }
//   POST { action: 'approve' | 'decline', uid } | { action: 'chat', id, url } | { action: 'cancel', id }
const deny = u => !u ? NextResponse.json({ error: 'Please sign in again' }, { status: 401 }) : !canEditSite(u) ? NextResponse.json({ error: 'Only Jacob, Irene and Floss can manage study pods' }, { status: 403 }) : null;

async function state() {
  const on = podsEnabled();
  const [ls, { pods, membersBy }] = await Promise.all([leaders(), listPods({ all: true })]);
  return {
    min: MIN, max: MAX, enabled: on,
    leaders: ls.map(l => ({ uid: l.uid, name: l.name, email: l.email, note: l.note, status: l.status, at: l.applied_at })),
    pods: pods.map(p => { const ms = membersBy[String(p.id)] || []; return { id: String(p.id), topic: p.topic, leader: p.leader_name, leaderEmail: p.leader_email, status: p.status, count: ms.length, chatUrl: p.chat_url, needsChat: p.status === 'active' && !p.chat_url, members: ms.map(m => m.name), created: p.created_at }; }),
  };
}

export async function GET() {
  const user = await currentUser(), no = deny(user);
  if (no) return no;
  if (!podsAvailable()) return NextResponse.json({ error: 'Study pods aren’t connected in this environment (no database).' }, { status: 503 });
  try { return NextResponse.json(await state()); } catch (e) { console.error('ops pods GET', e.message); return NextResponse.json({ error: 'Couldn’t load the pods just now. Try again shortly.' }, { status: 502 }); }
}

export async function POST(req) {
  const user = await currentUser(), no = deny(user);
  if (no) return no;
  if (!podsAvailable()) return NextResponse.json({ error: 'Study pods aren’t connected in this environment (no database).' }, { status: 503 });
  const b = await req.json().catch(() => ({}));
  try {
    if (b.action === 'approve' || b.action === 'decline') await decideLeader(b.uid, b.action === 'approve', user.name || user.email);
    else if (b.action === 'chat') await setChatUrl(b.id, b.url);
    else if (b.action === 'cancel') await cancelPod(null, b.id, { staff: true });
    else return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
    return NextResponse.json(await state());
  } catch (e) {
    const known = /^(A full link|That pod)/.test(e.message);
    if (!known) console.error('ops pods POST', b.action, e.message);
    return NextResponse.json({ error: known ? e.message : 'Couldn’t save that just now. Try again shortly.' }, { status: known ? 400 : 502 });
  }
}
