import { NextResponse } from 'next/server';
import { currentUser } from '@/lib/ops/auth';
import * as motion from '@/lib/ops/motion';
import * as db from '@/lib/ops/taskdb';
import { addDays } from '@/lib/ops/tasks';
import { todayET } from '@/lib/events';

// One-time move from Motion into the dashboard's database. Safe to run more than once: tasks already
// copied (matched by their Motion id) are skipped. Copies every open task with its comments, and tasks
// finished with a due date in the last 60 days (so Recently done and the readiness counts carry over).
//   GET  /api/ops/tasks/import          → what would be copied (nothing changes)
//   GET  /api/ops/tasks/import?run=1    → copy them (a link you can open in the browser)
//   POST /api/ops/tasks/import          → copy them
// Signed in as a director, or ?key=CRON_SECRET.
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

async function allowed(req) {
  const key = new URL(req.url).searchParams.get('key');
  if (process.env.CRON_SECRET && key === process.env.CRON_SECRET) return true;
  const u = await currentUser();
  return !!u?.director;
}

async function plan() {
  if (!process.env.DATABASE_URL && !process.env.POSTGRES_URL) throw new Error('Connect the database first (DATABASE_URL is not set).');
  const [all, done] = await Promise.all([motion.listTasks({ fresh: true }), db.importedMotionIds()]);
  const since = addDays(todayET(), -60);
  const keep = all.filter(t => !/\(superseded\)$/.test(t.name) && (!t.completed || (t.due && t.due >= since)));
  return { keep, todo: keep.filter(t => !done.has(t.id)), already: keep.length - keep.filter(t => !done.has(t.id)).length };
}

export async function GET(req) {
  if (!(await allowed(req))) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (new URL(req.url).searchParams.get('run') === '1') return POST(req);
  try {
    const { keep, todo, already } = await plan();
    return NextResponse.json({ mode: 'preview: nothing copied', in_motion_to_keep: keep.length, already_copied: already, to_copy: todo.length,
      open: todo.filter(t => !t.completed).length, finished: todo.filter(t => t.completed).length, sample: todo.slice(0, 10).map(t => `${t.due || 'no date'} · ${t.name}`) });
  } catch (e) { return NextResponse.json({ error: e.message }, { status: 500 }); }
}

export async function POST(req) {
  if (!(await allowed(req))) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const out = { copied: 0, comments: 0, skipped_comments: 0, errors: [] };
  try {
    const { todo } = await plan();
    for (const t of todo) {
      // Labels as Motion had them; a "[Role]" name prefix stays in the name, and the reader keeps treating it as a label
      const labels = t.labels.filter(l => !t.name.startsWith(`[${l}]`));
      try {
        const row = await db.createTask({ name: t.name, due: t.due || null, labels, description: t.description, motionId: t.id, completed: t.completed, createdBy: 'Motion import' });
        if (!row) continue;
        out.copied++;
        if (t.completed) continue;
        try {
          for (const c of await motion.listComments(t.id)) { await db.addComment(row.id, c.content, c.at || null); out.comments++; }
        } catch (e) { out.skipped_comments++; if (e.rateLimited) await new Promise(r => setTimeout(r, 5000)); }
      } catch (e) { out.errors.push(`${t.name}: ${e.message}`); }
    }
    return NextResponse.json(out);
  } catch (e) { return NextResponse.json({ ...out, error: e.message }, { status: 500 }); }
}
