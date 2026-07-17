'use strict';

/**
 * Register the plugin's admin RBAC action. Once registered it appears on
 * Settings → Administration Panel → Roles → <role> → Plugins → Search Sync,
 * where a Super Admin can grant it to other roles.
 *
 * Super Admin implicitly holds every action, so by default the plugin is
 * accessible to Super Admins only until access is granted to another role.
 *
 * The menu link (admin) and every admin route (server) are gated on this same
 * action, so hiding the menu and enforcing the API stay in lockstep.
 */
const RBAC_ACTIONS = [
  {
    section: 'plugins',
    displayName: 'Access the Search Sync plugin',
    uid: 'read',
    pluginName: 'search-sync',
  },
];

module.exports = async ({ strapi }) => {
  await strapi.admin.services.permission.actionProvider.registerMany(RBAC_ACTIONS);
};
