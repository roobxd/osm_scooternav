import { respondJSON, requireAuth } from './_utils.js';

export async function handle(request, env) {
  if (request.method !== 'GET') return respondJSON({ error: 'Method Not Allowed' }, 405);

  const auth = await requireAuth(request, env);
  if (!auth) return respondJSON({ error: 'Unauthorized' }, 401);
  if (!auth.user || !auth.user.isAdmin) return respondJSON({ error: 'Forbidden' }, 403);

  const obj = await env.MAPDATA.get('nl.geojson');
  if (!obj) return respondJSON({ error: 'Not Found' }, 404);

  // Stream the merged dataset back with attachment headers for easy download
  return new Response(obj.body, {
    status: 200,
    headers: {
      'Content-Type': 'application/geo+json; charset=utf-8',
      'Cache-Control': 'no-store',
      'Content-Disposition': 'attachment; filename="nl.geojson"'
    }
  });
}