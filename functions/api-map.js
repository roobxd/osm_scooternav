import { respondJSON } from './_utils.js';

export async function handle(request, env) {
  if (request.method !== 'GET') return respondJSON({ error: 'Method Not Allowed' }, 405);
  const obj = await env.MAPDATA.get('nl.geojson');
  if (!obj) return respondJSON({ error: 'Not Found' }, 404);
  // obj is R2Object; obj.body is a ReadableStream
  return new Response(obj.body, {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    }
  });
}