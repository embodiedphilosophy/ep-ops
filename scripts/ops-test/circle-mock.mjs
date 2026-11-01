// Stand-in for Circle's Headless Member API, for the season pages. Port 4600.
// Set CIRCLE_HEADLESS_BASE=http://localhost:4600 CIRCLE_HEADLESS_TOKEN=test. Writes are applied in memory and logged.
// Members: annual@test (all spaces), fall@test (Fall spaces only), nobody@test (none).
import http from 'node:http';
const day = n => new Date(Date.now() + n * 86400e3).toISOString();
const sess = (id, n, extra = {}) => ({ id, name: `Session ${id}`, starts_at: day(n), ends_at: new Date(Date.parse(day(n)) + 2 * 3600e3).toISOString(), space_id: 11, ...extra });
const events = [sess(1, -7, { replay_url: 'https://example.test/replay/1', replay_duration: 6000 }), sess(2, 0.0001), sess(3, 7), sess(4, 14), { ...sess(5, 3), space_id: 99 }];
const nextSat = () => { const d = new Date(Date.now() + 86400e3); while (d.getUTCDay() !== 6) d.setUTCDate(d.getUTCDate() + 1); d.setUTCHours(14, 0, 0, 0); return d; };
const hubEvents = [{ id: 71, name: 'Saturday Open Session', space_id: 108, starts_at: nextSat().toISOString(), ends_at: new Date(+nextSat() + 5400e3).toISOString() }, { id: 72, name: 'Sunday Practicum', space_id: 108, starts_at: new Date(+nextSat() + 86400e3).toISOString(), ends_at: new Date(+nextSat() + 86400e3 + 5400e3).toISOString() }, { id: 73, name: 'Fall Session 2', space_id: 2911531, starts_at: day(5), ends_at: new Date(Date.parse(day(5)) + 7200e3).toISOString() }];
const posts = [
  { id: 10, name: 'Reading: Pratyabhijñāhṛdaya, sūtras 1–5', topics: [{ id: 1 }], created_at: day(-9), position: 1, is_pinned: true },
  { id: 11, name: 'Reading: Introduction', topics: [1], created_at: day(-10), position: 2 },
  { id: 12, name: 'What I noticed after Session 1', topics: [2], created_at: day(-5), comments_count: 3, user: { name: 'Maya R.' }, author: { community_member_id: 501, name: 'Maya R.' }, body: '<p>For years I taught Triangle as a shape to arrive at. Reading the first sūtra this month, I began to wonder what it would mean to teach it as something consciousness does, rather than something a body achieves, and what would change for the person on the mat.</p><p>Second paragraph.</p>' },
  { id: 14, name: 'Where the breath already goes', topics: [2], created_at: day(-3), comments_count: 0, author: { community_member_id: 502, name: 'Mentee D' }, body: '<p>When I teach breathing, I have always started by sending the breath somewhere.</p>' },
  { id: 16, name: 'A note from the teacher on the first week', topics: [2], created_at: day(-2), comments_count: 0, author: { community_member_id: 1, name: 'Jacob Kyle', community_admin: true }, body: '<p>Welcome, everyone.</p>' },
  { id: 15, name: 'Svatantrā, and my to-do list', topics: [2], created_at: day(-4), comments_count: 1, author: { community_member_id: 503, name: 'Student Q' }, body: 'Freedom as the cause of everything is a strange thing to read on a Monday morning.' },
  { id: 13, name: 'Session 1 replay notes', topics: [3], created_at: day(-6), duration: 5400 },
];
// Comments on posts (the Reflections threads). Post 14 is the mentee post: its author (502) answers a comment in the thread.
const comments = { 14: [
  { id: 201, body: '<p>I’m not a teacher, but this changed how I’ll do Triangle on my own mat tomorrow.</p>', author: { community_member_id: 504, name: 'Student P' }, created_at: day(-2.5) },
  { id: 202, parent_comment_id: 201, body: '<p>That’s exactly the experiment. Tell me what you notice?</p>', author: { community_member_id: 502, name: 'Mentee D' }, created_at: day(-2.4) },
  { id: 203, body: '<p>This is what sūtra 1 looks like in a body. Bring it to Wednesday.</p>', author: { community_member_id: 1, name: 'Jacob Kyle', community_admin: true }, created_at: day(-2.3) },
  { id: 204, parent_comment_id: 202, body: '<p>I felt it in the hips first.</p>', author: { community_member_id: 504, name: 'Student P' }, created_at: day(-2.2) },
], 15: [{ id: 301, body: 'Same. I lasted until the third email.', author: { community_member_id: 505, name: 'Student R' }, created_at: day(-3.5) }], 12: [] };
// Hub members use the real season space ids from data/school-seasons.json plus 101-111 (synthetic ids for the other hub rows)
const core = [101, 102, 103, 104, 105, 106, 107];
const spacesFor = { 'annual@test': [22, 11, 32, 31], 'fall@test': [22, 11], 'nobody@test': [],
  'hubterm@test': [...core, 2911545, 2911531], 'hubfull@test': [...core, 108, 2911545, 2911552, 2911553, 2911554, 2911531],
  'hubmentee@test': [...core, 108, 109, 110, 111, 2911545, 2911552, 2911553, 2911554, 2911531] };

// ---- Wisdom School hub (docs/wisdom-hub.md): the Pilgrimage Project course, pathways, live events. Members wsplus@test and wsmember@test.
const MON = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MTHEME = ['The Call to Depth', 'Refusal and Resistance', 'Crossing the Threshold', 'The Descent', 'The Abyss', 'The Return of the Light', 'The Companion', 'The Gift', 'Tantric Buddhism: Inner and Outer Pilgrimage', 'The Return with Wisdom', 'Gratitude', 'Rest'];
const MSEC = [1212912, 1212914, 1212915, 1212916, 1212917, 1212918, 1212919, 1212920, 1212921, 1212922, 1212923, 1212924];
const les = (id, name, o = {}) => ({ id, name, url: `https://ss.example.test/lessons/${id}`, status: 'incomplete', created_at: day(-3), ...o });
const wsYear = [
  ...MSEC.map((id, k) => ({ id, name: k === 8 ? MTHEME[k] : `${MON[k]} · ${MTHEME[k]}`, lessons: k >= 10 ? [] : [les(id * 10, `${MON[k]} lecture`, { status: k < 9 ? 'complete' : 'incomplete', body: k === 9 ? '<p>What are you carrying home from the road?</p>' : `<p>Question for ${MON[k]}</p>` })] })),
  { id: 1212925, name: 'Book club', lessons: [les(9001, 'Q1 · Pilgrimage in the Ancient World', { created_at: day(-200) }), les(9002, 'Pilgrimage: Past and Present in the World Religions', { created_at: day(-10) })] },
  { id: 1223514, name: 'Hellenism & Neoplatonism', lessons: [les(9101, 'The One', { status: 'complete' }), les(9102, 'Nous', { status: 'complete' }), les(9103, 'Soul'), les(9104, 'Return')] },
];
const lessonsOf = (n, done) => [{ id: 1, name: 'Course', lessons: Array.from({ length: n }, (_, i) => les(700 + i, `Lesson ${i + 1}`, { status: i < done ? 'complete' : 'incomplete' })) }];
const wsCourses = { 2897436: wsYear, 2897437: lessonsOf(4, 2), 2897811: lessonsOf(10, 0), 2897812: lessonsOf(5, 5), 2897813: lessonsOf(3, 0), 2897814: lessonsOf(3, 0), 2897815: lessonsOf(3, 0), 2900101: lessonsOf(6, 1), 2900102: lessonsOf(6, 0), 2900103: lessonsOf(6, 0), 2900104: lessonsOf(6, 0) };
const monday = () => { const d = new Date(); d.setUTCDate(d.getUTCDate() + ((8 - d.getUTCDay()) % 7 || 7)); d.setUTCHours(16, 0, 0, 0); return d; };
const tue = n => new Date(Date.now() + n * 86400e3);
const wsEvents = [
  { id: 801, name: 'Meditation Monday: Somatic', space_id: 2897425, starts_at: monday().toISOString(), ends_at: new Date(+monday() + 2700e3).toISOString(), host: { name: 'Floss Harry' } },
  { id: 802, name: 'The Circle Reopens', space_id: 2897428, starts_at: tue(11).toISOString(), ends_at: new Date(+tue(11) + 5400e3).toISOString(), host: { name: 'Jacob Kyle' } },
  { id: 803, name: 'Meditation Monday: Metta', space_id: 2897425, starts_at: new Date(+monday() + 7 * 86400e3).toISOString(), ends_at: new Date(+monday() + 7 * 86400e3 + 2700e3).toISOString(), host: { name: 'Oneika Mays' } },
  { id: 804, name: 'Autumn workshop', space_id: 2897428, starts_at: tue(25).toISOString(), ends_at: new Date(+tue(25) + 9000e3).toISOString(), host: { name: 'Jacob Kyle' } },
  { id: 805, name: 'Book club meet-up', space_id: 2897428, starts_at: tue(40).toISOString(), ends_at: new Date(+tue(40) + 3600e3).toISOString(), host: { name: 'Jacob Kyle' } },
];
const wsPosts = [{ id: 31, name: 'The Circle Reopens: details', created_at: day(-1) }, { id: 32, name: 'Welcome to October', created_at: day(-30) }];
const wsSpaces = [2913549, 2897428, 2897425, 2897427, 2897436, 2897437];
const wsPlus = [...wsSpaces, 2897811, 2897812, 2897813, 2897814, 2897815, 2900101, 2900102, 2900103, 2900104, 2910160, 2912717];
Object.assign(spacesFor, { 'wsmember@test': wsSpaces, 'wsplus@test': wsPlus, 'wsnone@test': [] });

// ---- Meditation Pass hub (docs/meditation-hub.md): the replay course 2897426 and the live space 2897425.
// Members mmpass@test (the Pass), mmdrop@test (a one-week drop-in: the live space only), mmnone@test (nothing), mmadmin@test (both; use with ?as=).
const mmLes = (id, name, at, o = {}) => ({ id, name, url: `https://ss.example.test/c/meditation-pass/sections/1/lessons/${id}`, status: 'incomplete', created_at: at, ...o });
const mmCourse = [
  { id: 1212933, name: 'Start here', lessons: [mmLes(6001, 'Welcome to the Meditation Mondays Library', '2026-01-02T10:00:00Z'), mmLes(6002, 'How to sit', '2026-01-02T10:00:00Z')] },
  { id: 1212934, name: 'October 2026', lessons: [
    mmLes(6110, 'Mon 5 Oct · Mystical with Mary Reilly Nichols', '2026-10-06T10:00:00Z', { status: 'complete', duration_in_seconds: 2820 }),
    mmLes(6111, 'Mon 12 Oct', '2026-10-13T10:00:00Z', { duration_in_seconds: 2700 }),
    mmLes(6112, 'Mon 19 Oct · Mystical with Mary Reilly Nichols', '2026-10-20T10:00:00Z', { duration_in_seconds: 3000 })] },
  { id: 1212935, name: 'November 2026', lessons: [] }, { id: 1212936, name: 'December 2026', lessons: [] },
  { id: 1223518, name: 'Archive · January 2026', lessons: [mmLes(6201, 'Mon 5 Jan · Somatic with Floss Harry', '2026-01-06T10:00:00Z', { duration_in_seconds: 2400 })] },
  { id: 1223525, name: 'Archive · August 2026', lessons: [mmLes(6301, 'Mon 3 Aug · Metta with Oneika Mays', '2026-08-04T10:00:00Z', { duration_in_seconds: 2400 })] },
  { id: 1223529, name: 'Archive · September 2026', lessons: [mmLes(6401, 'Mon 14 Sep · Metta with Oneika Mays', '2026-09-15T10:00:00Z', { duration_in_seconds: 2640 }), mmLes(6402, 'Mon 21 Sep', '2026-09-22T10:00:00Z', { duration_in_seconds: 2580 })] },
];
const mmNoon = (y, m, d) => { const dst = Date.UTC(y, m - 1, d) < Date.UTC(2026, 10, 1); return new Date(Date.UTC(y, m - 1, d, dst ? 16 : 17)); };
const mmEvents = Array.from({ length: 20 }, (_, k) => { const d = new Date(Date.UTC(2026, 9, 26 + 7 * k)); const st = mmNoon(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()); return { id: 9000 + k, name: 'Meditation Mondays', space_id: 2897425, starts_at: st.toISOString(), duration_in_seconds: 3600, url: `https://ss.example.test/c/meditation-mondays-live/events/${9000 + k}`, host: { name: 'Jacob Kyle' } }; });
wsCourses[2897426] = mmCourse;
Object.assign(spacesFor, { 'mmpass@test': [2897426, 2897425], 'mmdrop@test': [2897425], 'mmnone@test': [], 'mmadmin@test': [2897426, 2897425] });
const tokens = new Map();
const log = [];
http.createServer(async (req, res) => {
  const body = await new Promise(r => { let b = ''; req.on('data', c => b += c); req.on('end', () => r(b)); });
  const send = (o, s = 200) => { res.writeHead(s, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
  const url = new URL(req.url, 'http://x');
  const who = tokens.get((req.headers.authorization || '').replace('Bearer ', ''));
  // Admin API: the members of a space (who is a mentee). Space 2896670 (the Mentorship Circle) holds Mentee D (502).
  if (url.pathname === '/api/admin/v2/space_members') return send({ records: url.searchParams.get('space_id') === '2896670' ? [{ community_member_id: 502 }] : [], has_next_page: false });
  if (url.pathname === '/api/v1/headless/auth_token') {
    const email = JSON.parse(body || '{}').email;
    if (!spacesFor[email]) return send({ error: 'No such member' }, 404);
    const t = `tok-${email}`; tokens.set(t, email); return send({ access_token: t, refresh_token: 'r', access_token_expires_at: day(0.04), community_member_id: email === 'hubfull@test' ? 501 : 900 });
  }
  if (!who) return send({ error: 'unauthorised' }, 401);
  const p = url.pathname.replace('/api/headless/v1', '');
  if (p === '/spaces') return send({ records: spacesFor[who].map(id => ({ id, url: `https://ss.example.test/c/space-${id}` })), has_next_page: false });
  if (p === '/community_events') return send({ records: (who.startsWith('mm') ? mmEvents : [...events, ...hubEvents, ...wsEvents]).filter(e => spacesFor[who].includes(e.space_id)), has_next_page: false });
  let m;
  if ((m = p.match(/^\/courses\/(\d+)\/sections$/))) return spacesFor[who].includes(Number(m[1])) || (m[1] === '2897436' && who === 'wsnone@test') ? send(wsCourses[m[1]] || [], 200) : send({ error: 'forbidden' }, 403);
  if ((m = p.match(/^\/spaces\/(\d+)\/posts$/))) {
    if (req.method === 'POST') { log.push(`POST post ${body}`); console.log('WROTE post', body); posts.unshift({ id: 99, name: JSON.parse(body).name, topics: JSON.parse(body).topic_ids, created_at: day(0) }); return send({ id: 99 }, 201); }
    return send({ records: spacesFor[who].includes(Number(m[1])) ? (Number(m[1]) === 2897427 ? wsPosts : posts) : [], has_next_page: false });
  }
  if ((m = p.match(/^\/posts\/(\d+)\/comments$/))) {
    if (req.method === 'POST') {
      const b = JSON.parse(body || '{}'); const text = (b.tiptap_body?.body?.content || []).map(x => (x.content || []).map(y => y.text).join('')).join('\n');
      console.log('WROTE comment', m[1], who, 'parent=' + (b.parent_comment_id ?? '-'), JSON.stringify(text));
      (comments[m[1]] ||= []).push({ id: 400 + (comments[m[1]] || []).length, parent_comment_id: b.parent_comment_id, body: text, author: { community_member_id: who === 'hubfull@test' ? 501 : 900, name: who }, created_at: day(0) });
      return send({ id: 999 }, 201);
    }
    return send({ records: comments[m[1]] || [], has_next_page: false });
  }
  if ((m = p.match(/^\/posts\/(\d+)$/)) && req.method === 'DELETE') { console.log('WROTE delete post', m[1], who); return send({}, 200); }
  if ((m = p.match(/^\/events\/(\d+)\/event_attendees$/)) && req.method === 'POST') { console.log('WROTE rsvp', m[1], who); return send({ ok: true }, 201); }
  send({ error: 'not mocked ' + p }, 404);
}).listen(4600, () => console.log('circle mock on 4600'));
