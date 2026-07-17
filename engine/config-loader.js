'use strict';

/**
 * Config loader — the single source of truth for the active mappings at runtime.
 *
 * Reads the serializable config from the plugin store (DB), seeds it from the
 * defaults on first boot, compiles it into runtime mappings, and caches both.
 * The engine calls getMappings(); the admin API calls getRawConfig()/saveConfig().
 *
 * Everything that used to `require('../config/mappings')` now goes through here,
 * so editing the config in the DB (or the UI) changes behavior with no code change.
 */

const { compileConfig } = require('./compile');
const { validateConfig } = require('./validate');
const { defaultConfig } = require('../config/default-config');

const STORE = { type: 'plugin', name: 'search-sync' };
const KEY = 'config';

let cache = null; // { raw, mappings }

async function loadConfig(strapi) {
  const store = strapi.store(STORE);
  let raw = await store.get({ key: KEY });
  if (!raw) {
    raw = defaultConfig;
    await store.set({ key: KEY, value: raw });
    strapi.log.info('[search-sync] seeded default config into the plugin store');
  }
  cache = { raw, mappings: compileConfig(raw) };
  return cache;
}

/** Return cached config, loading it if needed. */
async function ensureLoaded(strapi) {
  return cache || loadConfig(strapi);
}

function getMappings() {
  if (!cache) throw new Error('[search-sync] config not loaded — call loadConfig(strapi) after boot');
  return cache.mappings;
}

function getRawConfig() {
  return cache && cache.raw;
}

async function saveConfig(strapi, raw) {
  const errors = validateConfig(raw);
  if (errors.length) {
    const err = new Error(`invalid config:\n- ${errors.join('\n- ')}`);
    err.validationErrors = errors;
    throw err;
  }
  const store = strapi.store(STORE);
  await store.set({ key: KEY, value: raw });
  cache = { raw, mappings: compileConfig(raw) };
  strapi.log.info('[search-sync] config updated');
  return cache;
}

async function resetConfig(strapi) {
  return saveConfig(strapi, defaultConfig);
}

module.exports = { loadConfig, ensureLoaded, getMappings, getRawConfig, saveConfig, resetConfig };
