// The EP Social Engine inside the dashboard (Content → Social). Its data stays in the EP Social Engine
// spreadsheet because Make publishes from it (and writes Posted / Failed / IDs back), so these screens read
// and write that sheet through lib/ops/store.js (sheet: 'social'). Shared by the server and the screens.
//
// Status values come from its Rules tab: Proposed (planner wrote it) → Approved (Make publishes at the
// date and time) / Needs edit (note in jake_notes, the planner revises) / Skip. Posted, Failed and Manual
// are set by Make. Nothing posts unless it is Approved.
export const STATUSES = ['Proposed', 'Approved', 'Needs edit', 'Skip', 'Posted', 'Failed', 'Manual'];
export const SETTABLE = ['Proposed', 'Approved', 'Needs edit', 'Skip'];

export const VIEWS = [
  { key: 'plan', tab: 'Weekly Plan', label: 'Plan' },
  { key: 'history', tab: 'Post History', label: 'Published' },
  { key: 'quotes', tab: 'Quote Library', label: 'Quotes', add: true, name: r => r.quote, sub: r => [r.author, r.work].filter(Boolean).join(', '),
    search: ['quote', 'author', 'work', 'themes'], help: 'Only quotes marked verified are used, copied exactly. Add new ones here.' },
  // The Image Library in two tabs by its has_text column (the sheet's "label" column shows the same split):
  // Art = no words on the picture, the only kind offered for posts; Promo Images = course graphics, ads, title cards
  { key: 'art', tab: 'Image Library', label: 'Art', images: true, only: v => !hasText(v), name: r => r.file_name, search: ['file_name', 'tags', 'category', 'program', 'folder', 'type'],
    help: 'Pictures with no words on them. Only these are offered when you choose a picture for a post, and only those with reuse OK. Hide an image to keep it out of the plan.' },
  { key: 'promo', tab: 'Image Library', label: 'Promo Images', images: true, only: v => hasText(v), name: r => r.file_name, search: ['file_name', 'tags', 'category', 'program', 'folder', 'type'],
    help: 'Pictures with words on them: course graphics, ads, title cards. They are never offered for posts. In the wrong tab? Open it and change “Has text”.' },
  { key: 'captions', tab: 'Caption Bank', label: 'Captions', add: true, name: r => r.text, sub: r => [r.type, r.program].filter(Boolean).join(' · '),
    search: ['text', 'type', 'program'], help: 'Approved snippets are the only wording the planner puts around a quote.' },
  { key: 'rules', tab: 'Rules', label: 'Rules', name: r => r.setting, sub: r => r.value, search: ['setting', 'value', 'notes'], director: true,
    help: 'How the planner works: posts per week, the mix, times, reuse gaps and guardrails.' },
  { key: 'categories', tab: 'Image Categories', label: 'Image categories', add: true, name: r => r.category, sub: r => r.notes, director: true },
  { key: 'sources', tab: 'Archive Sources', label: 'Archive folders', add: true, name: r => r.name, sub: r => r.folder_id, director: true,
    help: 'Drive folders the Image Library is filled from.' },
];
// "images" was the one tab before Art / Promo Images: old links open Art
export const viewOf = k => VIEWS.find(v => v.key === (k === 'images' ? 'art' : k));
// Words on the picture (a title, a date, a call to action) → Promo Images; none → Art
export const hasText = v => String(v?.has_text ?? '').trim().toUpperCase() === 'TRUE';

// A post made in the dashboard: the planner's id pattern (SP-20261012-03) and its week (the Monday)
export const mondayOf = d => { const x = new Date(d + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7)); return x.toISOString().slice(0, 10); };
export const postIdFor = (date, ids) => {
  const pre = `SP-${date.replace(/-/g, '')}-`;
  const n = Math.max(0, ...ids.filter(i => String(i).startsWith(pre)).map(i => Number(String(i).slice(pre.length)) || 0)) + 1;
  return pre + String(n).padStart(2, '0');
};
// Social posts tie to an event as "Event name — YYYY-MM-DD" (the readiness check reads it)
export const eventLabel = ev => `${ev.internal_title || ev.title} — ${ev.date}`;

// The kinds of post the team wants to keep cycling through (from the social meeting). The Weekly Plan's
// `pillar` column holds a post's type; these are suggestions, anything typed there is kept and shown too.
export const POST_TYPES = ['Quote on an image', 'Sanskrit translation', 'Teacher video', 'Meet the teacher', 'South Asian art', 'Carousel: educational',
  'Carousel: storytelling', 'Past or upcoming course', 'Suggested reading', 'Event nearby', 'From our publications'];
// Instagram now allows five hashtags a post
export const MAX_HASHTAGS = 5;
export const hashtagCount = s => (String(s || '').match(/#[^\s#]+/g) || []).length;
// "9:00" and "11:00" in time order (plain text sorting puts 11 before 9)
export const timeKey = t => { const m = String(t || '').match(/^(\d{1,2}):(\d{2})/); return m ? m[1].padStart(2, '0') + ':' + m[2] : '99:99'; };
export const isFeed = p => !(/story/i.test(p.platforms || '') && !/feed/i.test(p.platforms || ''));
export const daysBetween = (a, b) => Math.round((new Date(b + 'T12:00:00Z') - new Date(a + 'T12:00:00Z')) / 864e5);

// Weekly Plan columns people may change; everything else is the planner's or Make's
export const PLAN_EDITABLE = ['publish_date', 'publish_time_ET', 'platforms', 'pillar', 'format', 'caption', 'hashtags', 'link', 'status', 'jake_notes', 'image_id', 'image_url', 'image_review', 'linked_event'];
// Library columns that are never edited by hand (ids, counters, sync fields)
export const LOCKED = {
  'Quote Library': ['quote_id', 'times_used', 'last_used', 'added_by'],
  'Image Library': ['image_id', 'drive_file_id', 'public_url', 'preview', 'source_file_id', 'times_used', 'last_used', 'drive_link', 'file_name', 'label'],
  'Caption Bank': ['snippet_id'],
  'Archive Sources': ['last_synced', 'images_added'],
  'Post History': ['*'],
};
export const isLocked = (tab, col) => {
  if (tab === 'Weekly Plan') return !PLAN_EDITABLE.includes(col);
  const l = LOCKED[tab] || [];
  return l.includes('*') || l.includes(col) || col === 'preview';
};

const BOOL_COLS = ['include', 'verified', 'reuse_ok', 'has_text', 'hidden', 'approved', 'use_in_auto_pick'];
export function colType(tab, col) {
  if (BOOL_COLS.includes(col)) return 'bool';
  if (col === 'status' && tab === 'Weekly Plan') return 'status';
  if (col === 'publish_date') return 'date';
  if (col === 'publish_time_ET') return 'hhmm';
  if (['caption', 'quote', 'text', 'notes', 'jake_notes', 'hashtags'].includes(col)) return 'long';
  if (col === 'image_url' && tab === 'Weekly Plan') return 'drivepic';
  if (['link', 'source_link'].includes(col)) return 'link';
  return 'text';
}

// → { value } or { error }
export function checkSocial(tab, col, raw) {
  const v = String(raw ?? '').trim(), type = colType(tab, col);
  if (!v) return col === 'status' ? { error: 'Pick a status' } : { value: '' };
  if (type === 'bool') return ['TRUE', 'FALSE'].includes(v.toUpperCase()) ? { value: v.toUpperCase() } : { error: 'Yes or no' };
  if (type === 'status') return SETTABLE.includes(v) ? { value: v } : { error: `Pick ${SETTABLE.join(', ')}` };
  if (type === 'date') return /^\d{4}-\d{2}-\d{2}$/.test(v) ? { value: v } : { error: 'A date like 2026-10-21' };
  if (type === 'hhmm') return /^([01]?\d|2[0-3]):[0-5]\d$/.test(v) ? { value: v.padStart(5, '0') } : { error: 'A 24-hour time like 11:00' };
  // Make downloads the post's picture from Drive, so it must be a Drive picture link
  if (type === 'drivepic') return /^https:\/\/lh3\.googleusercontent\.com\/d\/[A-Za-z0-9_-]{20,}$/.test(v) ? { value: v } : { error: 'A Drive picture' };
  if (type === 'link') return /^https:\/\/\S+$/.test(v) ? { value: v } : { error: 'A full link starting with https://' };
  return v.length > 5000 ? { error: 'Too long' } : { value: v };
}

// Drive image → a thumbnail the browser can show
export function thumbOf(url, driveId) {
  const id = driveId || (String(url || '').match(/\/d\/([A-Za-z0-9_-]{20,})/) || [])[1] || (String(url || '').match(/[?&]id=([A-Za-z0-9_-]{20,})/) || [])[1];
  return id ? `https://lh3.googleusercontent.com/d/${id}=w500` : (/^https:\/\//.test(url || '') ? url : '');
}
