// The monthly one-to-ones with Jacob, for the Ops dashboard: who booked, when, and what they wrote for him when they booked (Calendly's invitee
// question, or the note they added on their page if the booking had none). Read-only: nothing is written to Calendly.
import { upcomingBookings, calendlyConfigured } from '../mentee/calendly';
import { bookingNotes, menteeAvailable } from '../mentee/store';
import config from '../../data/mentee.json';

// → { configured, items: [{ uuid, start, name, email, summary: [{ q, a }], source: 'calendly' | 'note' | '' }] }
export async function oneToOnes({ days = 60, now = Date.now() } = {}) {
  if (!calendlyConfigured()) return { configured: false, items: [] };
  const rows = await upcomingBookings(config.calendly_event_type, { days, now });
  const missing = rows.filter(r => !r.answers.length).map(r => ({ email: r.email, uuid: r.uuid }));
  const notes = menteeAvailable() && missing.length ? await bookingNotes(missing).catch(() => ({})) : {};
  const items = rows.map(r => {
    const note = !r.answers.length ? notes[`${r.email}|${r.uuid}`] : '';
    return { uuid: r.uuid, start: r.start, name: r.name, email: r.email, joinUrl: r.joinUrl, summary: r.answers.length ? r.answers : note ? [{ q: 'What they sent', a: note }] : [], source: r.answers.length ? 'calendly' : note ? 'note' : '' };
  });
  return { configured: true, items };
}
