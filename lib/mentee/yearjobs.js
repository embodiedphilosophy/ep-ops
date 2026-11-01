// The daily job's mentee-year work (app/api/ops/daily/route.js): reminder emails to mentees and the Monday lines for Jacob.
// MENTEE_NUDGES: unset = no reminders; `dry` = work out what would go out and send nothing; `on` = send. Each reminder is sent once
// (a `nudge:<kind>:<id>` row on Mentee Step Status), and a mentee who turned reminders off gets none. Nothing here emails Jacob per mentee.
import { mentees } from '../member/cohort';
import { readTab, TABS } from './content';
import { statusRows, setStatus } from './yearstore';
import { dueNudges, digestLines, statusFor, oneToOneId } from './year';
import { oneToOnes } from '../ops/onetoones';
import { sendEmail, layout, button, esc } from '../ops/email';

export const nudgeMode = () => (['on', 'dry'].includes(process.env.MENTEE_NUDGES) ? process.env.MENTEE_NUDGES : '');
const origin = () => process.env.SCHOOL_ORIGIN || 'https://ss.embodiedphilosophy.com';

async function gather(today, now) {
  const [list, schedule, status, o2o] = await Promise.all([mentees(), readTab(TABS.schedule), statusRows({ light: false }), oneToOnes({ days: 8, now }).catch(() => ({ items: [] }))]);
  const bookings = o2o.items.map(x => ({ email: x.email, start: x.start, summary: !!x.summary.length || !!(statusFor(status, x.email).notes[oneToOneId(new Date(x.start).toISOString().slice(0, 7))] || {}).text }));
  return { list, schedule, status, bookings };
}

export const nudgeEmail = n => ({
  subject: n.subject,
  html: layout(n.subject, n.lines.map(l => `<p>${esc(l)}</p>`).join('') + button(origin() + n.button.path, n.button.label) +
    `<p style="font-size:13px;color:#6B6259">You can turn these off any time: <a href="${origin()}/c/mentorship#reminders">Reminders on your page</a>.</p>`),
});

// → { mode, due: [{ key, email, kind, subject }], sent: n }   (mode '' = off: returns nothing and reads nothing)
export async function runNudges({ today, now = Date.now(), send = sendEmail, record = setStatus } = {}) {
  const mode = nudgeMode();
  if (!mode) return { mode: '', due: [], sent: 0 };
  const g = await gather(today, now), due = dueNudges({ schedule: g.schedule, mentees: g.list, statusRows: g.status, bookings: g.bookings, today });
  if (mode === 'dry') return { mode, due: due.map(n => ({ key: n.key, email: n.email, kind: n.kind, subject: n.subject, text: n.lines.join(' ') })), sent: 0 };
  let sent = 0; const errors = [];
  for (const n of due) {
    try { await send({ to: n.email, ...nudgeEmail(n) }); await record({ email: n.email, stepId: n.key, status: 'sent', by: 'system' }); sent++; }
    catch (e) { errors.push(`${n.kind} → ${n.email}: ${e.message}`); } // not recorded, so it is tried again tomorrow
  }
  return { mode, due: due.map(n => ({ key: n.key, kind: n.kind })), sent, errors };
}

// Monday (New York): the "Mentee year" lines for Jacob, or [] on any other day or when there is nothing to say
export async function mondayLines({ today, now = Date.now() }) {
  if (new Date(`${today}T12:00:00Z`).getUTCDay() !== 1) return [];
  const g = await gather(today, now);
  return digestLines({ schedule: g.schedule, mentees: g.list, statusRows: g.status, bookings: g.bookings, today });
}
