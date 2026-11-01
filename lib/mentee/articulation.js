// Peer articulation sessions: one card logs a session for everyone who was there (so a partner doesn't log it again), credits the hours
// to each of them and feeds the cohort's cue bank. Pure checks here; the store is in lib/mentee/store.js. Tested by scripts/member-test/articulation.mjs.
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const lower = s => String(s ?? '').trim().toLowerCase();
const text = (v, max) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const days = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 864e5);

export const MAX_BACK_DAYS = 60;

/**
 * me: the signed-in mentee's email. body: { day, hours, present: [emails besides me], mine, terms: { email: text }, before, after, reflected }.
 * allowed: emails the mentee may name (their partners this rotation, plus the cohort for a third person). today: 'YYYY-MM-DD'.
 * Throws a plain-English message that starts with "Choose" / "Write" / "Hours should" (the route shows those to the person).
 */
export function cleanArticulation(me, body, allowed, today) {
  const email = lower(me);
  const day = DAY.test(body?.day || '') ? body.day : '';
  if (!day) throw new Error('Choose the date');
  if (day > today) throw new Error('Choose a date that has already happened');
  if (days(day, today) > MAX_BACK_DAYS) throw new Error('Choose a date from the last two months');
  const hours = Math.round(Number(body?.hours) * 4) / 4;
  if (!(hours >= 0.25 && hours <= 6)) throw new Error('Hours should be between a quarter and 6');
  const ok = new Set((allowed || []).map(lower));
  const others = [...new Set((body?.present || []).map(lower).filter(e => e && e !== email))];
  if (!others.length) throw new Error('Choose who you practised with');
  if (others.length > 2) throw new Error('A group is two or three people');
  const stranger = others.find(e => !ok.has(e));
  if (stranger) throw new Error('Choose people from your cohort');
  const present = [email, ...others];
  const terms = {};
  const mine = text(body?.mine ?? body?.terms?.[email], 300);
  if (!mine) throw new Error('Write what you articulated');
  terms[email] = mine;
  for (const e of others) { const t = text(body?.terms?.[e], 300); if (t) terms[e] = t; }
  const before = text(body?.before, 300), after = text(body?.after, 300);
  if (!!before !== !!after) throw new Error('Write both the line before and after, or leave both empty');
  return { day, hours, present, terms, cueBefore: before, cueAfter: after, reflected: text(body?.reflected, 300) };
}

// The line a credited hour carries in the formation record: what was practiced
export const summaryOf = (a, email) => `Articulation: ${a.terms[email] || Object.values(a.terms)[0] || 'a session with your partner'}`.slice(0, 200);

// Two articulation records are the same session if they are on the same day and share at least two people
export const sameSession = (a, b) => a.day === b.day && a.present.filter(e => b.present.includes(e)).length >= 2;
