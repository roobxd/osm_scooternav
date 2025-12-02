import { respondJSON, json, requireAuth } from './_utils.js';

// Admin-only endpoint to update user flags without changing password
// Allows toggling isAdmin while preserving existing passwordHash and changeCount
// Requires either X-Admin-Token header matching env.ADMIN_TOKEN or a logged-in admin session
// POST /admin/update-user { username, isAdmin }
export async function handle(request, env) {
  if (request.method !== 'POST') return respondJSON({ error: 'Method Not Allowed' }, 405);
  const token = request.headers.get('X-Admin-Token');
  if (!(env.ADMIN_TOKEN && token === env.ADMIN_TOKEN)) {
    const auth = await requireAuth(request, env);
    if (!auth || !auth.user?.isAdmin) return respondJSON({ error: 'Forbidden' }, 403);
  }

  const body = await json(request);
  if (!body || !body.username) return respondJSON({ error: 'Invalid payload' }, 400);

  const key = `users:${body.username}`;
  const str = await env.USERS.get(key);
  if (!str) return respondJSON({ error: 'Not Found' }, 404);
  let user;
  try { user = JSON.parse(str); } catch { return respondJSON({ error: 'Corrupt user record' }, 500); }

  user.isAdmin = !!body.isAdmin;
  await env.USERS.put(key, JSON.stringify(user));
  return respondJSON({ ok: true, user: { username: user.username, isAdmin: !!user.isAdmin } });
}