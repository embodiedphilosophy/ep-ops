import { readRange, toObjects } from '../google';
import { addPlain } from './store';

// Support desk for ops: Zendesk stays the mail system underneath; Ichha works here.
// Vercel: ZENDESK_SUBDOMAIN (default embodiedphilosophy), ZENDESK_EMAIL, ZENDESK_API_TOKEN.
// The EP Support KB sheet (KB_SHEET_ID) supplies suggested answers and takes new Draft answers.

export const KB_SHEET = () => process.env.KB_SHEET_ID || '1Fn884BCxEK-m_h7oeV3V1JmEfzaiUGahRWCPyEq-Upc';
const SUB = () => process.env.ZENDESK_SUBDOMAIN || 'embodiedphilosophy';
export const zendeskConfigured = () => !!(process.env.ZENDESK_EMAIL && process.env.ZENDESK_API_TOKEN);
export const zendeskTicketUrl = id => `https://${SUB()}.zendesk.com/agent/tickets/${id}`;
export const kbSheetUrl = () => `https://docs.google.com/spreadsheets/d/${KB_SHEET()}/edit`;

export { canSupport } from './nav';

async function zd(path, { method = 'GET', body } = {}) {
  const auth = Buffer.from(`${process.env.ZENDESK_EMAIL}/token:${process.env.ZENDESK_API_TOKEN}`).toString('base64');
  const base = process.env.ZENDESK_BASE || `https://${SUB()}.zendesk.com`;
  const res = await fetch(`${base}/api/v2${path}`, {
    method, cache: 'no-store',
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`Zendesk ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

// Mail from systems rather than people (the Zendesk research found 1,089 of 1,770 tickets were this)
const AUTOMATED = /paypal|facebook|meta(mail)?|shopify|tiktok|stripe|noreply|no-reply|donotreply|mailer-daemon|notification|payout|uscreen|samcart|kajabi|circle\.so/i;
const PITCH = /\b(guest|podcast pitch|collaborat|sponsor|partnership|seo|backlinks?|guest post|submission)\b/i;
export function kindOf(t, requester) {
  const from = `${requester?.email || ''} ${requester?.name || ''}`;
  if (AUTOMATED.test(from)) return 'automated';
  if (PITCH.test(t.subject || '') && !/^\[Chat/.test(t.subject || '')) return 'pitch';
  return 'person';
}

// Unsolved tickets, newest activity first, with requesters
export async function listQueue() {
  const q = encodeURIComponent('type:ticket status<solved');
  const data = await zd(`/search.json?query=${q}&sort_by=updated_at&sort_order=desc&per_page=100&include=tickets(users)`);
  const users = Object.fromEntries((data.users || []).map(u => [u.id, u]));
  return (data.results || []).map(t => {
    const requester = users[t.requester_id];
    return {
      id: t.id, subject: t.subject || '(no subject)', status: t.status, updated: t.updated_at, created: t.created_at,
      requester: requester ? { name: requester.name, email: requester.email } : null,
      kind: kindOf(t, requester), entry: (/^\[Chat · ([a-z0-9]+)\]/i.exec(t.subject || '') || [])[1] || '',
    };
  });
}

// One ticket with its conversation (public replies and internal notes)
export async function getTicket(id) {
  const [{ ticket, users: tu = [] }, { comments = [], users: cu = [] }] = await Promise.all([
    zd(`/tickets/${id}.json?include=users`),
    zd(`/tickets/${id}/comments.json?include=users&sort_order=asc`),
  ]);
  const users = Object.fromEntries([...tu, ...cu].map(u => [u.id, u]));
  const requester = users[ticket.requester_id];
  return {
    id: ticket.id, subject: ticket.subject || '(no subject)', status: ticket.status, created: ticket.created_at,
    requester: requester ? { name: requester.name, email: requester.email } : null,
    entry: (/^\[Chat · ([a-z0-9]+)\]/i.exec(ticket.subject || '') || [])[1] || '',
    comments: comments.map(c => ({
      id: c.id, public: c.public, at: c.created_at, body: c.plain_body || c.body || '',
      author: users[c.author_id]?.name || 'Unknown', fromCustomer: c.author_id === ticket.requester_id,
    })),
  };
}

// Reply as the signed-in team member (falls back to the API token's user if they have no Zendesk account)
export async function reply(id, { body, status, isPublic = true, authorEmail }) {
  let author_id;
  if (authorEmail) {
    const found = await zd(`/users/search.json?query=${encodeURIComponent(`email:${authorEmail}`)}`).catch(() => null);
    author_id = found?.users?.find(u => u.role !== 'end-user')?.id;
  }
  const ticket = { comment: { body, public: isPublic, ...(author_id ? { author_id } : {}) } };
  if (status) ticket.status = status;
  await zd(`/tickets/${id}.json`, { method: 'PUT', body: { ticket } });
}

export async function setStatus(id, status) {
  await zd(`/tickets/${id}.json`, { method: 'PUT', body: { ticket: { status } } });
}

// ----- Knowledge base -----

export async function loadEntries() {
  const rows = toObjects(await readRange(KB_SHEET(), 'Entries!A1:O500'));
  return rows.filter(r => r.id).map(r => ({
    id: r.id, topic: r.topic, question: r.question, phrasings: r.other_phrasings, answer: r.public_answer,
    notes: r.ether_notes, handoff: r.hand_to_ichha_when, status: r.status, owner: r.owner, open: r.open_question,
  }));
}

const STOP = new Set('a an and are as at be but by can do for from get got have how i if in into is it its me my no not of on or our so that the their them then there they this to was we were what when where which who why will with you your hi hello thanks thank please dear regards best'.split(' '));
const words = s => String(s || '').toLowerCase().replace(/[^a-z0-9ā-ṿ\s]/g, ' ').split(/\s+/).filter(w => w.length > 2 && !STOP.has(w));

// Answers most likely to fit a ticket: the entry Ether named first, then keyword overlap
export function suggest(entries, ticket, n = 3) {
  const usable = entries.filter(e => e.id !== 'h01' && e.answer);
  const text = new Set(words(`${ticket.subject} ${ticket.comments.filter(c => c.fromCustomer).map(c => c.body).join(' ')}`));
  const scored = usable.map(e => {
    const ws = new Set(words(`${e.question} ${e.phrasings} ${e.topic}`));
    let score = 0; ws.forEach(w => { if (text.has(w)) score++; });
    if (ticket.entry && e.id.toLowerCase() === ticket.entry.toLowerCase()) score += 100;
    return { ...e, score };
  });
  return scored.filter(e => e.score > 0).sort((a, b) => b.score - a.score).slice(0, n);
}

// A question with no entry becomes a Draft row for review (through the store, so it lands in the Change Log)
export async function addDraft({ question, answer, topic, ticketId, who }) {
  const today = new Date().toISOString().slice(0, 10);
  return addPlain('Entries', {
    'ID': `n${ticketId || Date.now().toString().slice(-6)}`, 'Topic': topic || '', 'Programs': 'All',
    'Question': question, 'Public answer': answer, 'Public': 'Yes', 'Status': 'Draft', 'Owner': who || '',
    'Last reviewed': today, 'Open question': `Added from ticket #${ticketId || '?'} in ops. Check the wording, ID and topic before it goes Live.`,
  }, { who, sheet: KB_SHEET() });
}

// Ether handoffs with no matching answer, newest first (from the Handoffs tab)
export async function loadGaps(days = 30) {
  const rows = toObjects(await readRange(KB_SHEET(), 'Handoffs!A1:G2000').catch(() => []));
  const since = Date.now() - days * 864e5;
  return rows
    .filter(r => String(r.gap_no_entry).toLowerCase() === 'yes' && String(r.test_run).toLowerCase() !== 'yes')
    .filter(r => { const t = Date.parse(String(r.time_utc).replace(' ', 'T') + 'Z'); return isNaN(t) || t >= since; })
    .reverse();
}
