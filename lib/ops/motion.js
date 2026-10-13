// Motion is the master task list. Vercel: MOTION_API_KEY, optional MOTION_WORKSPACE_ID
const BASE = process.env.MOTION_BASE || 'https://api.usemotion.com/v1';
async function motion(path, init = {}) {
  if (!process.env.MOTION_API_KEY) throw new Error('MOTION_API_KEY is not set');
  const res = await fetch(BASE + path, {
    ...init, cache: 'no-store',
    headers: { 'X-API-Key': process.env.MOTION_API_KEY, 'Content-Type': 'application/json', ...(init.headers || {}) },
  });
  if (res.status === 429) { const e = new Error('Motion rate limit reached'); e.rateLimited = true; throw e; }
  const text = await res.text();
  if (!res.ok) throw new Error(`Motion ${path} failed: ${res.status} ${text}`);
  return text ? JSON.parse(text) : {};
}

let ws = null;
export async function workspaceId() {
  if (process.env.MOTION_WORKSPACE_ID) return process.env.MOTION_WORKSPACE_ID;
  if (ws) return ws;
  const j = await motion('/workspaces');
  ws = (j.workspaces || [])[0]?.id;
  if (!ws) throw new Error('No Motion workspace found');
  return ws;
}

let cache = { at: 0, tasks: [] };
export async function listTasks({ fresh = false } = {}) {
  if (!fresh && Date.now() - cache.at < 90_000) return cache.tasks;
  const w = await workspaceId();
  const out = []; let cursor = '';
  do {
    const j = await motion(`/tasks?workspaceId=${w}&includeAllStatuses=true${cursor ? `&cursor=${cursor}` : ''}`);
    out.push(...(j.tasks || [])); cursor = j.meta?.nextCursor || '';
  } while (cursor);
  const tasks = out.map(t => ({
    id: t.id, name: t.name, description: t.description || '', due: (t.dueDate || '').slice(0, 10),
    completed: !!t.completed || !!t.status?.isResolvedStatus,
    // Labels, plus a "[Role]" prefix in the name (used when the Motion label doesn't exist)
    labels: [...(t.labels || []).map(l => l.name || l), ...((t.name || '').match(/^\[([^\]]+)\]/) ? [t.name.match(/^\[([^\]]+)\]/)[1]] : [])].filter(Boolean),
    // "Blocked — waiting on X" is kept in the description as [blocked:Name]
    blockedOn: ((t.description || '').match(/\[blocked:([^\]]+)\]/) || [])[1] || '',
    // Closed by the auto-complete job: the date it did so ([auto:2026-10-08:rule] in the description)
    auto: ((t.description || '').match(/\[auto:(\d{4}-\d{2}-\d{2})/) || [])[1] || '',
  }));
  cache = { at: Date.now(), tasks };
  return tasks;
}

export async function createTask({ name, due, labels, description }) {
  const w = await workspaceId();
  cache.at = 0;
  // Motion rejects an empty labels list, so only send labels when there are some
  const body = { name, workspaceId: w, dueDate: `${due}T17:00:00.000Z`, description, autoScheduled: null };
  if (labels && labels.length) body.labels = labels;
  return motion('/tasks', { method: 'POST', body: JSON.stringify(body) });
}

let resolved = null, reopenAs = null;
export async function completeTask(id) {
  if (!resolved) {
    const j = await motion(`/statuses?workspaceId=${await workspaceId()}`);
    resolved = (Array.isArray(j) ? j : j.statuses || []).find(s => s.isResolvedStatus)?.name || 'Completed';
  }
  cache.at = 0;
  return motion(`/tasks/${id}`, { method: 'PATCH', body: JSON.stringify({ status: resolved }) });
}

// Undo a completion: back to the workspace's default open status
export async function reopenTask(id) {
  if (!reopenAs) {
    const j = await motion(`/statuses?workspaceId=${await workspaceId()}`);
    const all = Array.isArray(j) ? j : j.statuses || [];
    reopenAs = (all.find(s => s.isDefaultStatus && !s.isResolvedStatus) || all.find(s => !s.isResolvedStatus))?.name || 'Todo';
  }
  cache.at = 0;
  return motion(`/tasks/${id}`, { method: 'PATCH', body: JSON.stringify({ status: reopenAs }) });
}

// Change a task's name, labels, description or due date (only the fields given)
export async function updateTask(id, { name, labels, description, due } = {}) {
  const body = {};
  if (name !== undefined) body.name = name;
  if (labels !== undefined) body.labels = labels;
  if (description !== undefined) body.description = description;
  if (due) body.dueDate = `${due}T17:00:00.000Z`;
  cache.at = 0;
  return motion(`/tasks/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
}

// A task that a newer assignment has replaced: renamed and closed, so it drops off everyone's lists
export async function retireTask(id, name) {
  await updateTask(id, { name: `${name.replace(/ \(superseded\)$/, '')} (superseded)` });
  return completeTask(id);
}

// Comments live in Motion. Everything goes through Jake's API key, so the writer's name is put in the text.
export async function addComment(taskId, content) {
  return motion('/comments', { method: 'POST', body: JSON.stringify({ taskId, content }) });
}
export async function listComments(taskId) {
  const j = await motion(`/comments?taskId=${encodeURIComponent(taskId)}`);
  return (j.comments || []).map(c => ({ id: c.id, content: c.content || '', at: c.createdAt || '' }))
    .sort((a, b) => a.at.localeCompare(b.at));
}
