// The jobs that run on their own, for Settings › Connections and jobs. The schedule is read from vercel.json (so the list cannot drift from
// what really runs); the plain-English name and what each one does are written here. Read only: nothing here runs a job.
import vercel from '../../vercel.json';

const JOBS = {
  '/api/zoom/sync': ['Zoom meetings', 'Makes or updates the Zoom meeting for each session on the sheet, so every session has its join link.'],
  '/api/ops/daily': ['The daily job', 'Makes the tasks from the templates and the repeating tasks, sends the day’s nudges and puts Jacob’s overview in Motion.'],
  '/api/ops/auto': ['Ticking things off', 'Ticks off tasks the calendar proves are done, and looks after the time clock (a reminder at ten hours; shifts left open past midnight are closed).'],
  '/api/scaffolding': ['Weekly Scaffolding draft', 'Builds the Sunday newsletter as a draft in Kit and emails the directors. It never sends: the send button stays with a person.'],
  '/api/ops/library-sync': ['Course Library', 'Reads Circle and updates the Course Library. It only reads.'],
  '/api/ops/mentee-digest': ['Sahṛdaya Upāya Monday note', 'One email to Jacob with what needs him in the mentee year this week.'],
  '/api/ops/social-sync': ['Instagram sync', 'Brings Instagram posts, likes and comments back into Published, and marks matching plan rows Posted.'],
  '/api/ops/ads-sync': ['Ad results', 'Reads how each Meta campaign is doing and keeps it for the campaign pages. It only reads; it never changes anything in Meta.'],
  '/api/ops/ads-rules': ['Ad rules and digest', 'Applies each campaign’s automatic rules (as a dry run unless every safety lock is open), then emails the ad digest to the people who run ads.'],
  '/api/ops/ads-audiences': ['Audience library', 'Brings the Audience library up to date from the ad results: each audience’s result in each campaign, its standing, and any new audience a campaign used. It only reads; it never changes anything in Meta.'],
  '/api/ops/ads-insights': ['Audience insights', 'Every Monday it reads last week from the Practice Report, the ad results, Circle and Kit, writes a short read with every claim checked against its numbers, and suggests course topics. It only reads; nothing is sent, posted or changed in Meta.'],
  '/api/ops/ads-research': ['Outside research', 'Every Monday it looks outside for changes to Meta’s ad policies, features and costs, and ad-cost benchmarks for similar advertisers, using a web search. Every statement must carry a link the search really returned or it is dropped. It only informs: it changes no rule and no ad. Uses one search run on our Anthropic account.'],
  '/api/ops/ads-watch': ['Ad safety net', 'Reads your whole Meta ad account every hour (never changes it) and warns you by email, text and WhatsApp about overspending, ads left running, broken tracking and payment trouble. If it can’t read Meta, that is itself an alert.'],
  '/api/ops/reminders': ['Student reminders', 'Turns each reminder rule that is switched on into the Kit emails for the next 14 days. Drafts unless the rule schedules itself.'],
};
const DAYS = ['Sundays', 'Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays', 'Sundays'];
const clock = (h, m) => `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')} UTC`;

// "0 13 * * *" → "Every day at 13:00 UTC". Only the shapes vercel.json uses.
export function plainSchedule(cron) {
  const [m, h, dom, mon, dow] = String(cron).trim().split(/\s+/);
  if (/^\*\/\d+$/.test(m) && h === '*') return `Every ${m.slice(2)} minutes`;
  if (/^\d+$/.test(m) && h === '*' && dom === '*' && dow === '*') return `Every hour, at ${m} past`;
  if (/^\d+$/.test(m) && /^\d+$/.test(h) && dom === '*' && mon === '*') return dow === '*' ? `Every day at ${clock(h, m)}` : `${DAYS[Number(dow)]} at ${clock(h, m)}`;
  return cron;
}

export const scheduledJobs = () => (vercel.crons || []).map(c => ({ path: c.path, name: (JOBS[c.path] || [c.path])[0], what: (JOBS[c.path] || [])[1] || '', when: plainSchedule(c.schedule) }));

// The systems the dashboard talks to, in plain words. Whether each is answering right now is a later piece (a status check per system).
export const SYSTEMS = [
  ['Google Sheets', 'The calendar, team, templates and website copy: the sheets behind every page. Every save is written to the Change Log tab.'],
  ['Circle', 'Spaces, live sessions (made as drafts until you push them) and course access. The Course Library reads it every hour.'],
  ['Kit', 'Email drafts and schedules, tags and the newsletter. Promo emails carry the session’s code, like [E047].'],
  ['Instagram', 'Reads posts back into Published, and posts only when switched on.'],
  ['Meta ads', 'Where Ads will make and run Facebook and Instagram campaigns. Nothing is sent to Meta until a person presses a button and the safety switch says live.'],
  ['Alerts by text and WhatsApp', 'Twilio carries the urgent and important ad alerts to people’s phones. Email always works without it. Nothing is sent until a director adds a phone number in Settings.'],
  ['Zoom', 'Makes the meeting and the join link for every session on the sheet.'],
  ['Make', 'Publishes approved posts, saves new pictures to Drive, and fills the revenue sheet from Stripe, PayPal and Meta.'],
  ['Motion', 'Receives only Jacob’s daily overview. Tasks and the time clock live in the dashboard’s own database.'],
];
