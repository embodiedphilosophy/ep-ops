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

let resolved = null;
export async function completeTask(id) {
  if (!resolved) {
    const j = await motion(`/statuses?workspaceId=${await workspaceId()}`);
    resolved = (Array.isArray(j) ? j : j.statuses || []).find(s => s.isResolvedStatus)?.name || 'Completed';
  }
  cache.at = 0;
  return motion(`/tasks/${id}`, { method: 'PATCH', body: JSON.stringify({ status: resolved }) });
}
