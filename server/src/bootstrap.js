'use strict';

const { createSyncMiddleware } = require('../../engine/sync');
const { buildReverseDeps } = require('../../engine/cascade');
const { loadConfig, getMappings } = require('../../engine/config-loader');
const { loadSettings, getSettingsCached } = require('../../engine/settings-loader');

/**
 * Loads the config and settings from the store (seeding defaults on first
 * boot), then registers the real-time sync middleware. From here on, every
 * create/update/publish/unpublish/delete on a mapped content-type reconciles
 * that entry against Meilisearch — and parent slug changes cascade to children.
 *
 * The middleware builds its Meilisearch client per-event from the current
 * settings, so host/key/prefix and the on/off toggle all apply live from the
 * Settings tab with no restart.
 */
module.exports = async ({ strapi }) => {
  await loadConfig(strapi);
  await loadSettings(strapi);

  const reverseDeps = buildReverseDeps(strapi, getMappings());
  strapi.documents.use(createSyncMiddleware({ strapi, reverseDeps }));

  const settings = getSettingsCached();
  strapi.log.info(
    settings.syncEnabled
      ? `[search-sync] real-time sync active → ${settings.host} (cascade parents: ${Object.keys(reverseDeps).length})`
      : '[search-sync] real-time sync is OFF (enable it in the Settings tab)'
  );
};
