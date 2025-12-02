import { respondJSON, json, requireAuth, randomId } from './_utils.js';

export async function handle(request, env) {
  if (request.method !== 'POST') return respondJSON({ error: 'Method Not Allowed' }, 405);
  const auth = await requireAuth(request, env);
  if (!auth) return respondJSON({ error: 'Unauthorized' }, 401);
  const body = await json(request);
  if (!body) return respondJSON({ error: 'Invalid JSON' }, 400);

  // Merge incoming changes into the existing baseline stored in R2
  // Expect body to be FeatureCollection of changed features
  let baseline = { type: 'FeatureCollection', features: [] };
  try {
    const obj = await env.MAPDATA.get('nl.geojson');
    if (obj) {
      const text = await new Response(obj.body).text();
      baseline = JSON.parse(text);
    }
  } catch {}

  const byId = new Map();
  for (const f of (baseline.features || [])) {
    byId.set(f.id || `${f.properties?._osm_type || ''}:${f.properties?._osm_id || ''}`, f);
  }
  const changes = Array.isArray(body.features) ? body.features : [];
  for (const cf of changes) {
    const cid = cf.id || `${cf.properties?._osm_type || ''}:${cf.properties?._osm_id || ''}`;
    // Replace or insert
    byId.set(cid, cf);
  }
  const merged = { type: 'FeatureCollection', features: Array.from(byId.values()) };
  await env.MAPDATA.put('nl.geojson', JSON.stringify(merged), { httpMetadata: { contentType: 'application/json' } });

  // Log change
  const ts = new Date().toISOString();
  const key = `changes:${ts}:${randomId()}`;
  const log = { user: auth.user.username, timestamp: ts, summary: 'Map updated' };
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