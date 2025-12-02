import { respondJSON, requireAuth } from './_utils.js';

export async function handle(request, env) {
  if (request.method !== 'GET') return respondJSON({ error: 'Method Not Allowed' }, 405);
  const auth = await requireAuth(request, env);
  if (!auth) return respondJSON({ error: 'Unauthorized' }, 401);
  const { user } = auth;
  return respondJSON({ username: user.username, changeCount: user.changeCount || 0, isAdmin: !!user.isAdmin });
}