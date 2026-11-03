// YouTube Studio: weekly Vimeo → YouTube proposals, the cuts the pipeline makes from them, and what was published.
// The heavy work (transcripts, picking the stretch, ffmpeg, thumbnails, the YouTube upload) runs in the separate
// GitHub repo embodiedphilosophy/ep-youtube-pipeline (GitHub Actions). Ops only keeps the records, shows them and
// fires the worker (repository_dispatch). The worker talks back through /api/youtube/* (Bearer OPS_PIPELINE_SECRET).
//
// Records live in the dashboard's Neon database (table ops_youtube, made on first use), like the Course Library.
// Without DATABASE_URL (local tests only) they live in memory, so a test run never touches a real database.
import crypto from 'crypto';
import { neon } from '@neondatabase/serverless';
import { loadCalendar, loadTeam } from '../calendar';
import { todayET } from '../events';
import { listTasks, createTask, completeTask, taskBackend } from './taskstore';

const url = () => process.env.DATABASE_URL || process.env.POSTGRES_URL || '';
let sqlFn = null;
const sql = () => (sqlFn ||= neon(url()));
export const persistent = () => !!url();
const mem = (globalThis.__epYouTube ||= new Map());

let ready = null;
function ensure() {
  if (!url()) return Promise.resolve();
  return (ready ||= (async () => {
    const q = sql();
    await q`CREATE TABLE IF NOT EXISTS ops_youtube (
      id text PRIMARY KEY,
      kind text NOT NULL,
      status text NOT NULL DEFAULT '',
      data jsonb NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )`;
    await q`CREATE INDEX IF NOT EXISTS ops_youtube_kind ON ops_youtube (kind, status)`;
  })().catch(e => { ready = null; throw e; }));
}

export const SERIES = ['CHITHEADS', 'Sādhana School', 'Wisdom School', 'Embodied Philosophy'];
export const PRIVACY = ['private', 'unlisted', 'public'];
const newId = p => p + crypto.randomUUID().replace(/-/g, '').slice(0, 16);
const now = () => new Date().toISOString();

async function all(kind) {
  await ensure();
  const rows = url() ? (await sql()`SELECT data FROM ops_youtube WHERE kind = ${kind} ORDER BY created_at`).map(r => r.data)
    : [...mem.values()].filter(d => d.kind === kind);
  return rows;
}
async function get(id) {
  await ensure();
  return (url() ? (await sql()`SELECT data FROM ops_youtube WHERE id = ${id}`)[0]?.data : mem.get(id)) || null;
}
async function put(rec) {
  await ensure();
  const data = { ...rec, updated_at: now() };
  if (url()) await sql()`INSERT INTO ops_youtube (id, kind, status, data, created_at, updated_at)
    VALUES (${data.id}, ${data.kind}, ${data.status || ''}, ${JSON.stringify(data)}::jsonb, ${data.created_at || now()}, now())
    ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status, data = EXCLUDED.data, updated_at = now()`;
  else mem.set(data.id, data);
  return data;
}

export const listProposals = () => all('proposal');
export const listCuts = () => all('cut');
export const getProposal = async id => { const r = await get(id); return r?.kind === 'proposal' ? r : null; };
export const getCut = async id => { const r = await get(id); return r?.kind === 'cut' ? r : null; };

// ---------- what the worker reads ----------

// Vimeo videos that must not be proposed again: published or skipped (the rule), plus anything still on its way
// (approved, being cut, waiting for review) so the same talk isn't proposed twice. A proposal nobody acted on can
// come back in a later week.
export async function usedVimeoIds() {
  const [ps, cs] = await Promise.all([listProposals(), listCuts()]);
  const ids = new Set();
  for (const p of ps) if (p.status !== 'proposed') ids.add(String(p.vimeo_id));
  for (const c of cs) if (c.source_vimeo_id) ids.add(String(c.source_vimeo_id));
  return [...ids].filter(Boolean);
}

// Programs starting in the next ~10 weeks on the Master Schedule, one row per program (first session), so the
// proposals can favour talks that seed interest in them.
export async function upcomingPrograms({ weeks = 10 } = {}) {
  const today = todayET();
  const until = new Date(Date.parse(today + 'T12:00:00Z') + weeks * 7 * 864e5).toISOString().slice(0, 10);
  const cal = await loadCalendar().catch(() => []);
  const seen = new Map();
  for (const e of cal.sort((a, b) => a.date.localeCompare(b.date))) {
    if (e.date < today || e.date > until) continue;
    const name = e.program_name || e.series || e.title;
    const key = String(name).toLowerCase().trim();
    if (!key || seen.has(key)) continue;
    seen.set(key, { title: e.program_name || e.title, start: e.date, summary: String(e.summary || e.note || '').slice(0, 400) });
  }
  return [...seen.values()];
}

// ---------- what the worker writes ----------

const num = v => (v === null || v === undefined || v === '' || Number.isNaN(Number(v)) ? null : Number(v));
const str = v => (v === null || v === undefined ? '' : String(v));
const list = v => (Array.isArray(v) ? v : String(v || '').split(',')).map(s => String(s).trim()).filter(Boolean);

// POST /proposals: the week's five. A video that already has an open proposal is refreshed, not duplicated.
export async function addProposals({ week_of, proposals = [] }) {
  if (!Array.isArray(proposals) || !proposals.length) throw new Error('No proposals sent');
  const week = str(week_of).slice(0, 10) || todayET();
  const existing = await listProposals();
  const out = [];
  for (const p of proposals) {
    if (!p?.vimeo_id) continue;
    const vid = String(p.vimeo_id);
    const open = existing.find(x => String(x.vimeo_id) === vid && x.status === 'proposed');
    const fields = {
      week_of: week, vimeo_id: vid, title: str(p.title), link: str(p.link), duration_sec: num(p.duration_sec), plays: num(p.plays),
      picture: str(p.picture), teacher: str(p.teacher), angle: str(p.angle), reason: str(p.reason),
    };
    out.push(await put(open ? { ...open, ...fields } : { id: newId('yp_'), kind: 'proposal', status: 'proposed', created_at: now(), series: '', ...fields }));
  }
  await taskFor('week', week, `YouTube: ${out.length} new video idea${out.length === 1 ? '' : 's'} to approve or skip`,
    `This week's proposals from the Vimeo archive are in Ops → YouTube. Approve the ones worth cutting for YouTube; skip the rest.`);
  return out;
}

// Fields staff can change on a cut. Once someone edits one, a later re-cut from the worker doesn't overwrite it.
export const EDITABLE = ['yt_title', 'yt_description', 'yt_tags', 'hashtags', 'thumb_headline', 'thumb_accent', 'privacy', 'publish_at', 'playlist_id', 'teacher', 'series'];

// POST /cuts: a finished cut (or a re-cut of one already made for this proposal, which keeps staff edits)
export async function addCut(b) {
  const proposal = b.proposal_id ? await getProposal(b.proposal_id) : null;
  const cuts = await listCuts();
  const prior = b.proposal_id ? cuts.find(c => c.proposal_id === b.proposal_id && c.status !== 'published') : null;
  const media = {
    proposal_id: str(b.proposal_id) || null, source_vimeo_id: str(b.source_vimeo_id || proposal?.vimeo_id), source_link: str(b.source_link || proposal?.link),
    cut_vimeo_id: str(b.cut_vimeo_id), start_sec: num(b.start_sec), end_sec: num(b.end_sec), duration_sec: num(b.duration_sec),
    why: str(b.why), opening_lines: str(b.opening_lines), source_title: proposal?.title || str(b.source_title),
  };
  const offered = {
    yt_title: str(b.yt_title).slice(0, 100), yt_description: str(b.yt_description), yt_tags: list(b.yt_tags), hashtags: list(b.hashtags),
    thumb_headline: str(b.thumb_headline), thumb_accent: str(b.thumb_accent), teacher: str(b.teacher || proposal?.teacher), series: str(b.series || proposal?.series),
  };
  let cut;
  if (prior) {
    const keep = new Set(prior.edited || []);
    const fresh = Object.fromEntries(Object.entries(offered).filter(([k]) => !keep.has(k)));
    cut = await put({ ...prior, ...media, ...fresh, status: 'review', thumb_pending: true, recut_at: now(), error: '' });
  } else {
    cut = await put({
      id: newId('yc_'), kind: 'cut', status: 'review', created_at: now(), ...media, ...offered,
      thumbnail_url: '', thumb_pending: true, privacy: 'private', publish_at: '', publish_local: null, playlist_id: '', edited: [],
      youtube_id: '', youtube_url: '', published_at: '',
    });
    await taskFor('cut', cut.id, `YouTube: review the cut of “${cut.source_title || cut.yt_title || 'a video'}”`,
      `A 15–20 minute cut is ready in Ops → YouTube → Review queue. Check the stretch, title and thumbnail, then push it to YouTube.`);
  }
  if (proposal) await put({ ...proposal, status: 'ready', cut_id: cut.id, error: '' });
  return cut;
}

// What GET /cuts/{id} returns to the worker (staff edits already applied)
export const forWorker = c => ({
  cut_id: c.id, proposal_id: c.proposal_id, source_vimeo_id: c.source_vimeo_id, source_link: c.source_link, cut_vimeo_id: c.cut_vimeo_id,
  start_sec: c.start_sec, end_sec: c.end_sec, duration_sec: c.duration_sec, why: c.why, opening_lines: c.opening_lines,
  teacher: c.teacher, series: c.series, yt_title: c.yt_title, yt_description: c.yt_description, yt_tags: c.yt_tags || [], hashtags: c.hashtags || [],
  thumb_headline: c.thumb_headline, thumb_accent: c.thumb_accent, thumbnail_url: c.thumbnail_url || '',
  privacy: c.privacy || 'private', publish_at: c.publish_at || '', playlist_id: c.playlist_id || '', status: c.status,
});

// POST /cuts/{id}/thumbnail: the JPEG goes to Vercel Blob; its public address is kept on the cut
export async function saveThumbnail(id, file, { thumb_headline, thumb_accent } = {}) {
  const cut = await getCut(id);
  if (!cut) throw new Error('No such cut');
  if (!file || typeof file.arrayBuffer !== 'function') throw new Error('Send the thumbnail as a file field called "file"');
  const bytes = Buffer.from(await file.arrayBuffer());
  if (!bytes.length || bytes.length > 4 * 1024 * 1024) throw new Error('The thumbnail must be a JPEG under 4 MB');
  let thumbnail_url;
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const { put: blobPut } = await import('@vercel/blob');
    thumbnail_url = (await blobPut(`youtube/thumbs/${id}.jpg`, bytes, { access: 'public', addRandomSuffix: true, contentType: 'image/jpeg' })).url;
  } else if (!persistent()) {
    thumbnail_url = `data:image/jpeg;base64,${bytes.toString('base64')}`;   // local tests only
  } else throw new Error('Thumbnail storage isn’t connected (BLOB_READ_WRITE_TOKEN)');
  const next = { ...cut, thumbnail_url, thumb_pending: false, thumbs: [...(cut.thumbs || []), { url: thumbnail_url, at: now() }].slice(-6) };
  if (thumb_headline !== undefined && thumb_headline !== null && thumb_headline !== '') next.thumb_headline = String(thumb_headline);
  if (thumb_accent !== undefined && thumb_accent !== null) next.thumb_accent = String(thumb_accent);
  if (next.status === 'rethumbing' || next.status === 'recutting') next.status = 'review';
  return put(next);
}

// POST /cuts/{id}/published
export async function markPublished(id, { youtube_id, youtube_url }) {
  const cut = await getCut(id);
  if (!cut) throw new Error('No such cut');
  if (!youtube_id) throw new Error('youtube_id is missing');
  const out = await put({ ...cut, status: 'published', youtube_id: String(youtube_id), youtube_url: str(youtube_url) || `https://youtu.be/${youtube_id}`, published_at: now(), error: '' });
  if (cut.proposal_id) { const p = await getProposal(cut.proposal_id); if (p) await put({ ...p, status: 'published' }); }
  await closeTask('cut', id);
  return out;
}

// ---------- what staff do (app/api/ops/youtube) ----------

export async function approve(id, { teacher, series }, who) {
  const p = await getProposal(id);
  if (!p) throw new Error('That proposal is gone');
  if (p.status !== 'proposed' && p.status !== 'skipped') throw new Error('Already approved');
  if (series && !SERIES.includes(series)) throw new Error('Pick a series from the list');
  const next = { ...p, teacher: str(teacher ?? p.teacher).trim(), series: series || p.series || '', status: 'producing', approved_by: who, approved_at: now(), fired_at: now(), error: '' };
  await dispatch('produce', { vimeo_id: p.vimeo_id, proposal_id: p.id, teacher: next.teacher, series: next.series, start: null, end: null });
  const out = await put(next);
  await weekDone(p.week_of);
  return out;
}

export async function skip(id, who, undo = false) {
  const p = await getProposal(id);
  if (!p) throw new Error('That proposal is gone');
  if (!undo && p.status !== 'proposed') throw new Error('Only a proposal that hasn’t been approved can be skipped');
  const out = await put({ ...p, status: undo ? 'proposed' : 'skipped', skipped_by: undo ? '' : who, skipped_at: undo ? '' : now(), restored_at: undo ? now() : '' });
  await weekDone(p.week_of);
  return out;
}

// Fire the produce job again for a proposal that seems stuck (the worker never reported back)
export async function retry(id, who) {
  const p = await getProposal(id);
  if (!p || p.status !== 'producing') throw new Error('Nothing to retry');
  await dispatch('produce', { vimeo_id: p.vimeo_id, proposal_id: p.id, teacher: p.teacher, series: p.series, start: null, end: null });
  return put({ ...p, fired_at: now(), retried_by: who });
}

// New York date + time → the UTC timestamp YouTube wants for a scheduled release
export function nyToUtc(date, time) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '') || !/^\d{2}:\d{2}$/.test(time || '')) return '';
  const [y, m, d] = date.split('-').map(Number), [h, mi] = time.split(':').map(Number);
  const guess = Date.UTC(y, m - 1, d, h, mi);
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
    .formatToParts(new Date(guess)).map(p => [p.type, p.value]));
  const wall = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute);
  return new Date(guess + (guess - wall)).toISOString().replace(/\.\d{3}Z$/, 'Z');
}

// Save staff edits. changes: any of EDITABLE, plus publish_date / publish_time (New York) for a scheduled release.
export async function saveCut(id, changes = {}, who) {
  const cut = await getCut(id);
  if (!cut) throw new Error('That cut is gone');
  if (cut.status === 'published') throw new Error('Already on YouTube. Change it in YouTube Studio.');
  const next = { ...cut }, edited = new Set(cut.edited || []);
  for (const k of EDITABLE) {
    if (!(k in changes) || k === 'publish_at') continue;
    let v = changes[k];
    if (k === 'yt_tags' || k === 'hashtags') v = list(v).map(t => k === 'hashtags' && !t.startsWith('#') ? '#' + t.replace(/\s+/g, '') : t);
    else v = str(v);
    if (k === 'privacy' && !PRIVACY.includes(v)) throw new Error('Privacy must be private, unlisted or public');
    if (k === 'series' && v && !SERIES.includes(v)) throw new Error('Pick a series from the list');
    if (JSON.stringify(v) !== JSON.stringify(cut[k])) { next[k] = v; edited.add(k); }
  }
  if ('publish_date' in changes || 'publish_time' in changes) {
    const date = str(changes.publish_date), time = str(changes.publish_time) || '09:00';
    if (!date) { next.publish_at = ''; next.publish_local = null; }
    else {
      const at = nyToUtc(date, time);
      if (!at) throw new Error('Use a date and a time for the scheduled release');
      next.publish_at = at; next.publish_local = { date, time };
    }
    edited.add('publish_at');
  }
  next.edited = [...edited]; next.edited_by = who; next.edited_at = now();
  return put(next);
}

export function problems(c) {
  const out = [];
  if (!c.yt_title?.trim()) out.push('Add a YouTube title.');
  if ((c.yt_title || '').length > 100) out.push('The title is over YouTube’s 100 characters.');
  if ((c.yt_description || '').length > 5000) out.push('The description is over YouTube’s 5,000 characters.');
  if (/[<>]/.test((c.yt_title || '') + (c.yt_description || ''))) out.push('YouTube doesn’t allow < or > in titles and descriptions.');
  if ((c.yt_tags || []).join(',').length > 500) out.push('The tags are over YouTube’s 500 characters in all.');
  if (!c.thumbnail_url) out.push('The thumbnail hasn’t arrived yet.');
  if (!c.cut_vimeo_id) out.push('The cut hasn’t arrived on Vimeo yet.');
  if (c.publish_at && Date.parse(c.publish_at) < Date.now() + 15 * 60e3) out.push('The scheduled time has to be at least 15 minutes from now.');
  return out;
}

export async function rethumb(id, changes, who) {
  const cut = await saveCut(id, changes, who);
  await dispatch('thumb', { vimeo_id: cut.source_vimeo_id, cut_id: cut.id, headline: cut.thumb_headline, accent: cut.thumb_accent });
  return put({ ...cut, status: 'rethumbing', fired_at: now() });
}

export async function recut(id, { start_sec, end_sec }, who) {
  const cut = await getCut(id);
  if (!cut) throw new Error('That cut is gone');
  if (cut.status === 'published') throw new Error('Already on YouTube');
  const s = num(start_sec), e = num(end_sec);
  if (s === null || e === null || s < 0 || e <= s) throw new Error('The end has to come after the start');
  if (e - s < 60) throw new Error('That’s under a minute. Check the in and out times.');
  // Sent as strings: the worker drops a bare 0 (a start at the very beginning)
  await dispatch('produce', { vimeo_id: cut.source_vimeo_id, proposal_id: cut.proposal_id, teacher: cut.teacher, series: cut.series, start: String(s), end: String(e) });
  return put({ ...cut, status: 'recutting', asked_start: s, asked_end: e, fired_at: now(), recut_by: who });
}

export async function publish(id, changes, who) {
  const cut = changes && Object.keys(changes).length ? await saveCut(id, changes, who) : await getCut(id);
  if (!cut) throw new Error('That cut is gone');
  if (cut.status === 'published') throw new Error('Already on YouTube');
  if (cut.status !== 'review') throw new Error('Wait until the new cut or thumbnail has arrived');
  const bad = problems(cut);
  if (bad.length) throw new Error(bad.join(' '));
  await dispatch('publish', { cut_id: cut.id });
  return put({ ...cut, status: 'publishing', fired_at: now(), pushed_by: who });
}

// ---------- the worker (GitHub Actions, repository_dispatch) ----------

export const dispatchConfigured = () => !!process.env.GITHUB_PIPELINE_TOKEN;
export async function dispatch(event_type, client_payload) {
  if (!dispatchConfigured()) throw new Error('The YouTube pipeline isn’t connected yet (GITHUB_PIPELINE_TOKEN on the ep-ops project).');
  const base = (process.env.GITHUB_API_BASE || 'https://api.github.com').replace(/\/$/, '');
  const repo = process.env.GITHUB_PIPELINE_REPO || 'embodiedphilosophy/ep-youtube-pipeline';
  const r = await fetch(`${base}/repos/${repo}/dispatches`, {
    method: 'POST', cache: 'no-store',
    headers: { Authorization: `Bearer ${process.env.GITHUB_PIPELINE_TOKEN}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'Content-Type': 'application/json' },
    body: JSON.stringify({ event_type, client_payload }),
  });
  if (!r.ok) throw new Error(`GitHub didn’t start the job (${r.status}). Check GITHUB_PIPELINE_TOKEN can write to ${repo}.`);
}

// ---------- the task list ----------
// One task per week of proposals and one per cut, for the directors and anyone with the Media or YouTube role.
// Tagged [yt:week:<date>] / [yt:cut:<id>] so they're made once and closed when the work is done.
async function owners() {
  const team = await loadTeam().catch(() => []);
  return [...new Set(team.filter(t => t.director || t.roles.some(r => /^(media|youtube)$/i.test(r))).map(t => t.name))];
}
async function taskFor(kind, key, name, text) {
  if (taskBackend() !== 'database') return;   // tasks only live in the database (local tests have none)
  try {
    const tag = `[yt:${kind}:${key}]`;
    if ((await listTasks({ fresh: true })).some(t => t.description.includes(tag))) return;
    await createTask({ name, due: todayET(), labels: await owners(), description: `${text}\n\nhttps://ops.embodiedphilosophy.com/ops/youtube ${tag}`, createdBy: 'YouTube pipeline' });
  } catch (e) { console.error('YouTube task', e.message); }
}
async function closeTask(kind, key) {
  if (taskBackend() !== 'database') return;
  try {
    const tag = `[yt:${kind}:${key}]`;
    for (const t of (await listTasks({ fresh: true })).filter(t => !t.completed && t.description.includes(tag))) await completeTask(t.id);
  } catch (e) { console.error('YouTube task', e.message); }
}
async function weekDone(week) {
  const left = (await listProposals()).filter(p => p.week_of === week && p.status === 'proposed');
  if (!left.length) await closeTask('week', week);
}

// ---------- the page ----------
export async function studio() {
  const [ps, cs] = await Promise.all([listProposals(), listCuts()]);
  const weeks = [...new Set(ps.map(p => p.week_of))].sort();
  const week = weeks.at(-1) || '';
  return {
    week,
    proposals: ps.filter(p => p.week_of === week),
    // Approved in an earlier week and still on their way
    earlier: ps.filter(p => p.week_of !== week && (p.status === 'producing' || (p.status === 'proposed' && p.restored_at))),
    review: cs.filter(c => c.status !== 'published').sort((a, b) => String(a.created_at).localeCompare(String(b.created_at))),
    published: cs.filter(c => c.status === 'published').sort((a, b) => String(b.published_at).localeCompare(String(a.published_at))),
    skipped: ps.filter(p => p.status === 'skipped').sort((a, b) => String(b.skipped_at).localeCompare(String(a.skipped_at))),
  };
}
