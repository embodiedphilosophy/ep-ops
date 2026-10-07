// Dates are stored as plain YYYY-MM-DD (Eastern) so they never shift across time zones.
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const parts = s => { const [y, m, d] = s.split('-').map(Number); return { y, m, d, dow: new Date(Date.UTC(y, m - 1, d)).getUTCDay() }; };
export const month = s => MONTHS[parts(s).m - 1];
export const day = s => String(parts(s).d).padStart(2, '0');
export const longDate = s => { const p = parts(s); return `${DAYS[p.dow]}, ${MONTHS[p.m - 1]} ${p.d}`; };
