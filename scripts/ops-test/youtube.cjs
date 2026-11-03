// YouTube Studio: the pipeline's calls (state, proposals, cuts, thumbnail, published) with the shared secret, and the
// staff screens (approve with teacher + series, skip, edit, re-render, re-cut, push, published history, phone width).
// The worker is played by this script; Ops' dispatches go to the mock's fake GitHub (out/mock.log: GITHUB DISPATCH).
const { chromium } = require('./pw.cjs');
const fs = require('fs');
const OUT = __dirname + '/out';
const cookie = fs.readFileSync(OUT + '/cookie.txt', 'utf8').trim();
const BASE = 'http://localhost:3100', MOCK = 'http://localhost:4555';
const SECRET = 'mock-pipeline-secret-0123456789abcdef';
const ok = (c, m) => { console.log(c ? 'PASS' : 'FAIL', m); if (!c) process.exitCode = 1; };
const api = async (method, path, body, { secret = SECRET, form } = {}) => {
  const r = await fetch(BASE + '/api/youtube' + path, {
    method, headers: { Authorization: `Bearer ${secret}`, ...(form ? {} : { 'Content-Type': 'application/json' }) },
    body: form || (body ? JSON.stringify(body) : undefined),
  });
  return { status: r.status, json: await r.json().catch(() => ({})) };
};
const dispatches = () => fs.readFileSync(OUT + '/mock.log', 'utf8').split('\n').filter(l => l.startsWith('GITHUB DISPATCH'));
const thumbForm = extra => { const f = new FormData(); f.append('file', new Blob([fs.readFileSync(OUT + '/upload-test.png')], { type: 'image/jpeg' }), 'thumb.jpg'); for (const [k, v] of Object.entries(extra || {})) f.append(k, v); return f; };

(async () => {
  // ---- the worker's side ----
  ok((await api('GET', '/state', null, { secret: 'wrong' })).status === 401, 'a wrong secret is refused');
  const st = await api('GET', '/state');
  ok(st.status === 200 && Array.isArray(st.json.used_vimeo_ids) && Array.isArray(st.json.upcoming_programs), 'GET /state answers');
  console.log('   upcoming programs from the mock calendar:', st.json.upcoming_programs.length, st.json.upcoming_programs[0] || '');
  const pic = 'data:image/png;base64,' + fs.readFileSync(OUT + '/upload-test.png').toString('base64');   // the Vimeo still
  const props = [1, 2, 3, 4, 5].map(i => ({ vimeo_id: String(1000 + i), title: `Talk ${i}: On Recognition`, link: `https://vimeo.com/${1000 + i}`, duration_sec: 3600 + i * 60, plays: 100 * i, picture: pic, teacher: i === 2 ? null : `Teacher ${i}`, angle: `The hook for talk ${i}`, reason: `Seeds interest in Wisdom School (${i})` }));
  const pr = await api('POST', '/proposals', { week_of: '2026-11-02', proposals: props });
  ok(pr.status === 200 && pr.json.proposal_ids.length === 5, 'POST /proposals stores five');
  const again = await api('POST', '/proposals', { week_of: '2026-11-02', proposals: [props[0]] });
  ok(again.json.proposal_ids[0] === pr.json.proposal_ids[0], 'the same video sent again refreshes its proposal, no duplicate');

  // ---- staff: approve one, skip one ----
  const b = await chromium.launch();
  const c = await b.newContext({ viewport: { width: 1366, height: 900 } });
  await c.addCookies([{ name: 'ep_ops', value: cookie, domain: 'localhost', path: '/' }]);
  const p = await c.newPage(); p.setDefaultTimeout(15000);
  p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) console.log('CONSOLE', m.text().slice(0, 300)); }); p.on('pageerror', e => { console.log('PAGE ERROR', e.message); process.exitCode = 1; });
  p.on('dialog', d => d.accept());
  await p.goto(BASE + '/ops/youtube', { waitUntil: 'networkidle' }); await p.waitForTimeout(700);
  ok(await p.locator('.ops-nav a', { hasText: 'YouTube' }).count() === 1, 'YouTube is in the sidebar');
  ok(await p.locator('.ops-yt-card').count() === 5, 'five proposal cards');
  await p.screenshot({ path: OUT + '/yt-week.png', fullPage: true });
  const card1 = p.locator('.ops-yt-card', { hasText: 'Talk 1:' });
  await card1.getByRole('button', { name: 'Approve' }).click();
  await card1.getByLabel('Teacher').fill('Paul Muller-Ortega');
  await card1.getByLabel('Series').selectOption('Wisdom School');
  await card1.getByRole('button', { name: 'Make the cut' }).click();
  await card1.getByText('Producing…').waitFor();
  ok(true, 'approve → Producing…');
  const d1 = dispatches().at(-1) || '';
  ok(/produce/.test(d1) && /"vimeo_id":"1001"/.test(d1) && /Paul Muller-Ortega/.test(d1) && /Wisdom School/.test(d1) && /token ok/.test(d1), 'produce dispatched with teacher and series');
  await p.locator('.ops-yt-card', { hasText: 'Talk 3:' }).getByRole('button', { name: 'Skip' }).click();
  await p.locator('.ops-yt-card', { hasText: 'Talk 3:' }).getByText('Skipped').waitFor();
  const used = (await api('GET', '/state')).json.used_vimeo_ids;
  ok(used.includes('1001') && used.includes('1003') && !used.includes('1002'), 'approved and skipped are used; untouched ones are not');

  // ---- the worker sends the cut + thumbnail ----
  const pid = pr.json.proposal_ids[0];
  const cutBody = { proposal_id: pid, source_vimeo_id: '1001', source_link: 'https://vimeo.com/1001', cut_vimeo_id: '9001', start_sec: 754, end_sec: 1870, duration_sec: 1116, why: 'A complete argument about recognition.', opening_lines: 'Recognition is not a new seeing but a re-cognising.', teacher: 'Paul Muller-Ortega', series: 'Wisdom School', yt_title: 'What Is Recognition? | Paul Muller-Ortega', yt_description: 'An excerpt from Wisdom School.', yt_tags: ['tantra', 'kashmir shaivism'], hashtags: ['#Tantra'], thumb_headline: 'You Already Know', thumb_accent: 'Know' };
  const cut = await api('POST', '/cuts', cutBody);
  ok(cut.status === 200 && /^yc_/.test(cut.json.cut_id), 'POST /cuts returns a cut_id');
  const cid = cut.json.cut_id;
  ok((await api('POST', `/cuts/${cid}/thumbnail`, null, { form: thumbForm() })).json.thumbnail_url?.startsWith('data:image/jpeg'), 'POST thumbnail stores it (in memory locally, Blob in production)');

  await p.goto(BASE + '/ops/youtube?tab=review', { waitUntil: 'networkidle' }); await p.waitForTimeout(700);
  const panel = p.locator(`#${cid}`);
  ok(await panel.locator('iframe[src="https://player.vimeo.com/video/9001"]').count() === 1, 'the cut is embedded from Vimeo');
  ok(await panel.getByText('In 12:34 · Out 31:10').count() === 1, 'in/out shown');
  ok(await panel.locator('.yt-thumb img').count() === 1, 'thumbnail shown');
  await panel.getByLabel(/YouTube title/).fill('Recognition, Explained | Paul Muller-Ortega');
  await panel.getByLabel('Tags', { exact: true }).fill('tantra, recognition, pratyabhijna');
  await panel.getByLabel(/Playlist/).fill('PLabc123');
  await panel.getByRole('button', { name: 'Save', exact: true }).click();
  await panel.getByText('Saved.').waitFor();
  await p.screenshot({ path: OUT + '/yt-review.png', fullPage: true });

  // re-render the thumbnail
  await panel.getByLabel('Headline').fill('Already Here');
  await panel.getByRole('button', { name: 'Re-render thumbnail' }).click();
  await panel.getByText('New thumbnail coming…').waitFor();
  const d2 = dispatches().at(-1) || '';
  ok(/thumb/.test(d2) && /"vimeo_id":"1001"/.test(d2) && new RegExp(`"cut_id":"${cid}"`).test(d2) && /Already Here/.test(d2), 'thumb dispatched with the source video, cut and headline');
  ok((await api('GET', `/cuts/${cid}`)).json.thumb_headline === 'Already Here', 'the worker reads the new headline');
  await api('POST', `/cuts/${cid}/thumbnail`, null, { form: thumbForm({ thumb_headline: 'Already Here', thumb_accent: 'Here' }) });

  // re-cut: the worker posts /cuts again for the same proposal; staff edits survive
  await p.goto(BASE + '/ops/youtube?tab=review', { waitUntil: 'networkidle' }); await p.waitForTimeout(700);
  await panel.getByRole('button', { name: 'Adjust in/out' }).click();
  await panel.getByLabel('In', { exact: true }).fill('0:00');
  await panel.getByLabel('Out', { exact: true }).fill('18:30');
  await panel.getByRole('button', { name: 'Re-cut', exact: true }).click();
  await panel.getByText('Re-cutting…').first().waitFor();
  const d3 = dispatches().at(-1) || '';
  ok(/produce/.test(d3) && /"start":"0"/.test(d3) && /"end":"1110"/.test(d3), 're-cut dispatched with start "0" and end (strings, so a 0 start survives)');
  const recut = await api('POST', '/cuts', { ...cutBody, cut_vimeo_id: '9002', start_sec: 0, end_sec: 1110, duration_sec: 1110, yt_title: 'Worker title that must not win' });
  ok(recut.json.cut_id === cid, 'the re-cut updates the same cut');
  const after = (await api('GET', `/cuts/${cid}`)).json;
  ok(after.cut_vimeo_id === '9002' && after.yt_title === 'Recognition, Explained | Paul Muller-Ortega' && after.playlist_id === 'PLabc123' && after.yt_tags.includes('pratyabhijna'), 'staff edits win over the re-cut');
  await api('POST', `/cuts/${cid}/thumbnail`, null, { form: thumbForm() });

  // push
  await p.goto(BASE + '/ops/youtube?tab=review', { waitUntil: 'networkidle' }); await p.waitForTimeout(700);
  await panel.getByRole('button', { name: 'Push to YouTube' }).click();
  await panel.getByText('Uploading to YouTube…').waitFor();
  ok(new RegExp(`publish.*"cut_id":"${cid}"`).test(dispatches().at(-1) || ''), 'publish dispatched');
  const w = (await api('GET', `/cuts/${cid}`)).json;
  ok(w.privacy === 'private' && w.publish_at === '' && w.thumbnail_url, 'the worker gets privacy, schedule and thumbnail');
  ok((await api('POST', `/cuts/${cid}/published`, { youtube_id: 'abc123XYZ', youtube_url: 'https://youtu.be/abc123XYZ' })).status === 200, 'POST published');
  await p.goto(BASE + '/ops/youtube?tab=published', { waitUntil: 'networkidle' }); await p.waitForTimeout(700);
  ok(await p.locator('a[href="https://youtu.be/abc123XYZ"]').count() >= 1, 'Published lists the YouTube link');
  await p.screenshot({ path: OUT + '/yt-published.png', fullPage: true });

  // a scheduled release converts New York time to UTC, and a past time is refused
  const p2 = pr.json.proposal_ids[3];
  await api('POST', '/cuts', { ...cutBody, proposal_id: p2, source_vimeo_id: '1004', cut_vimeo_id: '9004' });
  await p.goto(BASE + '/ops/youtube?tab=review', { waitUntil: 'networkidle' }); await p.waitForTimeout(700);
  const second = p.locator('.ops-yt-cut').first();
  await second.getByLabel(/Release date/).fill('2027-01-15');
  await second.getByLabel('Release time').fill('09:00');
  await second.getByRole('button', { name: 'Save', exact: true }).click();
  await second.getByText('Saved.').waitFor();
  const sid = await second.getAttribute('id');
  ok((await api('GET', `/cuts/${sid}`)).json.publish_at === '2027-01-15T14:00:00Z', '9am New York on Jan 15 → 14:00 UTC');
  await second.getByRole('button', { name: 'Push to YouTube' }).click();
  await second.getByText('The thumbnail hasn’t arrived yet.').waitFor();
  ok(true, 'push refused until the thumbnail arrives');
  ok((await api('GET', '/state')).json.used_vimeo_ids.includes('1004'), 'a cut made for a video marks it used');

  // phone width
  await p.setViewportSize({ width: 390, height: 844 });
  for (const t of ['week', 'review', 'published']) {
    await p.goto(BASE + '/ops/youtube?tab=' + t, { waitUntil: 'networkidle' }); await p.waitForTimeout(700);
    const over = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    ok(over <= 1, `phone width, ${t}: no sideways scroll (${over}px)`);
    await p.screenshot({ path: `${OUT}/yt-${t}-phone.png`, fullPage: true });
  }
  await b.close();
})().catch(e => { console.error(e); process.exitCode = 1; });
