import { respondJSON, requireAuth } from './_utils.js';

export async function handle(request, env) {
  if (request.method !== 'GET') return respondJSON({ error: 'Use GET to look up a user' }, 405);
  const auth = await requireAuth(request, env);
  if (!auth) return respondJSON({ error: 'Login required to look up users', hint: 'Log in and try again.' }, 401);
  if (!auth.user || !auth.user.isAdmin) return respondJSON({ error: 'Admin privileges required', hint: 'This endpoint is restricted to admins.' }, 403);

  const url = new URL(request.url);
  const name = (url.searchParams.get('name') || '').trim();
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '50', 10), 200);
  if (!name) return respondJSON({ error: 'Missing query parameter: name', hint: 'Provide ?name=<username> to search.' }, 400);

  // Load user record (case-insensitive lookup) and include stored changeCount
  let user = null;
  try {
    // Try exact match first
    const exactStr = await env.USERS.get(`users:${name}`);
    if (exactStr) {
      const parsed = JSON.parse(exactStr);
      user = { username: parsed.username || name, changeCount: parsed.changeCount || 0 };
    } else {
      // Fallback: case-insensitive search across user keys
      const list = await env.USERS.list({ prefix: 'users:' });
      const found = (list.keys || []).find(k => {
        const uname = k.name.slice('users:'.length);
        return uname.toLowerCase() === name.toLowerCase();
      });
      if (found) {
        const userStr = await env.USERS.get(found.name);
        const parsed = JSON.parse(userStr || '{}');
        user = { username: parsed.username || name, changeCount: parsed.changeCount || 0 };
      }
    }
  } catch {}
  if (!user) return respondJSON({ error: `User not found: ${name}`, hint: 'Controleer de spelling of maak de gebruiker aan via Beheer.' }, 404);

  // Gather recent changes and filter by user
  const listLimit = 1000; // fetch a large batch, then filter and slice
  const list = await env.CHANGES.list({ prefix: 'changes:', limit: listLimit });
  const byUser = [];
  for (const key of list.keys || []) {
    try {
      const val = await env.CHANGES.get(key.name);
      if (!val) continue;
      const log = JSON.parse(val);
      if (log && log.user && (String(log.user).toLowerCase() === name.toLowerCase())) byUser.push(log);
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
