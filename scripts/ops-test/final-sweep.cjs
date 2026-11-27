// EP Ops 2, step 10: the final sweep. Proves the reorganisation is complete. Mock data only. Needs run.sh (source env.sh first).
//   1. Nothing left over: every app/ and lib/ file is imported by something (or is on the short list kept on purpose); no exported helper
//      in app/ops or lib/ops that nothing uses; no CSS class in the ops stylesheets that no code uses; the page list under /ops is exactly the
//      final one (the places, their records, search, login, and the two address-reading redirects).
//   2. Every old address (all of lib/ops/redirects.mjs, with and without a query string) answers with ONE redirect to a page that loads, to a
//      new place, with the query string kept; the website's own link (/ops/landing) included.
//   3. Every role's pages: Today, each place and each tab of each place, and every same-site link on them (one level deep) lands on a
//      page (200) or one redirect, never a 404 and never an old address.
//   4. Links the code writes into emails, digests, the newsletter and pages: none uses an old address.
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const R = path.join(__dirname, '../..'), B = 'http://localhost:3100';
let bad = 0, ok = 0;
const t = (n, c, extra = '') => { if (c) ok++; else { bad++; console.log('FAIL', n, extra); } };
const cookie = who => execFileSync('node', [path.join(__dirname, 'cookie.mjs'), who]).toString().trim();
const DIRECTOR = fs.readFileSync(path.join(__dirname, 'out/cookie.txt'), 'utf8').trim().replace(/^ep_ops=/, '');
const get = (u, ck = DIRECTOR) => fetch(B + u, { redirect: 'manual', headers: { Cookie: `ep_ops=${ck}` } });
const walk = (d, o = []) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) { if (!/node_modules|\.next$|\.git$|[\\/]out$/.test(p)) walk(p, o); } else o.push(p); } return o; };
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const pool = async (items, n, fn) => { const out = []; let i = 0; await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k], k); } })); return out; };

// Kept on purpose: copies of the website's libraries (CLAUDE.md: "libraries shared with the site are copies"). The website's pages use them; here nothing does.
const KEPT_FILES = ['lib/hub/meditation.js', 'lib/member/schedule.js', 'lib/mentee/partners.js', 'lib/mentee/reflectionstore.js'];
// The page list under /ops after the reorganisation. /ops/content shows Publish › Promo emails (app/ops/place.js asks it for that) and
// sends its older ?tab= addresses on; /ops/admin sends ?t= to the right Settings section.
const FINAL_PAGES = ['/ops', '/ops/admin', '/ops/business', '/ops/content', '/ops/login', '/ops/people', '/ops/people/:id', '/ops/programs', '/ops/programs/:id', '/ops/programs/library/:id', '/ops/publish', '/ops/search', '/ops/settings', '/ops/students', '/ops/tasks'];
const NEW_PLACES = /^\/ops(\/(programs|tasks|people|publish|students|business|settings|search|login)(\/.*)?)?$/;

(async () => {
  const { REDIRECTS } = await import(path.join(R, 'lib/ops/redirects.mjs'));
  const OLD = new Set(REDIRECTS.filter(r => !r.has && !r.missing).map(r => r.source.replace(/\/:\w+$/, ''))); // addresses that exist only to redirect
  for (const x of ['/ops/content', '/ops/admin']) OLD.add(x);

  console.log('-- 1a. every file is imported by something');
  {
    const files = [...walk(path.join(R, 'app')), ...walk(path.join(R, 'lib')), path.join(R, 'next.config.mjs')].filter(f => /\.(js|mjs|jsx)$/.test(f)), set = new Set(files);
    const resolve = (from, spec) => { let base; if (spec.startsWith('@/')) base = path.join(R, spec.slice(2)); else if (spec.startsWith('.')) base = path.resolve(path.dirname(from), spec); else return null; for (const c of [base, base + '.js', base + '.mjs', base + '.jsx', base + '/index.js']) if (set.has(c)) return c; return null; };
    const edges = {}, dynamic = [];
    for (const f of files) {
      const s = fs.readFileSync(f, 'utf8'), out = new Set();
      for (const m of s.matchAll(/(?:import|export)\s[^'"`;]*?from\s*['"]([^'"]+)['"]|import\s*['"]([^'"]+)['"]|(?:import|require)\(\s*['"]([^'"]+)['"]\s*\)/g)) { const r = resolve(f, m[1] || m[2] || m[3]); if (r) out.add(r); }
      for (const m of s.matchAll(/import\(\s*`([^`]+)`/g)) dynamic.push(`${path.relative(R, f)}: import(\`${m[1]}\`)`);
      edges[f] = out;
    }
    t('no import(`...${x}`) the graph cannot follow', dynamic.length === 0, dynamic.join(' | '));
    // Next's own entry files: pages, layouts, API routes, icons, robots, loading/error files and next.config
    const roots = files.filter(f => /(^|[\\/])app[\\/](.*[\\/])?(page|layout|route|loading|error|global-error|not-found|template|default|icon|apple-icon|robots|sitemap|opengraph-image)\.(js|mjs)$/.test(path.relative(R, f)) || /next\.config/.test(f));
    const seen = new Set(roots), q = [...roots];
    while (q.length) for (const x of edges[q.pop()] || []) if (!seen.has(x)) { seen.add(x); q.push(x); }
    const orphans = files.filter(f => !seen.has(f)).map(f => path.relative(R, f)).filter(f => !KEPT_FILES.includes(f));
    t('no component, page body or library file that nothing imports', orphans.length === 0, orphans.join(' '));
    t('the kept website copies are still the only ones', KEPT_FILES.every(f => fs.existsSync(path.join(R, f)) && !seen.has(path.join(R, f))), 'one of them is now used or gone: update KEPT_FILES');
  }
  console.log('-- 1b. no exported helper in app/ops or lib/ops that nothing uses');
  {
    const all = [...walk(path.join(R, 'app')), ...walk(path.join(R, 'lib')), ...walk(path.join(R, 'scripts')), path.join(R, 'next.config.mjs')].filter(f => /\.(js|mjs|cjs|jsx|sh)$/.test(f)), src = Object.fromEntries(all.map(f => [f, fs.readFileSync(f, 'utf8')]));
    const dead = [];
    for (const f of all.filter(f => /\.(js|mjs|jsx)$/.test(f) && /[\\/](app[\\/]ops|lib[\\/]ops)[\\/]/.test(f))) {
      const names = new Set();
      for (const m of src[f].matchAll(/^export\s+(?:async\s+)?(?:function\*?|const|let|var|class)\s+([A-Za-z0-9_$]+)/gm)) names.add(m[1]);
      for (const nm of names) { const re = new RegExp('(?<![A-Za-z0-9_$])' + esc(nm) + '(?![A-Za-z0-9_$])'); if (!all.some(g => g !== f && re.test(src[g])) && (src[f].match(new RegExp(re.source, 'g')) || []).length < 2) dead.push(`${path.relative(R, f)} ${nm}`); }
    }
    t('every export in app/ops and lib/ops is used somewhere', dead.length === 0, dead.join(' | '));
  }
  console.log('-- 1c. no CSS class in the dashboard stylesheets that no code uses');
  {
    const js = [...walk(path.join(R, 'app')), ...walk(path.join(R, 'lib')), ...walk(path.join(R, 'public'))].filter(f => /\.(js|mjs|html)$/.test(f)).map(f => fs.readFileSync(f, 'utf8')).join('\n');
    const dead = [];
    for (const css of ['app/ops/ops.css', 'app/ops/social/social.css', 'app/ops/email/email.css', 'app/ops/publish/publish.css', 'app/ops/students/support.css']) {
      const s = fs.readFileSync(path.join(R, css), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
      for (const k of new Set([...s.matchAll(/\.([A-Za-z_][A-Za-z0-9_-]*)/g)].map(m => m[1]))) {
        if (new RegExp('(?<![A-Za-z0-9_-])' + esc(k) + '(?![A-Za-z0-9_-])').test(js)) continue;
        const parts = k.split('-'); // a class built from a prefix and a value, like `s-${status}` or 'k-' + kind
        if (parts.some((_, i) => new RegExp(esc(parts.slice(0, i + 1).join('-') + '-') + '(\\$\\{|[\'"`]\\s*\\+)').test(js))) continue;
        if (k === 'Needsedit') continue; // `.soc-badge.Needsedit`: the status word with its space taken out
        dead.push(`${css}:${k}`);
      }
    }
    t('every class in ops.css, social.css, email.css, publish.css and support.css is used by some code', dead.length === 0, dead.join(' '));
  }
  console.log('-- 1d. the page list under /ops is the final one');
  {
    const pages = walk(path.join(R, 'app/ops')).filter(f => /[\\/]page\.js$/.test(f)).map(f => '/' + path.relative(path.join(R, 'app'), path.dirname(f)).split(path.sep).join('/').replace(/\[(\w+)\]/g, ':$1')).sort();
    t('the pages under /ops are exactly the final ones', JSON.stringify(pages) === JSON.stringify([...FINAL_PAGES].sort()), `got ${pages.join(' ')}`);
    const shadowed = pages.filter(p => REDIRECTS.some(r => !r.has && !r.missing && r.source === p));
    t('no page sits behind an address that always redirects', shadowed.length === 0, shadowed.join(' '));
  }

  console.log('-- 2. every old address: one redirect, query kept, to a page that loads');
  {
    const sample = v => /\(\?<|[.+*\\]/.test(v) ? 'x1' : v;
    let n = 0;
    for (const r of REDIRECTS) {
      const q = new URLSearchParams([['zz', '1']]);
      for (const h of r.has || []) if (h.type === 'query') q.set(h.key, sample(h.value || 'x1'));
      const src = r.source.replace(':id', 'abc'), u = `${src}?${q}`;
      const res = await get(u), loc = res.headers.get('location') || '', g = loc ? new URL(loc, B) : null;
      t(`${u} answers with one redirect`, res.status === 307 && !!g, `${res.status} ${loc}`);
      if (!g) continue; n++;
      t(`${u} goes to a new place`, NEW_PLACES.test(decodeURIComponent(g.pathname)), g.pathname);
      t(`${u} keeps its query string`, g.searchParams.get('zz') === '1', loc);
      for (const [k, v] of q) t(`${u} keeps ?${k}=`, g.searchParams.get(k) === v || k === 'tab' || k === 'event', loc);
      if (!r.source.includes(':id')) { const fin = await get(g.pathname + g.search); t(`${u} lands on a page that loads (no second redirect)`, fin.status === 200, `${fin.status} ${fin.headers.get('location') || ''}`); }
    }
    t('every old address was exercised', n >= REDIRECTS.length, `${n} of ${REDIRECTS.length}`);
    // the addresses read by a page instead of the table
    for (const [u, want] of [['/ops/admin', '/ops/tasks?show=unowned'], ['/ops/admin?t=links', '/ops/settings'], ['/ops/content', '/ops/publish'], ['/ops/content?tab=social&s=review', '/ops/publish?view=review'], ['/ops/content?tab=website', '/ops/settings'], ['/ops/content?tab=zzz', '/ops/publish'], ['/ops/social/sources', '/ops/publish?view=library&s=quotes']]) {
      const res = await get(u), loc = res.headers.get('location') || '';
      t(`${u} redirects once to ${want}`, res.status === 307 && (loc === want || loc.startsWith(want.split('?')[0] + (want.includes('?') ? '?' : ''))), `${res.status} ${loc}`);
    }
    // the one the website links to
    const lp = await get('/ops/landing'), lloc = lp.headers.get('location') || '';
    t('the website\'s link /ops/landing redirects once to Programs › Landing pages', lp.status === 307 && lloc.includes('/ops/programs') && lloc.includes('view=landing'), lloc);
    const lf = await get('/ops/programs?view=landing'); t('and that page loads', lf.status === 200, String(lf.status));
    // an old address is also one redirect for someone who is not a director
    for (const [who, u] of [['ichha@example.com', '/ops/support'], ['floss@example.com', '/ops/events?range=3m'], ['abha@example.com', '/ops/events']]) { const res = await get(u, cookie(who)); t(`${u} is one redirect for ${who}`, res.status === 307 && NEW_PLACES.test(new URL(res.headers.get('location'), B).pathname), `${res.status} ${res.headers.get('location')}`); }
    // an address that never existed stays a 404 (not an old page)
    t('an unknown /ops address is a 404', (await get('/ops/social/zzz')).status === 404);
  }

  console.log('-- 3. every role: Today, each place and tab, and every link on them');
  {
    const links = html => [...new Set([...html.matchAll(/<a\b[^>]*?\bhref="([^"]*)"/g)].map(m => m[1].replace(/&amp;/g, '&').replace(/&#x27;/g, "'").replace(/&quot;/g, '"')))]
      .filter(h => h.startsWith('/') && !h.startsWith('//') && !/^\/(api|_next|brand|icon|apple-icon|kalighat|robots)/.test(h) && !/\.(png|jpe?g|svg|css|js|ico|woff2?)(\?|$)/.test(h));
    const places = h => [...h.matchAll(/class="ops-nav[^"]*"[^>]*>([\s\S]*?)<\/nav>/g)].flatMap(m => [...m[1].matchAll(/href="(\/ops[^"]*)"/g)].map(x => x[1]));
    const roles = [['director (Jacob)', DIRECTOR], ['Floss', cookie('floss@example.com')], ['Irene', cookie('irene@example.com')], ['Ichha (support)', cookie('ichha@example.com')], ['Carolyn (social)', cookie('carolyn@example.com')], ['Stephanie (payroll)', cookie('stephanie@example.com')], ['a teacher', cookie('abha@example.com')]];
    let total = 0; const bounces = [];
    for (const [name, ck] of roles) {
      const pages = new Map(); // address -> html
      const load = async u => { if (pages.has(u)) return; const r = await get(u, ck); const loc = r.headers.get('location') || ''; if (r.status === 200) pages.set(u, await r.text()); else { pages.set(u, ''); t(`${name}: ${u} opens`, r.status === 307 && /^\/(teach|ops)/.test(new URL(loc, B).pathname), `${r.status} ${loc}`); } };
      await load('/ops'); await load('/ops/programs'); // a teacher still to onboard is sent to /teach from Today, so also start from Programs
      const nav = places(pages.get('/ops/programs') || pages.get('/ops') || '');
      t(`${name}: sees the sidebar`, nav.length >= 2, nav.join(' '));
      for (const place of nav) { await load(place); for (const m of (pages.get(place) || '').matchAll(/<nav[^>]*aria-label="[^"]* views"[^>]*>([\s\S]*?)<\/nav>/g)) for (const v of links(m[1])) if (v.startsWith('/ops')) await load(v); }
      const todo = new Map(); // link -> first page it was seen on
      for (const [u, html] of pages) for (const l of links(html)) if (!todo.has(l)) todo.set(l, u);
      const results = await pool([...todo], 6, async ([l, from]) => {
        let res = await get(l, ck), hops = 0, final = l;
        while (res.status >= 300 && res.status < 400 && hops < 3) { const to = new URL(res.headers.get('location'), B); final = to.pathname + to.search; res = await get(final, ck); hops++; }
        return { l, from, status: res.status, hops, final };
      });
      total += results.length;
      for (const { l, from, status, hops, final } of results) {
        const p = l.split(/[?#]/)[0];
        t(`${name}: ${l} (on ${from}) lands on a page`, status === 200, `${status} after ${hops}`);
        t(`${name}: ${l} takes at most one redirect`, hops <= 1, `${hops} hops`);
        t(`${name}: ${l} is not an old address`, !OLD.has(p) && !/^\/ops\/content/.test(l), l);
        if (hops === 1 && /^\/ops\/?$/.test(final) && l !== '/ops') bounces.push(`${name}: ${l}`);
      }
      console.log(`   ${name}: ${pages.size} pages read, ${results.length} links checked`);
    }
    console.log(`   ${total} links in all`);
    // the Sources page (Quotes & captions) is reachable by everyone who sees Publish; the Library's director tables are not an error for anyone else
    for (const [who, ck] of [['director', DIRECTOR], ['Floss', cookie('floss@example.com')], ['Carolyn', cookie('carolyn@example.com')]]) {
      const q = await get('/ops/publish?view=library&s=quotes', ck), qh = q.status === 200 ? await q.text() : '';
      t(`${who}: Library › Quotes & captions opens the quotes (not the archive folders)`, q.status === 200 && /<h1>Sources/.test(qh) && /Quotes/.test(qh) && !/Archive folders/.test(qh), String(q.status));
      const c = await get('/ops/publish?view=library&s=captions', ck); t(`${who}: ...and the captions`, c.status === 200 && /<h1>Sources/.test(await c.text()), String(c.status));
      for (const s of ['sources', 'categories']) { const r = await get(`/ops/publish?view=library&s=${s}`, ck), h = r.status === 200 ? await r.text() : ''; t(`${who}: ?s=${s} is ${who === 'director' ? 'the director table' : 'the Library (no error)'}`, r.status === 200 && (who === 'director' ? /Archive folders|Image categories/.test(h) : /ops-soc-tabs|Upload images|Art/.test(h) && !/Archive folders/.test(h)), String(r.status)); }
    }
    if (bounces.length) console.log('   note (not a failure): a link that sends the person back to Today because their role may not open it:', [...new Set(bounces)].slice(0, 12).join(' | '));
  }

  console.log('-- 4. links the code writes into emails, digests, the newsletter and pages');
  {
    const files = [...walk(path.join(R, 'lib')), ...walk(path.join(R, 'app'))].filter(f => /\.(js|mjs)$/.test(f) && !/redirects\.mjs$/.test(f));
    const stale = [], written = new Set();
    for (const f of files) fs.readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
      for (const m of line.matchAll(/(?<![\w/.])(?<!api)(\/ops(?:\/[a-z0-9-]+)*)(\?[^\s'"`)\\<]*)?/g)) {
        const before = line.slice(0, m.index); if (/^\s*(\/\/|\*|\/\*)/.test(line) || /\s\/\/\s/.test(before)) continue; // a comment, not a link
        if (OLD.has(m[1])) stale.push(`${path.relative(R, f)}:${i + 1} ${m[0]}`);
        else written.add((m[1] + (m[2] || '')).replace(/\$\{[^}]*\}/g, 'x1').replace(/[&?]$/, ''));
      }
    });
    t('no link written by the code uses an old address (emails, digests, newsletter, support and pod mail, pages)', stale.length === 0, stale.join(' | '));
    let n = 0; for (const u of [...written].sort()) { if (/^\/ops(\/login)?$/.test(u)) continue; const res = await get(u), loc = res.headers.get('location') || ''; n++; t(`${u} (written by the code) answers 200 or one redirect to a page that loads`, res.status === 200 || (res.status === 307 && (await get(new URL(loc, B).pathname + new URL(loc, B).search)).status === 200), `${res.status} ${loc}`); }
    console.log(`   ${n} written addresses followed`);
  }

  console.log(`\n${ok} passed, ${bad} failed`); process.exit(bad ? 1 : 0);
})();
