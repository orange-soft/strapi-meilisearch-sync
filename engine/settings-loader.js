'use strict';

/**
 * Settings loader — all operational config lives in the plugin store (DB) and
 * is managed entirely from the admin UI. The plugin does NOT read any env vars
 * for its Meilisearch connection or indexing settings.
 *
 * Persisted:
 *   - host          Meilisearch base URL
 *   - apiKey        a scoped indexing key (search + document/index/settings
 *                   actions on <prefix>_*). NOT the master/admin key — that is
 *                   only entered transiently in the UI to mint scoped keys.
 *   - indexPrefix   per-app index prefix; indexes are named <prefix>_<locale>
 *   - defaultLocale locale used for non-localized types
 *   - syncEnabled   real-time indexing on/off
 *
 * A module-level cache lets config/runtime.js and the Meilisearch client read
 * the current values at call-time (so UI changes apply with no restart).
 */

const STORE = { type: 'plugin', name: 'search-sync' };
const KEY = 'settings';

/** Static defaults used to seed the store on first boot. */
function defaultSettings() {
  return {
    host: 'http://127.0.0.1:7700',
    apiKey: '',        // scoped indexing key (server-side credential)
    searchKey: '',     // scoped search-only key (for the public frontend)
    indexPrefix: 'search',
    defaultLocale: 'en',
    syncEnabled: true,
  };
}

let cache = null;

function sanitize(s) {
  const d = defaultSettings();
  return {
    host: typeof s?.host === 'string' && s.host.trim() ? s.host.trim() : d.host,
    apiKey: typeof s?.apiKey === 'string' ? s.apiKey : d.apiKey,
    searchKey: typeof s?.searchKey === 'string' ? s.searchKey : d.searchKey,
    indexPrefix: typeof s?.indexPrefix === 'string' && s.indexPrefix.trim() ? s.indexPrefix.trim() : d.indexPrefix,
    defaultLocale: typeof s?.defaultLocale === 'string' && s.defaultLocale.trim() ? s.defaultLocale.trim() : d.defaultLocale,
    syncEnabled: typeof s?.syncEnabled === 'boolean' ? s.syncEnabled : d.syncEnabled,
  };
}

async function loadSettings(strapi) {
  const store = strapi.store(STORE);
  let raw = await store.get({ key: KEY });
  if (!raw) {
    raw = defaultSettings();
    await store.set({ key: KEY, value: raw });
    strapi.log.info('[search-sync] seeded default settings into the plugin store (configure connection in the Settings tab)');
  }
  cache = sanitize(raw);
  return cache;
}

/** Cached settings, or null before loadSettings() ran (standalone scripts). */
function getSettingsCached() {
  return cache;
}

async function saveSettings(strapi, patch) {
  const next = sanitize({ ...(cache || defaultSettings()), ...patch });
  const store = strapi.store(STORE);
  await store.set({ key: KEY, value: next });
  cache = next;
  strapi.log.info('[search-sync] settings updated');
  return cache;
}

module.exports = { loadSettings, getSettingsCached, saveSettings, defaultSettings };
