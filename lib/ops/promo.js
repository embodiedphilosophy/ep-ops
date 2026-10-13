import { loadCalendar, loadTemplates } from '../calendar';
import { todayET } from '../events';
import { kitSignals, kitConfigured, createDraft, updateDraft, getBroadcast, isEditableDraft, draftUrl } from '../kit';
import { readPlain, updatePlain } from './store';
import { ruleOf } from './autocomplete';
import { addDays, longDate, esc, C, F, block, kicker, h5, para, paragraphs, button, missing } from '../scaffolding';

// Promo emails per event (Publish → Email). Two sources, merged here:
//  - Task Templates: the Marketing "kit_email" rows say which emails each track gets and how many days
//    before the event (the plan). Nothing has to be typed for the plan to show.
//  - the "Promo Emails" tab on EP-Programming-Calendar: one row per email someone has written, moved,
//    marked "not needed" (Status Skip, planned emails only) or added (an extra email; deleting one sets
//    Status Removed, so nothing disappears from the sheet by accident). The tab is made on the first save.
// Kit broadcasts count for an event when their subject or internal description carries its ID, e.g.
// "[E047] Promo #2"; a draft built from here carries it in the description. Building never schedules or
// sends: that stays in Kit, with a person.
export const PROMO_TAB = 'Promo Emails';
export const PROMO_COLS = ['Event ID', 'Email', 'Send Date', 'Status', 'Subject', 'Preview Text', 'Heading', 'Body',
  'Button Text', 'Button URL', 'Notes', 'Kit Draft', 'Built At'];
export const PROMO_STATUSES = ['', 'Draft', 'Ready'];          // what staff pick; In Kit / Skip / Removed are set by buttons
export const PROMO_FIELDS = ['Email', 'Send Date', 'Status', 'Subject', 'Preview Text', 'Heading', 'Body', 'Button Text', 'Button URL', 'Notes'];
const LONG = ['Body', 'Notes', 'Preview Text'];

const lower = s => String(s ?? '').trim().toLowerCase();
const v = (r, k) => String(r?.[k] ?? '').trim();
export const slugOf = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
export const kitIdOf = url => (String(url || '').match(/campaigns\/(\d+)/) || [])[1] || '';
export const isSkip = r => lower(r?.Status) === 'skip';
export const isRemoved = r => lower(r?.Status) === 'removed';

// → { rows: [{ row, values }], missing } (missing: the tab isn't there yet, so nothing has been saved)
export async function loadPromoRows({ light = true } = {}) {
  try { const d = await readPlain(PROMO_TAB, { light }); return { rows: d.rows.filter(r => v(r.values, 'Event ID')), head: d.head, missing: false }; }
  catch { return { rows: [], head: [], missing: true }; }
}

// The planned emails per track: { TRACK: [{ task, offset }] }
export function plannedSlots(tpls) {
  const slots = {};
  for (const t of tpls) if (ruleOf(t) === 'kit_email' && /^marketing$/i.test(String(t.assign_to).trim()))
    (slots[String(t.track).toUpperCase()] ||= []).push({ task: String(t.task).trim(), offset: Number(t.offset_days) || 0 });
  return slots;
}

// One event's emails: the planned ones (with any saved row) and the extras, by send date.
//   { key, label, due, planned, row (sheet row number or null), values, skipped }
export function emailsFor(ev, slots, rows) {
  const mine = rows.filter(r => lower(r.values['Event ID']) === lower(ev.sched_id) && !isRemoved(r.values));
  const out = (slots[ev.track] || []).map(s => {
    const r = mine.find(x => lower(x.values.Email) === lower(s.task));
    const due = addDays(ev.date, s.offset);
    return { key: `p:${s.task}`, label: s.task, planned: true, offset: s.offset, due: /^\d{4}-\d{2}-\d{2}$/.test(v(r?.values, 'Send Date')) ? v(r.values, 'Send Date') : due, planDue: due,
      row: r?.row ?? null, values: r?.values || {}, skipped: isSkip(r?.values) };
  });
  const taken = new Set(out.map(o => lower(o.label)));
  for (const r of mine) if (!taken.has(lower(r.values.Email))) out.push({ key: `x:${r.row}`, label: v(r.values, 'Email') || 'Extra email', planned: false,
    due: v(r.values, 'Send Date') || ev.date, row: r.row, values: r.values, skipped: false });
  return out.sort((a, b) => a.due.localeCompare(b.due));
}

// Pair each email with its Kit broadcast: first the draft built from that row, then the rest in date order
export function matchKit(emails, broadcasts) {
  const left = [...broadcasts].sort((x, y) => (x.at || '9').localeCompare(y.at || '9'));
  const take = i => left.splice(i, 1)[0];
  for (const e of emails) { const id = kitIdOf(e.values['Kit Draft']); const i = id ? left.findIndex(b => String(b.id) === id) : -1; e.kit = i >= 0 ? take(i) : null; }
  for (const e of emails) if (!e.kit && !e.skipped && left.length) e.kit = take(0);
  return left; // broadcasts no email claimed
}

// Everything Publish → Email and the Overview show. Events in the next 10 weeks that have planned emails or
// extras. want: the emails still needed (skipped ones left out); ready: how many of them Kit has scheduled or sent.
export async function promoRows({ light = true } = {}) {
  const [cal, tpls, kit, saved] = await Promise.all([loadCalendar(), loadTemplates(), kitConfigured() ? kitSignals().catch(() => null) : null, loadPromoRows({ light })]);
  const slots = plannedSlots(tpls);
  const today = todayET(), until = addDays(today, 70);
  const extraIds = new Set(saved.rows.filter(r => !isRemoved(r.values)).map(r => lower(r.values['Event ID'])));
  const rows = cal.filter(e => e.sched_id && (slots[e.track] || extraIds.has(lower(e.sched_id))) && e.date >= today && e.date <= until && !/cancel/i.test(e.status))
    .map(e => {
      const all = emailsFor(e, slots, saved.rows);
      const extra = kit ? matchKit(all, kit.broadcasts.filter(b => b.ids.includes(e.sched_id))) : [];
      const want = all.filter(x => !x.skipped);
      return { e, all, want, extra, ready: want.filter(x => x.kit?.at).length };
    }).filter(r => r.all.length);
  const untagged = kit ? kit.broadcasts.filter(b => !b.sent && b.at && !b.ids.length && b.at.slice(0, 10) >= today && b.at.slice(0, 10) <= addDays(today, 30)) : [];
  return { rows, untagged, kit: !!kit, tabMissing: saved.missing };
}

// For readiness checks and auto-complete: per event ID, the planned emails marked not needed (by task slug),
// the extras added, and the Kit draft built for each email.
export async function promoAdjustments() {
  const { rows } = await loadPromoRows({ light: false });
  const out = {};
  for (const r of rows) {
    if (isRemoved(r.values)) continue;
    const o = (out[String(r.values['Event ID']).trim().toUpperCase()] ||= { skipped: new Set(), emails: [], drafts: {} });
    if (isSkip(r.values)) o.skipped.add(slugOf(r.values.Email)); else o.emails.push(slugOf(r.values.Email));
    if (kitIdOf(r.values['Kit Draft'])) o.drafts[slugOf(r.values.Email)] = kitIdOf(r.values['Kit Draft']);
  }
  return out;
}

// What each field holds → the editor's input and the server's check
export const promoType = h => h === 'Send Date' ? 'date' : h === 'Status' ? 'promostatus' : h === 'Button URL' ? 'link' : LONG.includes(h) ? 'long' : 'text';
export function checkPromo(h, raw) {
  const s = String(raw ?? '').trim(), t = promoType(h);
  if (!s) return h === 'Email' ? { error: 'Give the email a name, e.g. Promo email #3' } : { value: '' };
  if (t === 'date') return /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s)) ? { value: s } : { error: 'A date like 2026-11-02' };
  if (t === 'promostatus') return PROMO_STATUSES.includes(s) ? { value: s } : { error: 'Pick a status' };
  if (t === 'link') return /^https:\/\/\S+$/.test(s) ? { value: s } : { error: 'A full link starting with https://' };
  if (t === 'text') return s.length > 200 ? { error: 'Keep it under 200 characters' } : { value: s.replace(/\s*\n\s*/g, ' ') };
  return s.length > 8000 ? { error: 'Too long' } : { value: s };
}

// ---------- the email itself (same look as the Weekly Scaffolding; Kit's "Text only" template adds the footer) ----------
export function buildPromo(values, ev) {
  const gaps = [];
  const need = (k, label) => { const s = v(values, k); if (!s) gaps.push(label); return s; };
  const subject = need('Subject', 'Subject');
  const heading = v(values, 'Heading') || ev.title;
  const body = need('Body', 'Body');
  const btnUrl = v(values, 'Button URL') || ev.registration_url;
  const btnText = v(values, 'Button Text') || (btnUrl ? 'Join us →' : '');
  const when = [longDate(ev.date), ev.time, ev.teachers ? `with ${ev.teachers}` : ''].filter(Boolean).map(esc).join(' · ');
  const out = [];
  out.push(block(`<table width="100%" border="0" cellSpacing="0" cellPadding="0" style="text-align:center"><tbody><tr><td align="center"><a href="https://embodiedphilosophy.com" target="_blank" rel="noopener noreferrer"><img src="https://embed.filekitcdn.com/e/x8NRZ83fCR5nzjGX8kcfRN/sNy6tXg8PBU4u8j7rBoKXX" alt="Embodied Philosophy" width="180" style="max-width:100%;width:180px;height:auto"/></a></td></tr></tbody></table>`,
    { pad: '24px 24px 14px 24px', extra: `border-bottom:solid 2px ${C.ink};` }));
  out.push(block(`${kicker(esc(ev.program || ev.host || 'Embodied Philosophy'))}<h2 style="color:${C.ink};font-family:${F.serif};font-size:30px;font-weight:400;line-height:1.2;margin:4px 0 8px 0">${esc(heading)}</h2>
${h5(when)}${body ? paragraphs(body) : para(missing('[FILL IN] Body'))}${btnUrl ? button(btnUrl, btnText, ev.button_color || C.amber) : ''}`, { pad: '26px 28px 22px 28px' }));
  out.push(block(`<p style="color:#B1A982;font-family:${F.sans};font-size:12px;line-height:1.6;margin:8px 0;text-align:center">Embodied Philosophy · A school of interdisciplinary, contemplative education. <a href="https://embodiedphilosophy.com" style="color:${C.goldLight}">embodiedphilosophy.com</a></p>`, { bg: C.ink, pad: '18px 24px 16px 24px' }));
  return {
    subject: gaps.length ? `[NEEDS CONTENT] ${subject || ev.title}` : subject,
    preview_text: v(values, 'Preview Text'),
    content: `<table cellPadding="0" cellSpacing="0" style="width:100%;margin:0 auto"><tbody><tr><td>\n${out.join('\n')}\n</td></tr></tbody></table>`,
    gaps,
  };
}

// One saved row with its event → { values, ev } or an { error }
export async function promoContext(row) {
  const { rows } = await loadPromoRows({ light: false });
  const r = rows.find(x => x.row === Number(row));
  if (!r || isRemoved(r.values)) return { error: 'That email isn’t on the Promo Emails tab any more. Reload the page.' };
  const ev = (await loadCalendar()).find(e => lower(e.sched_id) === lower(r.values['Event ID']));
  if (!ev) return { error: `Couldn’t find ${r.values['Event ID']} on the schedule.` };
  return { values: r.values, ev, row: r.row };
}

// mode 'preview' → { html }; 'build' → makes or updates the Kit draft (never scheduled) → { status, json }
export async function runPromo({ row, mode = 'build', who = '' }) {
  const c = await promoContext(row);
  if (c.error) return { status: 404, json: { error: c.error } };
  const built = buildPromo(c.values, c.ev);
  if (mode === 'preview') return { html: `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(built.subject)}</title><body style="margin:0;background:#eee"><p style="max-width:600px;margin:12px auto 0;font:13px Arial;color:#555;padding:0 8px">Subject: <b>${esc(built.subject)}</b>${built.preview_text ? `<br>Preview: ${esc(built.preview_text)}` : ''}</p><div style="max-width:600px;margin:10px auto 20px;background:#FAF7EA">${built.content}</div></body>` };
  if (built.gaps.length) return { status: 400, json: { error: `Fill in ${built.gaps.join(' and ')} first.`, blanks: built.gaps } };
  const { audience } = await import('./scaffoldrun');
  const fields = {
    subject: built.subject, preview_text: built.preview_text, content: built.content,
    description: `[${c.ev.sched_id}] ${c.values.Email} (built from the ops dashboard)`,
    email_template_id: Number(process.env.PROMO_TEMPLATE_ID || process.env.SCAFFOLDING_TEMPLATE_ID || 5578308),
    subscriber_filter: audience(),
  };
  const existing = kitIdOf(c.values['Kit Draft']);
  let broadcast, action = 'created';
  if (existing) {
    const current = await getBroadcast(existing).catch(() => null);
    if (current && !isEditableDraft(current)) return { status: 200, json: { skipped: 'This email is already scheduled or sent in Kit, so nothing changed. Edit it in Kit.', draft: draftUrl(existing) } };
    if (current) { broadcast = await updateDraft(existing, fields); action = 'updated'; }
  }
  if (!broadcast) broadcast = await createDraft(fields);
  const link = draftUrl(broadcast.id);
  const builtAt = new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC';
  await updatePlain(PROMO_TAB, c.row, { 'Kit Draft': link, 'Built At': builtAt, Status: 'In Kit' }, { who });
  kitSignals({ fresh: true }).catch(() => {}); // so the list counts it straight away
  return { status: 200, json: { action, draft: link } };
}
