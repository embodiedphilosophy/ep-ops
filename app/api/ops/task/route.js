import { NextResponse } from 'next/server';
import { currentUser } from '@/lib/ops/auth';
import { listTasks, createTask, updateTask, addComment, listComments, reopenTask } from '@/lib/ops/taskstore';
import { isStaff } from '@/lib/ops/nav';
import { loadCalendar } from '@/lib/calendar';
import { UNDO_DAYS } from '@/lib/ops/autocomplete';
import { visibleTo, ownersOf, parseTag, loadTeam, addDays } from '@/lib/ops/tasks';
import { todayET } from '@/lib/events';
import { sendEmail, layout, button, esc } from '@/lib/ops/email';

export const dynamic = 'force-dynamic';

const slug = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
const bare = name => String(name).replace(/^\[[^\]]+\]\s*/, '');
const withoutBlock = d => String(d || '').replace(/\s*\[blocked:[^\]]+\]/g, '');

async function findTask(user, id) {
  const find = async fresh => visibleTo(user, await listTasks({ fresh })).find(t => t.id === id);
  return (await find(false)) || (await find(true));
}

// Tell people about a task, best effort (never fails the action)
async function notify(people, subject, bodyHtml, base) {
  for (const p of people) {
    if (!p?.email) continue;
    try { await sendEmail({ to: p.email, subject, html: layout(subject, bodyHtml + button(`${base}/ops`, 'Open the dashboard')) }); }
    catch (e) { console.error('Task email failed', e.message); }
  }
}

// GET ?id=…  → the task's comments
export async function GET(req) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Please sign in again' }, { status: 401 });
  const id = new URL(req.url).searchParams.get('id');
  if (!(await findTask(user, id))) return NextResponse.json({ error: 'Task not found' }, { status: 404 });
  try { return NextResponse.json({ comments: await listComments(id) }); }
  catch (e) { return NextResponse.json({ error: 'Couldn’t load comments. Try again.' }, { status: 502 }); }
}

// POST { action: 'create', name, due, who, event? }  → a new task (staff only)
// POST { id, action: snooze|block|unblock|comment|assign|undo, days? | date?, who?, text? }
export async function POST(req) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Please sign in again' }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  if (body.action === 'create') return create(user, body, process.env.OPS_URL || new URL(req.url).origin);
  const { id, action, days, date, who, text } = body;
  const task = await findTask(user, id);
  if (!task) return NextResponse.json({ error: 'Task not found' }, { status: 404 });
  const team = await loadTeam();
  const base = process.env.OPS_URL || new URL(req.url).origin;
  const me = user.name || user.email;
  const title = esc(bare(task.name));
  try {
    if (action === 'snooze') {
      const today = todayET();
      // A picked date (up to 90 days out), or 1–30 days from today
      const due = /^\d{4}-\d{2}-\d{2}$/.test(String(date || '')) && date > today && date <= addDays(today, 90)
        ? date : addDays(today, Math.min(Math.max(Number(days) || 1, 1), 30));
      await updateTask(id, { due });
      await addComment(id, `**${me}** snoozed this to ${due}.`).catch(() => {});
      return NextResponse.json({ ok: true, due });
    }
    if (action === 'block') {
      const person = team.find(m => m.name === who);
      if (!person) return NextResponse.json({ error: 'Pick someone from the team' }, { status: 400 });
      await updateTask(id, { description: `${withoutBlock(task.description)}\n\n[blocked:${person.name}]` });
      const note = String(text || '').trim().slice(0, 1000);
      await addComment(id, `**${me}** marked this blocked, waiting on ${person.name}${note ? `: ${note}` : '.'}`).catch(() => {});
      if (person.email !== user.email) await notify([person], `${me} is waiting on you`,
        `<p><b>${esc(me)}</b> can’t finish <b>${title}</b> until you help.</p>${note ? `<p>“${esc(note)}”</p>` : ''}`, base);
      return NextResponse.json({ ok: true, blockedOn: person.name });
    }
    if (action === 'unblock') {
      await updateTask(id, { description: withoutBlock(task.description) });
      await addComment(id, `**${me}** cleared the block.`).catch(() => {});
      return NextResponse.json({ ok: true });
    }
    if (action === 'comment') {
      const body = String(text || '').trim().slice(0, 2000);
      if (!body) return NextResponse.json({ error: 'Write something first' }, { status: 400 });
      await addComment(id, `**${me}**: ${body}`);
      const blocked = team.find(m => m.name === task.blockedOn);
      const others = [...ownersOf(task, team), ...(blocked ? [blocked] : [])]
        .filter((m, i, a) => m.email !== user.email && a.findIndex(x => x.email === m.email) === i);
      await notify(others, `New comment: ${bare(task.name).split(' — ')[0]}`, `<p><b>${esc(me)}</b> commented on <b>${title}</b>:</p><p>“${esc(body)}”</p>`, base);
      return NextResponse.json({ ok: true });
    }
    if (action === 'undo') {
      if (!task.auto || task.auto < addDays(todayET(), -UNDO_DAYS)) return NextResponse.json({ error: 'Only automatic ticks from the last week can be undone' }, { status: 400 });
      // [auto-undone] keeps the job from closing it again
      await updateTask(id, { description: task.description.replace(/\[auto:[^\]]+\]/, '[auto-undone]') });
      await reopenTask(id);
      await addComment(id, `**${me}** reopened this: the automatic tick was wrong.`).catch(() => {});
      return NextResponse.json({ ok: true });
    }
    if (action === 'assign') {
      if (!user.director) return NextResponse.json({ error: 'Only directors can assign tasks' }, { status: 403 });
      const person = team.find(m => m.name === who);
      if (!person) return NextResponse.json({ error: 'Pick someone from the team' }, { status: 400 });
      const p = parseTag(task.description);
      const description = p ? task.description.replace(p.tag, p.tag.replace(/:[^:\]]+\]$/, `:${slug(person.name)}]`)) : task.description;
      try { await updateTask(id, { name: bare(task.name), labels: [person.name], description }); }
      catch { await updateTask(id, { name: `[${person.name}] ${bare(task.name)}`, description }); }
      await addComment(id, `**${me}** assigned this to ${person.name}.`).catch(() => {});
      if (person.email !== user.email) await notify([person], `New task: ${bare(task.name).split(' — ')[0]}`, `<p>${esc(me)} assigned you <b>${title}</b>, due ${esc(task.due)}.</p>`, base);
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (e) {
    console.error('Task action failed', action, e.message);
    return NextResponse.json({ error: e.rateLimited ? 'The task list is busy. Try again in a minute.' : 'Couldn’t save the task. Try again shortly.' }, { status: 502 });
  }
}

// Quick add: a task for anyone on the team, optionally tied to an event (it then counts on that event's
// readiness drawer and groups under it on Today). Owners are labels, as for every other task.
async function create(user, { name, due, who, event, note }, base) {
  if (!isStaff(user)) return NextResponse.json({ error: 'Only staff can add tasks' }, { status: 403 });
  const title = String(name || '').trim().slice(0, 200);
  if (!title) return NextResponse.json({ error: 'Name the task first' }, { status: 400 });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(due || ''))) return NextResponse.json({ error: 'Pick a due date' }, { status: 400 });
  const team = await loadTeam();
  const person = team.find(m => m.name === who) || team.find(m => m.email === user.email);
  if (!person) return NextResponse.json({ error: 'Pick someone from the team' }, { status: 400 });
  let description = String(note || '').trim().slice(0, 2000);
  let full = title;
  if (event) {
    const ev = (await loadCalendar().catch(() => [])).find(e => e.id === event);
    if (ev) {
      full = `${title} — ${ev.title} (${ev.date})`;
      description = `${description ? description + '\n\n' : ''}Event: ${ev.title}, ${ev.date}\n[ep:${ev.id}:${slug(title)}:${slug(person.name)}]`;
    }
  }
  const me = user.name || user.email;
  try {
    const t = await createTask({ name: full, due, labels: [person.name], description, createdBy: me });
    if (t?.id) await addComment(t.id, `**${me}** added this.`).catch(() => {});
    if (person.email !== user.email) await notify([person], `New task: ${title}`, `<p>${esc(me)} added a task for you: <b>${esc(title)}</b>, due ${esc(due)}.</p>`, base);
    return NextResponse.json({ ok: true, id: t?.id || null });
  } catch (e) {
    console.error('Task create failed', e.message);
    return NextResponse.json({ error: 'Couldn’t add the task. Try again shortly.' }, { status: 502 });
  }
}
