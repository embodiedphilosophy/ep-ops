import { calendarEvents, googleConfigured } from '../google';

// Team meetings come from Google Calendar (the "Team Meetings Calendar" by default; add more IDs,
// comma-separated, in OPS_TEAM_CALENDARS). Each calendar must be shared with the site's service account.
// A person sees a meeting only when they are a guest on the Google event (directors see them all).
const TEAM_CALENDARS = () => String(process.env.OPS_TEAM_CALENDARS || 'c_6oagcm22im6p6eupoguvm5jk3g@group.calendar.google.com')
  .split(',').map(s => s.trim()).filter(Boolean);
const lower = s => String(s || '').trim().toLowerCase();
const TZ = 'America/New_York';
const dayLabel = d => new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'long', month: 'long', day: 'numeric' }).format(d);
const timeLabel = d => new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit' }).format(d).replace(':00', '').replace(' ', '').toLowerCase();
const videoLink = ev => ev.hangoutLink
  || (ev.conferenceData?.entryPoints || []).find(p => p.entryPointType === 'video')?.uri
  || (`${ev.location || ''} ${ev.description || ''}`.match(/https:\/\/[\w.-]*zoom\.us\/[^\s"<>]+/) || [])[0] || '';

export async function teamMeetingsFor(user, days = 14) {
  if (!googleConfigured()) return { meetings: [], error: '' };
  const email = lower(user.email);
  const from = new Date(), to = new Date(Date.now() + days * 864e5);
  const out = [], seen = new Set(), errors = [];
  for (const id of TEAM_CALENDARS()) {
    let items;
    try { items = await calendarEvents(id, from.toISOString(), to.toISOString()); }
    catch (e) {
      const m = e.message;
      errors.push(/has not been used|is disabled|accessNotConfigured/i.test(m) ? 'the Google Calendar API isn’t turned on for the website’s Google Cloud project yet.'
        : /\b404\b|not ?found/i.test(m) ? 'the Team Meetings calendar isn’t shared with the website yet.' : m);
      continue;
    }
    for (const ev of items) {
      if (ev.status === 'cancelled') continue;
      const startRaw = ev.start?.dateTime || ev.start?.date; if (!startRaw) continue;
      const key = `${ev.iCalUID || ev.id}|${startRaw}`; if (seen.has(key)) continue;
      const guests = (ev.attendees || []).filter(a => !a.resource && a.email);
      const me = guests.find(g => lower(g.email) === email);
      if (!user.director && (!me || me.responseStatus === 'declined')) continue;
      seen.add(key);
      const allDay = !ev.start?.dateTime;
      const start = allDay ? new Date(`${startRaw}T12:00:00Z`) : new Date(startRaw);
      const end = ev.end?.dateTime ? new Date(ev.end.dateTime) : null;
      out.push({
        id: key, title: ev.summary || '(No title)', at: start.getTime(),
        day: dayLabel(start), time: allDay ? 'All day' : `${timeLabel(start)}${end ? '–' + timeLabel(end) : ''} ET`,
        who: guests.filter(g => g.responseStatus !== 'declined').map(g => g.displayName || g.email.split('@')[0].replace(/^./, c => c.toUpperCase())).join(', '),
        link: videoLink(ev),
      });
    }
  }
  out.sort((a, b) => a.at - b.at);
  return { meetings: out, error: !out.length && errors.length ? errors[0] : '' };
}
