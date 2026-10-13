import { readRange, writeRange, addTab } from '../google';
import { todayET } from '../events';

// The director's pinned line of priorities on everyone's Home. Kept in the "Ops Note" tab of the
// calendar sheet (CALENDAR_SHEET_ID): row 1 headers note | updated_by | updated_on, row 2 the note.
const SHEET = () => process.env.CALENDAR_SHEET_ID;
const RANGE = "'Ops Note'!A1:C2";

export async function getNote({ fresh = false } = {}) {
  try {
    const [, row = []] = await readRange(SHEET(), RANGE, { fresh });
    return { text: String(row[0] || '').trim(), by: row[1] || '', on: row[2] || '' };
  } catch { return { text: '', by: '', on: '' }; }
}

export async function setNote(text, by) {
  const write = () => writeRange(SHEET(), RANGE, [['note', 'updated_by', 'updated_on'], [String(text || '').trim().slice(0, 400), by, todayET()]]);
  try { await write(); }
  catch { await addTab(SHEET(), 'Ops Note'); await write(); } // first note: make the tab
}
