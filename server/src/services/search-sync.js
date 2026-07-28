'use strict';

const { buildPopulate, buildDocument, routeDeps } = require('../../../engine/document');
const { buildReverseDeps } = require('../../../engine/cascade');
const { clientFromSettings, createClient } = require('../../../engine/meilisearch');
const { indexName, defaultLocale } = require('../../../config/runtime');
const { ensureLoaded, getMappings, getRawConfig, saveConfig, resetConfig } = require('../../../engine/config-loader');
const { loadSettings, getSettingsCached, saveSettings } = require('../../../engine/settings-loader');
const { introspectContentTypes } = require('../../../engine/introspect');
const indexConfig = require('../../../config/index-settings');

const BATCH = 200;

// The only env var the plugin honors: an optional admin/master key used solely
// to mint scoped keys. When set, the UI skips the admin-key prompt.
const ADMIN_KEY_ENV = 'MEILISEARCH_ADMIN_KEY';

// Actions a scoped indexing key needs (create/populate/search its own indexes).
const INDEXING_ACTIONS = [
  'search', 'documents.add', 'documents.get', 'documents.delete',
  'indexes.create', 'indexes.get', 'settings.get', 'settings.update',
  'stats.get', 'tasks.get',
];

function isLocalized(strapi, uid) {
  const ct = strapi.contentTypes[uid];
  return !!(ct && ct.pluginOptions && ct.pluginOptions.i18n && ct.pluginOptions.i18n.localized);
}

module.exports = ({ strapi }) => ({
  /** Per-content-type status: Strapi published count vs indexed count, route, cascade. */
  async status() {
    await ensureLoaded(strapi);
    const mappings = getMappings();
    const meili = clientFromSettings();
    const reverse = buildReverseDeps(strapi, mappings);
    const rows = [];

    for (const [uid, mapping] of Object.entries(mappings)) {
      const localized = isLocalized(strapi, uid);
      const locale = localized ? defaultLocale() : undefined;
      const index = indexName(locale);

      let strapiCount = 0;
      try {
        strapiCount = await strapi.documents(uid).count({ status: 'published', ...(localized ? { locale } : {}) });
      } catch { /* count may vary by version */ }

      let indexed = null;
      try {
        const res = await meili.search(index, '', { filter: `type = ${mapping.type}`, limit: 0 });
        indexed = res.estimatedTotalHits;
      } catch { /* index may not exist yet */ }

      // which parents feed this type's URL
      const parents = Object.entries(reverse)
        .filter(([, deps]) => deps.some((d) => d.childUid === uid))
        .map(([parentUid]) => parentUid);

      rows.push({
        uid,
        type: mapping.type,
        localized,
        index,
        routeDeps: routeDeps(mapping.route),
        cascadeParents: parents,
        strapiCount,
        indexed,
        drift: indexed != null && indexed !== strapiCount,
      });
    }
    return { rows, meiliHost: (getSettingsCached() || {}).host };
  },

  /** Dry-run: the exact document that would be indexed for one entry. */
  async preview({ uid, documentId }) {
    await ensureLoaded(strapi);
    const mapping = getMappings()[uid];
    if (!mapping) throw new Error(`content-type ${uid} is not indexed`);
    const localized = isLocalized(strapi, uid);
    const locale = localized ? defaultLocale() : undefined;
    const populate = buildPopulate(uid, strapi);

    const entry = documentId
      ? await strapi.documents(uid).findOne({ documentId, populate, status: 'published', ...(locale ? { locale } : {}) })
      : (await strapi.documents(uid).findMany({ populate, limit: 1, sort: 'updatedAt:desc', status: 'published', ...(locale ? { locale } : {}) }))[0];

    if (!entry) return { found: false };
    const out = buildDocument({ entry, mapping, strapi, contentTypeUid: uid, locale });
    return { found: true, title: entry.title, documentId: entry.documentId, updatedAt: entry.updatedAt, ...out };
  },

  /** Published entries of a mapped type (newest first) for the preview picker. */
  async entries({ uid }) {
    await ensureLoaded(strapi);
    if (!getMappings()[uid]) throw new Error(`content-type ${uid} is not indexed`);
    const localized = isLocalized(strapi, uid);
    const locale = localized ? defaultLocale() : undefined;
    const rows = await strapi.documents(uid).findMany({
      limit: 100, sort: 'updatedAt:desc', status: 'published', ...(locale ? { locale } : {}),
    });
    return {
      entries: rows.map((e) => ({
        documentId: e.documentId,
        label: e.title || e.name || e.heading || e.slug || e.documentId,
        updatedAt: e.updatedAt,
      })),
    };
  },

  /** Content-type schema for the UI editors (relations, field kinds, transforms). */
  introspect() {
    return introspectContentTypes(strapi);
  },

  /** Return the raw (serializable) config the UI edits. */
  async getConfig() {
    await ensureLoaded(strapi);
    return getRawConfig();
  },

  /** Persist a new config; recompiles the active mappings immediately. */
  async saveConfig(raw) {
    if (!raw || typeof raw !== 'object' || !raw.contentTypes) {
      throw new Error('invalid config: expected an object with a contentTypes map');
    }
    await saveConfig(strapi, raw);
    return { ok: true };
  },

  /** Reset the config back to the code defaults. */
  async resetConfig() {
    await resetConfig(strapi);
    return { ok: true };
  },

  /** Reindex all mapped types (or one), pushing to Meilisearch. */
  async reindex({ uid } = {}) {
    await ensureLoaded(strapi);
    const mappings = getMappings();
    const meili = clientFromSettings();
    await meili.health();
    const targets = uid ? { [uid]: mappings[uid] } : mappings;
    const byIndex = {};
    const report = [];

    for (const [ctUid, mapping] of Object.entries(targets)) {
      if (!mapping) continue;
      const localized = isLocalized(strapi, ctUid);
      const locale = localized ? defaultLocale() : undefined;
      const populate = buildPopulate(ctUid, strapi);
      const stat = { type: mapping.type, built: 0, skipped: 0, unresolved: 0 };

      let start = 0;
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const rows = await strapi.documents(ctUid).findMany({ populate, start, limit: BATCH, status: 'published', ...(locale ? { locale } : {}) });
        if (!rows.length) break;
        for (const entry of rows) {
          const loc = localized ? entry.locale || defaultLocale() : undefined;
          const out = buildDocument({ entry, mapping, strapi, contentTypeUid: ctUid, locale: loc });
          if (out.skipped) { stat.skipped++; continue; }
          if (!out.url) { stat.unresolved++; continue; }
          const index = indexName(loc);
          (byIndex[index] = byIndex[index] || []).push(out.document);
          stat.built++;
        }
        start += rows.length;
        if (rows.length < BATCH) break;
      }
      report.push(stat);
    }

    for (const [index, docs] of Object.entries(byIndex)) {
      await meili.ensureIndex(index, indexConfig.primaryKey);
      await meili.updateSettings(index, indexConfig.settings);
      for (let i = 0; i < docs.length; i += BATCH) {
        await meili.addDocuments(index, docs.slice(i, i + BATCH), indexConfig.primaryKey);
      }
    }
    return { report, indexes: Object.keys(byIndex) };
  },

  // ---- Connection settings, tooling & playground ----------------------------

  /** UI-managed connection + settings. The API key is masked on read. */
  async getSettings() {
    const s = getSettingsCached() || (await loadSettings(strapi));
    const mask = (k) => (k ? `${k.slice(0, 4)}…${k.slice(-4)}` : '');
    return {
      settings: {
        host: s.host,
        indexPrefix: s.indexPrefix,
        defaultLocale: s.defaultLocale,
        syncEnabled: s.syncEnabled,
      },
      connection: {
        host: s.host,
        apiKeyConfigured: !!s.apiKey,
        apiKeyMasked: mask(s.apiKey),
        // Search-only key is public-safe (frontend embeds it), so return it in full.
        searchKey: s.searchKey || '',
        searchKeyConfigured: !!s.searchKey,
        indexName: indexName(s.defaultLocale),
        // Required scope for a manually-pasted key (matches what "Generate" mints).
        indexPattern: `${s.indexPrefix}_*`,
        indexingKeyActions: INDEXING_ACTIONS,
        searchKeyActions: ['search'],
        // When set, the UI skips the admin-key prompt for key generation.
        adminKeyFromEnv: !!process.env[ADMIN_KEY_ENV],
        adminKeyEnvVar: ADMIN_KEY_ENV,
      },
    };
  },

  /** Persist the connection + settings. apiKey is only updated when a value is
   *  sent (blank = leave the stored key unchanged). */
  async saveSettings(patch = {}) {
    const clean = {};
    if ('host' in patch) {
      const h = String(patch.host || '').trim();
      if (h && !/^https?:\/\//i.test(h)) throw new Error('Host must start with http:// or https://');
      clean.host = h;
    }
    if ('apiKey' in patch && typeof patch.apiKey === 'string' && patch.apiKey.trim()) {
      clean.apiKey = patch.apiKey.trim();
    }
    if ('indexPrefix' in patch) {
      const p = String(patch.indexPrefix || '').trim();
      if (!/^[A-Za-z0-9_-]+$/.test(p)) throw new Error('Index prefix may only contain letters, numbers, "-" and "_"');
      clean.indexPrefix = p;
    }
    if ('defaultLocale' in patch) {
      const l = String(patch.defaultLocale || '').trim();
      if (!/^[A-Za-z0-9_-]+$/.test(l)) throw new Error('Default locale looks invalid');
      clean.defaultLocale = l;
    }
    if ('syncEnabled' in patch) clean.syncEnabled = !!patch.syncEnabled;
    const next = await saveSettings(strapi, clean);
    return {
      ok: true,
      settings: {
        host: next.host,
        indexPrefix: next.indexPrefix,
        defaultLocale: next.defaultLocale,
        syncEnabled: next.syncEnabled,
      },
    };
  },

  /**
   * Verify the UI-configured connection end to end for the Settings status:
   *   - reachable? (public /health)
   *   - is the API key accepted? (authenticated /indexes probe)
   * Returns { ok, reachable, authOk, host, error } so the UI can say exactly
   * what's wrong (unreachable host vs missing/invalid key).
   */
  async health() {
    const s = getSettingsCached() || {};
    const host = s.host;
    const meili = clientFromSettings();

    let reachable = false;
    try {
      const res = await meili.health();
      reachable = !!res && res.status === 'available';
    } catch (e) {
      return { ok: false, reachable: false, authOk: false, host, error: `Can't reach Meilisearch at ${host}: ${e.message}` };
    }
    if (!reachable) {
      return { ok: false, reachable: false, authOk: false, host, error: `Meilisearch at ${host} is not available` };
    }

    // Reachable — now check the API key against an authenticated route.
    if (!s.apiKey) {
      return { ok: false, reachable: true, authOk: false, host, error: 'No API key set. Paste or generate a scoped indexing key below.' };
    }
    try {
      await meili.listIndexes();
      return { ok: true, reachable: true, authOk: true, host };
    } catch (e) {
      const authIssue = /401|403|unauthorized|forbidden|api key|authorization|missing|invalid/i.test(e.message || '');
      return {
        ok: false, reachable: true, authOk: false, host,
        error: authIssue
          ? `Reached ${host}, but the API key was rejected (missing or invalid): ${e.message}`
          : `Reached ${host}, but a check failed: ${e.message}`,
      };
    }
  },

  /**
   * Mint scoped Meilisearch keys and persist them. `scope` is:
   *   - 'indexing' → the plugin's own server-side indexing key (→ apiKey)
   *   - 'search'   → a public search-only key for the frontend (→ searchKey)
   *   - 'both'     → both, from a single admin-key entry (default)
   *
   * The admin key that can create keys comes from MEILISEARCH_ADMIN_KEY when
   * set, otherwise from the transient `adminKey` (UI prompt). Used once, never
   * stored. Existing keys are reused by description when the admin key can list
   * them (keys.get). Returns the generated key value(s).
   */
  async generateKey({ adminKey, scope = 'both' } = {}) {
    const s = getSettingsCached() || (await loadSettings(strapi));
    const useKey = process.env[ADMIN_KEY_ENV] || adminKey;
    if (!useKey) {
      throw new Error(`An admin key with keys.create is required (or set ${ADMIN_KEY_ENV} in .env to skip this prompt)`);
    }
    const admin = createClient({ host: s.host, apiKey: useKey });
    const pattern = `${s.indexPrefix}_*`;

    // Reuse an existing key by description when we can list (keys.get);
    // otherwise create a fresh one (only keys.create is strictly required).
    const mint = async (actions, description) => {
      let key = null;
      try {
        const existing = await admin.listKeys();
        key = (existing.results || []).find((k) => k.description === description) || null;
      } catch (e) {
        /* provided key may lack keys.get — fall through to create */
      }
      if (!key) key = await admin.createKey({ description, actions, indexes: [pattern], expiresAt: null });
      return key.key;
    };

    const wantIndexing = scope === 'indexing' || scope === 'both';
    const wantSearch = scope === 'search' || scope === 'both';

    const out = {};
    const patch = {};
    if (wantIndexing) {
      out.indexingKey = await mint(INDEXING_ACTIONS, `search-sync indexer (${pattern})`);
      patch.apiKey = out.indexingKey;
    }
    if (wantSearch) {
      out.searchKey = await mint(['search'], `search-sync search-only (${pattern})`);
      patch.searchKey = out.searchKey;
    }
    await saveSettings(strapi, patch); // persist both so they survive reloads
    return { ...out, pattern };
  },

  /** Run a live search server-side for the admin playground. */
  async runSearch({ q, types, limit, locale } = {}) {
    const s = getSettingsCached() || (await loadSettings(strapi));
    const loc = locale || s.defaultLocale;
    const index = indexName(loc);
    const opts = { limit: Math.min(Math.max(Number(limit) || 10, 1), 50) };
    const list = Array.isArray(types) ? types.filter(Boolean) : [];
    if (list.length) opts.filter = `type IN [${list.map((t) => JSON.stringify(String(t))).join(', ')}]`;
    try {
      const res = await clientFromSettings().search(index, q || '', opts);
      return {
        ok: true,
        index,
        query: q || '',
        filter: opts.filter || null,
        limit: opts.limit,
        hits: res.hits || [],
        estimatedTotalHits: res.estimatedTotalHits,
        processingTimeMs: res.processingTimeMs,
      };
    } catch (e) {
      return { ok: false, index, error: e.message };
    }
  },
});
