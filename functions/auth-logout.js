import { respondJSON, makeCookie, COOKIE_NAME } from './_utils.js';

export async function handle(request, env) {
  if (request.method !== 'POST') return respondJSON({ error: 'Use POST to log out' }, 405);
  const cookie = makeCookie(COOKIE_NAME, '', { Path: '/', Secure: !!env.SECURE_COOKIES, SameSite: 'Lax', MaxAge: 0 });
  return respondJSON({ ok: true }, 200, { 'Set-Cookie': cookie });
}
