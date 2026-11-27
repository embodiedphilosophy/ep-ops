// Ads PR 2: audience suggestions (lib/ops/adsaudiences.js) in node, on an in-process Postgres and the Meta mock (:4556). `source env.sh`, run.sh running.
// (1) reading Ads never makes the tables: adsTablesExist is false until something is saved; (2) with nothing in the Audience library the suggestions are all
// Meta interests labelled "New test"; (3) library audiences come first, Proven ones with their past result, matched on the topic; Retired ones never; (4) with no
// Meta key only the library is used and the page is told why.
process.removeAllListeners('warning');
let bad = 0; const ck = (n, c, x = '') => { if (c) console.log('ok  ', n); else { bad++; console.log('FAIL', n, x); } };
if (process.env.META_ADS_BASE !== 'http://localhost:4556') { console.log('FAIL: source scripts/ops-test/env.sh first'); process.exit(1); }
process.env.ADS_TEST_DB = 'pglite'; process.env.META_ADS_TOKEN = 'mock-token-for-audiences'; process.env.META_AD_ACCOUNT_ID = 'act_MOCK1';
const S = await import('../../lib/ops/adsstore.js'), A = await import('../../lib/ops/adsaudiences.js');

ck('before anything is saved the Ads tables do not exist', (await S.adsTablesExist()) === false);
let r = await A.suggestAudiences({ topic: 'Kali Winter 2027' });
ck('reading suggestions with no library did not make the tables', (await S.adsTablesExist()) === false);
ck('with an empty library, every suggestion is a Meta interest labelled “New test”', r.candidates.length >= 5 && r.candidates.every(c => c.label === 'New test' && c.targeting.flexible_spec?.[0]?.interests?.[0]?.id && !c.audience_id), JSON.stringify(r.candidates.slice(0, 2)));
ck('interest audiences are ages 25–65 in the US, UK, Canada and Australia', r.candidates[0].targeting.age_min === 25 && r.candidates[0].targeting.geo_locations.countries.includes('GB'));
await S.ensureAdsTables();
ck('the first save makes the tables', (await S.adsTablesExist()) === true);
await S.createRow('audiences', { name: 'Lookalike 1% · past Sādhana buyers', standing: 'Proven', tags: ['kali', 'tantra'], meta_settings: { targeting: { flexible_spec: [{ interests: [{ id: '1', name: 'x' }] }] } }, best_result: { roas: 3.1 }, description: 'US, UK, CA, AU · 25–65' });
await S.createRow('audiences', { name: 'Warm · engaged 365 days', standing: 'Promising', tags: ['kali'] });
await S.createRow('audiences', { name: 'Old broad', standing: 'Retired', tags: ['kali'] });
await S.createRow('audiences', { name: 'Unrelated', standing: 'Proven', tags: ['cooking'], best_result: { roas: 9 } });
r = await A.suggestAudiences({ topic: 'Kali Winter 2027' });
const names = r.candidates.map(c => c.name);
ck('library audiences come first and a Retired one is never suggested', names[0].startsWith('Lookalike 1%') && names[1].startsWith('Warm') && !names.includes('Old broad'), names.slice(0, 4).join(' | '));
ck('a Proven audience says so, with its past result', r.candidates[0].label === 'Proven' && /3\.1×/.test(r.candidates[0].result));
ck('a library audience that is not Proven is labelled “New test”', r.candidates[1].label === 'New test' && r.candidates[1].result === '');
ck('Meta interests fill the rest, after the library', r.candidates.slice(3).every(c => c.key.startsWith('int:') || c.key.startsWith('lib:')) && r.candidates.some(c => c.key.startsWith('int:')));
ck('hasAudience: interests count, an empty targeting does not', A.hasAudience(r.candidates.find(c => c.key.startsWith('int:')).targeting) && !A.hasAudience(A.blankAudience.targeting) && !A.hasAudience({ age_min: 25 }));
delete process.env.META_ADS_TOKEN;
r = await A.suggestAudiences({ topic: 'Kali' });
ck('with no Meta key only the library is used, and the page is told why', r.candidates.every(c => c.key.startsWith('lib:')) && /isn’t connected/.test(r.note), r.note);
console.log(bad ? `\n${bad} failed` : '\nall passed'); process.exit(bad ? 1 : 0);
