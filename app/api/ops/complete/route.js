import { NextResponse } from 'next/server';
import { currentUser } from '@/lib/ops/auth';
import { listTasks, completeTask } from '@/lib/ops/motion';
import { visibleTo } from '@/lib/ops/tasks';

export const dynamic = 'force-dynamic';
// Mark a task done → completed in Jake's Motion
export async function POST(req) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Please sign in again' }, { status: 401 });
  const { id } = await req.json().catch(() => ({}));
  const find = async fresh => visibleTo(user, await listTasks({ fresh })).find(t => t.id === id);
  const task = (await find(false)) || (await find(true));
  if (!task) return NextResponse.json({ error: 'Task not found' }, { status: 404 });
  try { await completeTask(id); return NextResponse.json({ ok: true }); }
  catch (e) { console.error('Complete failed', e.message); return NextResponse.json({ error: 'Could not update Motion. Try again shortly.' }, { status: 502 }); }
}
