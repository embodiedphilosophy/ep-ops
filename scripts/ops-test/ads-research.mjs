// Ads outside research, the checking and the keeping, in node (`source scripts/ops-test/env.sh`, `bash scripts/ops-test/run.sh` first). The library runs in this process against an in-process
// Postgres (PGlite) and the Anthropic stand-in in mock.mjs (:4555), which answers in the documented web search shape: a good answer, a bad one (one of every kind the code must drop), an empty
// one, a search error, a failure and a pause. Nothing real is contacted.
import crypto from 'node:crypto';
process.removeAllListeners('warning');
const MOCK = 'http://localhost:4555';
if (process.env.ADS_TEST_DB !== 'pglite' || process.env.ANTHROPIC_BASE !== `${MOCK}/anthropic`) { console.log('FAIL: run `source scripts/ops-test/env.sh` first'); process.exit(1); }
const R = await import('../../lib/ops/adsresearch.js'), S = await import('../../lib/ops/adsstore.js');
let bad = 0; const ck = (n, c, x = '') => { if (c) console.log('ok  ', n); else { bad++; console.log('FAIL', n, x); } };
const mode = (m) => fetch(`${MOCK}/__research?mode=${m}`).then(r => r.json());
const reqs = async () => (await (await fetch(`${MOCK}/__anthropic-log`)).json()).map(x => JSON.parse(x)).filter(b => (b.tools || []).length);
const addDays = (d, n) => new Date(Date.parse(`${d}T12:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
const today0 = new Date().toISOString().slice(0, 10), monday = addDays(today0, -((new Date(`${today0}T12:00:00Z`).getUTCDay() + 6) % 7));   // this week's Monday (the pages in the stand-in are dated from the real today)
const sayBlocks = async (m) => { await mode(m); const r = await fetch(`${MOCK}/anthropic/v1/messages`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ model: 'x', tools: [{ type: 'web_search_20250305', name: 'web_search' }], messages: [{ role: 'user', content: 'q' }] }) }); return (await r.json()).content; };

console.log('-- checking one statement (the pieces the bad answer is made of)');
const results = new Map([['https://www.facebook.com/business/help/a', { title: 'A' }], ['https://example-blog.invalid/x', { title: 'B' }], ['https://evilfacebook.com/x', { title: 'C' }], ['javascript:alert(1)', { title: 'D' }], ['ftp://www.facebook.com/x', { title: 'E' }]]);
const snip = 'From 14 March 2026, ads for online courses will show the course provider’s name in the ad. Average cost per click was $1.72, up 12.5% on last year.';
const cite = (url, snippet = snip) => [{ url, title: 't', snippet }], good = 'https://www.facebook.com/business/help/a';
const c = (text, cites = cite(good)) => R.checkStatement(text, cites, results);
ck('a plain statement that the source says is kept', c('Meta says that from 14 March 2026 ads for online courses show the course provider’s name.') === '');
ck('a quoted dollar amount and a percentage that are in the source are kept', c('Meta reports an average cost per click of $1.72, up 12.5% on last year, for ads for online courses.') === '');
ck('a statement with no source is dropped', c('Meta says that from 14 March 2026 ads for online courses show the course provider’s name.', []) !== '');
ck('an address the search never returned is dropped', c('Meta says that from 14 March 2026 ads for online courses show the course provider’s name.', cite('https://www.facebook.com/business/never')) !== '');
ck('one good source and one never returned: dropped', c('Meta says that from 14 March 2026 ads for online courses show the course provider’s name.', [...cite(good), ...cite('https://www.facebook.com/business/never')]) !== '');
ck('a site not on the list is dropped even if the search returned it', /list of sites/.test(c('Meta says that from 14 March 2026 ads for online courses show the course provider’s name.', cite('https://example-blog.invalid/x'))));
ck('a look-alike address (evilfacebook.com) is not facebook.com', c('Meta says that from 14 March 2026 ads for online courses show the course provider’s name.', cite('https://evilfacebook.com/x')) !== '');
ck('javascript: and ftp: addresses are dropped', c('Meta says that from 14 March 2026 ads for online courses show the course provider’s name.', cite('javascript:alert(1)')) !== '' && c('Meta says that from 14 March 2026 ads for online courses show the course provider’s name.', cite('ftp://www.facebook.com/x')) !== '');
ck('a source with no text is dropped', c('Meta says that from 14 March 2026 ads for online courses show the course provider’s name.', cite(good, '')) !== '');
ck('a number not in the source is dropped ($4.80; 13%; a year)', c('Meta reports an average cost per click of $4.80 for ads for online courses.') !== '' && c('Meta reports clicks up 13% on last year for ads for online courses.') !== '' && c('Meta says that from 14 March 2027 ads for online courses show the course provider’s name.') !== '');
ck('a number is matched exactly, not rounded (12 for 12.5%, $1.7 for $1.72)', c('Meta reports clicks up 12% on last year for ads for online courses.') !== '' && c('Meta reports an average cost per click of $1.7 for ads for online courses.') !== '');
ck('a number in words, “k” numbers and a month the source lacks are dropped', c('Meta says that from 14 March 2026 ads for online courses show the course provider’s name to five advertisers.') !== '' && c('Meta reports clicks of 2k for ads for online courses.') !== '' && c('Meta says that from 14 April 2026 ads for online courses show the course provider’s name.') !== '');
ck('“May” the word is not a month, but “14 May” is', c('Meta says ads for online courses may show the course provider’s name in the ad from 14 March 2026.') === '' && c('Meta says that from 14 May 2026 ads for online courses show the course provider’s name.') !== '');
ck('advice and reasons are dropped (should, must, because, so, likely, recommend, consider)', ['Meta says advertisers should add the course provider’s name to every online course ad.', 'Meta says online course ads show the course provider’s name because trust matters in the ad.', 'Meta says ads for online courses are likely to show the course provider’s name in the ad.', 'Meta says ads for online courses must show the course provider’s name in the ad.', 'We recommend that ads for online courses show the course provider’s name in the ad.'].every(t => c(t) !== ''));
ck('words that are not in the source are dropped', c('Meta announced a brand new way to schedule reels for creators.') !== '');
ck('too short and too long are dropped', c('Meta ads.') !== '' && c('Meta says that from 14 March 2026 ads for online courses show the course provider’s name. '.repeat(8)) !== '');

ck('a statement that stops at a comma, a colon or mid-word is dropped (it was cut off), a whole sentence is kept', ['Meta says that from 14 March 2026 ads for online courses show the course provider’s name,', 'Meta says that from 14 March 2026 ads for online courses show the course provider’s name:', 'Meta says that from 14 March 2026 ads for online courses show the course provider’s'].every(t => /part-way/.test(c(t))) && c('Meta says that from 14 March 2026 ads for online courses show the course provider’s name!') === '' && c('Does Meta say that from 14 March 2026 ads for online courses show the course provider’s name?') === '');
ck('a very short statement is dropped', /length/.test(c('Meta ads are new.')));

console.log('-- is the source recent? (questions a, c, d are about what is new; b, the benchmarks, may be older)');
const NOW = '2026-11-28', U = 'https://www.facebook.com/business/help/a', ST = 'Meta says that from 12 November 2026 ads for online courses show the course provider’s name.', ST0 = 'Meta says ads for online courses show the course provider’s name in the ad.';
const SN = 'From 12 November 2026, ads for online courses will show the course provider’s name in the ad.', SN0 = 'Ads for online courses will show the course provider’s name in the ad.';
const rc = (st, age, snippet, topic) => R.checkStatement(st, [{ url: U, title: 't', snippet }], new Map([[U, { title: 'A', page_age: age }]]), topic, NOW);
ck('a page dated within 90 days passes for a, c and d', ['a', 'c', 'd'].every(q => rc(ST, 'November 16, 2026', SN, q) === ''));
ck('89 days old passes, 91 days old is dropped (with a page_age the cited text is not asked)', rc(ST0, 'August 31, 2026', SN0, 'd') === '' && /recent/.test(rc(ST0, 'August 29, 2026', SN0, 'd')) && /recent/.test(rc(ST0, 'August 1, 2026', SN0, 'a')));
ck('a page_age that is only a month is read (September 2026 passes, March 2026 is dropped)', rc(ST0, 'September 2026', SN0, 'c') === '' && /recent/.test(rc(ST0, 'March 2026', SN0, 'c')));
ck('an old page_age is not rescued by a recent date in the cited text (the page’s own date wins)', /recent/.test(rc(ST, 'January 3, 2026', SN, 'd')));
ck('with NO page_age: a date in the last year in the cited text passes', rc(ST, '', SN, 'd') === '' && rc(ST, '', 'On 2 September 2026, the notice said: ' + SN, 'a') === '');
ck('with no page_age and no date in the cited text it is dropped (standing policy; nothing is guessed)', /recent/.test(rc(ST0, '', SN0, 'd')) && /recent/.test(rc(ST0, '', SN0, 'a')) && /recent/.test(rc(ST0, '', SN0, 'c')));
ck('with no page_age, a date older than a year, or only a bare year, is dropped', /recent/.test(rc(ST0, '', 'In March 2025, ads for online courses will show the course provider’s name in the ad.', 'd')) && /recent/.test(rc(ST0, '', 'In 2026, ads for online courses will show the course provider’s name in the ad.', 'd')));
ck('a page_age we cannot read (“3 days ago”) is treated as absent, not guessed', rc(ST, '3 days ago', SN, 'd') === '' && /recent/.test(rc(ST0, '3 days ago', SN0, 'd')));
ck('a source that is not recent fails the statement even if another source is', /recent/.test(R.checkStatement(ST, [{ url: U, title: 't', snippet: SN }, { url: 'https://www.facebook.com/business/help/old', title: 't', snippet: SN0 }], new Map([[U, { page_age: 'November 16, 2026' }], ['https://www.facebook.com/business/help/old', { page_age: 'January 1, 2025' }]]), 'd', NOW)));
ck('benchmarks (b) need no recent source', rc(ST0, 'January 2024', SN0, 'b') === '' && rc(ST0, '', SN0, 'b') === '');
ck('a statement with no topic given is not asked about recency (as before)', rc(ST0, '', SN0, '') === '');
ck('the source’s own date is shown in plain form, only when the result gives one we can read', R.publishedText('November 16, 2026') === '16 Nov 2026' && R.publishedText('March 2026') === 'Mar 2026' && R.publishedText('') === '' && R.publishedText('3 days ago') === '');

console.log('-- whole sentences and the question letter, read from the answer');
{
  const sr = ['https://www.facebook.com/business/help/a'], blocksFor = (...mid) => [{ type: 'web_search_tool_result', content: [{ type: 'web_search_result', url: sr[0], title: 'T', page_age: 'November 16, 2026' }] }, ...mid];
  const cite = { type: 'web_search_result_location', url: sr[0], title: 'T', cited_text: SN };
  let r1 = R.checkAnswer(R.readAnswer(blocksFor({ type: 'text', text: '(d) Meta says that from 12 November 2026 ads for online courses show the course provider’s name', citations: [cite] }, { type: 'text', text: '. More words that have no source.' })), NOW);
  ck('the full stop written just after the cited words ends the sentence (kept, without the later uncited words)', r1.kept.length === 1 && /name\.$/.test(r1.kept[0].statement) && r1.kept[0].topic === 'd', JSON.stringify(r1));
  r1 = R.checkAnswer(R.readAnswer(blocksFor({ type: 'text', text: '\n\n(d) ' }, { type: 'text', text: 'Meta says that from 12 November 2026 ads for online courses show the course provider’s name.', citations: [cite] })), NOW);
  ck('the letter on its own just before the cited words still belongs to the statement', r1.kept.length === 1 && r1.kept[0].topic === 'd' && !/^\(/.test(r1.kept[0].statement), JSON.stringify(r1));
  r1 = R.checkAnswer(R.readAnswer(blocksFor({ type: 'text', text: 'Meta says that from 12 November 2026 ads for online courses show the course provider’s name.', citations: [cite] })), NOW);
  ck('a statement that does not say which question it answers is dropped', r1.kept.length === 0 && /which question/.test(r1.dropped[0]));
  r1 = R.checkAnswer(R.readAnswer(blocksFor({ type: 'text', text: '(d) Meta says that from 12 November 2026 ads for online courses show the course provider’s name,', citations: [cite] })), NOW);
  ck('a cut-off statement (“…name,”) is dropped, never repaired', r1.kept.length === 0 && /part-way/.test(r1.dropped[0]));
}

console.log('-- our own figures, beside the outside ones');
const figs = R.ourFigures({ spend_cents: 36000, impressions: 20000, clicks: 300, purchases: 3, leads: 12 });
ck('cost per 1,000 views, per click and per lead are worked out in code; purchases are left out when there are fewer than 5', figs.map(f => `${f.key}:${f.v.toFixed(2)}`).join() === 'cpm:18.00,cpc:1.20,cpl:30.00');
ck('too few views, clicks or results show nothing', R.ourFigures({ spend_cents: 100, impressions: 999, clicks: 29, purchases: 4, leads: 4 }).length === 0 && R.ourFigures(null).length === 0);
const cmp = R.compareFor('WordStream reports an average cost per click of $0.90 for education advertisers on Meta in 2026.', figs);
ck('an outside cost per click is set beside ours: two numbers, no verdict', cmp && cmp.ours === '$1.20' && cmp.outside === '$0.90' && cmp.per === 'per click' && !/higher|lower|better|worse|more|less/.test(JSON.stringify(cmp)), JSON.stringify(cmp));
ck('and not when the statement names two kinds of cost, two figures, or a kind we have no figure for', R.compareFor('It reports a cost per click of $0.90 and a cost per lead of $12.00 in 2026.', figs) === null && R.compareFor('It reports a cost per click of $0.90 to $2.10 in 2026.', figs) === null && R.compareFor('It reports a cost per purchase of $40.00 in 2026.', figs) === null && R.compareFor('It reports that CPMs rose 18% in the week of Black Friday.', figs) === null);

console.log('-- the web search answer: reading and checking');
await mode('good');
const MK = await mode('bad');   // the stand-in tells us the dates it wrote into its pages
let read = R.readAnswer(await sayBlocks('bad'));
ck('the search shape is read: searches, the returned results (four), the cited statements', read.searches === 1 && read.results.size === 6 && read.cited.length >= 14, `${read.searches} ${read.results.size} ${read.cited.length}`);
const out = R.checkAnswer(read, today0);
ck('the bad answer keeps exactly the three sourced, recent statements (policy, benchmark, season), with the question letter taken off', out.kept.length === 3 && out.kept[0].statement.startsWith(`Meta says that from ${MK.d14}`) && /\$1\.72/.test(out.kept[1].statement) && /Black Friday/.test(out.kept[2].statement) && out.kept.map(k => k.topic).join() === 'd,b,c' && out.kept.every(k => /^[A-Z]/.test(k.statement)), JSON.stringify(out.kept.map(k => k.statement)));
const tally = Object.entries(out.dropped.reduce((a, d) => (a[d] = (a[d] || 0) + 1, a), {})).map(([d, n]) => `${n} ${d}`).sort().join('|');
ck('and drops each bad kind, with its own reason: a duplicate, an address never returned, two bad numbers or dates, advice and a reason, words not in the source, a site off the list, no text, no source at all, no question letter, a cut-off sentence, an old page and undated standing policy', tally === ['1 It said the same thing as a statement already kept.', '1 It did not say which question it answers.', '1 It had no source.', '1 It stopped part-way, not as a whole sentence.', '2 Its source was not recent enough for a question about what is new.', '1 Its source gave no text to check it against.', '1 Its source was not on the list of sites we accept.', '1 Its source was not one the search returned.', '1 Its words did not match the text of its source.', '2 A number or date in it was not in the text of its source.', '2 It gave advice or a reason, instead of only saying what the page says.'].sort().join('|'), tally);
ck('the reasons are all plain sentences (no code words)', out.dropped.every(d => /^[A-Z].*\.$/.test(d) && !/undefined|\[object/.test(d)));
ck('every kept statement’s sources are results that really came back (url, title and the cited words)', out.kept.every(k => k.sources.every(s => read.results.has(s.url) && s.title && s.snippet && /^https:\/\//.test(s.url))));
ck('the title comes from the search result, not from the model', out.kept[0].sources[0].title === 'About ad policy updates for education advertisers' && /^[A-Z][a-z]+ \d+, \d{4}$/.test(out.kept[0].sources[0].page_age));
const empty = R.checkAnswer(R.readAnswer(await sayBlocks('empty')));
ck('an empty answer (NOTHING_FOUND) keeps nothing and drops nothing', empty.kept.length === 0 && empty.dropped.length === 0);
const errd = R.readAnswer(await sayBlocks('searcherror'));
ck('a search error is noticed (no results, an error code)', errd.results.size === 0 && errd.searchError === 'unavailable');

console.log('-- a look: the request, the keeping, the week');
await fetch(`${MOCK}/__anthropic-log?reset=1`);
const D1 = monday, D2 = addDays(D1, 7), D3 = addDays(D1, 14), D4 = addDays(D1, 21), D5 = addDays(D1, 28), D6 = addDays(D1, 35);   // Mondays
await mode('bad');
let r = await R.runResearch({ today: D1 });
ck('the look keeps three and drops fourteen, in the first week', r.state === 'ok' && r.kept === 3 && r.dropped === 14 && r.searches === 1 && r.week_start === D1, JSON.stringify(r));
const sent = await reqs();
ck('one request, with the search tool (web_search_20250305, up to five searches, the sites on the list)', sent.length === 1 && sent[0].tools.length === 1 && sent[0].tools[0].type === 'web_search_20250305' && sent[0].tools[0].name === 'web_search' && sent[0].tools[0].max_uses === 5 && sent[0].tools[0].allowed_domains.join() === R.ALLOWED_DOMAINS.join() && sent[0].tools[0].allowed_domains.includes('facebook.com'));
const want = `Today's date: ${D1}.\nThe business: ${R.BUSINESS}.\nThe questions:\n${R.QUESTIONS.map((q, i) => `(${String.fromCharCode(97 + i)}) ${q}`).join('\n')}`;
ck('the model is told only today’s date, the questions and the one line about the business (the message is exactly that)', sent[0].messages.length === 1 && sent[0].messages[0].content === want && Object.keys(sent[0]).sort().join() === 'max_tokens,messages,model,system,tools', Object.keys(sent[0]).join());
ck('and there is no address, no dollar figure and no EP name in the whole request', !/@/.test(JSON.stringify(sent[0])) && !/\$\d/.test(JSON.stringify(sent[0])) && !/Marker|example\.invalid|Kali|Synthetic/i.test(JSON.stringify(sent[0])));
ck('the key went in the header, and never into the body', !/mock-anthropic-key/.test(JSON.stringify(sent[0])));
let rows = await S.listRows('outside_notes');
const notes = rows.filter(x => x.kind === 'note'), runs = rows.filter(x => x.kind === 'run');
ck('three notes and one run row are kept, all under that Monday', notes.length === 3 && runs.length === 1 && rows.every(x => x.week_start === D1));
ck('each note has its statement, status New, the day it was read, and sources with address, title and snippet', notes.every(n => n.status === 'New' && n.read_at && n.sources.length >= 1 && n.sources.every(s => s.url && s.title && s.snippet)));
ck('the run row says what happened: searches, results, asked, kept, and why each was left out', runs[0].info.searches === 1 && runs[0].info.results === 6 && runs[0].info.kept === 3 && runs[0].info.dropped.length === 14);
r = await R.runResearch({ today: D1 });
ck('looking again in the same week replaces that week, never doubles it', (await S.listRows('outside_notes')).filter(x => x.week_start === D1).length === 4);
await mode('empty');
r = await R.runResearch({ today: D1 });
ck('a second look that finds nothing leaves the week’s statements alone', r.state === 'unchanged' && (await S.listRows('outside_notes')).filter(x => x.kind === 'note').length === 3, JSON.stringify(r));
await mode('bad');
r = await R.runResearch({ today: D2 });
rows = await S.listRows('outside_notes');
ck('the next Monday: the same three are “Seen before”, and last week’s stay New', r.kept === 3 && rows.filter(x => x.week_start === D2 && x.kind === 'note').every(n => n.status === 'Seen before') && rows.filter(x => x.week_start === D1 && x.kind === 'note').every(n => n.status === 'New'));
const v = await R.researchView({});
ck('the view shows the latest week first, past weeks, and the notes with their sources', v.exists && v.ai && v.week.week_start === D2 && v.weeks.length === 2 && v.notes.length === 3 && v.week.dropped === 14 && v.questions.length === 4, JSON.stringify(v.week));
ck('the page data shows each source’s own date in plain form (“16 Nov 2026”), and nothing when the result gave none', v.notes.every(n => n.sources.every(x => /^\d{1,2} \w{3} \d{4}$|^\w{3} \d{4}$/.test(x.published))) && !JSON.stringify(v).includes('page says'));
ck('with no results synced yet “Your numbers” has nothing to show (too few), and says so by having no figures', v.ours.days === 30 && v.ours.figures.length === 0);
ck('a past week can be asked for', (await R.researchView({ week: D1 })).week.week_start === D1 && (await R.researchView({ week: D1 })).notes.every(n => n.status === 'New'));
await mode('fail');
const before = (await S.listRows('outside_notes')).length;
r = await R.runResearch({ today: D3 });
ck('a failed call says so and keeps nothing', r.state === 'failed' && (await S.listRows('outside_notes')).length === before);
await mode('searcherror');
r = await R.runResearch({ today: D3 });
ck('the search tool reporting an error is a failed look too, and nothing is kept', r.state === 'failed' && (await S.listRows('outside_notes')).length === before);
await mode('empty');
r = await R.runResearch({ today: D4 });
rows = await S.listRows('outside_notes');
ck('an empty week is kept as a run with nothing, and says nothing new', r.state === 'empty' && rows.some(x => x.week_start === D4 && x.kind === 'run' && x.info.state === 'empty') && !rows.some(x => x.week_start === D4 && x.kind === 'note'));
const ve = await R.researchView({});
ck('the page data for it: no notes, state empty', ve.week.week_start === D4 && ve.week.state === 'empty' && ve.notes.length === 0);
await mode('pause');
await fetch(`${MOCK}/__anthropic-log?reset=1`);
r = await R.runResearch({ today: D5 });
ck('a search that pauses part-way is sent back once and finishes (two requests, three kept)', r.state === 'ok' && r.kept === 3 && (await reqs()).length === 2, JSON.stringify(r));
ck('and the second request carries the first answer back, still with no EP data', (await reqs())[1].messages.length === 2 && !/Marker|@|Kali/.test(JSON.stringify((await reqs())[1].messages[0])));
await mode('good');
console.log('-- “Your numbers” (from our synced Meta results), and that none of it reaches the search');
const dEt = n => addDays(new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' }), n);
await S.upsertResults([
  { date: dEt(-3), campaign_id: 'cmp_x', adset_id: 'ads_x', ad_id: '', spend_cents: 36000, impressions: 20000, clicks: 300, leads: 12, purchases: 0, revenue_cents: 0 },
  { date: dEt(-3), campaign_id: 'cmp_x', adset_id: 'ads_x', ad_id: 'ad_x', spend_cents: 36000, impressions: 20000, clicks: 300, leads: 12, purchases: 0, revenue_cents: 0 },   // the ad's own row: never counted twice
  { date: dEt(-45), campaign_id: 'cmp_x', adset_id: 'ads_x', ad_id: '', spend_cents: 999900, impressions: 900000, clicks: 9000, leads: 900, purchases: 0, revenue_cents: 0 },   // too old for the last 30 days
]);
const vo = await R.researchView({ week: D3 });
ck('with results in the last 30 days: cost per 1,000 views, per click and per lead, each with what it rests on (ad rows and old days not counted)', vo.ours.figures.map(f => `${f.key} ${f.value} ${f.per} (${f.basis})`).join('|') === 'cpm $18.00 per 1,000 views (20,000 views)|cpc $1.20 per click (300 clicks)|cpl $30.00 per lead (12 leads)', JSON.stringify(vo.ours));
await fetch(`${MOCK}/__anthropic-log?reset=1`);
await mode('good');
r = await R.runResearch({ today: addDays(D5, 3) });
const vb = (await R.researchView({})).notes.find(n => /cost per click/.test(n.statement));
ck('the outside cost per click is shown beside ours: “Ours $1.20 per click. Outside $1.72 per click”, both computed in code', vb && vb.compare && vb.compare.ours === '$1.20' && vb.compare.outside === '$1.72' && vb.compare.per === 'per click', JSON.stringify(vb));
ck('the other statements (a policy, a CPM rise in percent) are shown with no comparison', (await R.researchView({})).notes.filter(n => n.compare).length === 1);
const sentNow = await reqs(), bodyNow = JSON.stringify(sentNow);
ck('the request that went out after the figures were saved has none of them: no $18.00, $1.20, $30.00, 36000, 20,000, 300 clicks, no campaign or ad set id', sentNow.length >= 1 && !/18\.00|1\.20|30\.00|36000|20,?000|300 clicks|cmp_x|ads_x|ad_x/.test(bodyNow) && !/\$\d/.test(bodyNow) && sentNow.every(b => b.messages[0].content === `Today's date: ${addDays(D5, 3)}.\nThe business: ${R.BUSINESS}.\nThe questions:\n${R.QUESTIONS.map((q, i) => `(${String.fromCharCode(97 + i)}) ${q}`).join('\n')}`));
ck('the instructions ask for whole sentences, the question letter, recent sources and no health, weight-loss, diet, mental-health or financial-product content', /complete plain sentence/.test(sentNow[0].system) && /Never stop part-way/.test(sentNow[0].system) && /last 60 to 90 days/.test(sentNow[0].system) && /health, weight loss, diet, mental health or financial products/.test(sentNow[0].system) && /letter of the question/.test(sentNow[0].system));
ck('the four questions: what Meta changed in 60 days, what advertisers pay, this season’s costs, policy changes in 60 days (not standing policy)', R.QUESTIONS.length === 4 && /last 60 days/.test(R.QUESTIONS[0]) && /CPM, CPC, cost-per-lead/.test(R.QUESTIONS[1]) && /Black Friday/.test(R.QUESTIONS[2]) && /last 60 days/.test(R.QUESTIONS[3]) && /Leave out standing policy/.test(R.QUESTIONS[3]));
ck('and none of the questions is about health, wellness, dieting, weight loss or mental health', R.QUESTIONS.every(q => !/health|wellness|diet|weight|mental|anxiety|depress|financ|loan|credit/i.test(q)));
ck('the list of sites keeps Meta’s and now has the industry ones on ad costs', ['facebook.com', 'transparency.meta.com', 'developers.facebook.com', 'about.fb.com', 'meta.com', 'wordstream.com', 'hubspot.com', 'socialmediaexaminer.com', 'searchenginejournal.com', 'adweek.com', 'marketingland.com', 'searchengineland.com', 'emarketer.com', 'sproutsocial.com', 'hootsuite.com', 'adespresso.com', 'tinuiti.com', 'databox.com'].every(d => R.ALLOWED_DOMAINS.includes(d)));
await mode('good');
const KEY = process.env.ANTHROPIC_API_KEY; delete process.env.ANTHROPIC_API_KEY;
await fetch(`${MOCK}/__anthropic-log?reset=1`);
r = await R.runResearch({ today: D6 });
ck('with no key it says so, asks nothing and keeps nothing', r.state === 'no_key' && (await reqs()).length === 0 && !(await S.listRows('outside_notes')).some(x => x.week_start === D6));
ck('and a preview asks nothing either, and says whether the key is set', (await R.runResearch({ preview: true })).key === false && (await reqs()).length === 0);
process.env.ANTHROPIC_API_KEY = KEY;
const pv = await R.runResearch({ preview: true });
ck('a preview with the key says how many searches and questions, and asks nothing', pv.preview === true && pv.key === true && pv.searches_allowed === 5 && pv.questions === 4 && (await reqs()).length === 0);
ck('the questions are about outside things only (no EP account words)', R.QUESTIONS.every(q => !/campaign|spend|customer|our |Kali|\$\d/i.test(q)) && R.QUESTIONS.length <= R.MAX_SEARCHES);
console.log(bad ? `${bad} FAILED` : 'all ok'); process.exit(bad ? 1 : 0);
