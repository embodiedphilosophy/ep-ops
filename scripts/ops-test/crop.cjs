const { chromium } = require('./pw.cjs');
const cookie = require('fs').readFileSync(__dirname + '/out/cookie.txt', 'utf8').trim();
(async () => {
  const b = await chromium.launch(); const errs = [];
  for (const [vw, w, h] of [['desktop', 1366, 900], ['phone', 390, 844]]) {
    const c = await b.newContext({ viewport: { width: w, height: h }, hasTouch: vw === 'phone' });
    await c.addCookies([{ name: 'ep_ops', value: cookie, domain: 'localhost', path: '/' }]);
    const p = await c.newPage(); p.on('pageerror', e => errs.push(e.message)); p.on('dialog', d => d.accept());
    p.on('response', r => { if (r.status() >= 400 && !/\/_vercel\/insights|\/kalighat\//.test(r.url())) errs.push(`${r.status()} ${r.url().slice(0, 120)}`); });
    await p.route('https://lh3.googleusercontent.com/**', r => r.fulfill({ status: 200, contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="500"><rect width="400" height="500" fill="#8a6d4a"/><circle cx="200" cy="230" r="90" fill="#d9c6a4"/></svg>' }));
    await p.route('https://picsum.photos/**', r => r.fulfill({ status: 200, contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="500"><rect width="400" height="500" fill="#4a6d8a"/></svg>' }));
    await p.goto('http://localhost:3100/ops/content?tab=social', { waitUntil: 'networkidle' }); await p.waitForTimeout(1200);
    await p.locator('.ops-se-feed li').filter({ hasText: 'Proposed' }).nth(vw === 'desktop' ? 0 : 1).locator('button').click(); await p.waitForTimeout(400);
    await p.locator('.ops-se-comp button:text-is("Crop")').click();
    await p.locator('.ops-crop .frame').waitFor({ timeout: 15000 });
    const f = await p.locator('.ops-crop .frame').boundingBox();
    console.log(vw, 'frame', Math.round(f.width), 'x', Math.round(f.height));
    await p.mouse.move(f.x + f.width / 2, f.y + f.height / 2); await p.mouse.down(); await p.mouse.move(f.x + f.width / 2 - 120, f.y + f.height / 2, { steps: 8 }); await p.mouse.up();
    const t1 = await p.locator('.ops-crop .frame img').evaluate(e => e.style.transform);
    await p.locator('.ops-crop .zoom input').fill('1.6');
    console.log('after drag:', t1, '| after zoom:', await p.locator('.ops-crop .frame img').evaluate(e => e.style.width));
    await p.screenshot({ path: `${__dirname}/out/crop-${vw}.png` });
    await p.locator('.ops-crop .shapes button:has-text("Square")').click(); await p.waitForTimeout(200);
    const f2 = await p.locator('.ops-crop .frame').boundingBox(); console.log('square frame', Math.round(f2.width), 'x', Math.round(f2.height));
    await p.locator('.ops-crop .shapes button:has-text("Feed")').click();
    await p.locator('button:has-text("Use this crop")').click(); await p.waitForTimeout(1500);
    console.log('msg:', await p.locator('.ops-se-comp .media > .hint').first().innerText());
    console.log('save:', await p.locator('.ops-se-comp button[type=submit]').innerText());
    await p.screenshot({ path: `${__dirname}/out/cropped-${vw}.png` });
    if (vw === 'desktop') {
      await p.locator('.ops-se-comp button[type=submit]').click(); await p.waitForTimeout(1500);
      console.log('after save:', await p.locator('.ops-se-comp .words > .hint').innerText().catch(() => '-'));
      // upload
      await p.locator('.ops-se-comp .upl input').setInputFiles(__dirname + '/out/upload-test.png'); await p.waitForTimeout(2500);
      console.log('upload msg:', await p.locator('.ops-se-comp .media > .hint').first().innerText(), '| crop open:', await p.locator('.ops-crop .frame').count());
      await p.screenshot({ path: `${__dirname}/out/upload-crop.png` });
      await p.locator('button:has-text("Use this crop")').click(); await p.waitForTimeout(1500);
      await p.locator('.ops-se-comp button[type=submit]').click(); await p.waitForTimeout(1500);
      console.log('after save 2:', await p.locator('.ops-se-comp .words > .hint').innerText().catch(() => '-'));
      await p.screenshot({ path: `${__dirname}/out/upload-saved.png` });
    }
    await c.close();
  }
  console.log('page errors:', errs.length ? errs : 'none'); await b.close();
})();
