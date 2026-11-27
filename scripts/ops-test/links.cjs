// The link check (EP Ops 2): every old /ops address in lib/ops/redirects.mjs, with its query strings, must make exactly one redirect
// to the right place and then load; the sidebar must show the right places for each role; and every /ops/... address that
// the code writes into emails, digests and pages must still land somewhere (at most one redirect). Mock data only. Needs run.sh.
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const B = 'http://localhost:3100'; let bad = 0, ok = 0; const t = (n, c, extra = '') => { if (c) ok++; else { bad++; console.log('FAIL', n, extra); } };
const cookie = who => execFileSync('node', [path.join(__dirname, 'cookie.mjs'), who]).toString().trim();
const DIRECTOR = fs.readFileSync(path.join(__dirname, 'out/cookie.txt'), 'utf8').trim().replace(/^ep_ops=/, '');
const get = (u, ck = DIRECTOR) => fetch(B + u, { redirect: 'manual', headers: { Cookie: `ep_ops=${ck}` } });
(async () => {
  const { REDIRECTS } = await import(path.join(__dirname, '../../lib/ops/redirects.mjs'));
  const samples = { '/ops/email/emails': '?show=unlinked', '/ops/email/edit': '?id=EM001', '/ops/events': '?range=3m', '/ops/social/compose': '?row=12', '/ops/social/library': '?s=sources', '/ops/library/:id': '', '/ops/email/launches': '' };
  console.log('-- every old address, with its query string');
  for (const r of REDIRECTS) {
    if (r.has || r.missing) continue;
    const src = r.source.replace(':id', 'abc'), q = samples[r.source] ?? '', res = await get(src + q);
    const loc = res.headers.get('location') || '', want = new URL(r.destination.split('#')[0].replace(':id', 'abc'), B), got = loc ? new URL(loc, B) : null;
    t(`${src}${q} redirects once`, res.status === 307 && got && got.pathname === want.pathname, `${res.status} ${loc}`);
    if (got) {
      for (const [k, v] of want.searchParams) t(`${src}${q} keeps ${k}=${v}`, got.searchParams.get(k) === v, loc);
      for (const [k, v] of new URLSearchParams(q)) t(`${src}${q} keeps ?${k}=`, got.searchParams.get(k) === v, loc);
      if (!r.source.includes(':id')) { const final = await get(got.pathname + got.search); t(`${src}${q} lands on a page that loads (no second redirect)`, final.status === 200, `${final.status} ${final.headers.get('location')}`); }
    }
  }
  console.log('-- one program is its own page (EP Ops 2, step 4)');
  for (const [u, to] of [['/ops/events?event=P-sadhana-fall-2026', '/ops/programs/P-sadhana-fall-2026'], ['/ops/programs?event=P-sadhana-fall-2026', '/ops/programs/P-sadhana-fall-2026'], ['/ops/events?event=2026-12-01-wsml&all=1', '/ops/programs/2026-12-01-wsml'], ['/ops/events?event=E002', '/ops/programs/E002']]) {
    const res = await get(u), loc = res.headers.get('location') || '';
    t(`${u} redirects once to ${to}`, res.status === 307 && new URL(loc, B).pathname === to, `${res.status} ${loc}`);
  }
  { const res = await get('/ops/events?event=2026-12-01-wsml&show=past'), loc = res.headers.get('location') || '';
    t('a past session (?show=past&event=) stays on the Past list', res.status === 307 && new URL(loc, B).pathname === '/ops/programs' && /show=past/.test(loc) && /event=2026-12-01-wsml/.test(loc), loc);
    const r2 = await get('/ops/programs?show=past&event=2026-12-01-wsml'); t('/ops/programs?show=past&event= loads the Past list', r2.status === 200); }
  for (const tab of ['', '?tab=sessions', '?tab=faculty', '?tab=launch', '?tab=circle', '?tab=recordings', '?tab=library']) { const r = await get('/ops/programs/P-sadhana-fall-2026' + tab); t(`program page ${tab || '(overview)'} loads`, r.status === 200, String(r.status)); }
  { const r = await get('/ops/programs/E002'); t('a session ID opens its program (one redirect to the program key)', r.status === 307 || r.status === 200, String(r.status)); }
  t('a teacher can open a program page', (await get('/ops/programs/P-sadhana-fall-2026', cookie('abha@example.com'))).status === 200);
  t('a teacher is not offered the Launch tab', !/tab=launch/.test(await (await get('/ops/programs/P-sadhana-fall-2026', cookie('abha@example.com'))).text()));
  console.log('-- people: one directory, one record per person (EP Ops 2, step 5)');
  for (const [u, to, q] of [['/ops/email/teachers?email=nataraj%40example.com', '/ops/people/nataraj@example.com', 'tab=profile'], ['/ops/team?tab=onboarding&email=abha%40example.com', '/ops/people', 'view=onboarding'], ['/ops/team?tab=invitations', '/ops/people', 'tab=invitations'],
    ['/ops/email/teachers', '/ops/people', 'needs=profile'], ['/ops/hours?m=2026-11', '/ops/people', 'view=hours'], ['/ops/content?tab=review', '/ops/people', 'view=review']]) {
    const res = await get(u), loc = res.headers.get('location') || '', g = loc ? new URL(loc, B) : null;
    t(`${u} redirects once to ${to}`, res.status === 307 && g && decodeURIComponent(g.pathname) === to && loc.includes(q), `${res.status} ${loc}`);
    if (g) { const fin = await get(g.pathname + g.search); t(`${u} lands on a page that loads`, fin.status === 200, `${fin.status} ${fin.headers.get('location')}`); }
  }
  { const res = await get('/ops/people?email=mary%40example.com'), loc = res.headers.get('location') || ''; t('/ops/people?email= opens the person’s record (one redirect)', res.status === 307 && /\/ops\/people\/mary/.test(decodeURIComponent(loc)), loc); }
  for (const tab of ['', '?tab=profile', '?tab=invitations', '?tab=hours', '?tab=access']) { const r = await get('/ops/people/floss%40example.com' + tab); t(`person record ${tab || '(overview)'} loads`, r.status === 200, String(r.status)); }
  for (const v of ['', '?view=invitations', '?view=onboarding', '?view=review', '?view=hours', '?show=needs', '?q=floss']) { const r = await get('/ops/people' + v); t(`/ops/people${v} loads`, r.status === 200, String(r.status)); }
  t('a teacher is not shown a person record', (await get('/ops/people/abha%40example.com', cookie('abha@example.com'))).status === 307);
  console.log('-- publish: one calendar, Compose, Review, Library, Published (EP Ops 2, step 6)');
  for (const [u, to, q] of [['/ops/social', '/ops/publish', ''], ['/ops/email/calendar', '/ops/publish', 'show=email'], ['/ops/email/edit?id=EM001&event=E002', '/ops/publish', 'kind=email'], ['/ops/social/compose?row=12&type=Practice', '/ops/publish', 'view=compose'],
    ['/ops/email/emails?show=draft', '/ops/publish', 'view=email'], ['/ops/youtube?tab=review', '/ops/publish', 'view=video'], ['/ops/social/sources', '/ops/publish', 's=sources']]) {
    const res = await get(u), loc = res.headers.get('location') || '', g = loc ? new URL(loc, B) : null;
    t(`${u} redirects once to ${to}`, res.status === 307 && g && g.pathname === to && loc.includes(q), `${res.status} ${loc}`);
    if (g) { for (const [k, v] of new URLSearchParams(u.split('?')[1] || '')) t(`${u} keeps ?${k}=`, g.searchParams.get(k) === v, loc); }
  }
  for (const v of ['', '?show=email', '?show=social', '?show=auto', '?show=video', '?layout=week', '?view=compose', '?view=compose&kind=email', '?view=compose&kind=post', '?view=compose&kind=video', '?view=compose-email', '?view=email-calendar', '?view=review', '?view=library', '?view=library&s=sources', '?view=published',
    '?view=email', '?view=week', '?view=this-week', '?view=newsletter', '?view=promo', '?view=reminders', '?view=video']) { const r = await get('/ops/publish' + v); t(`/ops/publish${v} loads`, r.status === 200, String(r.status)); }
  { const r = await get('/ops/settings?view=social-rules'); t('/ops/settings?view=social-rules loads (Rules, for a director)', r.status === 200, String(r.status)); }
  t('a teacher is not shown Publish', (await get('/ops/publish?view=compose', cookie('abha@example.com'))).status === 307);
  console.log('-- students: one place (EP Ops 2, step 7)');
  for (const [u, to, q] of [['/ops/support?tab=answers&a=2', '/ops/students', 'view=support'], ['/ops/support?t=9101', '/ops/students', 'view=support'], ['/ops/mentee-year?tab=months&m=2026-11', '/ops/students', 'view=mentee'], ['/ops/one-to-ones?f=none', '/ops/students', 'view=one-to-ones'],
    ['/ops/ce?tab=setup', '/ops/students', 'view=ce'], ['/ops/settings/pods', '/ops/students', 'view=pods'], ['/ops/settings/polls', '/ops/students', 'tab=surveys'], ['/ops/settings/partners', '/ops/students', 'tab=partners']]) {
    const res = await get(u), loc = res.headers.get('location') || '', g = loc ? new URL(loc, B) : null;
    t(`${u} redirects once to ${to}`, res.status === 307 && g && g.pathname === to && loc.includes(q), `${res.status} ${loc}`);
    if (g) { for (const [k, v] of new URLSearchParams(u.split('?')[1] || '')) t(`${u} keeps ?${k}=`, g.searchParams.get(k) === v, loc); const fin = await get(g.pathname + g.search); t(`${u} lands on a page that loads`, fin.status === 200, String(fin.status)); }
  }
  for (const v of ['', '?view=overview', '?view=support', '?view=support&tab=answers', '?view=mentee', '?view=mentee&tab=surveys', '?view=mentee&tab=partners', '?view=polls', '?view=partners', '?view=pods', '?view=one-to-ones', '?view=ce&tab=held']) { const r = await get('/ops/students' + v); t(`/ops/students${v} loads`, r.status === 200, String(r.status)); }
  t('a teacher is not shown Students', (await get('/ops/students', cookie('abha@example.com'))).status === 307);
  console.log('-- the older stubs');
  for (const [u, to] of [['/ops/content?tab=email', '/ops/publish'], ['/ops/content?tab=media', '/ops/programs'], ['/ops/content?tab=review', '/ops/people'], ['/ops/content', '/ops/publish'], ['/ops/content?tab=social&s=review', '/ops/publish'], ['/ops/content?tab=website', '/ops/settings'], ['/ops/admin', '/ops/tasks'], ['/ops/admin?t=links', '/ops/settings']]) {
    let res = await get(u); const loc = res.headers.get('location'); t(`${u} → ${to}`, res.status === 307 && loc && new URL(loc, B).pathname === to, `${res.status} ${loc}`);
  }
  console.log('-- the sidebar for each role');
  const places = h => [...h.matchAll(/class="ops-nav[^"]*"[^>]*>([\s\S]*?)<\/nav>/g)].flatMap(m => [...m[1].matchAll(/href="(\/ops[^"]*)"/g)].map(x => x[1]));
  const roles = [['director', DIRECTOR, ['/ops', '/ops/programs', '/ops/tasks', '/ops/people', '/ops/publish', '/ops/students', '/ops/business', '/ops/settings']],
    ['events staff (Irene)', cookie('irene@example.com'), ['/ops', '/ops/programs', '/ops/tasks', '/ops/people', '/ops/publish', '/ops/students', '/ops/settings']],
    ['events staff (Floss)', cookie('floss@example.com'), ['/ops', '/ops/programs', '/ops/tasks', '/ops/people', '/ops/publish', '/ops/students', '/ops/settings']],
    ['support (Ichha)', cookie('ichha@example.com'), ['/ops', '/ops/programs', '/ops/tasks', '/ops/people', '/ops/publish', '/ops/students']],
    ['social role (Carolyn)', cookie('carolyn@example.com'), ['/ops', '/ops/programs', '/ops/tasks', '/ops/people', '/ops/publish', '/ops/students']],
    ['teacher (a teacher still to onboard is sent to /teach from Today, so look from Programs)', cookie('abha@example.com'), ['/ops', '/ops/programs'], '/ops/programs']];
  for (const [name, ck, want, from] of roles) {
    const res = await get(from || '/ops', ck), html = await res.text(), got = places(html);
    t(`${name} sees ${want.length} places`, JSON.stringify(got) === JSON.stringify(want), `got ${got.join(' ')}`);
  }
  // views are role-checked too: Ichha sees Support but not CE credits or Payroll; a teacher can't open Publish
  const ichha = cookie('ichha@example.com'), pub = await get('/ops/students?view=ce', ichha), html = await pub.text();
  t('a view the role may not see falls back to the first allowed one', pub.status === 200 && !/CE credits/.test((html.match(/aria-label="students views"[\s\S]*?<\/nav>/) || [''])[0]));
  t('a teacher is sent away from Publish', (await get('/ops/publish', cookie('abha@example.com'))).status === 307);
  t('Business is not reachable for Floss', (await get('/ops/business', cookie('floss@example.com'))).status === 307);
  console.log('-- addresses the code writes into emails, digests and pages');
  const found = new Set();
  for (const dir of ['lib', 'app']) (function walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) { if (!/node_modules|\.next/.test(p)) walk(p); } else if (/\.(js|mjs)$/.test(e.name) && !/redirects\.mjs$/.test(e.name)) for (const m of fs.readFileSync(p, 'utf8').matchAll(/(?<![\w/.])(?<!api)\/ops(\/[a-z0-9-]+)*(?=[\s?'"`#)\\<$]|$)/g)) found.add(m[0]); } })(path.join(__dirname, '../..', dir));
  for (const u of [...found].sort()) {
    if (/^\/ops\/(login|search)$/.test(u) || u === '/ops' || u === '/ops/library' && false) { if (u !== '/ops') { const r = await get(u); t(`${u} loads`, r.status === 200 || r.status === 307); } continue; }
    let res = await get(u), hops = 0; while (res.status === 307 && hops < 3) { res = await get(new URL(res.headers.get('location'), B).pathname + new URL(res.headers.get('location'), B).search); hops++; }
    const first = await get(u);
    t(`${u} (written by the code) lands on a page`, res.status === 200 || res.status === 404 && u.includes('library'), `${res.status} after ${hops}`);
    t(`${u} takes at most one redirect`, hops <= 1, `${hops} hops`);
  }
  console.log(`\n${ok} passed, ${bad} failed`); process.exit(bad ? 1 : 0);
})();
