import { respondJSON, requireAuth } from './_utils.js';

// Admin-only endpoint to upload baseline GeoJSON directly to R2 via streaming
// POST /admin/upload  (body: raw GeoJSON)
// Requires X-Admin-Token header matching env.ADMIN_TOKEN OR a logged-in admin user
export async function handle(request, env) {
  if (request.method !== 'POST') return respondJSON({ error: 'Use POST to upload baseline dataset' }, 405);

  const token = request.headers.get('X-Admin-Token');
  if (!(env.ADMIN_TOKEN && token === env.ADMIN_TOKEN)) {
    const auth = await requireAuth(request, env);
    if (!auth || !auth.user?.isAdmin) return respondJSON({ error: 'Admin privileges required', hint: 'Provide X-Admin-Token or log in as an admin.' }, 403);
  }

  // Stream request body directly into R2. Avoid parsing large JSON in the Worker.
  const contentType = request.headers.get('Content-Type') || 'application/json';
  try {
    await env.MAPDATA.put('nl.geojson', request.body, {
      httpMetadata: { contentType }
    });
  } catch (e) {
    return respondJSON({ error: `Upload failed: ${e.message || e}` }, 500);
  }

  return respondJSON({ ok: true });
}
