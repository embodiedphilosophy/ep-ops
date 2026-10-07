import { findTagged, getMeeting, listUpcoming } from '../zoom';
import { zoomLinkOf } from '../events';
import { meetingKey } from '../zoomplan';

// A zoom_link on any row of a series covers the whole series
export function seriesLinksOf(cal) {
  const out = {};
  for (const ev of cal) if (ev.series && zoomLinkOf(ev) && !out[ev.series]) out[ev.series] = zoomLinkOf(ev);
  return out;
}

// The Zoom link for a session, in order: the row's Zoom Link; a Zoom Link on another row of the same
// series; Meditation Mondays' hand-made meeting; the meeting the Zoom sync created (one-off or series).
// Used by both the reminder emails and the ops dashboard, so they always agree.
export async function joinUrlFor(ev, seriesLinks = {}, upcoming) {
  if (zoomLinkOf(ev)) return zoomLinkOf(ev);
  if (ev.series && seriesLinks[ev.series]) return seriesLinks[ev.series];
  try {
    if (ev.series === 'meditation-mondays' && process.env.MEDITATION_MONDAYS_MEETING_ID) return (await getMeeting(process.env.MEDITATION_MONDAYS_MEETING_ID)).join_url;
    const key = meetingKey(ev) || ev.series || '';
    if (!key) return '';
    const m = await findTagged(key, upcoming);
    return m ? (m.join_url || (await getMeeting(m.id)).join_url) : '';
  } catch { return ''; }
}

// Fetch Zoom's upcoming-meeting list once for many lookups (empty if Zoom isn't reachable)
export const upcomingMeetings = () => listUpcoming().catch(() => []);
