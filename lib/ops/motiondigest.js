import * as motion from './motion';
import { taskBackend } from './taskstore';
import { forHome, needsOwner, dedupe, addDays } from './tasks';
import { todayET } from '../events';

// Once tasks live in the dashboard, Motion becomes Jacob's read-only overview: each morning the daily job
// puts one task in his Motion, due today, listing what needs him (his own tasks due within a week, anything
// late, and how many tasks have no owner). Nothing in Motion is read back; ticking it there changes nothing here.
// Needs MOTION_API_KEY. Runs only when the database is the task store.
const short = d => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });

export async function sendMotionDigest({ tasks, team, base }) {
  if (taskBackend() !== 'database' || !process.env.MOTION_API_KEY) return { skipped: true };
  const director = team.find(m => m.director);
  if (!director) return { skipped: true, why: 'no director on the Team tab' };
  const today = todayET(), week = addDays(today, 7);
  const all = dedupe(tasks).filter(t => !t.completed);
  const mine = forHome({ ...director, roles: director.roles || [] }, all).filter(t => t.due && t.due <= week)
    .sort((a, b) => a.due.localeCompare(b.due));
  const late = mine.filter(t => t.due < today), unowned = all.filter(needsOwner).length;
  const title = `EP Ops · ${short(today)}: ${mine.length} need you${late.length ? `, ${late.length} late` : ''}`;
  // Don't add a second one if the job runs twice in a day
  const existing = await motion.listTasks({ fresh: true }).catch(() => []);
  if (existing.some(t => !t.completed && t.name.startsWith(`EP Ops · ${short(today)}`))) return { skipped: true, why: 'already sent today' };
  const lines = mine.map(t => `- ${t.due < today ? 'LATE ' : ''}${short(t.due)}: ${t.name.replace(/^\[[^\]]+\]\s*/, '')}${t.escalated ? ` (${t.escalated})` : ''}`);
  const description = [
    lines.length ? lines.join('\n') : 'Nothing of yours is due this week.',
    unowned ? `\n${unowned} task${unowned === 1 ? '' : 's'} with no owner.` : '',
    `\nOpen the dashboard: ${base}/ops`,
    '\n(Read-only copy. Tick things off in the dashboard.)',
  ].join('\n');
  await motion.createTask({ name: title, due: today, labels: [], description });
  return { sent: title };
}
