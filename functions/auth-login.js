import { respondJSON, json, hashPassword, createSession, makeCookie, COOKIE_NAME } from './_utils.js';

export async function handle(request, env) {
  if (request.method !== 'POST') return respondJSON({ error: 'Use POST to log in', hint: 'Send JSON body with "username" and "password".' }, 405);
  let body;
  try {
    body = await json(request);
  } catch (e) {
    return respondJSON({ error: 'Invalid JSON payload', hint: 'Send a valid JSON object: { "username": "...", "password": "..." }' }, 400);
  }
  if (!body || !body.username || !body.password) return respondJSON({ error: 'Missing username or password', hint: 'Both fields are required to authenticate.' }, 400);

  // Optional mode for generating password hashes without logging in
  if (body.mode === 'hashOnly') {
    const salt = env.PASSWORD_SALT || '';
    const passwordHash = await hashPassword(body.username, body.password, salt);
    return respondJSON({ username: body.username, passwordHash });
  }

  const key = `users:${body.username}`;
  const userStr = await env.USERS.get(key);
  if (!userStr) return respondJSON({ error: 'Invalid username or password', hint: 'Check spelling; usernames are case-sensitive.' }, 401);
  let user;
  try { user = JSON.parse(userStr); } catch { return respondJSON({ error: 'Invalid username or password', hint: 'Account record unreadable; contact an admin.' }, 401); }

  const salt = env.PASSWORD_SALT || '';
  const passwordHash = await hashPassword(body.username, body.password, salt);
  if (passwordHash !== user.passwordHash) return respondJSON({ error: 'Invalid username or password', hint: 'If you forgot your password, contact an admin to reset it.' }, 401);

  const token = await createSession(user.username, env.SESSION_SECRET);
  const cookie = makeCookie(COOKIE_NAME, token, { Path: '/', Secure: !!env.SECURE_COOKIES, SameSite: 'Lax', MaxAge: 86400 });

  return respondJSON({ ok: true, user: { username: user.username, changeCount: user.changeCount || 0 } }, 200, { 'Set-Cookie': cookie });
}
