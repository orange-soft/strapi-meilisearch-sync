'use strict';

// Admin-only routes, mounted under /search-sync in the admin API.
// Every route is gated on the plugin::search-sync.read RBAC action, so access
// is enforced on the backend (not just hidden in the menu). Super Admins hold
// every action by default; other roles must be granted it on the Roles page.
const GATE = [{ name: 'admin::hasPermissions', config: { actions: ['plugin::search-sync.read'] } }];
const route = (method, path, handler) => ({
  method,
  path,
  handler: `search-sync.${handler}`,
  config: { policies: GATE },
});

module.exports = {
  admin: {
    type: 'admin',
    routes: [
      route('GET', '/status', 'status'),
      route('GET', '/preview', 'preview'),
      route('GET', '/entries', 'entries'),
      route('POST', '/reindex', 'reindex'),
      route('GET', '/schema', 'schema'),
      route('GET', '/config', 'getConfig'),
      route('PUT', '/config', 'saveConfig'),
      route('POST', '/config/reset', 'resetConfig'),
      route('GET', '/settings', 'getSettings'),
      route('PUT', '/settings', 'saveSettings'),
      route('GET', '/settings/health', 'health'),
      route('POST', '/settings/generate-key', 'generateKey'),
      route('POST', '/search', 'runSearch'),
    ],
  },
};
