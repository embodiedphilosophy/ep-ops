import { parseSlot } from '../mentee/polls';
import seasonReadingSeed from '../../data/season-readings-seed.json';
// The website content tabs the dashboard edits (Content → Website). Each is a plain table with headers
// in row 1 on EP-Programming-Calendar; the site reads them through lib/sheet.js (CALENDAR_TABS).
// Shared by the server (checks) and the editor (labels, inputs). Rows are never deleted from here:
// set "Show on the website" to No instead, so nothing the site links to disappears by accident.
export const SITE_TABLES = [
  { key: 'links', title: 'Site Links & Prices', label: 'Links & prices', add: false, locked: ['key', "where it's used"],
    name: r => r["where it's used"] || r.key, sub: r => r.value, help: 'Checkout links and prices used on the site. Each row is used in the place described.' },
  { key: 'stats', title: 'Site Stats', label: 'Stats', add: true, name: r => `${r.number} ${r.label}`, sub: r => r.notes, help: 'The numbers on the home page, in order.' },
  { key: 'teachers', title: 'Site Teachers', label: 'Teachers', add: true, importFrom: 1001, name: r => r.name, sub: r => r.role, help: 'The Teachers page and the faces on event cards. A teacher’s approved bio from onboarding replaces the one here.' },
  { key: 'testimonials', title: 'Site Testimonials', label: 'Testimonials', add: true, importFrom: 1002, name: r => r.name || String(r.quote || '').slice(0, 60), sub: r => r.quote, help: 'Program: home, wisdom, sadhana… or all.' },
  { key: 'pathways', title: 'Site Pathways', label: 'Pathways', add: true, name: r => r.title, sub: r => r.question, help: 'Learning pathways on Wisdom School and Continuing Education, in order.' },
  { key: 'seasons', title: 'Site Seasons', label: 'Seasons', add: true, name: r => [r.key, r.title].filter(Boolean).join(': '), sub: r => r.program, help: 'Sādhana School terms and other seasonal offerings.' },
  { key: 'teachings', title: 'Site Teachings', label: 'Today: teaching', add: true, create: true,
    columns: ['week_start', 'source', 'sanskrit_iast', 'translation', 'prompt_mon', 'prompt_tue', 'prompt_wed', 'prompt_thu', 'prompt_fri', 'prompt_sat', 'prompt_sun', 'publish'],
    name: r => `${r.week_start} · ${r.source || 'No source yet'}`, sub: r => r.translation,
    help: 'The sūtra of the week and a question for each day, shown on every student’s Today page (and in the practice app). One row per week; Week start is that week’s Monday. Leave a day’s question empty to show none. Publish = No hides the row.' },
  { key: 'sacred', title: 'Site Sacred Days', label: 'Today: sacred days', add: true, create: true, columns: ['date', 'name', 'note', 'region', 'publish'],
    name: r => `${r.date} · ${r.name || 'No name yet'}`, sub: r => r.note,
    help: 'The great observances shown under "Sacred days ahead" on every student’s Today page, soonest first (the next four show). Date is the day as reckoned for the US; some fall a day differently elsewhere, so check Drik Panchang. Publish = No hides a row.' },
  { key: 'themes', title: 'Site Annual Themes', label: 'Annual themes', add: true, name: r => `${r.year} · ${r.title}`, sub: r => r.tagline, help: 'Months: one per line as Month | Theme (separated by ;).' },
];

// Settings → Sahṛdaya Upāya: what staff write for the mentees' "This week" page (ep-website, /school/sahrdaya-upaya/this-week).
// The page reads these tabs privately, so nothing here is public. A missing tab is made from the editor (create: true).
// season is the season's slug as in the website's data/school-seasons.json (fall-2026); week counts from Session 1's week.
export const MENTEE_TABLES = [
  { key: 'mpolls', title: 'Mentee Polls', label: 'Polls', add: true, create: true, scope: 'site', columns: ['poll', 'title', 'note', 'start', 'closes', 'final', 'link', 'publish'],
    name: r => `${r.poll} · ${r.start}`, sub: r => [r.title, String(r.final).toUpperCase() === 'TRUE' ? 'CONFIRMED time' : '', String(r.publish).toUpperCase() === 'FALSE' ? 'hidden' : ''].filter(Boolean).join(' · '),
    help: 'The “which time works?” surveys on the mentee page (e.g. the mentorship orientation). One row per time option; rows with the same Poll id are one survey. Start: a time like 2026-10-24 10:00 ET (ET, UK or UTC); mentees see it in their own time zone. Closes (optional): when answers stop. To confirm a time, set Final = Yes on that row (and a meeting link): mentees then see the confirmed time instead of the survey, until two hours after it. Publish = No hides a row. Results: Settings → see who answered.' },
  { key: 'mbooks', title: 'Mentee Books', label: 'Reading list', add: true, create: true, scope: 'site', columns: ['month', 'starts', 'theme', 'kind', 'title', 'author', 'audio', 'note', 'search', 'asin', 'publish'],
    name: r => `Month ${r.month} · ${r.title}`, sub: r => [r.kind || 'required', r.author, r.starts && `from ${r.starts}`, String(r.publish).toUpperCase() === 'FALSE' ? 'hidden' : ''].filter(Boolean).join(' · '),
    help: 'The reading list shown as “Book of the month” on the mentee page, with a button to see them all. One row per book. Month: the number (1, 2, 3…). Starts: the date that month begins (the page moves on to the next month by itself on that date; put the same date on every book of a month). Theme: the month’s title. Kind: required (feeds the monthly reflection) or suggested (peer articulation, not assessed). Audio: e.g. Audible. Note: a line shown under the book. Search: what to look for on Amazon if the title alone is not enough. Amazon id (asin): the 10-character id from the book’s Amazon page, for a direct link. Links go to Amazon.co.uk for students in the UK and Amazon.com for everyone else. Publish = No hides a row.' },
  { key: 'mreadings', title: 'Mentee Readings', label: 'Weekly reading', add: true, create: true, scope: 'site',
    columns: ['season', 'week', 'sanskrit', 'translation', 'citation', 'reading_url', 'workbook_url', 'publish'],
    name: r => `${r.season} · week ${r.week}`, sub: r => r.citation || r.translation,
    help: 'The reading shown on each mentee’s page for that week: the Sanskrit line, its translation, the citation, and the Circle link to the reading. Add the Workbook link if it differs from the usual one. Fill it in before each Wednesday session. Publish = No hides a row.' },
  { key: 'massignments', title: 'Mentee Assignments', label: 'Assignments', add: true, create: true, scope: 'site',
    columns: ['season', 'week', 'title', 'where', 'url', 'due', 'audience', 'type', 'brief', 'hours_component', 'hours', 'publish'],
    name: r => `${r.season} · week ${r.week} · ${r.title}`, sub: r => [r.where, r.due && `due ${r.due}`].filter(Boolean).join(' · '),
    help: 'What is due each week. Where: where it lives (e.g. Circle · Readings). Link: the Circle link, opened in Circle. Audience: all (all Sādhana School) or mentees. Type: reading, reflection or workbook. Change the title and mentees’ ticks start fresh, so fix dates and links freely but think before renaming. Add a week at a time or the whole season up front. Brief: shown in the hand-in form. Hours component (observation, practice-teaching, peer or retreat) with Hours offers “also log hours”.' },
  { key: 'mfeedback', title: 'Mentee Feedback', label: 'Teaching feedback', add: true, create: true, scope: 'site',
    columns: ['email', 'date', 'notes', 'publish'],
    name: r => `${r.email} · ${r.date}`, sub: r => r.notes,
    help: 'Jacob’s notes after a Practicum. Only that mentee sees their own note, on their “This week” page. Use the email they sign in to Circle with.' },
  { key: 'mlaunches', title: 'Mentee Launches', label: 'Coming soon', add: true, create: true, scope: 'site',
    columns: ['title', 'line', 'date', 'audience', 'url', 'publish'],
    name: r => r.title, sub: r => [r.date, r.line].filter(Boolean).join(' · '),
    help: 'Upcoming launches shown under “Coming soon at EP”. Date: a full date (it drops off after that day) or just a month like January. Audience: leave blank for everyone, or name the mentees.' },
];

// Settings → Library: the member Library by department in Circle (ep-website, public/circle/library.js). One row per item;
// departments appear in the order of the rows. A missing tab is made from the editor.
export const LIBRARY_TABLES = [
  { key: 'libitems', title: 'Library Items', label: 'Library items', add: true, create: true, scope: 'site',
    columns: ['department', 'level', 'label', 'title', 'teachers', 'url', 'access', 'publish'],
    name: r => `${r.department} · ${r.title}`, sub: r => [r.level, r.access && `for ${r.access}`, String(r.publish).toUpperCase() === 'FALSE' ? 'hidden' : ''].filter(Boolean).join(' · '),
    help: 'One row per item in the member Library. Department: the group it sits in (departments show in the order of the rows). Level: Foundations, Deepening or Advanced. Label: the small line above the title, e.g. Learning pathway or Sādhana School · Fall. Link: the Circle space or course. Access: who sees it. Leave blank for everyone, or write meditation, wisdom, wisdom plus, sadhana or mentee (each also opens it to the memberships above). A word that is not one of these shows it to admins only. Publish = No hides it.' },
];

// The old "EP Website" sheet the site's content tabs came from (importFrom: that tab's id there)
export const OLD_SITE_SHEET = '1Ss58wGNPM6mW-ZyB9nMFak-Df4ZEqX-mQxsx2lieYSw';

// Content → Email: one row per Sunday issue of the Weekly Scaffolding newsletter
export const SCAFFOLDING = { key: 'scaffolding', title: 'Weekly Scaffolding', label: 'Weekly Scaffolding', add: true, scope: 'site', locked: ['Kit Draft', 'Built At'],
  columns: ['Pilgrimage Title', 'Pilgrimage Body', 'Pilgrimage URL', 'Pilgrimage Button'], // added to the tab on first save
  name: r => `${r['Send Date']}${r['Issue No'] ? ` · No. ${r['Issue No']}` : ''} · ${r.Subject || 'No subject yet'}`, sub: r => [r.Status || 'Draft', r['Kit Draft'] ? 'in Kit' : ''].filter(Boolean).join(' · '),
  help: 'One issue per Sunday. Fill in the words, preview, then build the Kit draft. Building never sends: that stays in Kit. The week’s events are added from the schedule automatically.',
  groups: [
    ['Issue', ['Send Date', 'Status', 'Issue No', 'Subject', 'Preview Text', 'Events Intro']],
    ['Reflection', ['Reflection Headline', 'Reflection Body', 'Reflection URL']],
    ['Pilgrimage Weekly (Wisdom School members only)', ['Pilgrimage Title', 'Pilgrimage Body', 'Pilgrimage URL', 'Pilgrimage Button']],
    ['Sanskrit', ['Sanskrit Devanagari', 'Sanskrit IAST', 'Sanskrit Translation', 'Sanskrit Source']],
    ['Video', ['Video Title', 'Video Meta', 'Video Caption', 'Video URL', 'Video Thumbnail']],
    ['Tarka', ['Tarka Issue', 'Tarka Title', 'Tarka Author', 'Tarka Teaser', 'Tarka URL']],
    ['P.S. and notes', ['PS', 'Notes']],
    ['Kit', ['Kit Draft', 'Built At']],
  ] };
// Team → Waiting for review: what teachers sent through /teach. Approving or publishing sets the status the
// website reads (an approved bio replaces the Teachers page one; a published course page goes live).
export const REVIEW_TABLES = [
  { key: 'profiles', title: 'Teachers', label: 'Teacher bios', add: false, scope: 'site', name: r => r.name, sub: r => r.status },
  { key: 'coursepages', title: 'Course Pages', label: 'Course pages', add: false, scope: 'site', name: r => r.title || r.offering, sub: r => r.status },
];
export const PROFILE_STATUSES = ['on file', 'submitted', 'approved'];
export const PAGE_STATUSES = ['', 'draft', 'submitted', 'published'];
export const SCAFFOLDING_STATUSES = ['', 'Draft', 'Ready', 'In Kit', 'Skip', 'Sent'];

// Admin → Settings (directors only). columns: the headers the dashboard needs; a missing one is added on
// first save, and a missing tab can be created from the editor (create: true).
export const ADMIN_TABLES = [
  { key: 'templates', title: 'Task Templates', label: 'Task templates', add: true, scope: 'admin',
    columns: ['track', 'task', 'assign_to', 'offset_days', 'details', 'done_when'],
    name: r => `${r.track} · ${r.task}`, sub: r => `${r.assign_to}, ${Number(r.offset_days) < 0 ? `${-r.offset_days} days before` : `${r.offset_days || 0} days after`}${r.done_when ? ` · done when: ${r.done_when}` : ''}`,
    help: 'The tasks the daily job makes for each event. Assign to: Teacher, Course Host, Marketing, Media, Director or a name. Days: negative = before the event. Done when: how the task ticks itself off (blank = worked out from the wording).' },
  { key: 'defaults', title: 'Track Defaults', label: 'Track defaults', add: true, scope: 'admin', name: r => r.track, sub: r => r.public_title || r.program,
    help: 'What each track uses when an event leaves a field blank: title, time, length, price, newsletter buttons.' },
  { key: 'team', title: 'Team', label: 'Team', add: true, scope: 'admin', columns: ['monthly_hours', 'hourly_rate'], name: r => r.name, sub: r => [r.type, r.roles, r.monthly_hours ? `${r.monthly_hours} h/month` : ''].filter(Boolean).join(' · '),
    help: 'Who can sign in and what they see. Type: director, manager, projects, marketing or teacher. Roles: comma-separated (e.g. Marketing, Media). Active = No removes access. Monthly hours: the most this person can clock in a month (blank = no cap, no clock warnings). Hourly rate: what a staff contractor is paid per hour, for their submitted hours (Finance → To pay).' },
  { key: 'circlegroups', title: 'Circle Groups', label: 'Circle spaces', add: true, scope: 'admin',
    columns: ['offering', 'circle_access_group_ids', 'name', 'circle_event_space_id', 'circle_course_space_id'],
    name: r => r.name || r.offering, sub: r => [r.offering, r.circle_event_space_id ? `live sessions in space ${r.circle_event_space_id}` : ''].filter(Boolean).join(' · '),
    help: 'One row per course. Offering: its Series (e.g. sadhana-fall-2026), an event ID (E047) or a track (SSWW). Access group IDs: the Circle groups its teachers join. Event space ID: the Circle space its live sessions are made in (the number in Circle’s space settings). Course space ID: a standalone course’s own course space (filled in by “Set up course in Circle” on Events).' },
  { key: 'recurring', title: 'Recurring Tasks', label: 'Recurring tasks', add: true, scope: 'admin', create: true, columns: ['task', 'owner', 'every', 'day', 'active'],
    name: r => r.task, sub: r => [r.owner, r.every && `${r.every} ${r.day}`.trim(), String(r.active).toLowerCase() === 'no' ? 'paused' : ''].filter(Boolean).join(' · '),
    help: 'Tasks that come back on a schedule. Owner: a name or role. Every: weekly or monthly. Day: a weekday (Saturday) for weekly, a date (1) for monthly. Active = No pauses it. The daily job makes each next one once.' },
  { key: 'funnel', title: 'Funnel', label: 'Funnel', add: true, scope: 'admin', create: true, columns: ['step', 'kit_tag'],
    name: r => r.step, sub: r => r.kit_tag ? `Kit tag: ${r.kit_tag}` : 'no tag, hidden',
    help: 'The steps on Business → Funnel, in order (Practice Report quiz, Meditation Mondays, Wisdom School…). Kit tag: the tag people get when they reach that step. A step with no tag is left out.' },
  { key: 'contracts', title: 'Contract Templates', label: 'Contracts', add: true, scope: 'admin', create: true, columns: ['name', 'kind', 'body', 'active'],
    name: r => r.name, sub: r => [r.kind, String(r.active).toUpperCase() === 'FALSE' ? 'not in use' : ''].filter(Boolean).join(' · '),
    help: 'Your standard teaching agreements, picked when inviting faculty (Faculty → Invitations). In the body, these fill themselves in: {{teacher_name}} {{teacher_email}} {{kind}} {{offering}} {{dates}} {{sessions}} {{fee}} {{terms}} {{today}} {{director}}. Active = No hides one.' },
  { key: 'resources', title: 'Resources', label: 'Resources', add: true, scope: 'admin', create: true, columns: ['group', 'title', 'url', 'teachers'],
    name: r => r.title, sub: r => `${r.group}${String(r.teachers).toUpperCase() === 'TRUE' ? ' · teachers see it too' : ''}`, help: 'Links on the Team page. Teachers = Yes also shows the link to teachers.' },
];
// Settings → Sādhana School: what the season pages in Circle read (ep-website lib/school/readings.js)
export const SS_TABLES = [
  { key: 'sreadings', title: 'Season Readings', label: 'Reading assignments', add: true, create: true, seed: seasonReadingSeed,
    columns: ['season', 'session', 'kind', 'title', 'detail', 'pages', 'teacher', 'file_url', 'link_url', 'order', 'publish'],
    name: r => [r.season || 'No season', r.session ? `session ${r.session}` : 'whole season', r.kind || 'core'].join(' · '),
    sub: r => [[r.title, r.detail].filter(Boolean).join(': ').slice(0, 120), r.file_url ? 'file' : '', r.link_url ? 'link' : '', String(r.publish).toUpperCase() === 'FALSE' ? 'hidden' : ''].filter(Boolean).join(' · '),
    help: 'What students read each week, shown on the season page’s Readings tab in Circle. Season: its short name (fall-2026, winter-2027, spring-2027, summer-2027). Session: 1–8 (blank for the whole season). Kind: session (one per session: Title = its theme, Detail = the focus such as Sūtras 1–4, Pages = how long the reading takes, Teacher = who teaches it), core and suggested (Title = the book, Detail = what to read, Pages = the pages), need (the “What you’ll need” box), intro (the opening paragraph, in Detail) and footer (the closing line). Upload a file or add a link and students get a Download or Open button. Order sorts readings within a week. Show on the website: No hides a row.' },
];

export const tableOf = key => [...SITE_TABLES, ...ADMIN_TABLES, ...MENTEE_TABLES, ...SS_TABLES, ...LIBRARY_TABLES, SCAFFOLDING, ...REVIEW_TABLES].find(t => t.key === key);
export const RULE_OPTIONS = ['', 'bio', 'title', 'blurbs', 'readings', 'video_id', 'kit_email', 'manual'];
export const TYPE_OPTIONS = ['director', 'manager', 'projects', 'marketing', 'teacher'];
export const NEWSLETTER_OPTIONS = ['show', 'enrolled_only', 'hide'];

const LONG = ['description', 'texts', 'quote', 'bio', 'notes', 'months', 'courses', 'kajabi_contents', 'tagline'];
// What kind of value a column holds → which input and which check
export function typeOf(table, col, row = {}) {
  const c = String(col).toLowerCase();
  if (table === 'profiles' && c === 'status') return 'profilestatus';
  if (table === 'coursepages' && c === 'status') return 'pagestatus';
  if (table === 'scaffolding') {
    if (c === 'send date') return 'date';
    if (c === 'status') return 'scaffstatus';
    if (c === 'issue no' || c === 'tarka issue') return 'number';
    if (/ url$|thumbnail|kit draft/.test(c)) return 'link';
    if (/body|caption|teaser|translation|intro|^ps$|notes|devanagari|iast/.test(c)) return 'long';
    return 'text';
  }
  if (c === 'publish' || c === 'active' || c === 'website' || (table === 'resources' && c === 'teachers')) return 'bool';
  if (table === 'templates') return { track: 'track', offset_days: 'number', done_when: 'rule', details: 'long' }[c] || 'text';
  if (table === 'team') return { email: 'email', type: 'teamtype', welcomed_on: 'date', notes: 'long', hourly_rate: 'number' }[c] || 'text';
  if (table === 'defaults') {
    if (c === 'track') return 'track';
    if (c === 'time') return 'time';
    if (c === 'duration') return 'number';
    if (c === 'newsletter') return 'newsletter';
    if (c === 'button_color') return 'color';
    if (c.endsWith('_url')) return 'link';
    if (c === 'notes' || c === 'enrolled_tags') return 'long';
    return 'text';
  }
  if (table === 'sreadings') return { session: 'number', order: 'number', kind: 'readkind', detail: 'long', file_url: 'file', link_url: 'link' }[c] || (c === 'publish' ? 'bool' : 'text');
  if (table === 'mpolls') return { start: 'slot', closes: 'slot', final: 'bool', link: 'link', note: 'long' }[c] || (c === 'publish' ? 'bool' : 'text');
  if (table === 'mbooks') return { month: 'number', starts: 'date', kind: 'bookkind', note: 'long' }[c] || (c === 'publish' ? 'bool' : 'text');
  if (table === 'massignments' && c === 'hours') return 'number';
  if (table === 'massignments' && c === 'brief') return 'long';
  if (table === 'libitems') {
    if (c === 'url') return 'link';
    if (c === 'publish') return 'bool';
    return 'text';
  }
  if (table.startsWith('m') && MENTEE_TABLES.some(t => t.key === table)) {
    if (c === 'email') return 'email';
    if (c === 'week') return 'number';
    if (c === 'due' || c === 'date') return table === 'mlaunches' ? 'text' : 'date'; // a launch date can be a month
    if (c === 'publish') return 'bool';
    if (['sanskrit', 'translation', 'notes'].includes(c)) return 'long';
    if (c.endsWith('_url') || c === 'url') return 'link';
    return 'text';
  }
  if (table === 'resources' && c === 'url') return 'link';
  if (table === 'contracts' && c === 'body') return 'contract';
  if (table === 'circlegroups' && (c === 'circle_event_space_id' || c === 'circle_course_space_id')) return 'number';
  if (c === 'value' && table === 'links') return /_price$|price|hours|seats|yacep|theme/i.test(row.key || '') ? 'text' : 'link';
  if (/(^|_)date$/.test(c) || (table === 'teachings' && c === 'week_start') || (table === 'sacred' && c === 'date')) return 'date';
  if (['order', 'year', 'ce_hours', 'contact_hours', 'non_contact_hours', 'hourly_rate', 'monthly_hours'].includes(c)) return 'number';
  if (['link', 'image', 'photo_url', 'registration_url'].includes(c) || c.endsWith('_url')) return 'link';
  if (LONG.includes(c)) return 'long';
  return 'text';
}

// → { value } or { error }
export function checkCell(type, raw) {
  const v = String(raw ?? '').trim();
  if (!v) return { value: '' };
  if (type === 'track') return /^[A-Za-z]{2,10}$/.test(v) ? { value: v.toUpperCase() } : { error: 'A track code like WSML or ALL' };
  if (type === 'rule') return RULE_OPTIONS.includes(v) ? { value: v } : { error: 'Pick a rule' };
  if (type === 'teamtype') return TYPE_OPTIONS.includes(v.toLowerCase()) ? { value: v.toLowerCase() } : { error: 'Pick a type' };
  if (type === 'newsletter') return NEWSLETTER_OPTIONS.includes(v) ? { value: v } : { error: 'Pick one' };
  if (type === 'email') return /^[^\s@,]+@[^\s@,]+\.[a-z]{2,}$/i.test(v) ? { value: v.toLowerCase() } : { error: 'An email address' };
  if (type === 'time') return /^\d{1,2}(:\d{2})?\s*(am|pm)\s+ET$/i.test(v) ? { value: v } : { error: 'A time like 7pm ET' };
  if (type === 'color') return /^#[0-9a-f]{6}$/i.test(v) ? { value: v.toUpperCase() } : { error: 'A colour like #1E4772' };
  if (type === 'profilestatus') return PROFILE_STATUSES.includes(v) ? { value: v } : { error: 'Pick a status' };
  if (type === 'pagestatus') return PAGE_STATUSES.includes(v) ? { value: v } : { error: 'Pick a status' };
  if (type === 'scaffstatus') return SCAFFOLDING_STATUSES.includes(v) ? { value: v } : { error: 'Pick a status' };
  if (type === 'bool') return ['TRUE', 'FALSE'].includes(v.toUpperCase()) ? { value: v.toUpperCase() } : { error: 'Yes or no' };
  if (type === 'date') return /^\d{4}-\d{2}-\d{2}$/.test(v) && !isNaN(Date.parse(v)) ? { value: v } : { error: 'A date like 2026-10-21' };
  if (type === 'number') return /^-?\d+(\.\d+)?$/.test(v) ? { value: v } : { error: 'A number' };
  if (type === 'link' || type === 'file') return /^(https:\/\/\S+|\/\S*)$/.test(v) ? { value: v } : { error: 'A full link starting with https:// (or a site path starting with /)' };
  if (type === 'text') return v.length > 300 ? { error: 'Keep it under 300 characters' } : { value: v.replace(/\s*\n\s*/g, ' ') };
  if (type === 'bookkind') return ['required', 'suggested'].includes(v.toLowerCase()) ? { value: v.toLowerCase() } : { error: 'required or suggested' };
  if (type === 'slot') return parseSlot(v) ? { value: v.replace(/\s+/g, ' ') } : { error: 'A time like 2026-10-24 10:00 ET (ET, UK or UTC)' };
  if (type === 'contract') return v.length > 40000 ? { error: 'Too long (40,000 characters at most)' } : { value: v };
  return v.length > 6000 ? { error: 'Too long' } : { value: v };
}
