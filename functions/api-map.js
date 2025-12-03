import { respondJSON, requireAuth } from './_utils.js';

export async function handle(request, env) {
  if (request.method !== 'GET') return respondJSON({ error: 'Method Not Allowed' }, 405);
  // Require authentication to access map data
  const auth = await requireAuth(request, env);
  if (!auth) return respondJSON({ error: 'Unauthorized' }, 401);
  const obj = await env.MAPDATA.get('nl.geojson');
  if (!obj) return respondJSON({ error: 'Not Found' }, 404);

  // Read baseline GeoJSON from R2
  let baseline;
  try {
    baseline = await new Response(obj.body).json();
  } catch (e) {
    return respondJSON({ error: 'Baseline parse error' }, 500);
  }

  const byId = new Map();
  if (baseline && Array.isArray(baseline.features)) {
    for (const f of baseline.features) {
      if (!f || !f.id) continue;
      byId.set(f.id, f);
    }
  } else {
    baseline = { type: 'FeatureCollection', features: [] };
  }

  // Retrieve recent changes from KV and apply in chronological order
  let list;
  try {
    list = await env.CHANGES.list({ prefix: 'changes:', limit: 1000 });
  } catch {
    list = { keys: [] };
  }

  const entries = [];
  for (const k of (list.keys || [])) {
    const val = await env.CHANGES.get(k.name);
    if (!val) continue;
    try {
      const obj = JSON.parse(val);
      entries.push(obj);
    } catch {}
  }
  // Oldest first so later edits win
  entries.sort((a, b) => (a.timestamp < b.timestamp ? -1 : 1));

  for (const entry of entries) {
    const fc = entry && entry.data;
    const feats = fc && Array.isArray(fc.features) ? fc.features : [];
    for (const f of feats) {
      if (!f || !f.id) continue;
      const props = f.properties || {};
      const deleted = (props.deleted === true) || (props._deleted === true) || (props._action === 'delete') || (f.deleted === true);
      if (deleted) {
        byId.delete(f.id);
      } else {
        byId.set(f.id, f);
      }
    }
  }

  const merged = { type: 'FeatureCollection', features: Array.from(byId.values()) };
  return respondJSON(merged);
}