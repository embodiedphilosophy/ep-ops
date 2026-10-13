import { readRange, googleConfigured } from './google';
import { todayET } from './events';

// Read-only view of the EP Social Engine sheet (Weekly Plan tab) for the ops dashboard.
// The sheet must be shared (Viewer) with the site's Google service account.
export const socialSheetId = () => process.env.SOCIAL_SHEET_ID || '1IWmlLqZNPgmMuPgdM9HkVQagQNwPylAd0zi4YcUtEIM';
const SHEET = socialSheetId;

const toMinutes = t => {
  const m = String(t || '').match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
  if (!m) return 24 * 60;
  let h = +m[1]; const ap = (m[3] || '').toLowerCase();
  if (ap === 'pm' && h < 12) h += 12;
  if (ap === 'am' && h === 12) h = 0;
  return h * 60 + (+m[2] || 0);
};

// The next `n` scheduled posts (today onwards, skipped rows left out), soonest first.
export async function upcomingSocial(n = 9) {
  if (!googleConfigured()) return { posts: [], error: 'The site has no Google access configured.' };
  let rows;
  try { rows = await readRange(SHEET(), "'Weekly Plan'!A1:AF"); }
  catch (e) { return { posts: [], error: /403/.test(e.message) ? 'The EP Social Engine sheet isn’t shared with the website yet.' : e.message }; }
  const hd = (rows[0] || []).map(s => String(s).trim());
  const col = k => hd.indexOf(k);
  const get = (r, k) => (col(k) >= 0 ? String(r[col(k)] ?? '').trim() : '');
  const today = todayET();
  const posts = rows.slice(1)
    .map(r => ({
      id: get(r, 'post_id'), date: get(r, 'publish_date'), time: get(r, 'publish_time_ET'),
      platforms: get(r, 'platforms'), pillar: get(r, 'pillar'), status: get(r, 'status') || 'Draft',
      imageId: get(r, 'image_id'), imageUrl: get(r, 'image_url'), review: get(r, 'image_review'),
      caption: get(r, 'caption'), event: get(r, 'linked_event'),
    }))
    .filter(p => p.id && /^\d{4}-\d{2}-\d{2}$/.test(p.date) && p.date >= today && !/^skip/i.test(p.status))
    .sort((a, b) => a.date.localeCompare(b.date) || toMinutes(a.time) - toMinutes(b.time))
    .slice(0, n)
    .map(p => {
      const id = (p.imageUrl.match(/\/d\/([A-Za-z0-9_-]{20,})/) || [])[1];
      return { ...p, thumb: id ? `https://lh3.googleusercontent.com/d/${id}=w400` : (/^https:\/\//.test(p.imageUrl) ? p.imageUrl : '') };
    });
  return { posts, error: '' };
}
