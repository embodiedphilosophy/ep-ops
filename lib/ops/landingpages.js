// Landing Pages: every /lp/ page on the public website, read live from the site's feed.
// Nothing is stored in ops: a new /lp/ page shows up here on the next read (the feed is cached for 5 minutes).
// The feed is ep-website's /api/landing-pages. LANDING_PAGES_URL overrides it (the test kit points it at the mock).
import { SITE } from '@/lib/siteurl';
import { slugify } from './library';

export const FEED_URL = () => process.env.LANDING_PAGES_URL || `${SITE}/api/landing-pages`;
export const REVALIDATE = 300; // seconds: the feed and the link checks both refresh every 5 minutes

const first = (o, keys) => { for (const k of keys) { const v = k.split('.').reduce((x, p) => x?.[p], o); if (v !== undefined && v !== null && v !== '') return v; } return ''; };
const abs = u => !u ? '' : /^https?:\/\//i.test(u) ? u : `${SITE}${u.startsWith('/') ? '' : '/'}${u}`;
const teacherOf = p => {
  const t = first(p, ['teacher', 'teachers', 'teacherName', 'teacher_name', 'faculty']);
  const names = (Array.isArray(t) ? t : [t]).map(x => typeof x === 'object' ? (x?.name || '') : String(x || '')).map(s => s.trim()).filter(Boolean);
  return names.join(', ');
};

// "Today" and dates as YYYY-MM-DD in New York time, so a date-only startsAt/endsAt means that whole day
const ymd = d => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(d);
const dayOf = v => {
  if (!v) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(v))) return String(v);
  const d = new Date(v);
  return isNaN(d) ? '' : ymd(d);
};

// Upcoming / Running / Ended from startsAt and endsAt; Evergreen when the page has neither.
// A page with only a start date runs for that day; one with only an end date is running until then.
export function stateOf(p, today = ymd(new Date())) {
  const s = dayOf(p.startsAt), e = dayOf(p.endsAt) || s;
  if (!s && !e) return 'evergreen';
  if (s && today < s) return 'upcoming';
  if (e && today > e) return 'ended';
  return 'running';
}

export function shapePage(p) {
  const slug = String(first(p, ['slug']) || '').replace(/^\/?(lp\/)?/, '').replace(/\/$/, '');
  const url = abs(first(p, ['url', 'href', 'path', 'liveUrl', 'live_url'])) || (slug ? `${SITE}/lp/${slug}` : '');
  const page = {
    slug: slug || String(url).split('/').filter(Boolean).pop() || '',
    title: String(first(p, ['title', 'name']) || slug || 'Untitled page'),
    teacher: teacherOf(p),
    url,
    checkoutUrl: abs(first(p, ['checkoutUrl', 'checkout_url', 'checkout', 'checkoutLink', 'checkout_link', 'cta.url'])),
    publishedAt: first(p, ['publishedAt', 'published_at', 'published', 'createdAt', 'created_at']) || '',
    startsAt: first(p, ['startsAt', 'starts_at', 'startDate', 'start_date']) || '',
    endsAt: first(p, ['endsAt', 'ends_at', 'endDate', 'end_date']) || '',
  };
  return { ...page, state: stateOf(page) };
}

// Read the feed. Returns { pages, error }: error is a plain sentence for staff when the feed can't be read.
export async function readLandingPages() {
  let r;
  try { r = await fetch(FEED_URL(), { next: { revalidate: REVALIDATE, tags: ['landing-pages'] }, headers: { accept: 'application/json' } }); }
  catch { return { pages: [], error: 'Couldn’t reach the website to read its landing pages. Try again in a few minutes.' }; }
  if (r.status === 404) return { pages: [], error: 'The website doesn’t list its landing pages yet (its /api/landing-pages feed isn’t live).' };
  if (!r.ok) return { pages: [], error: `The website’s landing page list answered with an error (${r.status}). Try again in a few minutes.` };
  const j = await r.json().catch(() => null);
  const list = Array.isArray(j) ? j : (j?.pages || j?.landingPages || j?.landing_pages || j?.items || j?.data || null);
  if (!Array.isArray(list)) return { pages: [], error: 'The website’s landing page list came back in a shape the dashboard doesn’t recognise.' };
  return { pages: list.filter(p => p && typeof p === 'object').map(shapePage), error: '' };
}

// ---------- Link checks ----------
// A page is healthy when its address answers 200 (following redirects). A checkout link is healthy when it answers
// 2xx after redirects. Results are kept for 5 minutes per server instance so the page stays quick.
const TIMEOUT = 8000;
const cache = (globalThis.__epLinkChecks ||= new Map());

async function probe(url) {
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), TIMEOUT);
  const opts = { redirect: 'follow', cache: 'no-store', signal: ctl.signal, headers: { 'user-agent': 'EP-Ops-LinkCheck/1.0 (+https://ops.embodiedphilosophy.com)', accept: 'text/html,*/*' } };
  try {
    let r = await fetch(url, { ...opts, method: 'HEAD' });
    // Some checkouts refuse HEAD: ask again with a normal GET before calling it broken
    if (r.status === 405 || r.status === 403 || r.status === 501 || r.status === 400) r = await fetch(url, { ...opts, method: 'GET' });
    try { await r.body?.cancel(); } catch {}
    return { status: r.status, finalUrl: r.url || url };
  } catch (e) {
    return { status: 0, error: e?.name === 'AbortError' ? 'took too long to answer' : 'couldn’t be reached' };
  } finally { clearTimeout(t); }
}

export async function checkLink(url, { fresh = false } = {}) {
  if (!url) return null;
  const hit = cache.get(url);
  if (!fresh && hit && Date.now() - hit.at < REVALIDATE * 1000) return hit.result;
  const result = await probe(url);
  cache.set(url, { at: Date.now(), result });
  return result;
}

// Plain-language verdict for one link
export function verdict(res, { exact200 = false } = {}) {
  if (!res) return { ok: null, say: '' };
  if (res.status === 0) return { ok: false, say: `Link ${res.error}` };
  const ok = exact200 ? res.status === 200 : res.status >= 200 && res.status < 300;
  return { ok, say: ok ? 'OK' : res.status === 404 ? 'Page not found (404)' : `Answers ${res.status}` };
}

// Check every page and checkout link, a few at a time
export async function checkAll(pages, { fresh = false, concurrency = 6 } = {}) {
  const urls = [...new Set(pages.flatMap(p => [p.url, p.checkoutUrl]).filter(Boolean))];
  const out = new Map();
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, urls.length) }, async () => {
    while (i < urls.length) { const u = urls[i++]; out.set(u, await checkLink(u, { fresh })); }
  }));
  return out;
}

// The Course Library entry for a landing page: same slug as the offering's id (or its slugified title)
export function libraryMatch(page, offerings) {
  const s = slugify(page.slug);
  if (!s) return null;
  return offerings.find(o => o.offering_id === s || slugify(o.title) === s) || null;
}
