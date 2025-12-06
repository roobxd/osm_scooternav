import { respondJSON, json, requireAuth, randomId } from './_utils.js';

export async function handle(request, env) {
  if (request.method !== 'POST') return respondJSON({ error: 'Use POST to save changes' }, 405);
  const auth = await requireAuth(request, env);
  if (!auth) return respondJSON({ error: 'Login required to save changes', hint: 'Log in and try again.' }, 401);
  let body;
  try {
    body = await json(request);
  } catch (e) {
    return respondJSON({ error: 'Invalid JSON payload', hint: 'Send a GeoJSON FeatureCollection with a "features" array.' }, 400);
  }
  if (!body) return respondJSON({ error: 'Invalid JSON payload', hint: 'Request body missing or unreadable.' }, 400);

  // Delta-only save: record changes in KV and skip baseline rewrite.
  const changes = Array.isArray(body.features) ? body.features : [];
  const featureCount = changes.length;
  // Compute a simple bbox summary for the change set
  let minLon = Infinity, minLat = Infinity, maxLon = -Infinity, maxLat = -Infinity;
  try {
    for (const f of changes) {
      const g = f && f.geometry;
      const collect = (coord) => {
        if (!Array.isArray(coord) || coord.length < 2) return;
        const lon = +coord[0];
        const lat = +coord[1];
        if (isNaN(lon) || isNaN(lat)) return;
        if (lon < minLon) minLon = lon;
        if (lat < minLat) minLat = lat;
        if (lon > maxLon) maxLon = lon;
        if (lat > maxLat) maxLat = lat;
      };
      if (!g) continue;
      if (g.type === 'Point') collect(g.coordinates);
      else if (g.type === 'LineString') for (const c of g.coordinates || []) collect(c);
      else if (g.type === 'Polygon') for (const ring of g.coordinates || []) for (const c of ring) collect(c);
      else if (g.type === 'MultiPolygon') for (const poly of g.coordinates || []) for (const ring of poly) for (const c of ring) collect(c);
    }
  } catch {}
  const bbox = (isFinite(minLon) && isFinite(minLat) && isFinite(maxLon) && isFinite(maxLat))
    ? [minLat, minLon, maxLat, maxLon]
    : null;

  // Log change
  const ts = new Date().toISOString();
  const key = `changes:${ts}:${randomId()}`;
  const log = {
    user: auth.user.username,
    timestamp: ts,
    summary: `Saved ${featureCount} feature${featureCount === 1 ? '' : 's'}`,
    bbox,
    data: { type: 'FeatureCollection', features: changes }
  };
  await env.CHANGES.put(key, JSON.stringify(log));

  // Increment user change count
  const userKey = `users:${auth.user.username}`;
  const userStr = await env.USERS.get(userKey);
  if (userStr) {
    try {
      const user = JSON.parse(userStr);
      user.changeCount = (user.changeCount || 0) + 1;
      await env.USERS.put(userKey, JSON.stringify(user));
    } catch {}
  }

  return respondJSON({ ok: true });
}
