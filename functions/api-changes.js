import { respondJSON, requireAuth } from './_utils.js';

export async function handle(request, env) {
  if (request.method !== 'GET') return respondJSON({ error: 'Method Not Allowed' }, 405);
  const auth = await requireAuth(request, env);
  if (!auth) return respondJSON({ error: 'Unauthorized' }, 401);

  const url = new URL(request.url);
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '20', 10), 100);

  const list = await env.CHANGES.list({ prefix: 'changes:', limit });
  const entries = [];
  for (const key of list.keys || []) {
    const val = await env.CHANGES.get(key.name);
    if (!val) continue;
    try { entries.push(JSON.parse(val)); } catch {}
  }
  entries.sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1));

  return respondJSON({ entries });
}