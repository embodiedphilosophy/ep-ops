// The Sahṛdaya Upāya cohort, for the mentor view: everyone with the mentorship Kit tag (lib/membership.js).
// Read-only. Cached for 10 minutes.
import { TAG } from '../membership';
import { kitConfigured, tagSubscribers } from '../kit';

let cache = null;
export async function mentees() {
  if (cache && Date.now() - cache.at < 10 * 60 * 1000) return cache.list;
  if (!kitConfigured()) return [];
  const subs = await tagSubscribers(TAG.mentorship);
  const list = subs.map(s => ({ name: (s.first_name || '').trim() || s.email_address, email: String(s.email_address || '').toLowerCase() }))
    .filter(m => m.email);
  cache = { at: Date.now(), list };
  return list;
}
