// What the Media lane has waiting: shared by the Content pages and the Social calendar's status cards.
import { loadCalendar, loadTemplates } from '../calendar';
import { todayET } from '../events';
import { addDays } from './tasks';

// Sessions from the last 30 days whose track has a replay task, still without a Video ID
export async function waitingReplays() {
  const [cal, tpls] = await Promise.all([loadCalendar(), loadTemplates()]);
  const tracks = new Set(tpls.filter(t => /vimeo|replay|video id/i.test(t.task)).map(t => t.track.toUpperCase()));
  const today = todayET(), from = addDays(today, -30);
  return cal.filter(e => tracks.has(e.track) && e.date >= from && e.date < today && !e.replay_link && !e.video_id && !/cancel/i.test(e.status))
    .sort((a, b) => a.date.localeCompare(b.date));
}

