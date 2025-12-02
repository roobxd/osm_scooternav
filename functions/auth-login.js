import { respondJSON, json, hashPassword, createSession, makeCookie, COOKIE_NAME } from './_utils.js';

export async function handle(request, env) {
  if (request.method !== 'POST') return respondJSON({ error: 'Method Not Allowed' }, 405);
  const body = await json(request);
  if (!body || !body.username || !body.password) return respondJSON({ error: 'Invalid payload' }, 400);

  // Optional mode for generating password hashes without logging in
  if (body.mode === 'hashOnly') {
    const salt = env.PASSWORD_SALT || '';
    const passwordHash = await hashPassword(body.username, body.password, salt);
    return respondJSON({ username: body.username, passwordHash });
  }

  const key = `users:${body.username}`;
  const userStr = await env.USERS.get(key);
  if (!userStr) return respondJSON({ error: 'Unauthorized' }, 401);
  let user;
  try { user = JSON.parse(userStr); } catch { return respondJSON({ error: 'Unauthorized' }, 401); }

  const salt = env.PASSWORD_SALT || '';
  const passwordHash = await hashPassword(body.username, body.password, salt);
  if (passwordHash !== user.passwordHash) return respondJSON({ error: 'Unauthorized' }, 401);

  const token = await createSession(user.username, env.SESSION_SECRET);
  const cookie = makeCookie(COOKIE_NAME, token, { Path: '/', Secure: !!env.SECURE_COOKIES, SameSite: 'Lax', MaxAge: 86400 });

  return respondJSON({ ok: true, user: { username: user.username, changeCount: user.changeCount || 0 } }, 200, { 'Set-Cookie': cookie });
}