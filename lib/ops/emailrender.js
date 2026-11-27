// Email blocks → Kit-ready HTML (the EP template look), the audience filter Kit wants, and the checks run before anything is scheduled.
import { esc, C, F, block, kicker, h5, para, button, missing } from '../scaffolding';
import { eventFacts } from './templates/facts';
import { hasAnyTag, WISDOM_TAGS } from '../scaffolding';

// Plain text with **bold**, *italic* and [link](https://…); blank lines split paragraphs, single newlines stay as line breaks
export function inline(t) {
  return esc(t).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/(^|[^*])\*(?!\s)(.+?)\*/g, '$1<em>$2</em>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, (_, a, h) => `<a href="${h}" target="_blank" rel="noopener noreferrer" style="color:${C.gold}">${a}</a>`);
}
const paras = t => String(t || '').split(/\n\s*\n/).map(s => s.trim()).filter(Boolean).map(s => para(inline(s).replace(/\r?\n/g, '<br/>'))).join('');
const HEAD = `<table width="100%" border="0" cellSpacing="0" cellPadding="0" style="text-align:center"><tbody><tr><td align="center"><a href="https://embodiedphilosophy.com" target="_blank" rel="noopener noreferrer"><img src="https://embed.filekitcdn.com/e/x8NRZ83fCR5nzjGX8kcfRN/sNy6tXg8PBU4u8j7rBoKXX" alt="Embodied Philosophy" width="180" style="max-width:100%;width:180px;height:auto"/></a></td></tr></tbody></table>`;
const FOOT = `<p style="color:#B1A982;font-family:${F.sans};font-size:12px;line-height:1.6;margin:8px 0;text-align:center">Embodied Philosophy · A school of interdisciplinary, contemplative education.</p>`;

// teacher: { name, role, bio } from the Faculty record, passed in by the caller
export function renderBlocks(blocks, { ev, teachers = {}, forPreview = false } = {}) {
  const out = [block(HEAD, { pad: '24px 24px 14px 24px', extra: `border-bottom:solid 2px ${C.ink};` })];
  for (const b of Array.isArray(blocks) ? blocks : []) {
    let html = '';
    if (b.type === 'text') html = paras(b.text);
    else if (b.type === 'facts') {
      if (!ev) html = para(missing('[Pick the event first] Event facts'));
      else { const f = eventFacts(ev); html = f.data ? `${kicker(esc(f.data.program || 'Embodied Philosophy'))}${h5(esc(f.data.when))}${para(esc(`${f.data.london} · ${f.data.teacher ? 'with ' + f.data.teacher : ''}`.replace(/^ · /, '')))}${para(esc(f.data.price))}` : para(missing(`[Master Schedule is missing ${f.missing.join(', ')}]`)); }
    }
    else if (b.type === 'member') {
      const m = paras(b.member), n = paras(b.nonmember);
      html = forPreview ? `${h5('Members see:')}${m}${h5('Everyone else sees:')}${n}` : `{% if ${hasAnyTag(WISDOM_TAGS())} %}${m}{% else %}${n}{% endif %}`;
    }
    else if (b.type === 'teacher') { const t = teachers[String(b.teacher || '').toLowerCase()]; html = t ? `${h5(esc(t.name) + (t.role ? ' · ' + esc(t.role) : ''))}${para(inline(t.bio || ''))}` : para(missing('[Choose a teacher]')); }
    else if (b.type === 'button') html = b.url ? button(b.url, b.label || 'Join us →') : para(missing('[Button needs a link]'));
    else if (b.type === 'image') html = b.url ? `<p style="margin:0 0 12px 0"><img src="${esc(b.url)}" alt="${esc(b.alt || '')}" style="max-width:100%;height:auto"/></p>` : para(missing('[Image needs a link]'));
    else if (b.type === 'html') html = String(b.html || '');
    if (html) out.push(block(html, { pad: '14px 28px 10px 28px' }));
  }
  out.push(block(FOOT));
  return `<table cellPadding="0" cellSpacing="0" style="width:100%;margin:0 auto"><tbody><tr><td>\n${out.join('\n')}\n</td></tr></tbody></table>`;
}

// { include: [{type:'tag'|'segment', id, name}], exclude: [...] } → Kit's subscriber_filter
export function filterOf(a) {
  const grp = xs => ['tag', 'segment'].map(t => ({ type: t, ids: xs.filter(x => x.type === t).map(x => Number(x.id)) })).filter(g => g.ids.length);
  const inc = grp(a?.include || []), exc = grp(a?.exclude || []);
  if (!inc.length && !exc.length) return [{ all: [{ type: 'all_subscribers' }] }];
  return [{ ...(inc.length ? { any: inc } : { all: [{ type: 'all_subscribers' }] }), ...(exc.length ? { none: exc } : {}) }];
}
export const audienceText = a => { const n = xs => (xs || []).map(x => x.name || `${x.type} ${x.id}`).join(', '); return `${n(a?.include) || 'Everyone'}${a?.exclude?.length ? ` · not ${n(a.exclude)}` : ''}`; };

// 8:00 ET on a date → the UTC instant Kit wants
export function etToIso(date, time = '09:00') {
  const m = String(time).match(/^(\d{1,2}):(\d{2})/); if (!m || !/^\d{4}-\d{2}-\d{2}$/.test(date || '')) return '';
  const guess = new Date(`${date}T${m[1].padStart(2, '0')}:${m[2]}:00Z`), ny = d => new Date(d.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  return new Date(guess.getTime() + (guess - ny(guess))).toISOString();
}

// Checks before Schedule. Each failure → { key, text }. Any failure needs an override note.
export function preSendChecks({ plan, blocks, ev, others = [], today }) {
  const out = [], text = JSON.stringify(blocks);
  const links = blocks.filter(b => b.type === 'button' || b.type === 'image').map(b => b.url).concat([...text.matchAll(/\]\((https?:[^)]*)\)/g)].map(m => m[1]));
  if (blocks.some(b => b.type === 'button' && !b.url) || links.some(u => /example\.|todo|\[|your-link|#$/i.test(u || ''))) out.push({ key: 'links', text: 'A link is missing or still a placeholder.' });
  const ids = [...new Set([...text.matchAll(/zoom\.us\/[a-z]\/(\d{9,11})/gi)].map(m => m[1]))], real = String(ev?.zoom_link || ev?.zoom || '').match(/(\d{9,11})/)?.[1];
  if (ids.length && real && ids.some(i => i !== real)) out.push({ key: 'zoom', text: 'The Zoom ID in the email isn’t the event’s Zoom ID.' });
  if (!plan.planned_date) out.push({ key: 'date', text: 'There is no send date.' });
  else if (plan.planned_date < today) out.push({ key: 'past', text: 'The send date is in the past.' });
  else if (ev?.date && plan.planned_date > ev.date) out.push({ key: 'after', text: 'The send date is after the event.' });
  const body = blocks.filter(b => b.type === 'text' || b.type === 'member' || b.type === 'html').map(b => `${b.text || ''}${b.member || ''}${b.nonmember || ''}${b.html || ''}`).join('').trim();
  if (!body || /\[needs content\]|\[fill in\]/i.test(`${plan.subject} ${text}`)) out.push({ key: 'empty', text: 'The email is empty or still marked [NEEDS CONTENT].' });
  if (!String(plan.subject || '').trim()) out.push({ key: 'subject', text: 'There is no subject.' });
  const aud = audienceText(JSON.parse(plan.audience_json || '{}'));
  if (others.some(o => o.date === plan.planned_date && o.audience === aud && o.id !== plan.id)) out.push({ key: 'twice', text: 'Another email goes to the same audience on the same day.' });
  if (ev) { const f = eventFacts(ev); if (f.missing) out.push({ key: 'facts', text: `The Master Schedule is missing ${f.missing.join(', ')} for this event.` }); }
  return out;
}
