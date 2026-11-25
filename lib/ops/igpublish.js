// Publishing one Weekly Plan post straight to Instagram (Graph content publishing).
// Off until META_PUBLISH=live (plus META_ACCESS_TOKEN and META_IG_USER_ID, same as the sync). Single pictures, carousels, Reels and Stories.
// Pictures and videos come from Drive as public links: Instagram downloads them itself.
import { readSlides } from './socialengine';

const GRAPH = () => process.env.META_GRAPH_URL || 'https://graph.facebook.com/v21.0';
export const publishLive = () => process.env.META_PUBLISH === 'live' && !!(process.env.META_ACCESS_TOKEN && process.env.META_IG_USER_ID);
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function call(path, params = {}, method = 'POST') {
  const q = new URLSearchParams({ ...params, access_token: process.env.META_ACCESS_TOKEN });
  const res = await fetch(`${GRAPH()}/${path}${method === 'GET' ? `?${q}` : ''}`, { method, ...(method === 'POST' && { body: q, headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }), cache: 'no-store', signal: AbortSignal.timeout(30000) });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error?.message || `Instagram answered ${res.status}`);
  return j;
}
const imageUrl = s => s.url || (s.drive_file_id ? `https://lh3.googleusercontent.com/d/${s.drive_file_id}` : '');
const videoUrl = s => s.url || (s.drive_file_id ? `https://drive.google.com/uc?export=download&id=${s.drive_file_id}` : '');
const ig = () => process.env.META_IG_USER_ID;

// Reels and videos are processed by Instagram first; wait until it says FINISHED (up to ~2 minutes)
async function ready(id) {
  for (let i = 0; i < 24; i++) {
    const s = await call(id, { fields: 'status_code' }, 'GET');
    if (!s.status_code || s.status_code === 'FINISHED') return;
    if (s.status_code === 'ERROR' || s.status_code === 'EXPIRED') throw new Error('Instagram couldn’t process the video');
    await sleep(5000);
  }
  throw new Error('Instagram is still processing the video; try again in a few minutes');
}

// → { media_id, permalink }. Throws a plain-English Error.
export async function publishPost(v) {
  if (!publishLive()) throw new Error('Publishing straight to Instagram isn’t switched on yet');
  const kind = v.media_kind || 'single', caption = [v.caption, v.hashtags].filter(Boolean).join('\n\n');
  const slides = readSlides(v);
  let creation;
  if (kind === 'carousel') {
    if (slides.length < 2) throw new Error('A carousel needs at least two slides');
    const kids = [];
    for (const s of slides) {
      const video = s.kind === 'video';
      const c = await call(`${ig()}/media`, { is_carousel_item: 'true', ...(video ? { media_type: 'VIDEO', video_url: videoUrl(s) } : { image_url: imageUrl(s) }) });
      if (video) await ready(c.id);
      kids.push(c.id);
    }
    creation = (await call(`${ig()}/media`, { media_type: 'CAROUSEL', children: kids.join(','), caption })).id;
  } else if (kind === 'reel') {
    const s = slides[0]; if (!s) throw new Error('This Reel has no video');
    creation = (await call(`${ig()}/media`, { media_type: 'REELS', video_url: videoUrl(s), caption, share_to_feed: 'true' })).id; await ready(creation);
  } else if (kind === 'story') {
    const s = slides[0] || { url: v.image_url }; if (!s.url && !s.drive_file_id) throw new Error('This story has no picture or video');
    const video = s.kind === 'video';
    creation = (await call(`${ig()}/media`, { media_type: 'STORIES', ...(video ? { video_url: videoUrl(s) } : { image_url: imageUrl(s) }) })).id; if (video) await ready(creation);
  } else {
    if (!v.image_url) throw new Error('This post has no picture');
    creation = (await call(`${ig()}/media`, { image_url: v.image_url, caption })).id;
  }
  const media = await call(`${ig()}/media_publish`, { creation_id: creation });
  if (v.first_comment) await call(`${media.id}/comments`, { message: v.first_comment }).catch(() => {}); // the post is already up; a missed comment isn't a failure
  const info = await call(media.id, { fields: 'permalink' }, 'GET').catch(() => ({}));
  return { media_id: media.id, permalink: info.permalink || '' };
}
