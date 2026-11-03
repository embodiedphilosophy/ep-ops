// YouTube Studio: the weekly pipeline (repo embodiedphilosophy/ep-youtube-pipeline, GitHub Actions) proposes
// five Vimeo videos from the Studio-Produced showcase; staff approve or skip; the pipeline cuts the best
// 15–20 minutes, makes a thumbnail and parks the cut on Vimeo; staff review and press Push to YouTube.
// One row per proposed video, in the dashboard's Neon database (same as tasks and hours).
// The pipeline talks to /api/youtube/* with OPS_PIPELINE_SECRET; staff use /api/ops/youtube.
// Work for the pipeline is a "job" on the row (produce | thumb | publish). The pipeline picks jobs up
// from /api/youtube/queue (every 30 minutes, or straight away when GITHUB_PIPELINE_TOKEN is set).
import { neon } from '@neondatabase/serverless';
import { getEvents, todayET } from '@/lib/events';

const url = () => process.env.DATABASE_URL || process.env.POSTGRES_URL || '';
let sqlFn = null;
const sql = () => { if (!url()) throw new Error('The database isn’t connected (DATABASE_URL)'); return (sqlFn ||= neon(url())); };
export const youtubeAvailable = () => !!url();

let ready = null;
function ensure() {
  return (ready ||= (async () => {
    await sql()`CREATE TABLE IF NOT EXISTS ops_yt_items (
      id bigserial PRIMARY KEY, week_of text NOT NULL DEFAULT '', vimeo_id text NOT NULL,
      title text NOT NULL DEFAULT '', link text NOT NULL DEFAULT '', duration_sec int, plays int, picture text,
      teacher text, series text, angle text, reason text,
      status text NOT NULL DEFAULT 'proposed', job text, job_args jsonb NOT NULL DEFAULT '{}', job_at timestamptz,
      cut jsonb NOT NULL DEFAULT '{}', thumbnail_url text,
      yt_title text, yt_description text, yt_tags text[] NOT NULL DEFAULT '{}', hashtags text[] NOT NULL DEFAULT '{}',
      thumb_headline text, thumb_accent text,
      privacy text NOT NULL DEFAULT 'private', publish_at timestamptz, playlist_id text,
      youtube_id text, youtube_url text, error text,
      decided_by text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
    )`;
    await sql()`ALTER TABLE ops_yt_items ADD COLUMN IF NOT EXISTS last_job text`;
    await sql()`CREATE INDEX IF NOT EXISTS ops_yt_items_status ON ops_yt_items (status, created_at)`;
  })().catch(e => { ready = null; throw e; }));
}

// What staff see, newest first
export const STATUS = {
  proposed: ['Proposed', 'amber'], approved: ['Queued for editing', 'amber'], producing: ['Editing now', 'amber'],
  ready: ['Ready for review', 'green'], publishing: ['Uploading to YouTube', 'amber'], published: ['On YouTube', 'green'],
  skipped: ['Skipped', ''], failed: ['Needs a retry', 'red'],
};
const shape = r => ({
  id: String(r.id), weekOf: r.week_of, vimeoId: r.vimeo_id, title: r.title, link: r.link,
  durationSec: r.duration_sec, plays: r.plays, picture: r.picture, teacher: r.teacher || '', series: r.series || '',
  angle: r.angle || '', reason: r.reason || '', status: r.status, job: r.job, cut: r.cut || {},
  thumbnailUrl: r.thumbnail_url || '', ytTitle: r.yt_title || '', ytDescription: r.yt_description || '',
  ytTags: r.yt_tags || [], hashtags: r.hashtags || [], thumbHeadline: r.thumb_headline || '', thumbAccent: r.thumb_accent || '',
  privacy: r.privacy || 'private', publishAt: r.publish_at ? new Date(r.publish_at).toISOString() : '', playlistId: r.playlist_id || '',
  youtubeId: r.youtube_id || '', youtubeUrl: r.youtube_url || '', error: r.error || '', decidedBy: r.decided_by || '',
  createdAt: new Date(r.created_at).toISOString(), updatedAt: new Date(r.updated_at).toISOString(),
});

export async function listItems() {
  await ensure();
  return (await sql()`SELECT * FROM ops_yt_items ORDER BY created_at DESC, id DESC LIMIT 300`).map(shape);
}
async function one(id) {
  await ensure();
  const [r] = await sql()`SELECT * FROM ops_yt_items WHERE id = ${Number(id)}`;
  if (!r) throw new Error('That video isn’t in the YouTube list');
  return r;
}

// Ask GitHub to run the pipeline's queue now (optional; otherwise it runs every 30 minutes)
async function nudge() {
  const token = process.env.GITHUB_PIPELINE_TOKEN;
  if (!token) return false;
  const repo = process.env.YOUTUBE_PIPELINE_REPO || 'embodiedphilosophy/ep-youtube-pipeline';
  try {
    const res = await fetch(`https://api.github.com/repos/${repo}/dispatches`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ event_type: 'queue' }),
    });
    return res.ok;
  } catch (e) { console.error('YouTube pipeline nudge failed', e.message); return false; }
}

// ---------------- staff actions ----------------
const SERIES = ['CHITHEADS', 'Sādhana School', 'Wisdom School', 'Embodied Philosophy'];
export const seriesList = SERIES;

export async function approve(id, { teacher = '', series = '' }, who) {
  const r = await one(id);
  if (!['proposed', 'skipped', 'failed'].includes(r.status)) throw new Error('That one is already under way');
  const args = { teacher: String(teacher).slice(0, 120), series: SERIES.includes(series) ? series : '' };
  await sql()`UPDATE ops_yt_items SET status = 'approved', job = 'produce', job_args = ${JSON.stringify(args)}::jsonb, job_at = now(),
    teacher = ${args.teacher || r.teacher}, series = ${args.series || r.series}, decided_by = ${who}, error = NULL, updated_at = now() WHERE id = ${r.id}`;
  return { ok: true, nudged: await nudge() };
}

export async function skip(id, who) {
  const r = await one(id);
  if (!['proposed', 'failed', 'ready'].includes(r.status)) throw new Error('That one can’t be skipped now');
  await sql()`UPDATE ops_yt_items SET status = 'skipped', job = NULL, decided_by = ${who}, updated_at = now() WHERE id = ${r.id}`;
  return { ok: true };
}

const clean = (v, n) => String(v ?? '').slice(0, n);
const list = (v, n) => (Array.isArray(v) ? v : String(v || '').split(','))
  .map(x => String(x).trim()).filter(Boolean).slice(0, n);

export async function saveEdits(id, b) {
  const r = await one(id);
  if (['publishing', 'published'].includes(r.status)) throw new Error('It’s already on its way to YouTube');
  const privacy = ['private', 'unlisted', 'public'].includes(b.privacy) ? b.privacy : r.privacy;
  const at = b.publishAt === undefined ? r.publish_at : b.publishAt ? new Date(b.publishAt) : null;
  if (b.publishAt && (isNaN(at) || at < new Date())) throw new Error('Pick a release time in the future');
  await sql()`UPDATE ops_yt_items SET
    yt_title = ${clean(b.ytTitle ?? r.yt_title, 100)}, yt_description = ${clean(b.ytDescription ?? r.yt_description, 5000)},
    yt_tags = ${list(b.ytTags ?? r.yt_tags, 30)}, hashtags = ${list(b.hashtags ?? r.hashtags, 15)},
    privacy = ${privacy}, publish_at = ${at}, playlist_id = ${clean(b.playlistId ?? r.playlist_id, 64) || null},
    updated_at = now() WHERE id = ${r.id}`;
  return { ok: true };
}

// Re-cut with new in/out points (seconds), or re-render the thumbnail with a new headline/accent
export async function requeue(id, kind, b) {
  const r = await one(id);
  if (!['ready', 'failed'].includes(r.status)) throw new Error('Wait until the current edit is ready');
  let args;
  if (kind === 'produce') {
    const start = Number(b.start), end = Number(b.end);
    if (!(start >= 0) || !(end > start)) throw new Error('Give a start and an end time');
    if (end - start < 60) throw new Error('The excerpt needs to be at least a minute long');
    args = { teacher: r.teacher || '', series: r.series || '', start, end, headline: clean(b.headline ?? r.thumb_headline, 60), accent: clean(b.accent ?? r.thumb_accent, 30) };
  } else if (kind === 'thumb') {
    const headline = clean(b.headline, 60).trim();
    if (!headline) throw new Error('Give the thumbnail a headline');
    args = { cut_id: String(r.id), headline, accent: clean(b.accent, 30).trim() };
  } else throw new Error('Unknown request');
  await sql()`UPDATE ops_yt_items SET status = 'producing', job = ${kind}, job_args = ${JSON.stringify(args)}::jsonb, job_at = now(), error = NULL, updated_at = now() WHERE id = ${r.id}`;
  return { ok: true, nudged: await nudge() };
}

export async function publish(id, who) {
  const r = await one(id);
  if (r.status !== 'ready') throw new Error('Only a finished, reviewed cut can go to YouTube');
  if (!r.cut?.cut_vimeo_id) throw new Error('The cut isn’t on Vimeo yet');
  if (!r.yt_title) throw new Error('Give it a YouTube title first');
  await sql()`UPDATE ops_yt_items SET status = 'publishing', job = 'publish', job_args = '{}'::jsonb, job_at = now(), decided_by = ${who}, error = NULL, updated_at = now() WHERE id = ${r.id}`;
  return { ok: true, nudged: await nudge() };
}

export async function retry(id) {
  const r = await one(id);
  if (r.status !== 'failed') throw new Error('Nothing to retry');
  const kind = r.last_job || 'produce';
  await sql()`UPDATE ops_yt_items SET status = ${kind === 'publish' ? 'publishing' : 'producing'}, job = ${kind}, job_at = now(), error = NULL, updated_at = now() WHERE id = ${r.id}`;
  return { ok: true, nudged: await nudge() };
}

// ---------------- pipeline side ----------------
// Videos that must not be proposed again: anything decided, plus this month's open proposals
export async function pipelineState() {
  await ensure();
  const rows = await sql()`SELECT DISTINCT vimeo_id FROM ops_yt_items
    WHERE status <> 'proposed' OR created_at > now() - interval '28 days'`;
  let upcoming = [];
  try {
    const today = todayET();
    const until = new Date(Date.parse(`${today}T12:00:00Z`) + 70 * 864e5).toISOString().slice(0, 10);
    const seen = new Set();
    for (const e of await getEvents()) {
      if (e.date > until) continue;
      const key = String(e.series || e.title || '').toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      upcoming.push({ title: e.title, start: e.date, summary: String(e.summary || e.description || e.note || '').slice(0, 300) });
      if (upcoming.length >= 15) break;
    }
  } catch (e) { console.error('YouTube: upcoming programs unavailable', e.message); upcoming = []; }
  return { used_vimeo_ids: rows.map(r => String(r.vimeo_id)), upcoming_programs: upcoming };
}

export async function addProposals({ week_of = todayET(), proposals = [] }) {
  await ensure();
  let added = 0;
  for (const p of proposals.slice(0, 10)) {
    if (!p?.vimeo_id) continue;
    const [dupe] = await sql()`SELECT id FROM ops_yt_items WHERE vimeo_id = ${String(p.vimeo_id)} AND created_at > now() - interval '28 days'`;
    if (dupe) continue;
    await sql()`INSERT INTO ops_yt_items (week_of, vimeo_id, title, link, duration_sec, plays, picture, teacher, angle, reason)
      VALUES (${clean(week_of, 10)}, ${String(p.vimeo_id)}, ${clean(p.title, 300)}, ${clean(p.link, 300)}, ${Number(p.duration_sec) || null},
        ${Number(p.plays) || null}, ${clean(p.picture, 500) || null}, ${clean(p.teacher, 120) || null}, ${clean(p.angle, 300)}, ${clean(p.reason, 600)})`;
    added++;
  }
  return { ok: true, added };
}

// The pipeline claims waiting jobs (peek = just count them)
export async function claimJobs({ peek = false } = {}) {
  await ensure();
  if (peek) {
    const [c] = await sql()`SELECT count(*)::int AS n FROM ops_yt_items WHERE job IS NOT NULL`;
    return { waiting: c.n };
  }
  const rows = await sql()`UPDATE ops_yt_items SET last_job = job, job = NULL, updated_at = now() WHERE job IS NOT NULL
    RETURNING id, vimeo_id, last_job AS kind, job_args`;
  await sql()`UPDATE ops_yt_items SET status = 'producing' WHERE status = 'approved' AND id = ANY(${rows.map(r => r.id)})`;
  return { jobs: rows.map(r => ({ id: String(r.id), vimeo_id: r.vimeo_id, kind: r.kind, ...(r.job_args || {}) })) };
}

const CUT_KEYS = ['source_vimeo_id', 'source_link', 'cut_vimeo_id', 'cut_link', 'start_sec', 'end_sec', 'duration_sec', 'why', 'opening_lines'];
export async function recordCut(b) {
  await ensure();
  const cut = Object.fromEntries(CUT_KEYS.filter(k => b[k] !== undefined).map(k => [k, b[k]]));
  let id = Number(b.proposal_id) || null;
  if (id) {
    const [r] = await sql()`SELECT id FROM ops_yt_items WHERE id = ${id}`;
    if (!r) id = null;
  }
  if (!id) { // a cut made by hand from GitHub: give it its own row
    const [r] = await sql()`INSERT INTO ops_yt_items (vimeo_id, title, link, status) VALUES (${String(b.source_vimeo_id || '')}, ${clean(b.yt_title, 300)}, ${clean(b.source_link, 300)}, 'producing') RETURNING id`;
    id = r.id;
  }
  await sql()`UPDATE ops_yt_items SET status = 'ready', cut = ${JSON.stringify(cut)}::jsonb, error = NULL,
    teacher = COALESCE(NULLIF(${clean(b.teacher, 120)}, ''), teacher), series = COALESCE(NULLIF(${clean(b.series, 60)}, ''), series),
    yt_title = ${clean(b.yt_title, 100)}, yt_description = ${clean(b.yt_description, 5000)},
    yt_tags = ${list(b.yt_tags, 30)}, hashtags = ${list(b.hashtags, 15)},
    thumb_headline = ${clean(b.thumb_headline, 60)}, thumb_accent = ${clean(b.thumb_accent, 30)}, updated_at = now() WHERE id = ${id}`;
  return { cut_id: String(id) };
}

export async function cutForPipeline(id) {
  const r = await one(id);
  const c = r.cut || {};
  return {
    id: String(r.id), ...c, teacher: r.teacher || '', series: r.series || '',
    yt_title: r.yt_title || '', yt_description: r.yt_description || '', yt_tags: r.yt_tags || [], hashtags: r.hashtags || [],
    thumb_headline: r.thumb_headline || '', thumb_accent: r.thumb_accent || '', thumbnail_url: r.thumbnail_url || '',
    privacy: r.privacy || 'private', publish_at: r.publish_at ? new Date(r.publish_at).toISOString() : null, playlist_id: r.playlist_id || null,
  };
}

export async function setThumbnail(id, thumbUrl, { headline, accent } = {}) {
  const r = await one(id);
  await sql()`UPDATE ops_yt_items SET thumbnail_url = ${thumbUrl},
    thumb_headline = COALESCE(NULLIF(${clean(headline, 60)}, ''), thumb_headline),
    thumb_accent = ${accent === undefined ? r.thumb_accent : clean(accent, 30)},
    status = CASE WHEN status = 'producing' AND job IS NULL THEN 'ready' ELSE status END, updated_at = now() WHERE id = ${r.id}`;
  return { ok: true };
}

export async function markPublished(id, { youtube_id, youtube_url }) {
  const r = await one(id);
  await sql()`UPDATE ops_yt_items SET status = 'published', youtube_id = ${clean(youtube_id, 40)}, youtube_url = ${clean(youtube_url, 200)}, error = NULL, updated_at = now() WHERE id = ${r.id}`;
  return { ok: true };
}

export async function markFailed(id, message) {
  const r = await one(id);
  await sql()`UPDATE ops_yt_items SET status = 'failed', error = ${clean(message, 600)}, updated_at = now() WHERE id = ${r.id}`;
  return { ok: true };
}
