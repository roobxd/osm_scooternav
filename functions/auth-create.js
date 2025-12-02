import { respondJSON, json, hashPassword, requireAuth } from './_utils.js';

// Admin-only endpoint to create users in KV during setup
// Requires env.ADMIN_TOKEN; client must send header: X-Admin-Token: <token>
// POST /admin/create-user { username, password }
export async function handle(request, env) {
  if (request.method !== 'POST') return respondJSON({ error: 'Method Not Allowed' }, 405);
  // Allow either admin token or a logged-in admin user
  const token = request.headers.get('X-Admin-Token');
  if (!(env.ADMIN_TOKEN && token === env.ADMIN_TOKEN)) {
    const auth = await requireAuth(request, env);
    if (!auth || !auth.user?.isAdmin) {
      return respondJSON({ error: 'Forbidden' }, 403);
    }
  }
  const body = await json(request);
  if (!body || !body.username || !body.password) return respondJSON({ error: 'Invalid payload' }, 400);

  const salt = env.PASSWORD_SALT || '';
  const passwordHash = await hashPassword(body.username, body.password, salt);
  const key = `users:${body.username}`;
  const value = { username: body.username, passwordHash, changeCount: 0, isAdmin: !!body.isAdmin };
  await env.USERS.put(key, JSON.stringify(value));
  return respondJSON({ ok: true, user: { username: body.username, isAdmin: !!body.isAdmin } });
}