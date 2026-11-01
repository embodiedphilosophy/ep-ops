// Pure logic for the Meditation Pass hub (/school/meditation-pass, and GET /api/hub/meditation for Today). No network and no
// @-imports, so scripts/ops-test/meditation-hub.mjs can run it directly. Circle decides who can open what; this turns the
// member's own Circle reads (the live-session events, the replay course's sections), Ops' per-date teacher and stream, the
// mm_streams table and the member's plan into the one payload the page draws. Config and Circle ids: data/mm-hub.json.
// Notes: docs/meditation-hub.md.
import { normEvent } from '../school/tabs.js';
import { parseTime, zonedToUtc } from '../member/schedule.js';

export const TABS = [
  { key: 'week', label: 'This week' },
  { key: 'replays', label: 'Replays' },
  { key: 'upcoming', label: 'Upcoming' },
  { key: 'teachers', label: 'Teachers & streams' },
];
export const tabKey = t => (TABS.some(x => x.key === t) ? t : 'week');
export const PLANS = ['pass', 'dropin', 'none'];
export const PLAN_LABEL = { pass: 'Meditation Pass', dropin: 'Drop-in · one week', none: 'Not enrolled' };

const first = (...v) => v.find(x => x !== undefined && x !== null && x !== '');
const ms = iso => (iso ? new Date(iso).getTime() : NaN);
export const etDay = iso => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date(iso));
export const slug = s => String(s || '').toLowerCase().replace(/&/g, ' ').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
// "Dr. Abha  Rajbhandari" and "abha rajbhandari" are the same person
const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\bdr\b\.?/g, ' ').replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim();

// ---- plan ----
// pass: the Meditation Pass tag, or any membership that includes Meditation Mondays (lib/member/programmes.js OPEN: Wisdom School,
// Plus, the Sādhana School year, Sahṛdaya Upāya). dropin: one week of access to the live space without any of those. none: everyone else.
export function planOf({ pass, joinedLive }) {
  if (pass) return 'pass';
  return joinedLive ? 'dropin' : 'none';
}

// ---- streams (the mm_streams table) ----
export function normStreams(rows) {
  return (rows || []).filter(r => r && r.stream).map((r, i) => ({ order: Number(r.order) || i + 1, key: slug(r.stream), name: String(r.stream).trim(), teacher: String(r.teacher || '').trim(), approach: String(r.approach || '').trim() }))
    .sort((a, b) => a.order - b.order);
}
// A stream named in free text (a title or note); "Neuroscience" alone counts for "Neuroscience & Yoga"
export function streamIn(text, streams) {
  const t = ` ${norm(text)} `;
  if (!t.trim()) return null;
  return streams.find(s => t.includes(` ${norm(s.name)} `)) || streams.find(s => t.includes(` ${norm(s.name).split(' ')[0]} `) && norm(s.name).split(' ')[0].length >= 5) || null;
}
export const streamOfTeacher = (teachers, streams) => {
  const t = norm(teachers);
  return t ? streams.find(s => s.teacher && (t.includes(norm(s.teacher)) || norm(s.teacher).includes(t))) || null : null;
};

// ---- Ops: who teaches which Monday ----
// rows: the website's Meditation Monday events (lib/events.js, series meditation-mondays), past and upcoming. The teacher is the row's
// Teachers; the stream is the one named in its title or notes, else the stream that teacher leads (mm_streams).
export function opsDays(rows, streams) {
  const days = {};
  for (const e of rows || []) {
    if (!e || !/^\d{4}-\d{2}-\d{2}$/.test(e.date || '') || /cancel/i.test(e.status || '')) continue;
    const typed = String(e.teachers || '').trim();
    const stream = streamIn([e.public_title, e.title, e.internal_title, e.note, e.summary].filter(Boolean).join(' · '), streams) || streamOfTeacher(typed, streams);
    // A teacher who leads a stream is named as the table spells them ("Dr. Abha Rajbhandari"); a guest is named as the sheet has them
    const teacher = stream && streamOfTeacher(typed, [stream]) ? stream.teacher : typed || stream?.teacher || '';
    if (!teacher && !stream) continue;
    days[e.date] = { teacher, stream: stream?.name || '', streamKey: stream?.key || '' };
  }
  return days;
}
export const sessionTitle = (stream, teacher) => (stream && teacher ? `${stream} with ${teacher}` : stream || (teacher ? `Meditation Mondays with ${teacher}` : 'Meditation Mondays'));

// The title a replay lesson gets when Ops creates it: "Mon 26 Oct · Neuroscience & Yoga with Dr. Abha Rajbhandari". ev: a calendar row
// (date, teachers, title); streams: the normalised mm_streams table. Without a teacher or stream it is the date alone.
export function replayTitle(ev, streams) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' }).formatToParts(new Date(`${ev.date}T12:00:00Z`)).map(x => [x.type, x.value]));
  const day = `${p.weekday} ${p.day} ${p.month}`, d = opsDays([ev], streams)[ev.date];
  return d ? `${day} · ${sessionTitle(d.stream, d.teacher)}` : day;
}

// ---- live sessions ----
// Circle's events in the live space, soonest first. When Circle shows this member none (a visitor can't read the space), the
// website's own schedule stands in so dates and teachers still show; such a session has no Circle link.
export function sessionsFrom({ rawEvents, opsRows, days, cfg }) {
  const minutes = cfg.session.minutes, space = String(cfg.circle.live_space_id);
  let list = (rawEvents || []).map(normEvent).filter(e => e.spaceId === space && e.start).map(e => {
    const startsAt = new Date(ms(e.start)).toISOString();
    const raw = ms(e.end);
    return { id: e.id, startsAt, endsAt: new Date(Number.isFinite(raw) && raw > ms(e.start) ? raw : ms(e.start) + minutes * 60000).toISOString(), url: e.url || '', rsvped: e.rsvped, circle: true };
  });
  if (!list.length) {
    list = (opsRows || []).filter(e => /^\d{4}-\d{2}-\d{2}$/.test(e.date || '') && !/cancel/i.test(e.status || '') && ms(e.date) >= 0).map(e => {
      const t = parseTime(e.time) || { h: 12, m: 0, zone: 'America/New_York' };
      const st = zonedToUtc(e.date, t.h, t.m, t.zone);
      return { id: `site-${e.date}`, startsAt: st.toISOString(), endsAt: new Date(+st + minutes * 60000).toISOString(), url: '', rsvped: false, circle: false };
    });
  }
  const seen = new Set();
  return list.filter(s => !seen.has(s.id) && seen.add(s.id)).sort((a, b) => a.startsAt.localeCompare(b.startsAt)).map(s => {
    const date = etDay(s.startsAt), d = days[date] || {};
    return { ...s, date, teacher: d.teacher || '', stream: d.stream || '', streamKey: d.streamKey || '', title: sessionTitle(d.stream, d.teacher) };
  });
}
export const isOver = (s, now) => ms(s.endsAt) <= now;
// The drop-in buyer's one session: the one they have an RSVP on, else the first session in the week their access covers
export function ownSessionId(sessions, now) {
  const up = sessions.filter(s => !isOver(s, now));
  return (up.find(s => s.rsvped) || up.find(s => ms(s.startsAt) <= now + 7 * 86400000) || {}).id || null;
}
// Join live shows from 15 minutes before the start until the session ends
export const joinOpen = (s, now, before = 15) => !!s && now >= ms(s.startsAt) - before * 60000 && now < ms(s.endsAt);
export const nextOf = (sessions, now) => sessions.find(s => !isOver(s, now)) || null;
export function nextFourOf(sessions, now) {
  const i = sessions.findIndex(s => !isOver(s, now));
  return i < 0 ? [] : sessions.slice(i + 1, i + 5);
}

// ---- replays ----
const MON3 = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
// "Mon 26 Oct · Neuroscience & Yoga with Dr. Abha Rajbhandari": the date (the year comes from when the lesson was published), and
// whatever stream and teacher the title carries. Titles that don't follow the pattern still give a date if they hold "26 Oct".
export function parseReplayTitle(name, at) {
  const n = String(name || '').trim();
  const m = /(?:^|\b)(?:(?:mon|monday)\.?,?\s+)?(\d{1,2})\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?(?:\s*[·|\-–—:]\s*(.*))?$/i.exec(n);
  if (!m) return { date: null, stream: '', teacher: '' };
  const mon = MON3.indexOf(m[2].toLowerCase()), day = Number(m[1]);
  const pub = ms(at), base = Number.isFinite(pub) ? new Date(pub).getUTCFullYear() : new Date().getUTCFullYear();
  const at2 = y => Date.UTC(y, mon, day);
  // A December lesson published in January belongs to the year before; a January one published in December, to the year after
  let year = base;
  if (Number.isFinite(pub)) { if (at2(year) - pub > 60 * 86400000) year -= 1; else if (pub - at2(year) > 300 * 86400000) year += 1; }
  const date = `${year}-${String(mon + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const rest = (m[3] || '').trim(), w = /^(.*?)\s+with\s+(.+)$/i.exec(rest);
  return { date, stream: w ? w[1].trim() : '', teacher: w ? w[2].trim() : '' };
}

export function lessonOf(l) {
  const status = first(l.status, l.progress?.status, l.completion_status);
  const secs = Number(first(l.duration_in_seconds, l.duration, l.video_duration, l.length_in_seconds, l.length)) || 0;
  const thumb = first(l.thumbnail_url, l.cover_image_url, l.cover_image?.url, typeof l.cover_image === 'string' ? l.cover_image : '', l.thumbnail?.url, typeof l.thumbnail === 'string' ? l.thumbnail : '', l.image_url, l.image?.url);
  return {
    id: String(l.id), name: first(l.name, l.title) || '', url: first(l.url, l.public_url) || '',
    done: status === 'complete' || status === 'completed' || l.completed === true,
    at: first(l.published_at, l.created_at, l.updated_at) || null, minutes: secs ? Math.max(1, Math.round(secs / 60)) : null, thumb: thumb || '',
  };
}
export function sectionOf(s) {
  return { id: String(s.id), name: first(s.name, s.title) || '', lessons: (s.lessons || s.course_lessons || []).map(lessonOf) };
}

// One replay card. Ops names the teacher and stream for the session date in the title; if Ops has no entry, the title's own words are used.
export function replayOf(l, { days, streams, locked, section }) {
  const p = parseReplayTitle(l.name, l.at), ops = (p.date && days[p.date]) || {};
  const stream = ops.stream || streamIn(p.stream, streams)?.name || p.stream || streamIn(l.name, streams)?.name || '';
  const teacher = ops.teacher || p.teacher || streams.find(s => s.name === stream)?.teacher || '';
  const key = streams.find(s => s.name === stream)?.key || '';
  const titled = p.date && (stream || teacher);
  return {
    id: l.id, title: titled ? sessionTitle(stream, teacher) : l.name || 'Meditation Monday', date: p.date, teacher, stream, streamKey: key,
    minutes: l.minutes, thumb: l.thumb, done: l.done, at: l.at, locked, url: locked ? '' : l.url, section,
  };
}

// The course's sections in order: Start here, the current months as Circle lists them, then the Archive months newest first.
// Empty sections (months not yet published) are left out.
export function archiveStamp(name, at) {
  const n = String(name).toLowerCase(), mi = MON3.findIndex(m => new RegExp(`\\b${m}[a-z]*\\b`).test(n.replace(/^archive\s*[·\-–—:]?\s*/, ''))), y = /\b(20\d\d)\b/.exec(n);
  const year = y ? Number(y[1]) : Number.isFinite(ms(at)) ? new Date(ms(at)).getUTCFullYear() : 0;
  return mi < 0 ? -1 : year * 12 + mi;
}
export function orderSections(raw, cfg) {
  const all = (raw || []).map(sectionOf);
  const start = all.filter(s => s.id === String(cfg.circle.start_section_id));
  const rest = all.filter(s => s.id !== String(cfg.circle.start_section_id));
  const isArchive = s => /^archive\b/i.test(s.name);
  const current = rest.filter(s => !isArchive(s));
  const archive = rest.filter(isArchive).map((s, i) => ({ s, i, stamp: archiveStamp(s.name, s.lessons[0]?.at) }))
    .sort((a, b) => (b.stamp - a.stamp) || (a.i - b.i)).map(x => x.s); // unreadable months keep their place after the rest
  return { start, current, archive };
}

// Replay sections for people without the Pass, or when the course can't be read: the website's recent sessions with a recording.
const dayName = date => { const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).formatToParts(new Date(`${date}T00:00:00Z`)).map(x => [x.type, x.value])); return `${p.weekday} ${p.day} ${p.month}`; };
export function siteReplaySections(pastRows) {
  const rows = (pastRows || []).filter(e => /^\d{4}-\d{2}-\d{2}$/.test(e.date || '') && !/cancel/i.test(e.status || '') && (e.video_id || e.replay_link)).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 24);
  if (!rows.length) return [];
  return [{ id: 'recent', name: 'Recent sessions', lessons: rows.map(e => ({ id: `site-${e.date}`, name: dayName(e.date), url: '', done: false, at: `${e.date}T17:00:00Z`, minutes: null, thumb: '' })) }];
}

// ---- the payload ----
// in: { cfg, plan, viaWisdom, streams, rawEvents, opsUpcoming, opsPast, rawSections | null, now, feed, admin }
export function buildMeditationHub(i) {
  const { cfg, plan, streams, now } = i, locked = plan !== 'pass';
  const days = opsDays([...(i.opsPast || []), ...(i.opsUpcoming || [])], streams);
  const sessions = sessionsFrom({ rawEvents: i.rawEvents, opsRows: i.opsUpcoming, days, cfg });
  const ownId = plan === 'dropin' ? ownSessionId(sessions, now) : null;
  const open = s => plan === 'pass' || (plan === 'dropin' && s.id === ownId);
  const decorate = s => ({ id: s.id, date: s.date, startsAt: s.startsAt, endsAt: s.endsAt, title: s.title, teacher: s.teacher, stream: s.stream, streamKey: s.streamKey,
    own: s.id === ownId, open: open(s), url: open(s) ? s.url : '' });
  const upSessions = sessions.filter(s => !isOver(s, now));
  const dec = upSessions.map(decorate);

  // Replays: the course as the member reads it (the Pass), else the website's recordings, always as locked cards
  let sections = [], fromCircle = false;
  if (i.rawSections && !locked) {
    const o = orderSections(i.rawSections, cfg), mk = (g, kind) => g.filter(s => s.lessons.length).map(s => ({
      id: s.id, name: s.name, kind, lessons: [...s.lessons].map(l => replayOf(l, { days, streams, locked, section: s.id })),
    }));
    sections = [...mk(o.start, 'start'), ...mk(o.current, 'current'), ...mk(o.archive, 'archive')];
    // Within a month the newest lesson comes first
    for (const s of sections) if (s.kind !== 'start') s.lessons.sort((a, b) => String(b.date || b.at || '').localeCompare(String(a.date || a.at || '')));
    fromCircle = true;
  } else {
    sections = siteReplaySections(i.opsPast).map(s => ({ ...s, kind: 'recent', lessons: s.lessons.map(l => replayOf(l, { days, streams, locked: true, section: s.id })) }));
  }
  // Latest replay: the newest lesson that isn't in Start here
  const pool = sections.filter(s => s.kind !== 'start').flatMap(s => s.lessons);
  const stamp = r => String(r.at || (r.date ? `${r.date}T00` : '')); // newest published, so a new replay is the latest as soon as it is up
  const latest = [...pool].sort((a, b) => stamp(b).localeCompare(stamp(a)))[0] || null;
  const counts = {}; for (const r of pool) if (r.streamKey) counts[r.streamKey] = (counts[r.streamKey] || 0) + 1;
  const nextWho = {}; for (const s of upSessions) if (s.streamKey && !nextWho[s.streamKey]) nextWho[s.streamKey] = s.date;

  return {
    plan, planLabel: PLAN_LABEL[plan], viaWisdom: !!i.viaWisdom, admin: !!i.admin, kicker: cfg.session.kicker, now,
    joinBeforeMinutes: cfg.session.join_before_minutes,
    next: dec[0] || null, nextFour: dec.slice(1, 5), upcoming: dec.slice(0, 16),
    latestReplay: latest, sections, replaysFromCircle: fromCircle,
    streams: streams.map(s => ({ key: s.key, name: s.name, teacher: s.teacher, approach: s.approach, replays: counts[s.key] || 0, next: nextWho[s.key] || null })),
    links: cfg.links, feed: i.feed || '',
  };
}
