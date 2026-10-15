// Faculty invitations → signed agreement → teacher on the sessions → Finance → To pay; teacher module editing;
// starting a program from an earlier one; search. Writes go to the mock (out/mock.log); nothing is emailed
// (RESEND_API_KEY is unset, so invitations show their link to copy).
const { chromium } = require('./pw.cjs');
const { execSync } = require('child_process');
const fs = require('fs');
const cookie = fs.readFileSync(__dirname + '/out/cookie.txt', 'utf8').trim();
const BASE = 'http://localhost:3100';
const ok = (c, m) => { console.log(c ? 'PASS' : 'FAIL', m); if (!c) process.exitCode = 1; };
const call = (p, path, body) => p.evaluate(async ([u, b]) => { const r = await fetch(u, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) }); return { status: r.status, ...(await r.json().catch(() => ({}))) }; }, [path, body]);
(async () => {
  const b = await chromium.launch();
  const staff = await b.newContext({ viewport: { width: 1366, height: 900 } });
  await staff.addCookies([{ name: 'ep_ops', value: cookie, domain: 'localhost', path: '/' }]);
  const p = await staff.newPage();
  p.on('dialog', d => d.accept());
  p.on('pageerror', e => console.log('PAGE ERROR', e.message));

  // 0. No agreement yet: the form says where to add one
  await p.goto(`${BASE}/ops/team?tab=invitations`, { waitUntil: 'networkidle' });
  ok(/Settings → Contracts/.test(await p.locator('main.ops').innerText()), 'asks for a contract first');
  // 1. Add the standard agreement in Settings → Contracts
  ok((await call(p, '/api/ops/site', { tab: 'contracts', create: true })).ok, 'Contract Templates tab made');
  ok((await call(p, '/api/ops/site', { tab: 'contracts', changes: { name: 'Standard teaching agreement', kind: 'Course', active: 'TRUE',
    body: 'Teaching agreement\n\nBetween Embodied Philosophy and {{teacher_name}} ({{teacher_email}}).\nOffering: {{offering}}, {{sessions}} session(s): {{dates}}.\nFee: {{fee}}.\n\n{{terms}}\n\nSigned {{today}}. For EP: {{director}}.' } })).ok, 'agreement added');

  // 2. Invite through the form (SS season), preview, send
  await p.goto(`${BASE}/ops/team?tab=invitations`, { waitUntil: 'networkidle' });
  await p.fill('#iv-name', 'Tova Olsson');
  await p.fill('#iv-email', 'tova@example.com');
  await p.selectOption('#iv-kind', 'Sādhana School');
  const opt = await p.locator('#iv-off option', { hasText: 'Heart of Recognition' }).first().getAttribute('value');
  await p.selectOption('#iv-off', opt);
  await p.fill('#iv-fee', '300');
  await p.fill('#iv-terms', 'Sessions are recorded for enrolled students.');
  await p.locator('button', { hasText: 'Preview the agreement' }).click();
  await p.waitForSelector('.ops-contract');
  const pv = await p.locator('.ops-contract').innerText();
  ok(/Tova Olsson/.test(pv) && /\$300 per session/.test(pv) && /recorded/.test(pv), 'preview fills the placeholders');
  await p.locator('button', { hasText: 'Send invitation' }).click();
  await p.waitForSelector('text=Invitation made');
  const link = await p.locator('.ops-edit input[readonly]').inputValue();
  ok(/\/invite\//.test(link) && /Not emailed/.test(await p.locator('.ops-edit .hint').first().innerText()), 'invitation made, link shown (no email here)');

  // 3. The teacher's side (no sign-in): No first, change of heart, sign
  const t = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  t.on('pageerror', e => console.log('PAGE ERROR (teacher)', e.message));
  await t.goto(link.replace(/^https?:\/\/[^/]+/, BASE) + '?a=no', { waitUntil: 'networkidle' });
  ok(/decline this invitation/.test(await t.locator('main.inv').innerText()), 'No link asks to confirm');
  await t.locator('button', { hasText: 'Actually' }).click();
  ok(/Between Embodied Philosophy and Tova Olsson/.test(await t.locator('.contract').innerText()), 'agreement shown with their name');
  ok(await t.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'invitation page fits a phone');
  await t.fill('#sig-name', 'Tova M. Olsson');
  await t.locator('input[type=checkbox]').check();
  await t.locator('button', { hasText: 'Sign the agreement' }).click();
  await t.waitForSelector('text=Thank you', { timeout: 15000 });
  await t.goto(link.replace(/^https?:\/\/[^/]+/, BASE) + '/contract', { waitUntil: 'networkidle' });
  const signed = await t.locator('main.inv').innerText();
  ok(/Tova M\. Olsson/.test(signed) && /Jacob Kyle/.test(signed) && /Fingerprint [0-9a-f]{16}/.test(signed), 'archived agreement with both signatures and fingerprint');
  ok((await call(t, '/api/invite', { token: 'nonsense', action: 'sign', name: 'X Y Z', agree: true })).status === 400, 'a bad link is refused');
  await t.screenshot({ path: __dirname + '/out/invite-signed-phone.png' });

  // 4. Signed teacher is on every session of the season (Teachers + reminder email)
  const log = fs.readFileSync(__dirname + '/out/mock.log', 'utf8');
  ok(/Faculty invitation","Schedule".*Teachers & Hosts/.test(log) || /WROTE 'Schedule'![F]\d+ \[\[".*Tova Olsson/.test(log), 'teacher name written to the season’s sessions');
  ok(/tova@example\.com/.test(log.split('\n').filter(l => /Event Details/.test(l)).join('\n')), 'reminder email written to the season’s sessions');
  await p.goto(`${BASE}/ops/team?tab=invitations`, { waitUntil: 'networkidle' });
  ok(/Signed/.test(await p.locator('.ops-invites').innerText()), 'staff list shows Signed');

  // 5. A flat fee for a session already taught shows on Finance → To pay; mark it paid
  const r = await call(p, '/api/ops/faculty', { action: 'create', name: 'Abha Rajbhandari', email: 'abha@example.com', kind: 'Course', offering: 'event:E006', fee: '500', fee_unit: 'flat', template: 'Standard teaching agreement' });
  ok(r.ok && r.link, 'second invitation by API');
  ok((await call(p, '/api/invite', { token: r.link.split('/invite/')[1], action: 'sign', name: 'Abha Rajbhandari', agree: true })).ok, 'signed by API');
  await p.goto(`${BASE}/ops/insights`, { waitUntil: 'networkidle' });
  const pay = await p.locator('#to-pay').innerText();
  ok(/Abha Rajbhandari/.test(pay) && /\$500/.test(pay) && !/Tova/.test(pay), 'To pay lists the taught session only');
  await p.locator('#to-pay button', { hasText: 'Mark paid' }).first().click();
  await p.waitForTimeout(2500);
  await p.goto(`${BASE}/ops/insights`, { waitUntil: 'networkidle' });
  ok(/Nobody is owed/.test(await p.locator('#to-pay').innerText()), 'marked paid');
  ok(/Contractor Payables/.test(fs.readFileSync(__dirname + '/out/mock.log', 'utf8')), 'payment recorded on the Contractor Payables tab');

  // 6. The signed teacher edits only their own modules
  const tc = execSync(`node ${__dirname}/cookie.mjs tova@example.com`, { env: process.env }).toString().trim();
  const tctx = await b.newContext({ viewport: { width: 1366, height: 900 } });
  await tctx.addCookies([{ name: 'ep_ops', value: tc, domain: 'localhost', path: '/' }]);
  const tp = await tctx.newPage();
  await tp.goto(`${BASE}/ops/events?event=P-sadhana-fall-2026&skip=1`, { waitUntil: 'networkidle' });
  const g = await tp.evaluate(async () => (await fetch('/api/ops/program?series=sadhana-fall-2026')).json());
  ok(g.teacher && g.mine?.length > 0, `teacher sees the program (${g.mine?.length} of their sessions)`);
  const mineId = g.mine?.[0];
  ok((await call(tp, '/api/ops/program', { action: 'modules', series: 'sadhana-fall-2026', modules: [{ id: mineId, module: 'The first sūtra', summary: 'Citi is free.' }] })).ok, 'teacher saves their module');
  ok((await call(tp, '/api/ops/program', { action: 'shared', series: 'sadhana-fall-2026', changes: { 'Course Host': 'Me' } })).status === 403, 'teacher can’t change program-wide settings');

  // 7. Start a new program from the season (modules copied)
  const c = await call(p, '/api/ops/program', { action: 'create', name: 'The Heart of Recognition', track: 'SS', start: '2027-01-06', count: 3, every: 'weekly', copyFrom: 'sadhana-fall-2026', series: 'sadhana-winter-2027' });
  ok(c.ok, 'program created from the earlier one');
  const g2 = await p.evaluate(async () => (await fetch('/api/ops/program?series=sadhana-winter-2027')).json());
  ok(g2.sessions?.some(s => s.values['Module Title'] === 'The first sūtra'), 'module copied over');

  // 8. Search
  await p.goto(`${BASE}/ops/search?q=heart`, { waitUntil: 'networkidle' });
  const s = await p.locator('main.ops').innerText();
  ok(/Programs and sessions/i.test(s) && /Heart of Recognition/.test(s), 'search finds the program');
  await p.goto(`${BASE}/ops/search?q=tova`, { waitUntil: 'networkidle' });
  ok(/Invitations/i.test(await p.locator('main.ops').innerText()), 'search finds the invitation');
  await b.close();
})();
