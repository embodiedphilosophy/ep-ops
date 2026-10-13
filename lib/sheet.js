import { readRange, googleConfigured, SHEET_TAG } from './google';

// Website content tabs. They now live in EP-Programming-Calendar (CALENDAR_SHEET_ID) as the "Site …" tabs
// below, read privately with the site's Google service account, so the ops dashboard can edit them.
// A tab that isn't there (or can't be read) falls back to the old "EP Website" sheet, published to the
// web as CSV (EVENTS_SHEET_CSV_URL: the events tab's published link, with each tab's id (gid) swapped in).
export const CALENDAR_TABS = { teachers: 'Site Teachers', testimonials: 'Site Testimonials', links: 'Site Links & Prices', stats: 'Site Stats', pathways: 'Site Pathways', seasons: 'Site Seasons', themes: 'Site Annual Themes' };
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
  return toRows(rows);
}

// Header row → keys (trimmed, lower-cased); blank rows dropped; every cell trimmed
function toRows(rows) {
  const [head, ...body] = rows.map(r => r.map(x => String(x ?? ''))).filter(r => r.some(x => x.trim()));
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

async function fromCalendar(name) {
  const tab = CALENDAR_TABS[name];
  if (!tab || !process.env.CALENDAR_SHEET_ID || !googleConfigured()) return null;
  try { return toRows(await readRange(process.env.CALENDAR_SHEET_ID, `'${tab}'!A1:Z2000`)); }
  catch (e) { if (!/\(400\)|: 400/.test(e.message)) console.error(`Calendar tab "${tab}" failed`, e.message); return null; }
}

// Returns rows for a tab, or null if neither sheet has it
export async function readTab(name) {
  const fromCal = await fromCalendar(name);
  if (fromCal) return fromCal;
  const url = tabUrl(TABS[name]);
  if (!url) return null;
  try {
    const res = await fetch(url, { next: { revalidate: 300, tags: [SHEET_TAG] } });
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
