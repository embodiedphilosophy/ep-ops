// Ad copy for a launch (Ads PR 2). THE RULE: copy is drafted only from EP's own words for this launch (its emails, its landing page's copy on the
// Course Pages tab, and real testimonials on the Site Testimonials tab), and every copy set records which of those it came from. A set with no
// source stays a [placeholder] and blocks Start. What a model writes is a draft a person edits.
//
// Privacy: the prompt carries only that source text, with links, email addresses and merge tags taken out first. No names, no list data, no
// numbers from the business. A testimonial's author stays here; only the quote is sent.
//
// ANTHROPIC_API_KEY is the production key (planned in the handoff). Without it every set stays a placeholder (the page still works).
// ANTHROPIC_BASE is for tests only: read only when set, it points at the mock in scripts/ops-test/mock.mjs. Not set in production.
import { planRows } from './emailplan';
import { readPlain } from './store';
import { getTestimonials } from '../content';

const MODEL = 'claude-sonnet-5-5';
const base = () => (process.env.ANTHROPIC_BASE || 'https://api.anthropic.com').replace(/\/+$/, '');
export const aiConfigured = () => !!(process.env.ANTHROPIC_API_KEY || '').trim();

export const SLOTS = ['the first launch email', 'the second launch email', 'the landing page', 'a real testimonial', 'the last launch email'];
export const placeholderSet = i => ({ main_text: `[Main text: draft it from ${SLOTS[i] || 'a launch email, the landing page or a testimonial'}]`, headline: '[Headline]',
  source_kind: 'placeholder', source_ref: `Needs a source: ${SLOTS[i] || 'a launch email, the landing page or a testimonial'}`, source_text: '', is_placeholder: true });
// A set is a placeholder while any [bracketed] words are left in it, or it is empty
export const isPlaceholder = (main, head) => !String(main || '').trim() || !String(head || '').trim() || /\[[^\]]*\]/.test(`${main} ${head}`);

// Plain words only: markdown, merge tags, links and email addresses out
export function plain(t) {
  return String(t || '').replace(/\{\{[^}]*\}\}|\{%[\s\S]*?%\}/g, ' ').replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '$1').replace(/https?:\/\/\S+/g, ' ')
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, ' ').replace(/\*\*|\*|__|#+ /g, '').replace(/\s+/g, ' ').trim();
}
const blockText = blocks => (Array.isArray(blocks) ? blocks : []).flatMap(b => b?.type === 'text' ? [b.text] : b?.type === 'member' ? [b.member, b.nonmember] : []).map(plain).filter(Boolean).join(' ');
const real = t => t.length >= 30 && !/\[FILL IN\]|\[Pick the event/i.test(t);
const parse = s => { try { return JSON.parse(s || ''); } catch { return null; } };

// Everything on file that may be a source → [{ kind, ref, text }] (text is what the model may see)
export async function gatherSources({ launch, ev }) {
  const out = [];
  const plan = await planRows({ light: true }).catch(() => []);
  const emails = plan.map(r => r.values).filter(v => v.launch_id === launch.id && v.status !== 'Not needed').sort((a, b) => String(a.planned_date).localeCompare(String(b.planned_date)));
  for (const v of emails) { const text = blockText(parse(v.blocks_json)); if (real(text)) out.push({ kind: 'launch_email', ref: `Email ${v.id} · ${v.step || v.subject}`, text: text.slice(0, 900) }); }
  const keys = ev ? [ev.series, ev.sched_id, ev.id].filter(Boolean).map(k => String(k).toLowerCase()) : [];   // the Course Pages tab is keyed by the series, or the event ID
  if (keys.length) {
    const pages = await readPlain('Course Pages', { light: true }).catch(() => ({ rows: [] }));
    const p = pages.rows.map(r => r.values).find(v => keys.includes(String(v.offering || '').toLowerCase()));
    const text = p ? plain([p.title, p.subtitle, p.summary, p.explore, p.audience].filter(Boolean).join('. ')) : '';
    if (real(text)) out.push({ kind: 'landing_page', ref: `Course page · ${p.title || p.offering}`, text: text.slice(0, 900) });
  }
  // real testimonials: the program's own, then the site-wide ones (program home or all)
  const t = [...new Map([...(ev?.program ? await getTestimonials(String(ev.program).toLowerCase()).catch(() => []) : []), ...await getTestimonials('home').catch(() => [])].map(r => [r.quote, r])).values()];
  for (const r of t.slice(0, 3)) { const text = plain(r.quote); if (text.length >= 20) out.push({ kind: 'testimonial', ref: `Testimonial · ${r.name || 'a student'}`, text: text.slice(0, 500) }); }
  return out;
}

// Which source goes in which of the five places: first email, second email, landing page, a testimonial, last email; any gap is filled from what is
// left over, and a gap with nothing left stays empty (a placeholder).
export function assignSlots(sources) {
  const emails = sources.filter(s => s.kind === 'launch_email'), page = sources.find(s => s.kind === 'landing_page'), tests = sources.filter(s => s.kind === 'testimonial');
  const slots = [emails[0], emails[1], page, tests[0], emails.length > 2 ? emails[emails.length - 1] : null];
  const left = sources.filter(s => !slots.includes(s));
  return slots.map(s => s || left.shift() || null);
}

const SYSTEM = `You write Meta (Facebook and Instagram) ad copy for Embodied Philosophy, a school of contemplative education. You are given sources: EP's own words for one launch. For each source write ONE ad: "main_text" (at most 125 characters, plain warm English) and "headline" (at most 40 characters). Use only the words and facts in that source. Never add a fact, date, price, name, promise or quote that is not in the source. No hashtags, no emoji, no hype. Answer with JSON only: {"sets":[{"id":"…","main_text":"…","headline":"…"}]} with the same ids you were given.`;

// → { sets: Map(id → { main_text, headline }) } or { error } (a plain sentence). Sends only the source text.
export async function draftWithModel(items) {
  if (!aiConfigured()) return { error: 'The drafting key (ANTHROPIC_API_KEY) isn’t set, so the copy is left for a person to write.' };
  if (!items.length) return { sets: new Map() };
  try {
    const res = await fetch(`${base()}/v1/messages`, {
      method: 'POST', signal: AbortSignal.timeout(45000), cache: 'no-store',
      headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY.trim(), 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: MODEL, max_tokens: 1200, system: SYSTEM, messages: [{ role: 'user', content: JSON.stringify({ sources: items.map(({ id, kind, text }) => ({ id, kind, text })) }) }] }),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) return { error: 'The drafting service said no, so the copy is left for a person to write.' };
    const text = (j.content || []).filter(c => c.type === 'text').map(c => c.text).join('');
    const out = parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
    const sets = new Map();
    for (const s of out?.sets || []) if (items.some(i => i.id === s.id) && String(s.main_text || '').trim() && String(s.headline || '').trim()) sets.set(s.id, { main_text: String(s.main_text).trim().slice(0, 300), headline: String(s.headline).trim().slice(0, 60) });
    return { sets };
  } catch { return { error: 'Couldn’t reach the drafting service, so the copy is left for a person to write.' }; }
}

// The five copy sets for a launch → { sets: [5 rows ready to save], note }
export async function draftCopySets({ launch, ev }) {
  const sources = await gatherSources({ launch, ev }), slots = assignSlots(sources);
  const items = slots.map((s, i) => s && { ...s, id: `s${i}` }).filter(Boolean);
  const r = await draftWithModel(items);
  const sets = slots.map((s, i) => {
    const d = s && r.sets?.get(`s${i}`);
    return d ? { ...d, source_kind: s.kind, source_ref: s.ref, source_text: s.text.slice(0, 400), is_placeholder: false } : placeholderSet(i);
  });
  const note = r.error || (!sources.length ? 'No launch emails written yet, no course page and no testimonials on file, so every set is a placeholder. Write the emails, then press “Refresh draft”.' : '');
  return { sets, note, sourceCount: sources.length };
}
