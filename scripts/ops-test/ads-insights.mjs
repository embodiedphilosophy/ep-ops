// Ads PR 5: the checking of what a model writes (lib/ops/insightsverify.js, no imports, so it loads on its own), in node. No app, no mock needed.
// A claim must cite metrics that exist, and every number in its text must equal one of the cited metrics (rounded); anything else is dropped, never repaired.
import * as V from '../../lib/ops/insightsverify.js';
let bad = 0; const ck = (n, c, x = '') => { if (c) console.log('ok  ', n); else { bad++; console.log('FAIL', n, x); } };
const M = new V.Metrics(), W = { from: '2026-11-20', to: '2026-11-26', text: '20 Nov to 26 Nov' };
const spend = M.add({ label: 'Ad spend this week', value: 1234.56, unit: 'usd', source: 'meta', period: W });
const buys = M.add({ label: 'Purchases from ads this week', value: 12, unit: 'count', source: 'meta', period: W });
const roas = M.add({ label: 'Return on ad spend this week', value: 2.4, unit: 'ratio', source: 'meta', period: W });
const chg = M.add({ label: 'Change in ad spend from the week before', value: -12.4, unit: 'pct', source: 'meta', period: W });
const kali = M.add({ label: 'Kali Winter 2027: purchases', value: 7, unit: 'count', source: 'circle', period: W, topic: 'Kali' });
const by = new Map(M.list.map(m => [m.id, m]));
const v = (text, ...ids) => V.verifyText(text, ids, by, ['Kali Winter 2027']);

console.log('-- how each kind of number is shown');
ck('money, a count, a return, a change', spend.text === '$1,235' && buys.text === '12' && roas.text === '2.4×' && chg.text === '-12%', JSON.stringify([spend.text, buys.text, roas.text, chg.text]));
console.log('-- a claim that rests on its numbers is kept');
ck('the exact text of a metric passes', v('Ad spend this week was $1,235.', 'm1') === '');
ck('rounding is tolerated: $1,234.56, $1,235 and $1,234.6 all match $1234.56', v('Spend was $1,234.56.', 'm1') === '' && v('Spend was $1,235.', 'm1') === '' && v('Spend was $1,234.6.', 'm1') === '');
ck('a count, a return as 2.4x or 2.4×, 2 for 2.4 and a drop of 12% for -12.4', v('12 purchases.', 'm2') === '' && v('A return of 2.4x.', 'm3') === '' && v('A return of 2.4×.', 'm3') === '' && v('A return of 2.', 'm3') === '' && v('Spend fell 12%.', 'm4') === '' && v('Spend fell 12.4%.', 'm4') === '');
ck('two metrics, each number matching one of them', v('12 purchases at a return of 2.4×.', 'm2', 'm3') === '');
ck('a year inside a topic name is a name, not a quoted number', v('Kali Winter 2027 sold 7.', 'm5') === '' || v('Kali sold 7.', 'm5') === '');
ck('words with no numbers need only a real metric to cite', v('A quiet week for Kali.', 'm5') === '');
console.log('-- a claim that does not is dropped');
ck('a wrong number', v('Ad spend this week was $9,999.', 'm1') !== '');
ck('a number off by more than rounding (13 for 12; $1,300 for $1,235; 3× for 2.4×)', v('13 purchases.', 'm2') !== '' && v('Spend was $1,300.', 'm1') !== '' && v('A return of 3×.', 'm3') !== '');
ck('a number that belongs to a metric it did not cite', v('12 purchases.', 'm1') !== '');
ck('a sum of two cited numbers (12 + 7 = 19)', v('19 purchases in all.', 'm2', 'm5') !== '');
ck('a cited id that does not exist', v('12 purchases.', 'm99') !== '' && v('12 purchases.', 'm2', 'm99') !== '');
ck('no ids at all', v('12 purchases.') !== '' && v('12 purchases.', ...[]) !== '' && V.verifyText('12 purchases.', undefined, by) !== '');
ck('a number in words (“seven”) is checked like a digit', v('Seven purchases.', 'm5') === '' && v('Nine purchases.', 'm5') !== '');
ck('thousands as “k” are not accepted (no guessing at what it meant)', v('Spend was $1.2k.', 'm1') !== '');
ck('empty or huge text is refused', v('', 'm1') !== '' && v('x'.repeat(500), 'm1') !== '');
console.log('-- topics: one name for a campaign, a course and a product');
ck('Kali Winter 2027, Kali: the dark mother and [E034] Kali Promo #2 are the same topic', V.topicKey('Kali Winter 2027') === V.topicKey('Kali: the dark mother') && V.sameTopic(V.topicKey('Kali Winter 2027'), V.topicKey('Kali Promo #2')), V.topicKey('Kali Winter 2027'));
ck('the topic’s display name drops the season and the year', V.topicName('Kali Winter 2027') === 'Kali' && V.topicName('Sādhana School: Fall 2026') === 'Sādhana School');
ck('different topics stay different', !V.sameTopic(V.topicKey('Kali'), V.topicKey('Spanda Intensive')) && !V.sameTopic(V.topicKey('Meditation Pass'), V.topicKey('Sādhana School')));
ck('a reworded dismissed idea is the same topic (fierce compassion of Kali = Kali fierce compassion)', V.sameTopic(V.topicKey('Fierce compassion of Kali'), V.topicKey('Kali fierce compassion')));
console.log('-- words EP already uses');
const vocab = V.vocabulary(['Kali: the dark mother', 'Spanda Intensive', 'Meditation Pass', 'Sādhana School']);
ck('EP’s own words pass; a word it does not use is found', V.checkTopicWords('Kali and the dark mother', vocab).length === 0 && V.checkTopicWords('Quantum Crystal Healing', vocab).join() === 'quantum,crystal,healing');
ck('in a summary only capitalised names are checked, so plain English is fine', V.checkTopicWords('Strong sales for Kali and Spanda.', vocab, { capitalsOnly: true }).length === 0 && V.checkTopicWords('Strong sales for Kali and Atlantis.', vocab, { capitalsOnly: true }).join() === 'atlantis');
console.log('-- the week');
const w = V.windowFor('2026-11-30');   // a Monday
ck('a Monday run reads the Monday-to-Sunday that just ended, and compares with the week before', w.week_start === '2026-11-30' && w.from === '2026-11-23' && w.to === '2026-11-29' && w.prev.from === '2026-11-16' && w.prev.to === '2026-11-22', JSON.stringify(w));
ck('a week starts and ends at midnight in New York (05:00 UTC in winter, 04:00 in summer)', V.bounds({ from: '2026-11-20', to: '2026-11-26' }).join() === '2026-11-20T05:00:00.000Z,2026-11-27T05:00:00.000Z' && V.bounds({ from: '2026-07-01', to: '2026-07-02' }).join() === '2026-07-01T04:00:00.000Z,2026-07-03T04:00:00.000Z', JSON.stringify(V.bounds({ from: '2026-07-01', to: '2026-07-02' })));
ck('formats: five, each a school EP already has', V.FORMATS.length === 5 && V.FORMATS.every(f => V.formatOf(f.key)) && !V.formatOf('webinar'));
console.log(bad ? `\n${bad} failed` : '\nall passed'); process.exit(bad ? 1 : 0);
