import { respondJSON, requireAuth } from './_utils.js';

export async function handle(request, env) {
  if (request.method !== 'GET') return respondJSON({ error: 'Use GET to check login status' }, 405);
  const auth = await requireAuth(request, env);
  if (!auth) return respondJSON({ error: 'No active session', hint: 'Log in to access protected endpoints.' }, 401);
  const { user } = auth;
  return respondJSON({ username: user.username, changeCount: user.changeCount || 0, isAdmin: !!user.isAdmin });
}
