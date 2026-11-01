// The Sahṛdaya Upāya mentee year for the Ops dashboard (/ops/mentee-year): the rhythm, a typical month, month by month, the dated steps of the two
// final projects. The content is data/mentee-year.json (drawn from the Mentee Year page, Nov 2026). Pure helpers, no network: scripts/ops-test/mentee-year.mjs.
export const PROJECTS = { talk: '60-minute talk', offering: 'Three-session offering', both: 'Both' };

// Text in the data file marks emphasis with **bold**, _italic_, ~quiet~ and ^date^. → [{ t: 'b' | 'i' | 'q' | 'd' | 'text', s }]
export function segments(text) {
  return String(text ?? '').split(/(\*\*.+?\*\*|_.+?_|~.+?~|\^.+?\^)/).filter(Boolean).map(s => {
    const k = s.startsWith('**') ? 'b' : s[0] === '_' ? 'i' : s[0] === '~' ? 'q' : s[0] === '^' ? 'd' : 'text';
    return { t: k, s: k === 'b' ? s.slice(2, -2) : k === 'text' ? s : s.slice(1, -1) };
  });
}
export const plain = text => segments(text).map(x => (x.t === 'q' ? plain(x.s) : x.s)).join(''); // quiet text may hold bold or italics

const DAY = /^\d{4}-\d{2}-\d{2}$/;
// The next n steps due on or after today, soonest first (steps stay in file order for the same day)
export function nextSteps(steps, today, n = 3) {
  return steps.filter(s => DAY.test(s.date) && s.date >= today).sort((a, b) => a.date.localeCompare(b.date)).slice(0, n);
}
export const daysUntil = (date, today) => Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 864e5);

// The month card for today: this month if it is in the year, the first month before October, the last after July
export function currentMonth(months, today) {
  if (!months.length) return null;
  const ym = String(today).slice(0, 7);
  return months.find(m => m.id === ym) || (ym < months[0].id ? months[0] : months[months.length - 1]);
}

// The quarterly reviews are tick-lists in the data file (`reviews`: December Q1, March mid-year, June readiness).
// The review to show: the one for this month, else the next one coming
export function reviewFor(rs, today) {
  const ym = String(today).slice(0, 7);
  return rs.find(r => r.month === ym) || rs.find(r => r.month > ym) || null;
}

// The two lanes of the strip, as columns of the nine months
export const laneStyle = b => ({ gridColumn: `${b.from + 2} / ${b.to + 2}` });
