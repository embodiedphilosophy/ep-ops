import { NextResponse } from 'next/server';
import { currentUser } from '@/lib/ops/auth';
import { listTasks, completeTask } from '@/lib/ops/taskstore';
import { visibleTo } from '@/lib/ops/tasks';

export const dynamic = 'force-dynamic';
// Mark a task done in the task store (the database, or Motion until the switch)
export async function POST(req) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Please sign in again' }, { status: 401 });
  const { id } = await req.json().catch(() => ({}));
  const find = async fresh => visibleTo(user, await listTasks({ fresh })).find(t => t.id === id);
  const task = (await find(false)) || (await find(true));
  if (!task) return NextResponse.json({ error: 'Task not found' }, { status: 404 });
  try { await completeTask(id); return NextResponse.json({ ok: true }); }
  catch (e) { console.error('Complete failed', e.message); return NextResponse.json({ error: 'Couldn’t save that. Try again shortly.' }, { status: 502 }); }
}
