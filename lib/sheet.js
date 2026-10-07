// Reads tabs from the "EP Website" Google Sheet.
// Publish the WHOLE document (File → Share → Publish to web → Entire document, CSV); the site
// takes the events tab's published link and swaps in each tab's id (gid).
export const TABS = { events: null, teachers: 1001, testimonials: 1002, links: 1003, stats: 1004, recurring: 1005, pathways: 1006, seasons: 1007, themes: 1008 };

export function parseCSV(text) {
  const rows = []; let row = []; let cell = ''; let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const [head, ...body] = rows.filter(r => r.some(x => x.trim()));
  if (!head) return [];
  const keys = head.map(h => h.trim().toLowerCase());
  return body.map(r => Object.fromEntries(keys.map((k, i) => [k, (r[i] || '').trim()])));
}

function tabUrl(gid) {
  const base = process.env.EVENTS_SHEET_CSV_URL;
  if (!base) return null;
  if (gid == null) return base;
  return /[?&]gid=\d+/.test(base) ? base.replace(/([?&]gid=)\d+/, `$1${gid}`) : `${base}${base.includes('?') ? '&' : '?'}gid=${gid}`;
}

// Returns rows for a tab, or null if the sheet isn't connected / the tab isn't published
export async function readTab(name) {
  const url = tabUrl(TABS[name]);
  if (!url) return null;
  try {
    const res = await fetch(url, { next: { revalidate: 300 } });
    if (!res.ok) return null;
    const text = await res.text();
    if (text.trimStart().startsWith('<')) return null; // got an HTML page, not CSV
    return parseCSV(text);
  } catch (e) {
    console.error(`Sheet tab "${name}" failed`, e);
    return null;
  }
}

export const published = r => String(r.publish ?? 'TRUE').toUpperCase() !== 'FALSE';
