import { readRange, writeRange, toObjects } from './google';
import { loadCalendar } from './calendar';

// The Weekly Scaffolding: one Kit draft per week, built from two places in EP-Programming-Calendar:
//  - "Weekly Scaffolding" tab: one row per issue (Send Date = the Sunday it goes out). Every word of the
//    reflection, Sanskrit, video, Tarka and P.S. comes from this row. Nothing is written for you.
//  - "Master Schedule": every event from the send date through the following Saturday, plus any multi-day
//    event still running. Buttons per Track come from the Track Defaults newsletter columns.
// Layout and colours copy the Kit draft "The Weekly Scaffolding — MASTER (duplicate, don't send)".
const SHEET = () => process.env.CALENDAR_SHEET_ID;
const TAB = 'Weekly Scaffolding';

// ---------- dates ----------
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DOW = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const P = s => { const [y, m, d] = s.split('-').map(Number); return { y, m, d, dow: new Date(Date.UTC(y, m - 1, d)).getUTCDay() }; };
export const addDays = (s, n) => { const d = new Date(s + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
export function normDate(s) {
  s = String(s || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}` : '';
}
// The next Sunday on or after `from`
export function nextSunday(from) { let d = from; while (P(d).dow !== 0) d = addDays(d, 1); return d; }
export const longDate = s => { const p = P(s); return `${DOW[p.dow]}, ${MONTHS_LONG[p.m - 1]} ${p.d}, ${p.y}`; };
const range = (a, b) => { const x = P(a), y = P(b); return x.m === y.m ? `${MON[x.m - 1]} ${x.d}–${y.d}` : `${MON[x.m - 1]} ${x.d}–${MON[y.m - 1]} ${y.d}`; };

// ---------- the issue row ----------
export async function loadIssues({ fresh = true } = {}) {
  const rows = toObjects(await readRange(SHEET(), `'${TAB}'!A1:AZ300`, { fresh }));
  return rows.map(r => ({ ...r, send_date: normDate(r.send_date), status: String(r.status || '').trim() })).filter(r => r.send_date);
}

// Columns Y (Kit Draft), Z (Built At), B (Status) are written back
export async function markIssue(row, { status, draftUrl, builtAt }) {
  await writeRange(SHEET(), `'${TAB}'!Y${row}:Z${row}`, [[draftUrl, builtAt]]);
  if (status) await writeRange(SHEET(), `'${TAB}'!B${row}`, [[status]]);
}

// ---------- events for the week ----------
export async function weekEvents(sendDate) {
  const end = addDays(sendDate, 6);
  const cal = await loadCalendar({ fresh: true });
  return cal
    .filter(e => e.newsletter !== 'hide')
    .filter(e => { const last = e.end_date && e.end_date > e.date ? e.end_date : e.date; return e.date <= end && last >= sendDate; })
    .sort((a, b) => a.date.localeCompare(b.date) || a.track.localeCompare(b.track));
}

// ---------- HTML (Kit "Text only" template wraps this and adds the unsubscribe footer) ----------
// Used for the dashboard preview and as the fallback. Kit drafts are normally built from editable blocks instead:
// lib/scaffoldtree.js builds the same design. Keep the two in step.
export const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export const C = { cream: '#FAF7EA', ink: '#1A1613', gold: '#9C7E1E', gold2: '#A2851F', goldLight: '#C4A74B', body: '#4C4636', muted: '#928A72', rule: '#DBCFAC', amber: '#ECA127', blue: '#1E4772' };
export const F = { sans: 'Arial', serif: 'Georgia' };
const FILL = '[FILL IN]';
export const missing = t => `<span style="background:#FFF2A8;color:#7a5b00">${esc(t)}</span>`;

export const block = (inner, { bg = C.cream, pad = '10px 28px 10px 28px', extra = '' } = {}) =>
  `<table class="ck-layout-block" width="100%" border="0" cellPadding="0" cellSpacing="0" bgcolor="${bg}" style="background-color:${bg};padding:${pad};margin:0px;border-radius:0px;overflow:hidden;${extra}"><tbody><tr><td class="ck-column ck-column-1" width="100%" style="background-color:transparent;box-sizing:border-box;vertical-align:top"><div style="padding:0px">${inner}</div></td></tr></tbody></table>`;
export const kicker = (t, align = 'left') => `<h4 style="color:${C.gold};font-family:${F.sans};font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;margin:4px 0 8px 0;text-align:${align}">${t}</h4>`;
const h3 = (t, extra = '') => `<h3 style="color:${C.ink};font-family:${F.serif};font-size:19px;font-weight:700;line-height:1.3;margin:2px 0 4px 0;${extra}">${t}</h3>`;
// Meta lines are paragraphs, not <h5>: Kit's "Text only" theme italicises h5
export const h5 = (t, extra = '') => `<p style="color:${C.muted};font-family:${F.sans};font-size:12px;font-weight:400;font-style:normal;line-height:1.4;margin:0 0 6px 0;${extra}">${t}</p>`;
export const para = (t, extra = '') => `<p style="color:${C.body};font-family:${F.sans};font-size:15px;font-weight:400;line-height:1.6;margin:0 0 12px 0;${extra}">${t}</p>`;
const link = (href, t, color = C.gold) => `<a href="${esc(href)}" target="_blank" rel="noopener noreferrer" class="ck-link" style="color:${color}">${t}</a>`;
const rule = `<hr style="color:${C.rule};width:100%;height:1px;margin:6px 0;border:none;background-color:${C.rule}"/>`;
const textOn = bg => (['#ECA127', '#FAF7EA', '#F3ECD6'].includes(String(bg).toUpperCase()) ? C.ink : '#FFFFFF');
export function button(href, label, bg = C.amber) {
  const fg = textOn(bg);
  return `<table width="100%"><tbody><tr><td align="left"><a class="email-button" href="${esc(href)}" target="_blank" rel="noopener noreferrer" style="border:solid 1px ${bg};background-color:${bg};box-sizing:border-box;color:${fg};display:inline-block;text-decoration:none;padding:12px 20px;margin:8px 0 4px 0;font-size:13px;border-radius:4px;font-family:${F.sans};font-weight:700;letter-spacing:0.5px">${esc(label)}</a></td></tr></tbody></table>`;
}
// Keep the line breaks typed in the sheet (verse lines): email ignores plain newlines
const lines = t => esc(String(t).trim()).replace(/\r?\n/g, '<br/>');
export const paragraphs = (text, style = '') => String(text).split(/\n\s*\n|\r?\n/).map(s => s.trim()).filter(Boolean).map(p => para(esc(p), style)).join('');

// Liquid: true when the subscriber has ANY of these Kit tags
// Pilgrimage Weekly is shown only to Wisdom School members (both tiers). Override with a comma list in
// SCAFFOLDING_PILGRIMAGE_TAGS if the member tags change (names must match Kit exactly).
export const WISDOM_TAGS = () => (process.env.SCAFFOLDING_PILGRIMAGE_TAGS || 'Member: Wisdom School,Member: Wisdom School Plus')
  .split(',').map(s => s.trim()).filter(Boolean);
export const hasAnyTag = tags => tags.map(t => `subscriber.tags contains "${String(t).replace(/"/g, '')}"`).join(' or ');

// ---------- one event ----------
export function eventHtml(ev, sendDate) {
  const last = ev.end_date && ev.end_date > ev.date ? ev.end_date : '';
  const ongoing = ev.date < sendDate;
  // A course already running shows the day it ends ("Thru Oct / 20") instead of a start date
  const p = P(ongoing && last ? last : ongoing ? sendDate : ev.date);
  const extra = String(ev.note || ev.price || '');
  const span = last ? range(ev.date, last) : '';
  const spanSaid = span && extra.includes(span); // e.g. note "Ten sessions, Oct 11–20" already gives the dates
  const when = last ? [spanSaid ? '' : span, ongoing ? 'continues this week' : ''].filter(Boolean).join(' · ') : `${DOW[P(ev.date).dow]}, ${MON[P(ev.date).m - 1]} ${P(ev.date).d}`;
  const who = ev.teachers ? `with ${ev.teachers}` : '';
  const meta = [when, ev.time, who, extra].filter(Boolean).map(esc).join(' · ');
  const color = ev.button_color || C.amber;
  const openUrl = ev.registration_url || ev.open_url;
  const tags = ev.enrolled_tags || [];
  const enrolledBtn = ev.enrolled_label && ev.enrolled_url ? button(ev.enrolled_url, ev.enrolled_label, color) : '';
  const openBtn = ev.open_label && openUrl ? button(openUrl, ev.open_label, color) : '';
  let buttons;
  if (ev.newsletter === 'enrolled_only') buttons = enrolledBtn; // the whole block is already behind the tag check
  else if (tags.length && enrolledBtn) buttons = `{% if ${hasAnyTag(tags)} %}${enrolledBtn}{% else %}${openBtn}{% endif %}`;
  else buttons = openBtn || enrolledBtn;

  const html = `<table class="ck-layout-block" width="100%" border="0" cellPadding="0" cellSpacing="0" bgcolor="${C.cream}" style="background-color:${C.cream};padding:10px 28px 10px 28px;margin:0px;border-radius:0px;overflow:hidden"><tbody><tr>
<td class="ck-column ck-column-1" width="17%" style="background-color:${C.ink};border-radius:5px;box-sizing:border-box;vertical-align:top"><div style="padding:12px 4px 12px 4px">
<h4 style="color:${C.goldLight};font-family:${F.sans};font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;margin:0;text-align:center">${ongoing && last ? `Thru ${MON[p.m - 1]}` : ongoing ? 'Now' : MON[p.m - 1]}</h4>
<h3 style="color:${C.cream};font-family:${F.serif};font-size:26px;font-weight:700;line-height:1.3;margin:0;text-align:center">${ongoing && !last ? '·' : p.d}</h3></div></td>
<td style="padding-left:18px"></td>
<td class="ck-column ck-column-2" width="83%" style="background-color:transparent;box-sizing:border-box;vertical-align:top"><div style="padding:0px">
${h3(esc(ev.title))}${h5(meta)}${ev.summary ? para(esc(ev.summary), 'font-size:14px') : ''}${buttons}
</div></td></tr></tbody></table>`;
  // Enrolled-only tracks (e.g. Sādhana School sessions) are invisible to everyone else
  if (ev.newsletter === 'enrolled_only') return tags.length ? `{% if ${hasAnyTag(tags)} %}${html}{% endif %}` : '';
  return html;
}

// ---------- video thumbnail ----------
export function thumbOf(url, given) {
  if (given) return given;
  const yt = String(url).match(/(?:youtu\.be\/|v=|embed\/|shorts\/)([\w-]{11})/);
  if (yt) return `https://img.youtube.com/vi/${yt[1]}/hqdefault.jpg`;
  const vm = String(url).match(/vimeo\.com\/(?:video\/)?(\d+)/);
  if (vm) return `https://vumbnail.com/${vm[1]}.jpg`;
  return '';
}

// ---------- the whole issue ----------
// Returns { subject, preview_text, content, gaps } — gaps lists required fields left blank
export function buildIssue(issue, events) {
  const gaps = [];
  const need = (key, label) => { const v = String(issue[key] || '').trim(); if (!v) gaps.push(label); return v; };
  const or = (v, label) => (v ? esc(v) : missing(`${FILL} ${label}`));

  const subject = need('subject', 'Subject');
  const preview = String(issue.preview_text || '').trim();
  const headline = need('reflection_headline', 'Reflection headline');
  const body = need('reflection_body', 'Reflection body');
  const deva = String(issue.sanskrit_devanagari || '').trim();
  const iast = need('sanskrit_iast', 'Sanskrit transliteration');
  const trans = need('sanskrit_translation', 'Sanskrit translation');
  const src = String(issue.sanskrit_source || '').trim();
  const videoUrl = String(issue.video_url || '').trim();
  const hasTarka = String(issue.tarka_title || '').trim();
  const ps = String(issue.ps || '').trim();
  const out = [];

  // Masthead
  out.push(block(`<table width="100%" border="0" cellSpacing="0" cellPadding="0" style="text-align:center"><tbody><tr><td align="center"><a href="https://embodiedphilosophy.com" target="_blank" rel="noopener noreferrer"><img src="https://embed.filekitcdn.com/e/x8NRZ83fCR5nzjGX8kcfRN/sNy6tXg8PBU4u8j7rBoKXX" alt="Embodied Philosophy" width="210" style="max-width:100%;width:210px;height:auto"/></a></td></tr></tbody></table>
${kicker('Embodied Philosophy Weekly', 'center')}<h1 style="color:${C.ink};font-family:${F.serif};font-size:44px;font-weight:400;line-height:1.1;text-align:center;margin:6px 0">The Scaffolding</h1>
${h5(`Issue No. ${esc(issue.issue_no || '')} · ${longDate(issue.send_date)}`, 'text-align:center')}`, { pad: '28px 24px 22px 24px', extra: `border-bottom:solid 2px ${C.ink};` }));

  // Reflection
  out.push(block(`${kicker('The Weekly Reflection')}<h2 style="color:${C.gold2};font-family:${F.serif};font-size:30px;font-weight:400;line-height:1.2;margin:4px 0 12px 0">${or(headline, 'Reflection headline')}</h2>
${body ? paragraphs(body) : para(missing(`${FILL} Reflection body`))}${issue.reflection_url ? para(link(issue.reflection_url, 'Read the full reflection →')) : ''}`, { pad: '26px 28px 10px 28px' }));

  // Pilgrimage Weekly: Wisdom School members only (everyone else never sees it; Kit removes it at send)
  const pilTitle = String(issue.pilgrimage_title || '').trim(), pilBody = String(issue.pilgrimage_body || '').trim();
  if (pilTitle || pilBody) {
    const pilUrl = String(issue.pilgrimage_url || '').trim();
    const inner = block(`${rule}${kicker('Pilgrimage Weekly · For Wisdom School Members')}${pilTitle ? `<h2 style="color:${C.gold2};font-family:${F.serif};font-size:30px;font-weight:400;line-height:1.2;margin:4px 0 12px 0">${esc(pilTitle)}</h2>` : ''}${pilBody ? paragraphs(pilBody) : ''}${pilUrl ? button(pilUrl, String(issue.pilgrimage_button || '').trim() || 'Continue the journey →', C.blue) : ''}`, { pad: '14px 28px 10px 28px' });
    out.push(`{% if ${hasAnyTag(WISDOM_TAGS())} %}${inner}{% endif %}`);
  }

  // Sanskrit
  out.push(block(kicker('Sanskrit for the Week'), { pad: '14px 28px 12px 28px' }));
  out.push(block(`${deva ? `<h3 style="color:#F4ECCF;font-family:${F.serif};font-size:26px;font-weight:700;line-height:1.3;margin:0;text-align:center">${lines(deva)}</h3>` : ''}
<p style="font-family:${F.serif};font-size:19px;line-height:1.6;margin:8px 0;text-align:center"><em style="color:${C.goldLight}">${iast ? lines(iast) : or(iast, 'transliteration')}</em></p>
<p style="color:#E9E2CD;font-family:${F.serif};font-size:17px;line-height:1.6;margin:8px 0;text-align:center">${trans ? lines(trans) : or(trans, 'translation')}</p>
${src ? `<h6 style="color:#B7A874;font-family:${F.sans};font-size:10px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;margin:8px 0 4px 0;text-align:center">${esc(src)}</h6>` : ''}`, { bg: C.ink, pad: '28px 32px 26px 32px' }));

  // This week
  out.push(block(`${rule}${kicker('This Week at Embodied Philosophy')}${issue.events_intro && !/^this week at embodied philosophy\.?$/i.test(issue.events_intro.trim()) ? para(esc(issue.events_intro)) : ''}`, { pad: '18px 28px 4px 28px' }));
  const evs = events.map(e => eventHtml(e, issue.send_date)).filter(Boolean);
  out.push(evs.length ? evs.join('\n') : block(para('A quiet week on the calendar. The recordings library is open any time.')));

  // Free video
  if (videoUrl || issue.video_title) {
    const thumb = thumbOf(videoUrl, issue.video_thumbnail);
    out.push(block(`${rule}${kicker('Free Video · A Window into Sādhana School')}
${thumb && videoUrl ? `<a href="${esc(videoUrl)}" target="_blank" rel="noopener noreferrer"><img src="${esc(thumb)}" alt="${esc(issue.video_title)}" width="544" style="max-width:100%;width:100%;height:auto;border-radius:4px;margin:4px 0 10px 0"/></a>` : ''}
${h3(or(issue.video_title, 'Video title'))}${issue.video_meta ? h5(esc(issue.video_meta)) : ''}${issue.video_caption ? para(esc(issue.video_caption)) : ''}
${videoUrl ? button(videoUrl, 'Watch free →', C.blue) : para(missing(`${FILL} Video URL`))}`, { pad: '14px 28px 10px 28px' }));
  }

  // Tarka
  if (hasTarka) {
    out.push(block(`${rule}${kicker('Latest from Tarka')}`, { pad: '10px 28px 0px 28px' }));
    out.push(`<table class="ck-layout-block" width="100%" border="0" cellPadding="0" cellSpacing="0" bgcolor="${C.cream}" style="background-color:${C.cream};padding:8px 28px 10px 28px;margin:0px;overflow:hidden"><tbody><tr>
<td class="ck-column ck-column-1" width="26%" style="background-color:${C.blue};border-radius:4px;box-sizing:border-box;vertical-align:top"><div style="padding:22px 6px 22px 6px">${h3('<span style="color:#FAF7EA">TARKA</span>', 'text-align:center')}${h5(`<span style="color:#C9D3DC">${esc(issue.tarka_issue || '')}</span>`, 'text-align:center')}</div></td>
<td style="padding-left:18px"></td>
<td class="ck-column ck-column-2" width="74%" style="box-sizing:border-box;vertical-align:top"><div style="padding:0px">
${h3(esc(issue.tarka_title))}${issue.tarka_author ? h5(`by ${esc(issue.tarka_author)}`) : ''}${issue.tarka_teaser ? para(esc(issue.tarka_teaser)) : ''}${issue.tarka_url ? button(issue.tarka_url, 'Read the essay →', C.amber) : ''}
</div></td></tr></tbody></table>`);
  }

  // Study with us (fixed cards)
  const card = (bg, title, sub, href) => {
    const c = `<td class="ck-column ck-column-stack" width="50%" style="background-color:${bg};border-radius:4px;box-sizing:border-box;vertical-align:top"><div style="padding:16px">
<h3 style="color:#FFFFFF;font-family:${F.serif};font-size:17px;font-weight:700;line-height:1.3;margin:2px 0 4px 0">${title}</h3>
<p style="color:#F4EFD9;font-family:${F.sans};font-size:12px;font-weight:400;line-height:1.4;margin:0 0 6px 0">${sub}</p>
<p style="font-family:${F.sans};font-size:13px;line-height:1.6;margin:8px 0">${link(href, 'Learn more →', '#FFFFFF')}</p></div></td>`;
    return c;
  };
  const pair = (a, b, pad) => `<table class="ck-layout-block ck-layout-stack" width="100%" border="0" cellPadding="0" cellSpacing="0" bgcolor="${C.cream}" style="background-color:${C.cream};padding:${pad};margin:0px;overflow:hidden"><tbody><tr>${a}<td style="padding-left:12px"></td>${b}</tr></tbody></table>`;
  out.push(block(`${rule}${kicker('Study With Us')}`, { pad: '10px 28px 0px 28px' }));
  out.push(pair(card(C.blue, 'Wisdom School', 'Membership · live salons &amp; learning pathways', 'https://embodiedphilosophy.com/wisdom-school'),
    card('#CB243B', 'Sādhana School', 'Year-long practice · Non-Dual Śākta-Śaiva', 'https://embodiedphilosophy.com/sadhana-school'), '6px 28px 6px 28px'));
  out.push(pair(card('#3C9A4A', 'Meditation Pass', '$9.99/mo · Meditation Mondays', 'https://embodiedphilosophy.com/meditation-pass'),
    card('#5F8F91', 'Tarka Journal', 'Essays in contemplative philosophy', 'https://www.tarkajournal.com'), '6px 28px 16px 28px'));

  // P.S.
  if (ps) out.push(block(para(`<strong style="color:${C.ink}">P.S. — </strong>${esc(ps)}`, 'font-size:14px'), { bg: '#F3ECD6', pad: '16px 28px 16px 28px', extra: 'border-top:solid 1px #E3D9BD;border-bottom:solid 1px #E3D9BD;' }));

  // Footer
  out.push(block(`<table width="100%" border="0" cellSpacing="0" cellPadding="0"><tbody><tr><td align="center"><img src="https://embed.filekitcdn.com/e/x8NRZ83fCR5nzjGX8kcfRN/2EUaDr5877kQGXdy9Lae7T" alt="EP" width="36" style="width:36px;height:auto"/></td></tr></tbody></table>
<h6 style="color:${C.goldLight};font-family:${F.sans};font-size:11px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;margin:8px 0 4px 0;text-align:center">Embodied Philosophy</h6>
<p style="color:#B1A982;font-family:${F.sans};font-size:12px;line-height:1.6;margin:8px 0;text-align:center">A school of interdisciplinary, contemplative education. ${link('https://embodiedphilosophy.com', 'embodiedphilosophy.com', C.goldLight)}</p>`, { bg: C.ink, pad: '24px 24px 22px 24px' }));

  const content = `<table cellPadding="0" cellSpacing="0" style="width:100%;margin:0 auto"><tbody><tr><td>\n${out.join('\n')}\n</td></tr></tbody></table>`;
  return {
    subject: gaps.length ? `[NEEDS CONTENT] ${subject || 'The Weekly Scaffolding'}` : subject,
    preview_text: preview,
    content,
    gaps,
  };
}
