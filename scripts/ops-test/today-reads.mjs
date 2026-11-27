// How many sheet reads does a Today load make? Loads /ops once per person (in this order, cold cache first) and prints the mock's read count for each load.
//   source scripts/ops-test/env.sh && bash scripts/ops-test/run.sh   (fresh), then:  node scripts/ops-test/today-reads.mjs [--seed] [--detail]   (--seed adds the Change Log and Email Plan Today now reads)
// The count is of requests that reached the mock, so it is what Google would see (reads served from the app's 5-minute cache are not counted).
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const M = 'http://localhost:4555', A = 'http://localhost:3100';
const ex = n => `${n.toLowerCase()}@example.com`;
const here = path.dirname(fileURLToPath(import.meta.url));
const jacob = fs.readFileSync(path.join(here, 'out/cookie.txt'), 'utf8').trim().replace(/^ep_ops=/, '');
const seeded = process.argv.includes('--seed') ? await (await import('./today-seed.mjs')).seed() : null;
const people = [['jacob', null], ['floss', ex('Floss')], ['irene', ex('Irene')], ['ichha', ex('Ichha')], ['carolyn', ex('Carolyn')], ['stephanie', ex('Stephanie')], ['abha (teacher)', ex('Abha')]];
const cookie = email => { if (email === null) return jacob; const body = Buffer.from(JSON.stringify({ email, exp: Date.now() + 86400e3 })).toString('base64url'); return `${body}.${crypto.createHmac('sha256', process.env.OPS_SECRET).update(body).digest('base64url')}`; };
const reads = async reset => (await fetch(`${M}/__reads${reset ? '?reset=1' : ''}`)).json();
await reads(true);
let sum = 0;
for (const [name, email] of people) {
  const t0 = Date.now();
  const r = await fetch(`${A}/ops?skip=1`, { headers: { cookie: `ep_ops=${cookie(email)}` }, redirect: 'manual' });
  await r.text();
  const j = await reads(true);
  sum += j.total;
  console.log(`${name.padEnd(16)} HTTP ${r.status}  ${String(j.total).padStart(3)} sheet reads  ${Date.now() - t0} ms`);
  if (process.argv.includes('--detail')) for (const x of j.reads) console.log('      ', x);
}
console.log(`total ${sum}`);
