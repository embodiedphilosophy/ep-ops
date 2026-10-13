import { circleConfigured, circleGet, circleList } from '../circle';

// What the Course Library reads from Circle (read only, server side only; the Admin key never reaches a browser).
// Circle's field names are not confirmed (see docs/circle-api-checks.md), so every field is looked up under the
// names it might have, and anything Circle doesn't give is left blank for staff to fill in by hand.
// Nothing here ever writes to Circle.

const first = (o, keys) => { for (const k of keys) { const v = k.split('.').reduce((x, p) => x?.[p], o); if (v !== undefined && v !== null && v !== '') return v; } return ''; };
const money = (amount, currency = 'USD') => {
  const n = Number(amount);
  if (!Number.isFinite(n)) return '';
  const whole = n > 1000 && Number.isInteger(n) ? n / 100 : n; // some APIs give cents
  try { return new Intl.NumberFormat('en-US', { style: 'currency', currency: String(currency || 'USD').toUpperCase(), maximumFractionDigits: whole % 1 ? 2 : 0 }).format(whole); }
  catch { return `$${whole}`; }
};
const EVERY = { month: 'month', monthly: 'month', year: 'year', yearly: 'year', annual: 'year', week: 'week', weekly: 'week', one_time: '', onetime: '', once: '' };

// "$49 / month", "$495", or "" when Circle gives no price
export function priceLabel(paywall) {
  const prices = first(paywall, ['prices', 'paywall_prices', 'plans']);
  const p = Array.isArray(prices) && prices.length ? prices[0] : paywall;
  const amount = first(p, ['amount', 'price', 'unit_amount', 'amount_cents', 'price_cents']);
  if (amount === '') return '';
  const interval = String(first(p, ['interval', 'billing_interval', 'billing_period', 'recurring_interval', 'period']) || '').toLowerCase();
  const every = EVERY[interval] ?? interval;
  return money(amount, first(p, ['currency', 'currency_code'])) + (every ? ` / ${every}` : '');
}

const publishedOf = o => {
  const s = String(first(o, ['status', 'state']) || '').toLowerCase();
  if (s) return /publish|live|active|public/.test(s) && !/unpub/.test(s) ? 'published' : 'draft';
  const flag = first(o, ['is_published', 'published']);
  if (flag !== '') return flag === true || flag === 'true' ? 'published' : 'draft';
  if (first(o, ['is_hidden', 'hidden']) === true) return 'draft';
  return 'published'; // Circle gave no sign either way: treat as live, staff see the status on the card
};

export function shapeCourse(o) {
  return {
    id: String(o.id),
    title: String(first(o, ['name', 'title']) || `Course ${o.id}`),
    status: publishedOf(o),
    cover_url: String(first(o, ['cover_image_url', 'cover_image', 'thumbnail_url', 'image_url', 'cover.url', 'banner_url']) || ''),
    url: String(first(o, ['url', 'space_url', 'public_url']) || ''),
    slug: String(o.slug || ''),
    paywall_ids: [...(Array.isArray(o.paywall_ids) ? o.paywall_ids : []), ...(Array.isArray(o.paywalls) ? o.paywalls.map(p => p?.id ?? p) : [])].map(String),
  };
}
export function shapePaywall(o) {
  return {
    id: String(o.id),
    title: String(first(o, ['name', 'title', 'display_name']) || `Paywall ${o.id}`),
    price_label: priceLabel(o),
    checkout_url: String(first(o, ['checkout_url', 'checkout_link', 'purchase_url', 'url', 'public_url']) || ''),
    space_ids: [...(Array.isArray(o.space_ids) ? o.space_ids : []), ...(Array.isArray(o.spaces) ? o.spaces.map(s => s?.id ?? s) : [])].map(String),
    access_group_ids: [...(Array.isArray(o.access_group_ids) ? o.access_group_ids : []), ...(Array.isArray(o.access_groups) ? o.access_groups.map(s => s?.id ?? s) : [])].map(String),
    active: first(o, ['active', 'is_active', 'enabled']) !== false,
  };
}

// Courses are spaces of type "course". Paywalls come from /paywalls; if Circle doesn't offer that endpoint
// the list is empty and the Course Library asks staff for price and checkout link instead.
export async function readCircle() {
  if (!circleConfigured()) return { configured: false, courses: [], paywalls: [], notes: ['CIRCLE_API_TOKEN is not set on this deployment.'] };
  const notes = [];
  let courses = [];
  try {
    const spaces = await circleList('/spaces');
    courses = spaces.filter(s => /course/i.test(String(s.space_type || s.type || s.kind || ''))).map(shapeCourse);
    if (!courses.length && spaces.length) notes.push('Circle returned spaces but none are marked as courses.');
  } catch (e) { notes.push(`Couldn’t read Circle spaces: ${e.message}`); }
  let paywalls = [];
  try { paywalls = (await circleList('/paywalls')).map(shapePaywall); }
  catch (e) { notes.push(e.status === 404 ? 'Circle has no paywalls endpoint for this key: prices and checkout links are entered by hand.' : `Couldn’t read Circle paywalls: ${e.message}`); }
  return { configured: true, courses, paywalls, notes };
}

// Which paywall belongs to a course: its own list of paywalls, or a paywall that lists the course's space.
export function paywallFor(course, paywalls) {
  return paywalls.find(p => course.paywall_ids.includes(p.id)) || paywalls.find(p => p.space_ids.includes(course.id)) || null;
}

// ---- The checks from the handoff: read-only probes, nothing stored, no values returned except the shape ----
const keysOf = v => { const o = Array.isArray(v) ? v[0] : v?.records?.[0] || v?.data?.[0] || v; return o && typeof o === 'object' ? Object.keys(o).sort() : []; };
const countOf = v => Array.isArray(v) ? v.length : (v?.records || v?.data || []).length;
async function probe(label, path) {
  try { const r = await circleGet(path); return { label, path, ok: true, status: 200, count: countOf(r), fields: keysOf(r), sample: r }; }
  catch (e) { return { label, path, ok: false, status: e.status || 0, error: String(e.message).replace(/Bearer\s+\S+/g, '').slice(0, 120) }; }
}
export async function circleChecks() {
  if (!circleConfigured()) return { configured: false };
  const out = {};
  const spaces = await probe('spaces', '/spaces?per_page=100');
  const courses = spaces.ok ? (spaces.sample.records || spaces.sample.data || spaces.sample || []).filter(s => /course/i.test(String(s.space_type || s.type || ''))) : [];
  out.courses = { ...spaces, sample: undefined, courseCount: courses.length,
    courseSample: courses.slice(0, 5).map(c => ({ id: c.id, title: first(c, ['name', 'title']), status: publishedOf(c), hasCover: !!shapeCourse(c).cover_url, spaceType: c.space_type || c.type })) };
  const paywalls = await probe('paywalls', '/paywalls?per_page=100');
  const pw = paywalls.ok ? (paywalls.sample.records || paywalls.sample.data || paywalls.sample || []) : [];
  out.paywalls = { ...paywalls, sample: undefined,
    shaped: pw.slice(0, 8).map(p => { const s = shapePaywall(p); return { id: s.id, title: s.title, price_label: s.price_label, hasCheckoutUrl: !!s.checkout_url, spaceIds: s.space_ids.length, accessGroupIds: s.access_group_ids.length }; }) };
  for (const [label, path] of [['paywall_prices', '/paywall_prices?per_page=1'], ['access_groups', '/access_groups?per_page=1'], ['webhooks', '/webhooks?per_page=1'], ['sso', '/sso_settings'], ['community_member_access_groups', '/access_groups?per_page=1']]) {
    const r = await probe(label, path); out[label] = { ...r, sample: undefined };
  }
  return { configured: true, ...out };
}
