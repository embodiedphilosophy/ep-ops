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
