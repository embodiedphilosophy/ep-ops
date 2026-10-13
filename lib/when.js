// "7pm ET", "12pm ET", "9:30am ET", "19:00" → "HH:MM:SS" (Eastern). Defaults to 7pm.
export function to24h(text) {
  const m = String(text || '').trim().toLowerCase().match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/);
  if (!m) return '19:00:00';
  let h = Number(m[1]); const min = m[2] || '00';
  if (m[3] === 'pm' && h < 12) h += 12;
  if (m[3] === 'am' && h === 12) h = 0;
  return `${String(h).padStart(2, '0')}:${min}:00`;
}
export const TZ = 'America/New_York';
export const WEEKDAY_NUM = { sunday: 1, monday: 2, tuesday: 3, wednesday: 4, thursday: 5, friday: 6, saturday: 7 }; // Zoom's numbering
