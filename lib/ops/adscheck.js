// "Check and start" (Ads PR 2): the list that must pass before Start is enabled. Pure reads: the landing page, the pixel and the ad account are looked at,
// never changed. canSend is the part Meta itself needs before it can take the ads paused (pictures, words, audiences, link); canStart is every check.
import { getPixel, getAccount, pixelFiredWithin, hasPaymentMethod, hasToken } from './meta-ads';
import { adLink, wantAdSets, campaignTotal } from './adsdraft';
import { hasAudience } from './adsaudiences';
import { SIZES, VIDEO_SIZES } from './adsimages';

export const sizesOf = cr => (cr.kind === 'video' ? VIDEO_SIZES : Object.keys(SIZES));
export const picturesDone = cr => sizesOf(cr).every(k => /^(https?:|data:image)/.test(cr.images?.[k] || ''));
const list = xs => xs.length > 1 ? `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}` : xs[0];

async function pageIsLive(url) {
  if (!/^https?:\/\//i.test(url || '')) return false;
  try { const r = await fetch(url, { redirect: 'follow', cache: 'no-store', signal: AbortSignal.timeout(7000) }); r.body?.cancel?.().catch(() => {}); return r.status >= 200 && r.status < 400; } catch { return false; }
}

// tree: campaignTree(); step: which of the four steps fixes it (the page links there)
export async function runChecks({ campaign: c, adsets, creatives, copysets, ads }) {
  const want = wantAdSets(c.structure), link = adLink(c), items = [];
  const [px, acct, live] = await Promise.all([getPixel(), getAccount(), pageIsLive(c.landing_url)]);
  const noAud = adsets.filter(a => !hasAudience(a.targeting)).map(a => a.position);
  items.push({ key: 'audiences', step: 1, group: 'send', ok: adsets.length === want && !noAud.length && ads.length === want * 5,
    label: adsets.length === want && !noAud.length ? `${want} audience${want > 1 ? 's' : ''}, ${ads.length} ads` : noAud.length ? `Ad set ${list(noAud.map(String))} still needs an audience` : `Needs ${want} ad set${want > 1 ? 's' : ''}` });
  const noPic = creatives.filter(x => !picturesDone(x)).map(x => x.position);
  items.push({ key: 'sizes', step: 2, group: 'send', ok: creatives.length === 5 && !noPic.length, label: !noPic.length && creatives.length === 5 ? 'Every ad has all its sizes' : `Ad ${list(noPic.map(String))} ${noPic.length > 1 ? 'don’t' : 'doesn’t'} have all the sizes yet` });
  const ph = copysets.filter(x => x.is_placeholder).map(x => x.position);
  items.push({ key: 'copy', step: 2, group: 'send', ok: copysets.length === 5 && !ph.length, label: !ph.length && copysets.length === 5 ? 'All five copy sets have words and a source' : `Copy set${ph.length > 1 ? 's' : ''} ${list(ph.map(String))} still ${ph.length > 1 ? 'have' : 'has'} placeholders` });
  items.push({ key: 'link', step: 2, group: 'send', ok: !!link, label: link ? 'The ad link is set' : 'The ad link needs the landing page address' });
  items.push({ key: 'dates', step: 3, group: 'start', ok: !!c.start_date && campaignTotal(c, adsets) > 0, label: c.start_date && campaignTotal(c, adsets) > 0 ? `Starts ${c.start_date} with a daily budget` : 'Needs a start date and a daily budget' });
  items.push({ key: 'landing', step: 4, group: 'start', ok: live, label: live ? 'The landing page is live' : 'The landing page isn’t live yet', link: c.landing_url });
  items.push({ key: 'pixel', step: 4, group: 'start', ok: pixelFiredWithin(px, 24), label: pixelFiredWithin(px, 24) ? 'The pixel saw a visit in the last 24 hours' : hasToken() && !px.notConnected ? 'The pixel hasn’t fired in the last 24 hours' : 'Can’t check the pixel: Meta isn’t connected yet' });
  items.push({ key: 'payment', step: 4, group: 'start', ok: hasPaymentMethod(acct), label: hasPaymentMethod(acct) ? 'The Meta ad account has a payment method' : acct.ok ? 'The Meta ad account has no payment method' : 'Can’t check the ad account: Meta isn’t connected yet' });
  return { items, canSend: items.filter(i => i.group === 'send').every(i => i.ok), canStart: items.every(i => i.ok), failing: items.filter(i => !i.ok).map(i => i.label) };
}
