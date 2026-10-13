// Chitheads episodes, read from the Spreaker RSS feed (refreshed hourly).
const FEED = process.env.CHITHEADS_RSS_URL || 'https://www.spreaker.com/show/6230267/episodes/feed';

// Shown on the public site while the feed is unreachable (the ops page filters it out)
export const placeholder = [
  { num: '', title: 'Latest episodes are loading', guest: '', duration: '', url: 'https://www.spreaker.com/podcast/chitheads-with-jacob-kyle-embodied-philosophy--6230267' },
];

// Exact tag match, so <itunes:episode> doesn't also catch <itunes:episodeType>
const tag = (xml, t) => {
  const m = xml.match(new RegExp(`<${t}(?:\\s[^>]*)?>([\\s\\S]*?)</${t}>`));
  return m ? m[1].replace(/<!\[CDATA\[|\]\]>/g, '').trim() : '';
};
const decode = s => s.replace(/&amp;/g, '&').replace(/&#39;|&apos;/g, '’').replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>');

function fmtDuration(raw) {
  if (!raw) return '';
  let secs = /^\d+$/.test(raw) ? Number(raw) : raw.split(':').reduce((a, n) => a * 60 + Number(n), 0);
  const h = Math.floor(secs / 3600), m = Math.round((secs % 3600) / 60);
  return h ? `${h}h ${String(m).padStart(2, '0')}m` : `${m} min`;
}

// "Kuṇḍalinī as the Power of Self-Recognition with Igor Kufayev" → title + "with Igor Kufayev"
function splitGuest(full) {
  const i = full.lastIndexOf(' with ');
  return i > 0 ? { title: full.slice(0, i), guest: full.slice(i + 1) } : { title: full, guest: '' };
}

export async function getEpisodes(limit = 5) {
  try {
    const res = await fetch(FEED, { next: { revalidate: 3600 } });
    if (!res.ok) throw new Error(`Feed returned ${res.status}`);
    const xml = await res.text();
    return xml.split('<item>').slice(1)
      .filter(it => tag(it, 'itunes:episodeType') !== 'trailer')
      .slice(0, limit)
      .map(it => {
        const { title, guest } = splitGuest(decode(tag(it, 'title')));
        return { num: tag(it, 'itunes:episode'), title, guest, duration: fmtDuration(tag(it, 'itunes:duration')), url: tag(it, 'link'), image: (it.match(/<itunes:image href="([^"]+)"/) || [])[1] || '' };
      });
  } catch (e) {
    console.error('Chitheads feed failed', e);
    return placeholder;
  }
}
