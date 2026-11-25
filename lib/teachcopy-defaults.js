// The words of teacher onboarding (/teach), editable in Ops (Faculty → Onboarding). Each key has the default below;
// a row on the "Onboarding Copy" tab (key, text) replaces it. {first} = the teacher's first name; a few keys have
// their own placeholders, named in their hint. Plain text: line breaks are kept, no formatting.
// Shared by the server (loading, the emails) and the browser (onboarding, the Ops editor), so nothing here imports.
export const COPY = [
  // [key, step, label, default, hint?]
  ['welcome_title', 'welcome', 'Heading', 'We’re glad you’re teaching with us, {first}'],
  ['welcome_title_back', 'welcome', 'Heading for returning teachers', 'Good to have you back, {first}'],
  ['welcome_lede', 'welcome', 'Introduction', 'This takes about fifteen minutes. By the end, your course page will be with our team for review, you’ll know how to use your dashboard, and you’ll know which emails to expect.'],
  ['welcome_none', 'welcome', 'When they aren’t on any session yet', 'You aren’t on the schedule for any upcoming sessions yet. Once the team adds you, your offering will appear here.'],

  ['agreement_title', 'agreement', 'Heading', 'Your teaching agreement'],
  ['agreement_lede', 'agreement', 'Introduction', 'Before we build your course page, please read our standard teaching agreement. It covers what you’ll teach, who owns your work (you do), how recordings are used and how you’re paid. Sign it by typing your name; Jacob Kyle countersigns for Embodied Philosophy, and you’ll get a copy by email.'],
  ['agreement_signed_title', 'agreement', 'Heading once signed', 'Thank you, {first}. Your agreement is signed'],

  ['profile_onfile_title', 'profile', 'Heading when we have their bio', 'We have you on file'],
  ['profile_onfile_lede', 'profile', 'Introduction when we have their bio', 'This is how you appear on the Teachers page and your course page. Update it if anything has changed.'],
  ['profile_title', 'profile', 'Heading for a new bio', 'Introduce yourself'],
  ['profile_lede', 'profile', 'Introduction for a new bio', 'Your bio appears on your course page and the Teachers page. Please write it in the third person.'],
  ['profile_bio_hint', 'profile', 'Bio guidance', '60–100 words. Lead with what you teach, and the lineage or scholarship behind it.'],
  ['profile_photo_hint', 'profile', 'Headshot guidance', 'Square works best, at least 800 × 800 px, JPG or PNG. Drop a file here or click to choose.'],

  ['course_title', 'course', 'Heading', 'Tell students what they’ll find'],
  ['course_lede', 'course', 'Introduction', 'This becomes your course page{emails}. You’ll see a preview next.', '{emails} = “ and the description in our emails” when we write the emails ourselves'],
  ['course_title_hint', 'course', 'Public title guidance', 'Short and evocative. The subtitle can carry the detail.'],
  ['course_summary_hint', 'course', 'Description guidance', 'The first thing people read on your page.'],
  ['course_explore_hint', 'course', '“What we’ll explore” guidance', 'One per line, three to five.'],
  ['course_audience_hint', 'course', '“Who it’s for” guidance', 'Experience level, and anything students should know before joining.'],
  ['readings_intro', 'course', 'Readings', 'You can share all your readings now, or send them a week before {when}. If you send them weekly, your dashboard and reminder emails will prompt you.', '{when} = “each session” or “the course”'],
  ['promo_intro', 'course', 'Promotional emails', 'Because this is your own course, we’ll send three emails to our community in your voice. Write a blurb for each (about 80–150 words). We’ll add the dates, links and design.'],
  ['promo_1_label', 'course', 'First email: name', 'First email: the announcement'],
  ['promo_1_hint', 'course', 'First email: guidance', 'Goes out about five weeks before. Introduce the course and why it matters now.'],
  ['promo_2_label', 'course', 'Second email: name', 'Second email: the invitation'],
  ['promo_2_hint', 'course', 'Second email: guidance', 'About three weeks before. Go deeper: a story, a teaching or a question students will explore with you.'],
  ['promo_3_label', 'course', 'Third email: name', 'Third email: last call'],
  ['promo_3_hint', 'course', 'Third email: guidance', 'The week it begins. Short and warm: who it’s for, and what they’ll miss.'],
  ['clip_hint', 'course', 'Promo video guidance', 'A 30–60 second clip for ads and social. A Google Drive or Dropbox link is fine.'],

  ['preview_title', 'preview', 'Heading', 'Here’s your page'],
  ['preview_lede', 'preview', 'Introduction', 'This is a draft. Nothing is public until you approve it and the EP team publishes it.'],

  ['circle_title', 'circle', 'Heading', 'Your course lives in Circle'],
  ['circle_lede', 'circle', 'Introduction', 'Circle is where your students gather, find session links and materials, and talk with you between sessions.'],
  ['circle_1_when', 'circle', 'Card 1: when', 'Before each session'],
  ['circle_1_title', 'circle', 'Card 1: heading', 'Post your readings'],
  ['circle_1_body', 'circle', 'Card 1: text', 'If you didn’t share them all up front, post readings in your course space a week before each session: choose New post and attach files or links. Students are notified when you post.'],
  ['circle_2_when', 'circle', 'Card 2: when', 'Live sessions'],
  ['circle_2_title', 'circle', 'Card 2: heading', 'Teach on Zoom, linked from Circle'],
  ['circle_2_body', 'circle', 'Card 2: text', 'Each session appears as an Event in your space with the Zoom link. Your reminder emails carry the same link.'],
  ['circle_3_when', 'circle', 'Card 3: when', 'The day after each session'],
  ['circle_3_title', 'circle', 'Card 3: heading', 'Send your slides as a PDF'],
  ['circle_3_body', 'circle', 'Card 3: text', '{host} posts the recording, and your slides once you send them, in the space. You don’t need to upload the recording yourself.', '{host} = the course host'],
  ['circle_4_when', 'circle', 'Card 4: when', 'Between sessions'],
  ['circle_4_title', 'circle', 'Card 4: heading', 'Answer questions in the threads'],
  ['circle_4_body', 'circle', 'Card 4: text', 'Students comment under posts; reply there so everyone benefits. In Notifications, turn on email digests so you don’t miss anything.'],

  ['dash_title', 'dashboard', 'Heading', 'A quick tour of your dashboard'],
  ['dash_lede', 'dashboard', 'Introduction', 'From now on, your dashboard is home base. Bookmark it: everything you owe us and every Zoom link is there. Sign in with this email any time.'],
  ['tour_1', 'dashboard', 'Tour 1: Past due', 'Anything late shows here first, in red, so nothing slips.'],
  ['tour_2', 'dashboard', 'Tour 2: This week', 'What needs doing in the next seven days. Tick the box when it’s done; the EP team sees it straight away.'],
  ['tour_3', 'dashboard', 'Tour 3: Coming up', 'Everything further out, with due dates worked out from your teaching schedule.'],
  ['tour_4', 'dashboard', 'Tour 4: Teaching & meetings', 'Your sessions for the next three weeks, each with its Zoom link. This is the one place to find your link.'],
  ['tour_5', 'dashboard', 'Tour 5: Recently done', 'What you’ve finished, including what you just completed here.'],

  ['emails_title', 'emails', 'Heading', 'What lands in your inbox, and when'],
  ['emails_lede', 'emails', 'Introduction', 'We keep email to a minimum. Reminders go only to the people teaching and hosting that session, never to a list.'],
  ['emails_contacts', 'emails', 'Contacts note', 'Add our address to your contacts so reminders don’t end up in spam or Promotions.'],

  ['done_title', 'done', 'Heading', 'Thank you, {first}. You’re ready.'],
  ['done_lede', 'done', 'Introduction', 'From here on, your dashboard is the place to check. We’ll email you when your course page goes live.'],

  ['invite_subject', 'invite', 'Onboarding invitation: subject', 'Welcome to Embodied Philosophy: your teacher onboarding'],
  ['invite_body', 'invite', 'Onboarding invitation: message', 'Here is your link to teacher onboarding. It takes a few minutes: your bio and headshot, then the details for what you’re teaching with us.', 'The button and the 7-day note are added below it'],
];
export const STEPS = [['invite', 'The invitation email'], ['welcome', 'Welcome'], ['agreement', 'Agreement'], ['profile', 'Bio & headshot'], ['course', 'Your offering'], ['preview', 'Course page'], ['circle', 'Circle teaching space'], ['dashboard', 'Your dashboard'], ['emails', 'Emails to expect'], ['done', 'All set']];
export const DEFAULTS = Object.fromEntries(COPY.map(([k, , , d]) => [k, d]));
// The text for a key, with its placeholders filled ({first}, {host}…)
export const fillCopy = (copy, key, vars = {}) => String((copy && copy[key]) || DEFAULTS[key] || '').replace(/\{(\w+)\}/g, (m, v) => v in vars ? String(vars[v] ?? '') : m);
