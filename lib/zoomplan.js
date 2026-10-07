// Which Zoom meeting a calendar row belongs to (the [ep:…] tag the website's Zoom sync puts in the agenda).
// zoom = one-off → the row's own meeting; zoom = series → one meeting per series; blank → none.
export const zoomMode = v => {
  const s = String(v || '').trim().toLowerCase();
  if (s === 'series') return 'series';
  if (['one-off', 'one off', 'oneoff', 'true', 'yes'].includes(s)) return 'one-off';
  return '';
};
export function meetingKey(e) {
  const mode = zoomMode(e.zoom);
  if (mode === 'series') return e.series ? String(e.series).trim() : '';
  if (mode === 'one-off') return e.id;
  return '';
}
