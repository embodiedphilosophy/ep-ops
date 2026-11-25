// The template system (design: "Template studio"). Plain data, safe for the browser and the server.
// Every field says where its words come from. "locked" fields come from a verified source and can never be retyped:
// the picture can only change layout and colour, never the words. "source" fields come from a table (Master Schedule, Caption Bank…).
// "editable" fields are the only ones a person types into.
export const SIZES = { '4:5': { w: 1080, h: 1350 }, '1:1': { w: 1080, h: 1080 }, '9:16': { w: 1080, h: 1920 } };
export const SIZE_KEYS = Object.keys(SIZES);

// colourway: [name, ground, text, accent]  (from the design)
export const TEMPLATES = {
  tarka: {
    id: 'tarka', name: 'Tarka quote card', group: 'Quotes', sizes: ['4:5', '1:1', '9:16'], needs: ['quote'],
    from: 'Rebuilt from “Tarka Quotes” (Canva)',
    fields: [
      { key: 'quote', label: 'Quote', kind: 'locked', source: 'Quote Library' },
      { key: 'author', label: 'Author', kind: 'source', source: 'Quote Library' },
      { key: 'label', label: 'Source label', kind: 'source', source: 'Quote Library' },
      { key: 'bold', label: 'Bold phrase', kind: 'editable', source: 'Editable', help: 'A phrase from the quote to show in bold. It must be words that are already in the quote.' },
    ],
    colourways: [['Black', '#1E1E1E', '#F1EBDD', '#D9A441'], ['Cream', '#F1EBDD', '#1E1E1E', '#3B4BD1'], ['Tarka blue', '#5468FF', '#FFFFFF', '#FFFFFF'], ['Crimson', '#C8404F', '#FFFFFF', '#FBE3A8'], ['Mauve', '#A983A6', '#1E1E1E', '#1E1E1E'], ['Indigo (web)', '#2E3F7F', '#F6F3EC', '#D9A441']],
    note: 'Rotates automatically, so no ground repeats two posts running.',
  },
  chit: {
    id: 'chit', name: 'CHITHEADS quote', group: 'Quotes', sizes: ['4:5', '1:1', '9:16'], needs: ['quote'],
    from: 'Rebuilt from “Add a little bit of body text”',
    fields: [
      { key: 'quote', label: 'Quote', kind: 'locked', source: 'Quote Library' },
      { key: 'author', label: 'Speaker', kind: 'source', source: 'Quote Library' },
      { key: 'label', label: 'Episode', kind: 'source', source: 'Quote Library' },
    ],
    colourways: [['Sage', '#E3EEE0', '#1E1A14', '#1E1A14'], ['Cream', '#F2E8D6', '#1E1A14', '#1E1A14']],
    note: 'Pair with a 30–60 s episode clip as a Reel.',
  },
  quoteart: {
    id: 'quoteart', name: 'Quote on art', group: 'Quotes', sizes: ['4:5', '1:1', '9:16'], needs: ['quote', 'art'],
    from: 'The proven top performer: a verified quote over deity art or a classic painting',
    fields: [
      { key: 'quote', label: 'Quote', kind: 'locked', source: 'Quote Library' },
      { key: 'author', label: 'Author', kind: 'source', source: 'Quote Library' },
      { key: 'label', label: 'Work', kind: 'source', source: 'Quote Library' },
      { key: 'art', label: 'Art', kind: 'source', source: 'Library (Art)' },
      { key: 'layout', label: 'Layout', kind: 'choice', source: 'Editable', options: [['overlay', 'Quote over the art'], ['panel', 'Quote beside the art']] },
    ],
    colourways: [['Pine', '#20302A', '#FAF5EB', '#B98A3E'], ['Terra', '#A5432A', '#FAF5EB', '#F2E8D6'], ['Ivory', '#FAF5EB', '#1E1A14', '#A5432A'], ['Sand', '#EADDC6', '#1E1A14', '#83341F']],
    note: 'Dark colourways darken the art behind the words so they stay readable.',
  },
  sanskrit: {
    id: 'sanskrit', name: 'Sanskrit verse card', group: 'Sanskrit', sizes: ['4:5', '9:16', '1:1'], needs: ['quote'],
    from: 'Rebuilt from “Sanskrit Practice Template” · now 4:5 and 9:16 too',
    fields: [
      { key: 'quote', label: 'IAST verse', kind: 'locked', source: 'Locked · verified source' },
      { key: 'devanagari', label: 'Devanāgarī', kind: 'locked', source: 'Locked · optional' },
      { key: 'translation', label: 'Translation', kind: 'locked', source: 'Locked · verified source' },
      { key: 'author', label: 'Attribution', kind: 'source', source: 'Quote Library' },
    ],
    colourways: [['Vermilion', '#E0552B', '#B33A16', '#B33A16'], ['Leaf', '#3E9A52', '#2B6B39', '#2B6B39'], ['Teal', '#3E8A8A', '#2A6262', '#2A6262']],
    note: 'Frame, eyebrow and verse share the colour. Diacritics kept exactly.',
  },
};
export const GROUPS = ['Quotes', 'Sanskrit'];

// ---- Programs: facts come from the Master Schedule and teacher onboarding, never typed ----
TEMPLATES.event = {
  id: 'event', name: 'Event / course promo', group: 'Programs', sizes: ['4:5', '9:16'], needs: ['event'],
  from: 'Web palette · refuses to render with missing facts',
  fields: [
    { key: 'title', label: 'Title · date · time', kind: 'locked', source: 'Master Schedule' },
    { key: 'teacher', label: 'Teacher', kind: 'locked', source: 'Master Schedule' },
    { key: 'price', label: 'Price', kind: 'locked', source: 'Master Schedule' },
    { key: 'link', label: 'Link label', kind: 'locked', source: 'Master Schedule' },
  ],
  colourways: [['Pine', '#20302A', '#FAF5EB', '#B98A3E'], ['Terra', '#A5432A', '#FAF5EB', '#F2E8D6'], ['Ivory', '#FAF5EB', '#1E1A14', '#A5432A']],
  note: 'Web palette for programs and events. Won’t draw if the schedule is missing a title, date, time, price, link or teacher.',
};
TEMPLATES.teacher = {
  id: 'teacher', name: 'Meet the teacher', group: 'Programs', sizes: ['4:5', '9:16'], needs: ['teacher'],
  from: 'New design · pulls from teacher onboarding',
  fields: [
    { key: 'photo', label: 'Headshot', kind: 'locked', source: 'Onboarding' },
    { key: 'name', label: 'Name · role', kind: 'locked', source: 'Onboarding' },
    { key: 'bio', label: 'One-line bio', kind: 'locked', source: 'Onboarding' },
    { key: 'program', label: 'Program', kind: 'source', source: 'Master Schedule' },
  ],
  colourways: [['Ivory', '#FAF5EB', '#1E1A14', '#A5432A'], ['Pine', '#20302A', '#FAF5EB', '#B98A3E'], ['Sand', '#EADDC6', '#1E1A14', '#83341F']],
  note: 'The teacher signs off before it goes out (a flag, not a lock).',
};

// ---- Carousels: a cover, numbered slides and a closing slide. colourway: [name, ground, text, tint] ----
const CAROUSEL_COLOURS = [['Leaf', '#5A9A5C', '#1E1A14', '#F3EDDD'], ['Navy', '#1C4466', '#FFFFFF', '#CFE5EA'], ['Brick', '#C0434A', '#FFF8F2', '#DDBFB5'], ['Pine', '#20302A', '#FAF5EB', '#F2E8D6']];
export const MAX_CAROUSEL_SLIDES = 8;
TEMPLATES.edu = {
  id: 'edu', name: 'Educational carousel', group: 'Carousels', carousel: true, sizes: ['4:5'], needs: ['slides'],
  from: 'Numbered slides, consistent margins · cover, slides, closing call to action',
  fields: [
    { key: 'title', label: 'Cover title', kind: 'editable', source: 'Editable' }, { key: 'subtitle', label: 'Cover line', kind: 'editable', source: 'Editable' },
    { key: 'slides', label: 'Slides (heading and body)', kind: 'editable', source: 'Editable' }, { key: 'cta', label: 'Closing call to action', kind: 'source', source: 'Caption Bank' },
  ],
  colourways: CAROUSEL_COLOURS, note: 'Sanskrit in a slide must be copied from a verified source. Nothing is checked for you in free text, so the post is flagged for teacher clearance.',
};
TEMPLATES.story = {
  id: 'story', name: 'Storytelling carousel', group: 'Carousels', carousel: true, sizes: ['4:5'], needs: ['slides'], art: true,
  from: 'Image-led, minimal text: art and one narrative line per slide',
  fields: [
    { key: 'title', label: 'Cover title', kind: 'editable', source: 'Editable' }, { key: 'subtitle', label: 'Cover line', kind: 'editable', source: 'Editable' },
    { key: 'slides', label: 'Narrative and art per slide', kind: 'editable', source: 'Editable · Library (Art)' }, { key: 'cta', label: 'Closing line', kind: 'source', source: 'Caption Bank' },
  ],
  colourways: CAROUSEL_COLOURS, note: 'Art only from the Library (reuse OK, no words on it).',
};
TEMPLATES.keyword = {
  id: 'keyword', name: 'Keyword lead magnet', group: 'Carousels', carousel: true, sizes: ['4:5'], needs: ['slides'], keyword: true,
  from: 'Comment-to-receive: cover, body slides, then “Comment KEYWORD”',
  fields: [
    { key: 'keyword', label: 'Campaign · keyword', kind: 'source', source: 'Caption Bank' }, { key: 'title', label: 'Cover headline', kind: 'editable', source: 'Editable' },
    { key: 'slides', label: 'Body slides', kind: 'editable', source: 'Editable' }, { key: 'cta', label: 'CTA', kind: 'source', source: 'Caption Bank' },
  ],
  colourways: [['TWELVE · brick', '#C0434A', '#FFF8F2', '#DDBFB5'], ['HAMSA · leaf', '#5A9A5C', '#FFFFFF', '#F3EDDD'], ['LRL · navy', '#1C4466', '#FFFFFF', '#CFE5EA']],
  note: 'The keyword is stored on the post so comments can be counted and an auto-reply can key off it.',
};
TEMPLATES.thisweek = {
  id: 'thisweek', name: 'This Week at EP', group: 'Programs', carousel: true, auto: true, sizes: ['4:5'], needs: ['events'],
  from: 'Standing Sunday carousel · events from the Master Schedule · built on the This Week at EP page',
  fields: [
    { key: 'events', label: 'Week & events', kind: 'locked', source: 'Master Schedule' }, { key: 'intro', label: 'Intro line', kind: 'editable', source: 'Editable' },
    { key: 'lines', label: 'Line per event', kind: 'source', source: 'Caption Bank' }, { key: 'cta', label: 'Closing CTA', kind: 'source', source: 'Caption Bank' },
  ],
  colourways: CAROUSEL_COLOURS, note: 'Changes colourway every Sunday.',
};
GROUPS.length = 0; GROUPS.push('Quotes', 'Sanskrit', 'Carousels', 'Programs');

// The slides of a carousel as drawn: a cover, one per body item (or per event), and a closing slide
export function slideList(template, data = {}) {
  const t = TEMPLATES[template]; if (!t?.carousel) return [];
  const body = (template === 'thisweek' ? data.events : data.slides) || [];
  return [{ type: 'cover' }, ...body.map((x, i) => ({ type: 'body', i, ...x })), { type: 'cta' }];
}
export const isCarousel = id => !!TEMPLATES[id]?.carousel;

export const templateOf = id => TEMPLATES[id];
export const colourwayOf = (t, name) => (t.colourways.find(c => c[0] === name) || t.colourways[0]);

// The next colourway for a template so the same ground never appears twice running:
// `recent` is the colourway names of the latest posts, newest first.
export function nextColourway(t, recent = []) {
  const last = recent.find(n => t.colourways.some(c => c[0] === n));
  const i = t.colourways.findIndex(c => c[0] === last);
  return t.colourways[(i + 1) % t.colourways.length][0];
}

// Which bold phrase is allowed: only words that are already in the quote, in the same spelling
export const boldOk = (quote, phrase) => !phrase || String(quote).includes(phrase);
