import { C, F, WISDOM_TAGS, hasAnyTag, thumbOf, longDate } from './scaffolding';

// The Weekly Scaffolding as Kit's own editor blocks (Kit-JSON `content_tree`), so the draft opens in Kit with every
// heading, paragraph and button editable in place. lib/scaffolding.js builds the same email as one HTML block; that
// version is kept for the dashboard preview and as the fallback if Kit refuses the blocks (lib/ops/scaffoldrun.js).
// Keep the two in step when the design changes.
//
// Layout rules learnt from Kit (Oct 2026):
//  - Rows may NOT be nested inside a column: Kit drops nested rows' backgrounds. Every band is a top-level row.
//  - Liquid conditions are tiny `html` blocks ({% if %} / {% else %} / {% endif %}), either at the top level
//    (wrapping whole rows) or inside a column (wrapping buttons). They show in Kit's editor as small code blocks.
//  - Rows get margin 0 so the cream bands join up without gaps.

const PAD = { top: 8, bottom: 8, left: 28, right: 28 };
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DOW = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const P = s => { const [y, m, d] = s.split('-').map(Number); return { y, m, d, dow: new Date(Date.UTC(y, m - 1, d)).getUTCDay() }; };
const range = (a, b) => { const x = P(a), y = P(b); return x.m === y.m ? `${MON[x.m - 1]} ${x.d}–${y.d}` : `${MON[x.m - 1]} ${x.d}–${MON[y.m - 1]} ${y.d}`; };

// Email-wide type styles (Kit theme). Inline marks on a run still win.
export const THEME = {
  'heading-one': { fontFamily: F.serif, fontWeight: 400, fontSize: 44, color: C.ink, lineHeight: 1.1 },
  'heading-two': { fontFamily: F.serif, fontWeight: 400, fontSize: 30, color: C.gold2, lineHeight: 1.2 },
  'heading-three': { fontFamily: F.serif, fontWeight: 700, fontSize: 19, color: C.ink, lineHeight: 1.3 },
  'heading-four': { fontFamily: F.sans, fontWeight: 700, fontSize: 11, color: C.gold, letterSpacing: 0.18, textTransform: 'uppercase' },
  'heading-six': { fontFamily: F.sans, fontWeight: 700, fontSize: 10, color: '#B7A874', letterSpacing: 0.15, textTransform: 'uppercase' },
  paragraph: { fontFamily: F.sans, fontWeight: 400, fontSize: 15, color: C.body, lineHeight: 1.6 },
  link: { color: C.gold },
};

// ---------- blocks ----------
const leaf = (text, marks = {}) => ({ text: String(text), ...marks });
const kids = parts => parts.filter(x => x !== '' && x != null).map(x => (typeof x === 'string' ? leaf(x) : x));
const heading = (level, parts, align) => ({ type: 'heading', level, ...(align ? { align } : {}), children: kids([].concat(parts)) });
const para = (parts, align) => ({ type: 'paragraph', ...(align ? { align } : {}), children: kids([].concat(parts)) });
const link = (href, text, marks = {}) => ({ type: 'link', href, children: [leaf(text, marks)] });
const liquid = s => ({ type: 'html', html: s });
const rule = () => ({ type: 'divider', color: C.rule, width: 100, height: 1, margin: { top: 14, bottom: 4 } });
const kicker = (t, align) => heading(4, t, align);
const meta = t => para(leaf(t, { color: C.muted, fontSize: 12 }));
const textOn = bg => (['#ECA127', '#FAF7EA', '#F3ECD6'].includes(String(bg).toUpperCase()) ? C.ink : '#FFFFFF');
const button = (href, label, bg = C.amber) => ({
  type: 'button', href, backgroundColor: bg, color: textOn(bg), borderColor: bg, align: 'left',
  margin: { top: 8, bottom: 4 }, typography: { fontFamily: F.sans, fontWeight: 700, fontSize: 13 }, children: [leaf(label)],
});
const image = (src, { width, alt = '', href, align, fullWidth = false } = {}) =>
  ({ type: 'image', src, fullWidth, ...(width ? { width } : {}), ...(align ? { align } : {}), alt, ...(href ? { href } : {}), showCaption: false });
const row = (children, { bg = C.cream, pad = PAD, ...rest } = {}) => ({ type: 'row', margin: 0, padding: pad, backgroundColor: bg, ...rest, children });
const band = (blocks, opts) => row([{ type: 'column', children: blocks.filter(Boolean) }], opts);
const blank = label => leaf(`[FILL IN] ${label}`, { highlight: '#FFF2A8', color: '#7A5B00' });
// Paragraphs split on blank lines or single line breaks, like the HTML builder
const paragraphs = text => String(text).split(/\n\s*\n|\r?\n/).map(s => s.trim()).filter(Boolean).map(s => para(s));
const lines = t => String(t).trim().replace(/\r\n/g, '\n');

// ---------- one event ----------
function eventRow(ev, sendDate) {
  const last = ev.end_date && ev.end_date > ev.date ? ev.end_date : '';
  const ongoing = ev.date < sendDate;
  const p = P(ongoing && last ? last : ongoing ? sendDate : ev.date);
  const extra = String(ev.note || ev.price || '');
  const span = last ? range(ev.date, last) : '';
  const spanSaid = span && extra.includes(span);
  const when = last ? [spanSaid ? '' : span, ongoing ? 'continues this week' : ''].filter(Boolean).join(' · ') : `${DOW[P(ev.date).dow]}, ${MON[P(ev.date).m - 1]} ${P(ev.date).d}`;
  const line = [when, ev.time, ev.teachers ? `with ${ev.teachers}` : '', extra].filter(Boolean).join(' · ');
  const color = ev.button_color || C.amber;
  const openUrl = ev.registration_url || ev.open_url;
  const tags = ev.enrolled_tags || [];
  const enrolledBtn = ev.enrolled_label && ev.enrolled_url ? button(ev.enrolled_url, ev.enrolled_label, color) : null;
  const openBtn = ev.open_label && openUrl ? button(openUrl, ev.open_label, color) : null;
  let buttons;
  if (ev.newsletter === 'enrolled_only') buttons = [enrolledBtn];
  else if (tags.length && enrolledBtn && openBtn) buttons = [liquid(`{% if ${hasAnyTag(tags)} %}`), enrolledBtn, liquid('{% else %}'), openBtn, liquid('{% endif %}')];
  else if (tags.length && enrolledBtn) buttons = [liquid(`{% if ${hasAnyTag(tags)} %}`), enrolledBtn, liquid('{% endif %}')];
  else buttons = [openBtn || enrolledBtn];

  const date = {
    type: 'column', padding: { top: 12, bottom: 12, left: 4, right: 4 }, border: { radius: 5 }, backgroundColor: C.ink,
    children: [
      heading(4, leaf(ongoing && last ? `Thru ${MON[p.m - 1]}` : ongoing ? 'Now' : MON[p.m - 1], { color: C.goldLight }), 'center'),
      heading(3, leaf(ongoing && !last ? '·' : String(p.d), { color: C.cream, fontSize: 26 }), 'center'),
    ],
  };
  const body = {
    type: 'column',
    children: [heading(3, ev.title), meta(line), ev.summary ? para(leaf(ev.summary, { fontSize: 14 })) : null, ...buttons].filter(Boolean),
  };
  const r = row([date, body], { pad: { top: 10, bottom: 10, left: 28, right: 28 }, gap: 18, columnRatio: 17, columnStacking: 'none' });
  // Enrolled-only tracks (e.g. Sādhana School sessions) are invisible to everyone else
  if (ev.newsletter === 'enrolled_only') return tags.length ? [liquid(`{% if ${hasAnyTag(tags)} %}`), r, liquid('{% endif %}')] : [];
  return [r];
}

// ---------- the whole issue ----------
// Returns { content_tree, theme }. Subject, preview text and blanks come from buildIssue (lib/scaffolding.js).
export function buildIssueTree(issue, events) {
  const s = k => String(issue[k] || '').trim();
  const out = [];

  // Masthead + reflection (one band)
  const masthead = [
    image('https://embed.filekitcdn.com/e/x8NRZ83fCR5nzjGX8kcfRN/sNy6tXg8PBU4u8j7rBoKXX', { width: 210, alt: 'Embodied Philosophy', href: 'https://embodiedphilosophy.com' }),
    kicker('Embodied Philosophy Weekly', 'center'),
    heading(1, 'The Scaffolding', 'center'),
    para(leaf(`Issue No. ${s('issue_no')} · ${longDate(issue.send_date)}`, { color: C.muted, fontSize: 12 }), 'center'),
    { type: 'divider', color: C.ink, width: 100, height: 2, margin: 16 },
    kicker('The Weekly Reflection'),
    heading(2, s('reflection_headline') || blank('Reflection headline')),
    ...(s('reflection_body') ? paragraphs(s('reflection_body')) : [para(blank('Reflection body'))]),
    s('reflection_url') ? para(link(s('reflection_url'), 'Read the full reflection →')) : null,
  ];
  out.push(band(masthead, { pad: { top: 28, bottom: 8, left: 28, right: 28 } }));

  // Pilgrimage Weekly: Wisdom School members only (Kit removes it for everyone else at send)
  if (s('pilgrimage_title') || s('pilgrimage_body')) {
    out.push(liquid(`{% if ${hasAnyTag(WISDOM_TAGS())} %}`));
    out.push(band([
      rule(), kicker('Pilgrimage Weekly · For Wisdom School Members'),
      s('pilgrimage_title') ? heading(2, s('pilgrimage_title')) : null,
      ...(s('pilgrimage_body') ? paragraphs(s('pilgrimage_body')) : []),
      s('pilgrimage_url') ? button(s('pilgrimage_url'), s('pilgrimage_button') || 'Continue the journey →', C.blue) : null,
    ]));
    out.push(liquid('{% endif %}'));
  }

  // Sanskrit
  out.push(band([rule(), kicker('Sanskrit for the Week')]));
  out.push(band([
    s('sanskrit_devanagari') ? heading(3, leaf(lines(s('sanskrit_devanagari')), { color: '#F4ECCF', fontSize: 24 }), 'center') : null,
    para(s('sanskrit_iast') ? leaf(lines(s('sanskrit_iast')), { italic: true, color: C.goldLight, fontSize: 18 }) : blank('transliteration'), 'center'),
    para(s('sanskrit_translation') ? leaf(lines(s('sanskrit_translation')), { color: '#E9E2CD', fontSize: 16 }) : blank('translation'), 'center'),
    s('sanskrit_source') ? heading(6, leaf(s('sanskrit_source'), { color: '#B7A874' }), 'center') : null,
  ], { bg: C.ink, pad: { top: 28, bottom: 26, left: 32, right: 32 } }));

  // This week
  const intro = s('events_intro');
  out.push(band([rule(), kicker('This Week at Embodied Philosophy'), intro && !/^this week at embodied philosophy\.?$/i.test(intro) ? para(intro) : null]));
  const evs = events.flatMap(e => eventRow(e, issue.send_date));
  if (evs.length) out.push(...evs);
  else out.push(band([para('A quiet week on the calendar. The recordings library is open any time.')]));

  // Free video + Tarka heading share one band
  const tail = [];
  const videoUrl = s('video_url');
  if (videoUrl || s('video_title')) {
    const thumb = thumbOf(videoUrl, s('video_thumbnail'));
    tail.push(rule(), kicker('Free Video · A Window into Sādhana School'),
      thumb && videoUrl ? image(thumb, { alt: s('video_title'), href: videoUrl, fullWidth: true }) : null,
      heading(3, s('video_title') || blank('Video title')),
      s('video_meta') ? meta(s('video_meta')) : null,
      s('video_caption') ? para(s('video_caption')) : null,
      videoUrl ? button(videoUrl, 'Watch free →', C.blue) : para(blank('Video URL')));
  }
  const tarka = s('tarka_title');
  if (tarka) tail.push(rule(), kicker('Latest from Tarka'));
  if (tail.length) out.push(band(tail));
  if (tarka) {
    out.push(row([
      { type: 'column', padding: { top: 22, bottom: 22, left: 6, right: 6 }, border: { radius: 4 }, backgroundColor: C.blue,
        children: [heading(3, leaf('TARKA', { color: '#FAF7EA' }), 'center'), para(leaf(s('tarka_issue') || ' ', { color: '#C9D3DC', fontSize: 12 }), 'center')] },
      { type: 'column', children: [heading(3, tarka), s('tarka_author') ? meta(`by ${s('tarka_author')}`) : null, s('tarka_teaser') ? para(s('tarka_teaser')) : null,
        s('tarka_url') ? button(s('tarka_url'), 'Read the essay →', C.amber) : null].filter(Boolean) },
    ], { pad: { top: 10, bottom: 10, left: 28, right: 28 }, gap: 18, columnRatio: 26, columnStacking: 'none' }));
  }

  // Study with us (fixed cards)
  const card = (bg, title, sub, href) => ({ type: 'column', padding: 16, border: { radius: 4 }, backgroundColor: bg, children: [
    heading(3, leaf(title, { color: '#FFFFFF', fontSize: 17 })), para(leaf(sub, { color: '#F4EFD9', fontSize: 12 })),
    para(link(href, 'Learn more →', { color: '#FFFFFF', fontSize: 13 })),
  ] });
  const pair = (a, b) => row([a, b], { pad: { top: 10, bottom: 10, left: 28, right: 28 }, gap: 12, columnStacking: 'stack' });
  out.push(band([rule(), kicker('Study With Us')]));
  out.push(pair(card(C.blue, 'Wisdom School', 'Membership · live salons & learning pathways', 'https://embodiedphilosophy.com/wisdom-school'),
    card('#CB243B', 'Sādhana School', 'Year-long practice · Non-Dual Śākta-Śaiva', 'https://embodiedphilosophy.com/sadhana-school')));
  out.push(pair(card('#3C9A4A', 'Meditation Pass', '$9.99/mo · Meditation Mondays', 'https://embodiedphilosophy.com/meditation-pass'),
    card('#5F8F91', 'Tarka Journal', 'Essays in contemplative philosophy', 'https://www.tarkajournal.com')));

  // P.S.
  if (s('ps')) out.push(band([para([leaf('P.S. — ', { bold: true, color: C.ink, fontSize: 14 }), leaf(s('ps'), { fontSize: 14 })])],
    { bg: '#F3ECD6', pad: { top: 16, bottom: 16, left: 20, right: 20 }, border: { color: '#E3D9BD', width: { top: 1, bottom: 1 } } }));

  // Footer
  out.push(band([
    image('https://embed.filekitcdn.com/e/x8NRZ83fCR5nzjGX8kcfRN/2EUaDr5877kQGXdy9Lae7T', { width: 36, alt: 'EP', align: 'center' }),
    heading(6, leaf('Embodied Philosophy', { color: C.goldLight }), 'center'),
    para([leaf('A school of interdisciplinary, contemplative education. ', { color: '#B1A982', fontSize: 12 }),
      link('https://embodiedphilosophy.com', 'embodiedphilosophy.com', { color: C.goldLight, fontSize: 12 })], 'center'),
  ], { bg: C.ink, pad: { top: 24, bottom: 22, left: 24, right: 24 } }));

  return { content_tree: out, theme: THEME };
}
