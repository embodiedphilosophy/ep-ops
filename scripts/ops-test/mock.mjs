// Local stand-in for Google (token, Sheets, Calendar) with synthetic data, a GET-only proxy to Motion,
// and a blocker for every other outbound service. Any write attempt is logged and refused.
import http from 'node:http';
import fs from 'node:fs';
import zlib from 'node:zlib';

const PORT = 4555;
const LOG = process.env.MOCK_LOG || '/dev/stdout';
const log = (...a) => fs.appendFileSync(LOG, a.join(' ') + '\n');

// ---------- synthetic sheet data (same column layout as EP-Programming-Calendar) ----------
const ex = n => n.toLowerCase().split(' ')[0] + '@example.com';
const team = [
  ['name', 'email', 'type', 'roles', 'active', 'welcomed_on', 'notes'],
  ['Jacob Kyle', 'jacob@embodiedphilosophy.com', 'director', 'Director, Marketing, Media, Social, Ads', 'TRUE', '', ''],
  ['Irene Barber', ex('Irene'), 'manager', 'General Manager', 'TRUE', '', ''],
  ['Floss Harry', ex('Floss'), 'projects', 'Project Manager, Course Host', 'TRUE', '', ''],
  ['Ichha Nihalani', ex('Ichha'), '', 'Customer Happiness Manager', 'TRUE', '', ''],
  ['Rebecka Oberg', ex('Rebecka'), 'marketing', 'Marketing Assistant, Marketing, Media, Social, Ads', 'TRUE', '', ''],
  ['Abha Rajbhandari', ex('Abha'), 'teacher', 'Teacher', 'TRUE', '2026-09-01', ''],
  ['Mary Reilly Nichols', ex('Mary'), 'teacher', 'Teacher', 'TRUE', '', ''],
  ['Ryan LeMere', ex('Ryan'), 'teacher', 'Teacher', 'TRUE', '', ''],
];
const defaults = [
  ['track', 'program', 'website', 'public_title', 'time', 'duration', 'price_label', 'series', 'zoom', 'notes', 'public_note', 'zoom_registration', 'audience', 'newsletter'],
  ['MM', 'wisdom', 'TRUE', 'Meditation Mondays', '12pm ET', '60', 'Members', 'meditation-mondays', '', '', 'Live on Zoom, recorded', 'each', 'Meditation Pass', 'show'],
  ['WSML', 'wisdom', 'TRUE', 'Wisdom School Monthly Lecture', '', '90', 'Members', '', '', '', 'Live on Zoom, recorded', '', 'WS members', 'show'],
  ['WSQ', 'wisdom', 'TRUE', '', '', '120', 'Members', '', '', '', '', '', 'WS members', 'show'],
  ['LRL', 'lrl', 'TRUE', '', '', '90', 'Free', '', '', '', 'Live on Zoom, recorded', '', 'Public', 'show'],
  ['CHIT', 'chitheads', 'TRUE', '', '', '75', 'Free', '', '', '', '', '', 'Public', 'show'],
  ['SS', 'sadhana', 'FALSE', '', '9am ET', '90', 'Enrolled', '', '', '', '', 'once', 'SS students', 'enrolled_only'],
  ['SSWW', 'sadhana', 'TRUE', '', '', '240', '', '', '', '', '', '', 'Public', 'show'],
  ['EVENT', 'seasonal', 'TRUE', '', '', '90', '', '', '', '', '', '', 'Public', 'show'],
  ['LAUNCH', '', 'FALSE', '', '', '', '', '', '', 'Internal only', '', '', 'Public', 'hide'],
];
const H = ['Date', 'Day', 'Wk', 'Track', 'Event', 'Teacher / Owner', 'Audience', 'Access', 'Promo Starts', 'Status', 'Notes', 'Time', 'Website', 'Public Title', 'Teachers', 'Course Host', 'Zoom', 'Duration', 'Registration URL', 'Video ID', 'Summary', 'Series', 'Public Note', 'Host Label', 'Zoom Link', 'Teacher/Host Emails', 'Enrolled Tag', 'ID'];
const ev = (date, track, event, o = {}) => {
  const row = Object.fromEntries(H.map(h => [h, '']));
  Object.assign(row, { Date: date, Track: track, Event: event, Status: 'Not started' }, o);
  return H.map(h => row[h]);
};
const T = (who) => ({ Teachers: who, 'Teacher/Host Emails': who.split(',').map(s => ex(s.trim())).join(', ') });
const schedule = [H,
  ev('2026-09-22', 'LRL', 'Living Room Lecture: Where do I begin?', { ...T('Jacob Kyle'), Time: '9am ET', Website: 'TRUE', Status: 'Done' }),
  ev('2026-09-28', 'MM', 'Meditation Monday'),
  ev('2026-09-30', 'LAUNCH', 'ENROLLMENT OPENS — Fall 2026', { 'Teacher / Owner': 'Marketing' }),
  ev('2026-10-05', 'MM', 'Meditation Monday', T('Mary Reilly Nichols')),
  ev('2026-10-06', 'WSML', 'Wisdom School Monthly Lecture', { ...T('Abha Rajbhandari'), Time: '7pm ET', 'Public Title': 'The Return with Wisdom', 'Host Label': 'Wisdom School' }),
  ev('2026-10-11', 'EVENT', 'The Nine Nights — Śāradīya Navaratri  (Oct 11–Oct 20)', { ...T('Jacob Kyle, Tova Olsson'), Time: '9am ET', Website: 'TRUE', 'Public Title': 'Song of the Goddess: Navarātri with the Devī Gītā', Zoom: 'series', Status: 'Live', 'Registration URL': 'https://enroll.embodiedphilosophy.com/navaratri-2026' }),
  ev('2026-10-12', 'MM', 'Meditation Monday', { ...T('Floss Harry'), Time: '12pm ET', Status: 'Live' }),
  ev('2026-10-15', 'CHIT', 'CHITHEADS Live', { Website: 'FALSE' }),
  ev('2026-10-18', 'SS', 'Sādhana School — Orientation 2026–27', { ...T('Jacob Kyle'), 'Course Host': 'Floss Harry', Time: '12pm ET', Website: 'TRUE', 'Public Title': 'Orientation: Sādhana School 2026-2027' }),
  ev('2026-10-19', 'MM', 'Meditation Monday', T('Mary Reilly Nichols')),
  ev('2026-10-21', 'SS', 'Sādhana School — Fall 2026 wk 1', { ...T('Jacob Kyle'), 'Course Host': 'Floss Harry', 'Public Title': 'The Heart of Recognition', Zoom: 'series', Series: 'sadhana-fall-2026' }),
  ev('2026-10-26', 'MM', 'Meditation Monday', T('Abha Rajbhandari')),
  ev('2026-10-28', 'SS', 'Sādhana School — Fall 2026 wk 2', { ...T('Jacob Kyle'), 'Course Host': 'Floss Harry', 'Public Title': 'The Heart of Recognition', Series: 'sadhana-fall-2026' }),
  ev('2026-10-28', 'WSML', 'Wisdom School Monthly Lecture (makeup)', T('Ryan LeMere')),
  ev('2026-11-02', 'MM', 'Meditation Monday'),
  ev('2026-11-03', 'WSML', 'Wisdom School Monthly Lecture', { ...T('Ryan LeMere'), Time: '6pm ET', 'Public Title': 'The Circle Reopens' }),
  ev('2026-11-04', 'SS', 'Sādhana School — Fall 2026 wk 3', { 'Public Title': 'The Heart of Recognition', Series: 'sadhana-fall-2026' }),
  ev('2026-11-07', 'WSQ', 'WS Quarterly — Weekend Seminar'),
  ev('2026-11-09', 'MM', 'Meditation Monday'),
  ev('2026-11-11', 'SS', 'Sādhana School — Fall 2026 wk 4', { 'Public Title': 'The Heart of Recognition', Series: 'sadhana-fall-2026' }),
  ev('2026-11-16', 'MM', 'Meditation Monday'),
  ev('2026-11-18', 'SS', 'Sādhana School — Fall 2026 wk 5', { Series: 'sadhana-fall-2026' }),
  ev('2026-11-19', 'CHIT', 'CHITHEADS Live'),
  ev('2026-11-23', 'MM', 'Meditation Monday'),
  ev('2026-11-25', 'SS', 'Sādhana School — Fall 2026 wk 6', { Series: 'sadhana-fall-2026' }),
  ev('2026-12-01', 'WSML', 'Wisdom School Monthly Lecture', { 'Public Title': 'Sanctifying the World' }),
  ev('2026-12-05', 'SSWW', 'SS Weekend Workshop — Winter on-ramp', T('Jacob Kyle')),
  ev('2026-11-14', 'EVENT', 'Spanda Intensive  (Nov 14–Nov 15)', { ...T('Tova Olsson'), Time: '10am ET', 'Public Title': 'Spanda Intensive', Summary: 'Two mornings with the Spanda Kārikās.' }),
];
const templates = [
  ['track', 'task', 'assign_to', 'offset_days', 'details'],
  ['ALL', 'Send bio and headshot (if not already on file)', 'Teacher', '-28', 'Done in teacher onboarding'],
  ['WSML', 'Confirm lecture title and description', 'Teacher', '-21', ''],
  ['WSML', 'Members email #1', 'Marketing', '-10', ''],
  ['LRL', 'Start ad ramp and open registration', 'Marketing', '-21', ''],
  ['MM', 'Upload replay to Vimeo', 'Media', '1', ''],
  ['SS', 'Post recording and materials in Circle', 'Course Host', '1', ''],
  ['EVENT', 'Promo email #1', 'Marketing', '-35', ''],
];
const note = [['note', 'updated_by', 'updated_on'], ['Navaratri is live — keep replays moving. Sādhana School orientation Oct 18: Circle space ready by Friday.', 'Jacob Kyle', '2026-10-06']];
const resources = [['group', 'title', 'url', 'teachers'],
  ['Handbooks', 'Team handbook', 'https://example.com/handbook', 'FALSE'],
  ['Handbooks', 'Teacher guide', 'https://example.com/teacher-guide', 'TRUE'],
  ['Brand', 'Logo and colours', 'https://example.com/brand', 'FALSE'],
  ['Tools', 'Motion', 'https://app.usemotion.com', 'FALSE']];
const day = n => { const d = new Date('2026-10-08T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const WP = ['post_id', 'week_of', 'publish_date', 'publish_time_ET', 'platforms', 'pillar', 'format', 'linked_event', 'quote_id', 'quote_text', 'quote_source', 'image_id', 'image_url', 'preview', 'caption', 'hashtags', 'link', 'status', 'jake_notes', 'posted_at', 'post_links', 'error', 'quote_check', 'ig_feed_id', 'ig_story_id', 'facebook_id', 'linkedin_id', 'image_review'];
const ST = ['Posted', 'Approved', 'Proposed', 'Proposed', 'Needs edit', 'Proposed', 'Skip', 'Proposed', 'Failed', 'Proposed'];
const weekly = [WP, ...Array.from({ length: 10 }, (_, i) => { const o = { post_id: `P${100 + i}`, week_of: i < 5 ? '2026-10-05' : '2026-10-12', publish_date: day(i - 3), publish_time_ET: i % 3 ? '11:00' : '09:00',
  platforms: i % 3 ? 'IG Feed, FB' : 'IG Story', pillar: ['Content', 'Practice', 'Marketing'][i % 3], format: 'Single image', linked_event: i % 4 === 2 ? 'The Nine Nights — Śāradīya Navaratri  (Oct 11–Oct 19) — 2026-10-11' : '',
  quote_id: i % 2 ? `Q${i}` : '', quote_text: i % 2 ? 'The Self is the light by which all is seen.' : '', quote_source: i % 2 ? 'Kṣemarāja' : '', image_id: `IMG${i % 4}`, image_url: '', caption: ['Nine nights of the Goddess begin on Sunday.\n\nJoin us live.', 'What is recognition?', 'A verse for tonight.', 'Meditation Mondays: join us at noon.'][i % 4],
  hashtags: '#tantra #yoga', link: 'https://embodiedphilosophy.com/events', status: ST[i], jake_notes: ST[i] === 'Needs edit' ? 'Shorter please' : '', quote_check: i % 2 ? 'Verbatim' : '', error: ST[i] === 'Failed' ? 'Instagram rejected the image size' : '', image_review: i % 3 ? 'Kept' : '' };
  return WP.map(h => o[h] ?? ''); })];
const imgLib = [['image_id', 'file_name', 'drive_file_id', 'public_url', 'preview', 'folder', 'program', 'tags', 'type', 'drive_link', 'year', 'reuse_ok', 'times_used', 'last_used', 'source_file_id', 'has_text', 'category', 'hidden'],
  // 150 pictures so the picker's paging (60 at a time) is exercised; 5 can't be reused, 6 is hidden
  ...Array.from({ length: 150 }, (_, i) => [`IMG${i}`, `kali-${i}.jpg`, `DRIVEFILE${i}abcdefghijklmnopq`, `https://picsum.photos/seed/ep${i}/400/500`, '', 'Archive', 'Sadhana', 'deity, kali', 'Archive', '', '2024', i === 5 ? 'FALSE' : 'TRUE', '2', '2026-09-01', '', i % 5 === 0 ? 'TRUE' : 'FALSE', 'Deity art', i === 6 ? 'TRUE' : 'FALSE'])]; // every 5th has words on it (Promo Images)
const siteTabs = {
  'Site Links & Prices': [['key', 'value', "where it's used"], ['wisdom_join', 'https://school.example.com/checkout?o=1', '"Become a member" buttons (Wisdom School annual offer)'], ['wisdom_price', '$297', 'Wisdom School yearly price'], ['tarka', 'https://tarka.example.com', 'Tarka links'], ['events_source', 'calendar', 'Where events come from']],
  'Site Stats': [['number', 'label', 'order', 'notes'], ['100,000+', 'In the community', '1'], ['2015', 'Teaching since', '2', 'Founded']],
  'Site Pathways': [['order', 'question', 'title', 'description', 'courses', 'link', 'publish', 'ce_hours'], ['1', 'What does yoga teach?', 'Classical Yoga', 'The classical sources, read closely.', 'Course A; Course B', 'https://example.com/p1', 'TRUE', '12'], ['2', 'Hidden?', 'Draft pathway', 'Not ready', '', '', 'FALSE', '']],
  'Site Seasons': [['key', 'program', 'school_year', 'title', 'texts', 'description', 'start_date', 'end_date', 'meeting', 'publish'], ['Fall 2026', 'sadhana', '2026–27', 'The Heart of Recognition', 'Pratyabhijñā-hṛdaya', 'The foundation.', '2026-10-21', '2026-12-09', 'Wednesdays', 'TRUE']],
  'Site Annual Themes': [['year', 'title', 'tagline', 'description', 'months', 'publish'], ['2026', 'The Pilgrimage Project', 'Every tradition knows the journey.', 'A year-long journey.', 'January | The Call; February | The Threshold', 'TRUE']],
  'Site Teachers': [['name', 'role', 'bio', 'photo_url', 'order', 'publish'], ['Jacob Kyle', 'Founding Director', 'Teaches Sādhana School.', '', '1', 'TRUE'], ['Guest Teacher', 'Guest', 'A visiting teacher.', 'https://example.com/g.jpg', '9', 'FALSE']],
  'Site Testimonials': [['quote', 'name', 'role', 'program', 'publish'], ['A place that treated me like a thinker.', 'Maya R.', 'Yoga teacher', 'home', 'TRUE']],
};
// The old EP Website tabs that "Bring it over" copies (by their sheet id there)
const oldSite = { 1001: siteTabs['Site Teachers'], 1002: siteTabs['Site Testimonials'] };
delete siteTabs['Site Teachers']; delete siteTabs['Site Testimonials'];
const sheetIds = {}; let nextSheet = 5000;
const kitDrafts = [];

// EP Support KB (Entries, Handoffs) and a Zendesk stand-in for the Support page
const kbEntries = [['ID', 'Replaces', 'Topic', 'Programs', 'Platform', 'Question', 'Other phrasings', 'Public answer', 'Ether notes', 'Hand to Ichha when', 'Public', 'Status', 'Owner', 'Last reviewed', 'Open question'],
  ['c04', 'A02', 'Your Course Dashboard', 'All', 'Circle', 'I paid, but my course isn\'t in my dashboard.', 'Paid but no access; course missing after purchase', 'Sign out and back in, and check you\'re signed in with the email you paid with. If it\'s still missing, our team will add it for you.', 'Several of these came from Meta ad checkouts.', 'Always.', 'Yes', 'Draft', 'Ichha', '2026-10-15', ''],
  ['b01', 'A09', 'Billing, refunds & cancelling', 'All', '', 'Can I get a refund?', 'Refund policy; money back', 'Courses and certificate programs: a full refund within 30 days of purchase.', 'Never say a refund has been made.', 'A course within 30 days.', 'Yes', 'Live', 'Jacob', '2026-10-15', '']];
const kbHandoffs = [['Time (UTC)', 'Zendesk ticket', 'Entry used', 'Topic', 'Gap (no entry)', 'Summary for Ichha', 'Test run'],
  [new Date(Date.now() - 2 * 864e5).toISOString().slice(0, 16).replace('T', ' '), '9102', 'none', 'other', 'Yes', 'Asks whether the Devī Gītā course has a reading list in Spanish.', '']];
const zdUsers = [{ id: 1, name: 'Maya Rivers', email: 'maya@example.com', role: 'end-user' }, { id: 2, name: 'PayPal', email: 'service@paypal.com', role: 'end-user' }, { id: 3, name: 'Ichha Nihalani', email: 'ichha@embodiedphilosophy.com', role: 'agent' }, { id: 4, name: 'Sam Lee', email: 'sam@example.com', role: 'end-user' }];
const zdTickets = [
  { id: 9101, subject: '[Chat · c04] dashboard: Paid for Wisdom School but the course is not showing', status: 'new', requester_id: 1, created_at: new Date(Date.now() - 5 * 36e5).toISOString(), updated_at: new Date(Date.now() - 5 * 36e5).toISOString() },
  { id: 9100, subject: 'Refund for Navaratri?', status: 'open', requester_id: 4, created_at: new Date(Date.now() - 30 * 36e5).toISOString(), updated_at: new Date(Date.now() - 26 * 36e5).toISOString() },
  { id: 9099, subject: 'You received a payment', status: 'new', requester_id: 2, created_at: new Date(Date.now() - 8 * 36e5).toISOString(), updated_at: new Date(Date.now() - 8 * 36e5).toISOString() },
];
const zdComments = { 9101: [{ id: 1, author_id: 1, public: true, created_at: zdTickets[0].created_at, plain_body: 'Hi, I paid for Wisdom School yesterday but nothing shows in my dashboard. My email is maya@example.com.' }],
  9100: [{ id: 2, author_id: 4, public: true, created_at: zdTickets[1].created_at, plain_body: 'I joined Navaratri last week but cannot make the times. Can I get a refund?' }, { id: 3, author_id: 3, public: false, created_at: zdTickets[1].updated_at, plain_body: 'Bought 6 days ago, within 30 days.' }],
  9099: [{ id: 4, author_id: 2, public: true, created_at: zdTickets[2].created_at, plain_body: 'You received a payment of $27.00.' }] };
const tabs = { 'Entries': kbEntries, 'Handoffs': kbHandoffs, 'catalog': [['offering_id', 'status', 'programme', 'card_label', 'kind', 'format', 'depth', 'topics', 'title', 'teachers', 'cover_url', 'price_label', 'checkout_url', 'access', 'requires', 'unlock_note', 'length', 'next_date', 'next_session', 'ce_hours', 'description', 'included', 'sessions', 'published_at', 'updated_at']], ...siteTabs, 'Ops Note': undefined, 'Team': team, 'Track Defaults': defaults, 'Master Schedule': schedule, 'Task Templates': templates, 'Weekly Plan': weekly, 'Image Library': imgLib,
  'Post History': [['ig_media_id', 'posted_at', 'media_type', 'caption', 'permalink', 'like_count', 'comments_count', 'archived_image_id', 'pillar', 'notes'], ...Array.from({ length: 70 }, (_, i) => [`M${i}`, day(-i * 3) + 'T15:00:00Z', 'IMAGE', `Post number ${i}: a verse and a painting.`, 'https://instagram.com/p/x' + i, String(200 - i), String(i % 9), '', 'Content', ''])],
  'Quote Library': [['quote_id', 'quote', 'author', 'work', 'publication', 'location', 'source_link', 'themes', 'pillar_fit', 'verified', 'added_by', 'times_used', 'last_used'], ['Q1', 'The Self is the light by which all is seen.', 'Kṣemarāja', 'Pratyabhijñāhṛdayam', '', '', '', 'recognition', 'Content', 'TRUE', 'Jacob', '3', '2026-09-01'], ['Q2', 'Consciousness is the world.', 'Abhinavagupta', 'Tantrāloka', '', '', '', 'nondual', 'Practice', 'FALSE', 'Jacob', '0', '']],
  'Caption Bank': [['snippet_id', 'type', 'program', 'text', 'source', 'approved', 'notes'], ['C1', 'cta', 'sadhana', 'Join us live this week.', '', 'TRUE', '']],
  'Rules': [['setting', 'value', 'notes'], ['Feed posts per week', '5', 'Instagram feed'], ['Approval deadline', 'Sunday 18:00 ET', '']],
  'Image Categories': [['category', 'use_in_auto_pick', 'notes'], ['Deity art', 'TRUE', '']],
  'Archive Sources': [['folder_id', 'name', 'include', 'last_synced', 'images_added'], ['F1', 'Ryan graphics', 'TRUE', '2026-10-01', '40']],
  'Teachers': [['email', 'name', 'role', 'bio', 'photo_url', 'status', 'updated_on', 'onboarded_on'], ['abha@example.com', 'Abha Rajbhandari', 'Guest teacher', 'Abha teaches the Wisdom School monthly lecture and has studied the Devī traditions for twenty years.', 'https://example.com/abha.jpg', 'submitted', '2026-10-05', '']],
  'Course Pages': [['offering', 'slug', 'track', 'teacher_emails', 'title', 'subtitle', 'summary', 'explore', 'audience', 'status', 'circle_space_id'], ['sadhana-fall-2026', 'heart-of-recognition', 'SS', 'jacob@example.com, abha@example.com', 'The Heart of Recognition', 'Fall Sādhana 2026', 'Kṣemarāja’s little masterpiece, read closely over eight weeks.', 'Weekly live seminar\nRecordings of every session\nReading guide', 'Students of yoga and Indian philosophy', 'submitted', '2002'], ['E003', 'old-course', 'EVENT', 'x@example.com', 'An earlier course', '', '', '', '', 'published', ''], ['mm-nov-2026', 'mm-nov', 'MM', 'abha@example.com', 'Meditation Mondays: November', '', 'A month of Monday practice.', 'Live sit every Monday', '', 'submitted', '']],
  // Circle event sync: which Circle space each program's live sessions go in
  'Circle Groups': [['offering', 'circle_access_group_ids', 'name', 'circle_event_space_id'], ['sadhana-fall-2026', '7', 'SS 26-27 · Fall', '3001'], ['SS', '', 'Sādhana School · Live', '3001']],
  'Weekly Scaffolding': [['Send Date', 'Status', 'Issue No', 'Subject', 'Preview Text', 'Events Intro', 'Reflection Headline', 'Reflection Body', 'Reflection URL', 'Sanskrit Devanagari', 'Sanskrit IAST', 'Sanskrit Translation', 'Sanskrit Source', 'Video Title', 'Video Meta', 'Video Caption', 'Video URL', 'Video Thumbnail', 'Tarka Issue', 'Tarka Title', 'Tarka Author', 'Tarka Teaser', 'Tarka URL', 'PS', 'Kit Draft', 'Built At', 'Notes', 'Pilgrimage Title', 'Pilgrimage Body', 'Pilgrimage URL', 'Pilgrimage Button'],
    ['2026-10-11', 'Draft', '1', 'The Nine Nights begin', 'Navaratri starts Sunday'], ['2026-10-18', 'Draft', '2'], ['2026-10-25', 'Draft', '3']], 'Event Details': [['ID']] };

// ---------- team calendar (Google Calendar events) ----------
const at = (n, h) => `${day(n)}T${String(h).padStart(2, '0')}:00:00-04:00`;
const meetings = [
  { id: 'm1', summary: 'Weekly team sync', start: { dateTime: at(1, 10) }, end: { dateTime: at(1, 11) }, hangoutLink: 'https://meet.google.com/abc-defg-hij', attendees: team.slice(1, 5).map(r => ({ email: r[1], displayName: r[0], responseStatus: 'accepted' })) },
  { id: 'm2', summary: 'Navaratri check-in', start: { dateTime: at(3, 14) }, end: { dateTime: at(3, 14) }, attendees: [team[1], team[3]].map(r => ({ email: r[1], displayName: r[0], responseStatus: 'accepted' })) },
  { id: 'm3', summary: 'Marketing planning', start: { dateTime: at(6, 11) }, end: { dateTime: at(6, 12) }, attendees: [team[1], team[4]].map(r => ({ email: r[1], displayName: r[0], responseStatus: 'accepted' })) },
];

// ---------- writable Schedule + Event Details; Master Schedule rebuilt from them, like the real formulas ----------
const SCHED_H = ['ID', 'Date', 'Day', 'Track', 'Event', 'Teachers & Hosts', 'Time', 'Status', 'Promo Starts', 'Notes', 'Owner (plan)', 'Audience'];
const DET_H = ['ID', 'Date', 'Track', 'Event', 'Series', 'Teacher/Host Emails', 'Public Title', 'Host Label', 'Website', 'Registration URL', 'Summary', 'Price Label', 'Public Note', 'Zoom Type', 'Zoom Link', 'Live Duration', 'Vimeo Video ID', 'Course Host', 'Enrolled Tag'];
const ms = schedule.slice(1).map((r, i) => ({ ...Object.fromEntries(H.map((h, j) => [h, r[j]])), ID: 'E' + String(i + 1).padStart(3, '0') }));
tabs['Schedule'] = [['Schedule'], ['How to use'], ['Next ID'], SCHED_H, ...ms.map(o => [o.ID, o.Date, '', o.Track, o.Event, o.Teachers, o.Time, o.Status, o['Promo Starts'], o.Notes, o['Teacher / Owner'], o.Audience])];
tabs['Event Details'] = [['Event Details'], ['How to use'], [], DET_H, ...ms.filter((_, i) => i !== 3).map(o => [o.ID, '', '', '', o.Series, o['Teacher/Host Emails'], o['Public Title'], o['Host Label'], o.Website, o['Registration URL'], o.Summary, '', o['Public Note'], o.Zoom, o['Zoom Link'], o.Duration, o['Video ID'], o['Course Host'], o['Enrolled Tag']])];
const objs = (t, hr) => { const h = tabs[t][hr - 1]; return tabs[t].slice(hr).filter(r => r[0]).map(r => Object.fromEntries(h.map((k, j) => [k, r[j] ?? '']))); };
function computed(tab) {
  if (tab === 'Event Details') { // Date/Track/Event come from Schedule by ID
    const sc = Object.fromEntries(objs('Schedule', 4).map(o => [o.ID, o]));
    return tabs[tab].map((r, i) => i < 4 || !r[0] ? r : [r[0], sc[r[0]]?.Date || '', sc[r[0]]?.Track || '', sc[r[0]]?.Event || '', ...r.slice(4)]);
  }
  if (tab === 'Master Schedule') {
    const det = Object.fromEntries(objs('Event Details', 4).map(o => [o.ID, o]));
    return [H, ...objs('Schedule', 4).map(s => { const d = det[s.ID] || {};
      const o = { Date: s.Date, Track: s.Track, Event: s.Event, 'Teacher / Owner': s['Owner (plan)'], Audience: s.Audience, 'Promo Starts': s['Promo Starts'], Status: s.Status, Notes: s.Notes, Time: s.Time,
        Website: d.Website, 'Public Title': d['Public Title'], Teachers: s['Teachers & Hosts'], 'Course Host': d['Course Host'], Zoom: d['Zoom Type'], Duration: d['Live Duration'], 'Registration URL': d['Registration URL'],
        'Video ID': d['Vimeo Video ID'], Summary: d.Summary, Series: d.Series, 'Public Note': d['Public Note'], 'Host Label': d['Host Label'], 'Zoom Link': d['Zoom Link'], 'Teacher/Host Emails': d['Teacher/Host Emails'], 'Enrolled Tag': d['Enrolled Tag'], ID: s.ID };
      return H.map(h => o[h] ?? ''); })];
  }
  return tabs[tab];
}
const colIdx = L => [...L].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0) - 1;
const parseRange = r => { const [t, a = 'A1'] = r.split('!'); const m = a.match(/^([A-Z]+)(\d+)?/); return { tab: t.replace(/^'|'$/g, ''), col: colIdx(m[1]), row: Number(m[2] || 1) }; };
function setCells(range, values) {
  const { tab, col, row } = parseRange(range);
  if (!tabs[tab]) throw new Error('no tab ' + tab);
  if (grid[tab] && row - 1 + values.length > grid[tab]) throw new Error('exceeds grid limits');
  values.forEach((line, i) => line.forEach((v, j) => { if (v === null) return; const R = tabs[tab][row - 1 + i] ||= []; while (R.length < col + j) R.push(''); R[col + j] = v; }));
  log('WROTE', range, JSON.stringify(values).slice(0, 160));
}
const body = req => new Promise(r => { let b = ''; req.on('data', c => b += c); req.on('end', () => r(b ? JSON.parse(b) : {})); });

const circleData = {
  spaces: [
    { id: 2001, name: 'Meditation Mondays: November', slug: 'mm-nov', space_type: 'course', status: 'published', cover_image_url: 'http://localhost:4555/img/cover.png' },
    { id: 2002, name: 'The Heart of Recognition', slug: 'heart', space_type: 'course', status: 'published', cover_image_url: '' },
    { id: 2003, name: 'Spanda Karikas: a close reading', slug: 'spanda', space_type: 'course', status: 'draft', cover_image_url: '' },
    { id: 2004, name: 'Community chat', slug: 'chat', space_type: 'discussion' },
    { id: 3001, name: 'Sādhana School · Live Sessions', slug: 'ss-live', space_type: 'event' },
  ],
  // Circle events (Admin API v2 shape: time and length under event_setting_attributes)
  events: [
    { id: 9001, name: 'Orientation (made by hand)', status: 'published', url: 'https://ss.example.com/c/ss-live/orientation', space: { id: 3001, name: 'Sādhana School · Live Sessions' }, event_setting_attributes: { starts_at: '2026-10-18T16:00:00.000Z', duration_in_seconds: 5400 } },
  ],
  sections: [], lessons: [],
  paywalls: [
    { id: 301, name: 'Meditation Mondays', prices: [{ amount: 15, currency: 'usd', interval: 'month' }], checkout_url: 'https://ss.example.com/checkout/301', space_ids: [2001] },
    { id: 302, name: 'Fall 2026 season', prices: [{ amount: 495, currency: 'usd', interval: 'one_time' }], checkout_url: 'https://ss.example.com/checkout/302', space_ids: [2002] },
  ],
};
if (process.env.MOCK_NOCATALOG) delete tabs.catalog;
const grid = {};
const send = (res, code, body) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const p = url.pathname;
  try {
    if (p === '/token' && req.method === 'POST') return send(res, 200, { access_token: 'mock', expires_in: 3600 });
    if (p.startsWith('/v4/spreadsheets/')) {
      if (process.env.MOCK_READONLY && req.method !== 'GET') { log('BLOCKED sheet write', req.method, decodeURIComponent(p)); return send(res, 403, { error: 'writes blocked' }); }
      if (req.method === 'GET' && !p.includes('/values')) { const names = Object.keys(tabs).filter(t => tabs[t]); return send(res, 200, { sheets: names.map((t, i) => ({ properties: { sheetId: 900 + i, title: t, gridProperties: { rowCount: (grid[t] ??= tabs[t].length) } } })) }); }
      const cp = p.match(/\/sheets\/(\d+):copyTo$/);
      if (cp) { const src = oldSite[cp[1]]; if (!src) return send(res, 404, {}); const id = nextSheet++, t = `Copy of ${cp[1]}`; tabs[t] = src.map(r => [...r]); sheetIds[id] = t; log('COPIED TAB', cp[1], '→', t); return send(res, 200, { sheetId: id, title: t }); }
      if (p.endsWith(':batchUpdate') && !p.includes('/values')) { const b = await body(req); for (const q of b.requests || []) if (q.updateSheetProperties) { const { sheetId, title } = q.updateSheetProperties.properties; const old = sheetIds[sheetId]; tabs[title] = tabs[old]; delete tabs[old]; log('RENAMED TAB', old, '→', title); } for (const q of b.requests || []) if (q.appendDimension) { const t = Object.keys(tabs).filter(t => tabs[t])[q.appendDimension.sheetId - 900]; grid[t] = (grid[t] || 0) + q.appendDimension.length; log('ADDED ROWS', t, q.appendDimension.length); } for (const q of b.requests || []) if (q.addSheet) { const t = q.addSheet.properties.title; if (tabs[t]) return send(res, 400, { error: { message: 'already exists' } }); tabs[t] = []; log('ADDED TAB', t); } return send(res, 200, {}); }
      if (p.endsWith('/values:batchUpdate')) { const b = await body(req); for (const d of b.data) setCells(d.range, d.values); return send(res, 200, {}); }
      const range = decodeURIComponent(p.split('/values/')[1] || '');
      if (range.endsWith(':append')) { const b = await body(req); const { tab } = parseRange(range.slice(0, -7)); if (!tabs[tab]) return send(res, 400, { error: { message: 'Unable to parse range' } }); for (const l of b.values) tabs[tab].push(l); log('APPENDED', tab, JSON.stringify(b.values).slice(0, 200)); return send(res, 200, {}); }
      if (req.method === 'PUT') { setCells(range, (await body(req)).values); return send(res, 200, {}); }
      const { tab, row } = parseRange(range);
      if (!tabs[tab]) { log('sheet: no tab', tab); return send(res, 400, { error: { message: `Unable to parse range: ${range}` } }); }
      let values = computed(tab);
      if (tab !== 'Master Schedule') values = values.slice(row - 1);
      if (url.searchParams.get('valueRenderOption') === 'FORMULA' && tab === 'Schedule' && row === 4) values = [values[0].map((v, i) => i === 2 ? '={"Day";ARRAYFORMULA(...)}' : v), ...values.slice(1)];
      if (url.searchParams.get('valueRenderOption') === 'FORMULA' && tab === 'Event Details' && row === 4) values = [values[0].map((v, i) => i >= 1 && i <= 3 ? `={"${v}";ARRAYFORMULA(...)}` : v), ...values.slice(1)];
      return send(res, 200, { range, values });
    }
    if (p.startsWith('/circle/')) {
      // Circle Admin API stand-in (read only). POST /circle/__set swaps the data, to test changes.
      if (p === '/circle/__set' && req.method === 'POST') { Object.assign(circleData, await body(req)); log('CIRCLE DATA SET'); return send(res, 200, {}); }
      // MOCK_CIRCLE_WRITES=1: Circle writes are applied to the data above (and logged), to test "Push to Circle"
      if (req.method !== 'GET' && process.env.MOCK_CIRCLE_WRITES) {
        const b = await body(req), ok = x => { log('CIRCLE WRITE', req.method, p, JSON.stringify(b).slice(0, 300)); return send(res, 200, x); };
        const n = () => 9100 + circleData.events.length + circleData.spaces.length + circleData.lessons.length + circleData.sections.length;
        if (p === '/circle/events' && req.method === 'POST') {
          const e = b.event || {}, sp = circleData.spaces.find(x => x.id === e.space_id);
          if (!sp || !e.event_setting_attributes?.starts_at) return send(res, 422, { message: 'space_id and event_setting_attributes.starts_at are required' });
          const id = n(), rec = { id, name: e.name, body: e.body, status: e.status || 'published', url: `https://ss.example.com/c/${sp.slug}/e${id}`, space: { id: sp.id, name: sp.name }, event_setting_attributes: { ...e.event_setting_attributes } };
          circleData.events.push(rec); return ok(rec);
        }
        const em = p.match(/^\/circle\/events\/(\d+)$/);
        if (em && req.method === 'PUT') {
          const rec = circleData.events.find(x => String(x.id) === em[1]); if (!rec) return send(res, 404, { message: 'not found' });
          const { event_setting_attributes: st, ...rest } = b.event || {}; Object.assign(rec, rest); if (st) Object.assign(rec.event_setting_attributes, st); return ok(rec);
        }
        if (p === '/circle/spaces' && req.method === 'POST') { const id = n(), rec = { id, slug: `s${id}`, ...b }; circleData.spaces.push(rec); return ok(rec); }
        const spm = p.match(/^\/circle\/spaces\/(\d+)$/);
        if (spm && req.method === 'PUT') { const rec = circleData.spaces.find(x => String(x.id) === spm[1]); if (!rec) return send(res, 404, {}); Object.assign(rec, b); return ok(rec); }
        if (p === '/circle/course_sections' && req.method === 'POST') { const rec = { id: n(), ...b }; circleData.sections.push(rec); return ok(rec); }
        if (p === '/circle/course_lessons' && req.method === 'POST') { const rec = { id: n(), ...b }; circleData.lessons.push(rec); return ok(rec); }
        const lm = p.match(/^\/circle\/course_lessons\/(\d+)$/);
        if (lm && req.method === 'PATCH') { const rec = circleData.lessons.find(x => String(x.id) === lm[1]); if (!rec) return send(res, 404, {}); Object.assign(rec, b); return ok(rec); }
        log('BLOCKED circle write (no stand-in)', req.method, p); return send(res, 404, { message: 'not found' });
      }
      if (req.method !== 'GET') { log('BLOCKED circle write', req.method, p); return send(res, 403, { error: 'writes blocked' }); }
      log('CIRCLE GET', p);
      const list = a => send(res, 200, { page: 1, per_page: 100, has_next_page: false, count: a.length, records: a });
      if (p === '/circle/spaces') return list(circleData.spaces);
      if (p === '/circle/events') return list(circleData.events);
      if (p === '/circle/course_sections') return list(circleData.sections.filter(x => String(x.space_id) === url.searchParams.get('space_id')));
      const sp = p.match(/^\/circle\/spaces\/([^/]+)$/); if (sp) { const x = circleData.spaces.find(s => String(s.id) === sp[1] || s.slug === sp[1]); return x ? send(res, 200, x) : send(res, 404, { message: 'not found' }); }
      if (p === '/circle/paywalls') return circleData.noPaywalls ? send(res, 404, { message: 'not found' }) : list(circleData.paywalls);
      if (p === '/circle/access_groups') return list([{ id: 7, name: 'SS 26-27 · Fall' }]);
      return send(res, 404, { message: 'not found' });
    }
    // Website landing pages feed (ep-website /api/landing-pages) and the pages and checkouts it links to,
    // for /ops/landing: one of each state, one page that 404s and one checkout that fails.
    if (p === '/site/api/landing-pages') {
      if (process.env.MOCK_NOLP) return send(res, 404, { error: 'not found' });
      const d = n => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10), S = `http://localhost:${PORT}/site`;
      log('SITE LANDING-PAGES GET');
      return send(res, 200, { pages: [
        { slug: 'the-heart-of-recognition', title: 'The Heart of Recognition', teacher: 'Jacob Kyle', url: `${S}/lp/the-heart-of-recognition`, checkoutUrl: `${S}/checkout/ok`, publishedAt: d(-20), startsAt: d(-3), endsAt: d(30) },
        { slug: 'spanda-intensive', title: 'Spanda Intensive', teachers: [{ name: 'Tova Olsson' }, { name: 'Jacob Kyle' }], url: `${S}/lp/spanda-intensive`, checkout_url: `${S}/checkout/broken`, published_at: d(-5), starts_at: d(12), ends_at: d(14) },
        { slug: 'meditation-for-real-life', title: 'Meditation for Real Life', teacher: 'Jacob Kyle', url: `${S}/lp/meditation-for-real-life`, checkoutUrl: `${S}/checkout/ok`, publishedAt: d(-90) },
        { slug: 'navaratri-2025', title: 'Navarātri 2025: Song of the Goddess', teacher: 'Tova Olsson', url: `${S}/lp/navaratri-2025`, checkoutUrl: `${S}/checkout/ok`, publishedAt: d(-400), startsAt: d(-370), endsAt: d(-361) },
        { slug: 'old-retreat', title: 'Taos Summer Retreat', teacher: 'Jacob Kyle', url: `${S}/lp/old-retreat`, publishedAt: d(-200), startsAt: d(-120), endsAt: d(-115) },
      ] });
    }
    if (p.startsWith('/site/lp/')) { const ok = !p.endsWith('/old-retreat'); return ok ? (res.writeHead(200, { 'Content-Type': 'text/html' }), res.end('<h1>ok</h1>')) : send(res, 404, {}); }
    if (p === '/site/checkout/ok') { if (req.method === 'HEAD') { res.writeHead(405); return res.end(); } res.writeHead(200, { 'Content-Type': 'text/html' }); return res.end('checkout'); }
    if (p === '/site/checkout/broken') return send(res, 500, {});
    if (p === '/site/api/revalidate-courses') { log('SITE REVALIDATE-COURSES', req.method, req.headers['x-revalidate-secret'] === 'mock-secret' ? 'secret ok' : 'secret WRONG'); return send(res, 200, { ok: true }); }
    if (p === '/make-hook' && req.method === 'POST') {
      const b = await body(req);
      if (b.action === 'get') {
        const w = 1200, h = 800, rows = [];
        for (let y = 0; y < h; y++) { const r = Buffer.alloc(1 + w * 3); for (let x = 0; x < w; x++) { r[1 + x * 3] = (x * 255 / w) | 0; r[2 + x * 3] = (y * 255 / h) | 0; r[3 + x * 3] = ((x / 60 | 0) + (y / 60 | 0)) % 2 ? 200 : 90; } rows.push(r); }
        const crc = b => { let c, t = []; for (let n = 0; n < 256; n++) { c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } c = 0xffffffff; for (const x of b) c = t[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
        const chunk = (ty, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(ty), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
        const ih = Buffer.alloc(13); ih.writeUInt32BE(w, 0); ih.writeUInt32BE(h, 4); ih[8] = 8; ih[9] = 2;
        const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ih), chunk('IDAT', zlib.deflateSync(Buffer.concat(rows))), chunk('IEND', Buffer.alloc(0))]);
        log('MAKE GET', b.file_id); res.writeHead(200, { 'Content-Type': 'application/octet-stream' }); return res.end(png);
      }
      if (b.action === 'put') { const id = 'MOCKDRIVE' + Date.now() + 'xxxxxxxxxx'; log('MAKE PUT', b.name, String(b.data || '').length, 'chars →', id); return send(res, 200, { id }); }
      return send(res, 200, 'Accepted');
    }
    // Website CE ledger (ep-website /api/ce/admin) for /ops/ce: one held, two issued, one withdrawn, one unmatched event.
    if (p.startsWith('/site/api/ce/admin')) {
      if (req.headers['x-ce-key'] !== 'mock-ce') return send(res, 401, { error: 'Not allowed' });
      if (p === '/site/api/ce/admin/export') { log('SITE CE EXPORT'); res.writeHead(200, { 'Content-Type': 'text/csv' }); return res.end('Certificate ID,Status\nEP-CE-2026-0001,issued\n'); }
      if (req.method === 'POST') { const b = await body(req); log('SITE CE', JSON.stringify(b)); return send(res, 200, { ok: true }); }
      const c = (id, status, name, title, hours, category, extra = {}) => ({ id, status, name, title, hours, category, email: name.split(' ')[0].toLowerCase() + '@example.com', ya_id: '', issued_at: '2026-10-12T15:00:00Z', first_at: '2026-09-20T15:00:00Z', done_at: '2026-10-12T14:00:00Z', pace: 'pass', r1: 'Reflection one.', r2: 'Reflection two.', notes: '', pdf: status === 'issued' ? 'https://example.com/x.pdf' : '', ...extra });
      return send(res, 200, {
        certs: [
          c('EP-CE-2026-0004', 'held', 'Member B', 'Myth, Shadow & the Inner Journey', 56, 'Yoga Humanities', { first_at: '2026-10-14T10:00:00Z', done_at: '2026-10-14T13:00:00Z', pace: 'held', r1: 'I learned to sit with the shadow material without rushing past it.', r2: 'I will add a closing journaling prompt to my classes.' }),
          c('EP-CE-2026-0003', 'issued', 'Maya Albright', 'Meditation for Real Life', 12, 'Techniques, Training & Practice', { ya_id: '123456' }),
          c('EP-CE-2026-0002', 'issued', 'Sam Okafor', 'Classical Yoga & the Yoga Sūtras', 19.5, 'Yoga Humanities', { notes: 'Name changed by Floss' }),
          c('EP-CE-2026-0001', 'revoked', 'Lee Park', 'The Subtle Body', 3.5, 'Anatomy & Physiology', { notes: 'Revoked by Jacob: duplicate' }),
        ],
        unmatched: [{ id: 9, at: '2026-10-14T12:00:00Z', kind: 'lesson', email: 'maya@example.com', space_id: '555', lesson_id: '42' }],
        counts: { issued_month: 2, hours_all: 31.5, tracking: 14, held: 1, last_event: '2026-10-14T12:00:00Z' },
        pathways: [
          { slug: 'meditation-for-real-life', title: 'Meditation for Real Life', hours: 12, category: 'Techniques, Training & Practice', spaceIds: ['104'], lessons: 8, runtimeMinutes: 720 },
          { slug: 'myth-shadow-and-the-inner-journey', title: 'Myth, Shadow & the Inner Journey', hours: 56, category: 'Yoga Humanities', spaceIds: [], lessons: 0, runtimeMinutes: 0 },
        ],
      });
    }
    if (p.startsWith('/zendesk/api/v2/')) {
      const z = p.slice('/zendesk/api/v2'.length);
      if (req.method !== 'GET') { const b = await body(req); log('ZENDESK WRITE', req.method, z, JSON.stringify(b).slice(0, 200)); const m = z.match(/^\/tickets\/(\d+)\.json$/); const t = m && zdTickets.find(x => x.id === Number(m[1])); if (t && b.ticket?.status) t.status = b.ticket.status; if (t && b.ticket?.comment) (zdComments[t.id] ||= []).push({ id: Date.now(), author_id: b.ticket.comment.author_id || 3, public: b.ticket.comment.public !== false, created_at: new Date().toISOString(), plain_body: b.ticket.comment.body }); return send(res, 200, { ticket: t || {} }); }
      if (z === '/search.json') return send(res, 200, { results: zdTickets.filter(t => t.status !== 'solved' && t.status !== 'closed'), users: zdUsers });
      if (z === '/users/search.json') { const e = (url.searchParams.get('query') || '').replace('email:', ''); return send(res, 200, { users: zdUsers.filter(u => u.email === e) }); }
      let m = z.match(/^\/tickets\/(\d+)\.json$/); if (m) return send(res, 200, { ticket: zdTickets.find(t => t.id === Number(m[1])), users: zdUsers });
      m = z.match(/^\/tickets\/(\d+)\/comments\.json$/); if (m) return send(res, 200, { comments: zdComments[m[1]] || [], users: zdUsers });
      return send(res, 404, {});
    }
    if (p.startsWith('/kit/')) {
      // Promo-email drafts (Publish → Email): logged, never real. Anything else written to Kit is refused.
      if (req.method === 'POST' && p.endsWith('/broadcasts')) { const b = await body(req); const id = 900 + (kitDrafts.length); kitDrafts.push({ id, ...b }); log('KIT DRAFT CREATED', id, b.subject, '|', b.description, '| send_at', b.send_at); return send(res, 200, { broadcast: { id, ...b } }); }
      if (req.method === 'PUT' && /\/broadcasts\/\d+$/.test(p)) { const b = await body(req); const id = Number(p.split('/').pop()); log('KIT DRAFT UPDATED', id, b.subject, '| send_at', b.send_at); return send(res, 200, { broadcast: { id, ...b } }); }
      if (req.method !== 'GET') { log('BLOCKED kit', req.method, p); return send(res, 403, { error: 'writes blocked' }); }
      if (/\/broadcasts\/\d+$/.test(p)) { const id = Number(p.split('/').pop()); const d = kitDrafts.find(x => x.id === id); return send(res, d ? 200 : 404, d ? { broadcast: { ...d, send_at: null } } : { error: 'not found' }); }
      if (p.endsWith('/tags')) return send(res, 200, { tags: [{ id: 1, name: 'Navaratri 2026' }], pagination: {} });
      if (p.endsWith('/broadcasts')) return send(res, 200, { broadcasts: [
        { id: 11, subject: '[E002] Promo #1: the Goddess', send_at: new Date(Date.now() + 2 * 864e5).toISOString() },
        { id: 12, subject: '[E002] Promo #2', published_at: new Date(Date.now() - 864e5).toISOString() },
        { id: 13, subject: 'Autumn sale', send_at: new Date(Date.now() + 5 * 864e5).toISOString() },
        { id: 14, subject: '[E005] Draft promo' }], pagination: {} });
      return send(res, 200, {});
    }
    if (p.startsWith('/calendar/v3/')) return send(res, 200, { items: meetings });
    if (p.startsWith('/motion/')) {
      if (req.method !== 'GET') { log('BLOCKED motion', req.method, p, (await body(req).catch(() => ({})))?.name || ''); return send(res, 403, { error: 'writes blocked in local test' }); }
      const r = await fetch('https://api.usemotion.com/v1' + p.slice('/motion'.length) + url.search, { headers: { 'X-API-Key': req.headers['x-api-key'] } });
      let text = await r.text();
      if (process.env.MOCK_AUTO && p.startsWith('/motion/tasks')) {
        const j = JSON.parse(text); let n = 0;
        for (const t of j.tasks || []) if ((t.completed || t.status?.isResolvedStatus) && n++ < 2) t.description = (t.description || '') + '\n[auto:2026-10-07:video_id]';
        text = JSON.stringify(j);
      }
      res.writeHead(r.status, { 'Content-Type': 'application/json' }); return res.end(text);
    }
    log('BLOCKED', req.method, p);
    return send(res, 403, { error: 'blocked in local test' });
  } catch (e) { log('mock error', e.message); send(res, 500, { error: e.message }); }
}).listen(PORT, () => log('mock on', PORT));
