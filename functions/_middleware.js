// Pages Functions middleware to route explicit paths to handlers.
// This allows us to keep the filenames requested while serving specific endpoints.

import * as login from './auth-login.js';
import * as logout from './auth-logout.js';
import * as me from './auth-me.js';
import * as map from './api-map.js';
import * as save from './api-save.js';
import * as changes from './api-changes.js';
import * as importBBox from './api-import-bbox.js';
import * as userLookup from './api-user.js';
import * as createUser from './auth-create.js';
import * as updateUser from './auth-update.js';
import * as resetBaseline from './admin-reset-baseline.js';
import * as uploadBaseline from './admin-upload.js';
import * as adminExport from './admin-export.js';

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const { pathname } = url;

  const routes = [
    { path: '/login', mod: login },
    { path: '/logout', mod: logout },
    { path: '/me', mod: me },
    { path: '/api/map', mod: map },
    { path: '/api/import-bbox', mod: importBBox },
    { path: '/api/user', mod: userLookup },
    { path: '/api/save', mod: save },
    { path: '/api/changes', mod: changes },
    { path: '/admin/create-user', mod: createUser },
    { path: '/admin/update-user', mod: updateUser },
    { path: '/admin/reset-baseline', mod: resetBaseline },
    { path: '/admin/upload', mod: uploadBaseline },
    // Admin export (merged baseline + KV deltas)
    { path: '/admin/export', mod: adminExport },
    { path: '/admin-export', mod: adminExport },
  ];

  for (const r of routes) {
    if (pathname === r.path) {
      return r.mod.handle(request, env);
    }
  }

  // Not a function route we handle; let static assets serve
  return context.next();
}
