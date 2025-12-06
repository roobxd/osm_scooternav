import { respondJSON, requireAuth } from './_utils.js';

export async function handle(request, env) {
  if (request.method !== 'GET') return respondJSON({ error: 'Method Not Allowed' }, 405);
  const auth = await requireAuth(request, env);
  if (!auth) return respondJSON({ error: 'Unauthorized' }, 401);
  if (!auth.user || !auth.user.isAdmin) return respondJSON({ error: 'Forbidden' }, 403);

  const url = new URL(request.url);
  const name = (url.searchParams.get('name') || '').trim();
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '50', 10), 200);
  if (!name) return respondJSON({ error: 'Missing query parameter: name' }, 400);

  // Load user record (for stored changeCount)
  const userKey = `users:${name}`;
  let user = { username: name, changeCount: 0 };
  try {
    const userStr = await env.USERS.get(userKey);
    if (userStr) {
      const parsed = JSON.parse(userStr);
      user = { username: name, changeCount: parsed.changeCount || 0 };
    }
  } catch {}

  // Gather recent changes and filter by user
  const listLimit = 1000; // fetch a large batch, then filter and slice
  const list = await env.CHANGES.list({ prefix: 'changes:', limit: listLimit });
  const byUser = [];
  for (const key of list.keys || []) {
    try {
      const val = await env.CHANGES.get(key.name);
      if (!val) continue;
      const log = JSON.parse(val);
      if (log && log.user === name) byUser.push(log);
    } catch {}
  }
  byUser.sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1));
  const entries = byUser.slice(0, limit);

  return respondJSON({
    user,
    count: entries.length,
    entries
  });
}