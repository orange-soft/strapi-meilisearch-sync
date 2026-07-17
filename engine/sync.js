'use strict';

/**
 * Real-time sync — reconciles one entry against Meilisearch, and a document
 * middleware that triggers reconciliation on content changes.
 *
 * Reconcile is idempotent and event-agnostic: given a documentId it re-fetches
 * the *published* version and either upserts it (published + resolvable URL) or
 * removes it (unpublished / deleted / skipped / no URL). This means every
 * lifecycle event — create, update, publish, unpublish, delete — funnels
 * through the same safe code path.
 */

const { getMappings } = require('./config-loader');
const { getSettingsCached } = require('./settings-loader');
const { clientFromSettings } = require('./meilisearch');
const { buildPopulate, buildDocument, docId } = require('./document');
const { indexName, defaultLocale } = require('../config/runtime');
const indexConfig = require('../config/index-settings');

const SYNC_ACTIONS = new Set(['create', 'update', 'publish', 'unpublish', 'delete', 'discardDraft']);
// A parent slug can only change via update/publish; unpublish/delete break child
// URLs too, so children are reconciled (→ removed) on those as well.
const CASCADE_ACTIONS = new Set(['update', 'publish', 'unpublish', 'delete']);

function isLocalized(strapi, uid) {
  const ct = strapi.contentTypes[uid];
  return !!(ct && ct.pluginOptions && ct.pluginOptions.i18n && ct.pluginOptions.i18n.localized);
}

/** Reconcile a single (documentId, locale) against the search index. */
async function reconcile({ strapi, meili, uid, documentId, locale }) {
  const mapping = getMappings()[uid];
  if (!mapping || !documentId) return { skipped: true, reason: 'unmapped' };

  const localized = isLocalized(strapi, uid);
  const loc = localized ? locale || defaultLocale() : undefined;
  const index = indexName(loc);
  const id = docId(mapping.type, documentId, loc);

  const populate = buildPopulate(uid, strapi);
  const entry = await strapi.documents(uid).findOne({
    documentId,
    populate,
    status: 'published',
    ...(loc ? { locale: loc } : {}),
  });

  // no published version → make sure it's not in the index
  if (!entry) {
    await meili.deleteDocument(index, id);
    return { action: 'removed', reason: 'no published version', index, id };
  }

  const out = buildDocument({ entry, mapping, strapi, contentTypeUid: uid, locale: loc });
  if (out.skipped || !out.url) {
    await meili.deleteDocument(index, id);
    return { action: 'removed', reason: out.skipped ? 'skip()' : 'unresolved url', index, id };
  }

  await meili.ensureIndex(index, indexConfig.primaryKey);
  await meili.addDocuments(index, [out.document], indexConfig.primaryKey);
  return { action: 'upserted', index, id, url: out.url, title: out.document.title };
}

/**
 * Build a document-service middleware. Register with:
 *   strapi.documents.use(createSyncMiddleware({ strapi, meili }))
 *
 * onSync (optional) is called with the reconcile result — handy for tests/logs.
 */
function createSyncMiddleware({ strapi, onSync, reverseDeps }) {
  // Lazy require to avoid a circular dependency (cascade.js requires sync.js).
  const { cascadeReindex } = reverseDeps ? require('./cascade') : {};

  return async (context, next) => {
    const result = await next(); // let the write complete first

    // Real-time sync can be toggled off live from the Settings tab.
    const settings = getSettingsCached();
    if (settings && settings.syncEnabled === false) return result;

    // Build the client per-event so host/key changes apply without a restart.
    const meili = clientFromSettings();

    try {
      const { uid, action } = context;
      const params = context.params || {};
      const documentId = params.documentId || (result && result.documentId);
      const locale = params.locale || (result && result.locale);
      const mappings = getMappings();

      // 1) the entry itself, if it's an indexed content-type
      if (mappings[uid] && SYNC_ACTIONS.has(action) && documentId) {
        const res = await reconcile({ strapi, meili, uid, documentId, locale });
        if (onSync) onSync({ uid, action, documentId, ...res });
        else strapi.log.debug(`[search-sync] ${action} ${uid} ${documentId} → ${res.action || res.reason}`);
      }

      // 2) children, if this is a parent whose slug feeds their URLs
      if (reverseDeps && reverseDeps[uid] && CASCADE_ACTIONS.has(action) && documentId) {
        const affected = await cascadeReindex({ strapi, meili, parentUid: uid, parentDocumentId: documentId, reverseDeps, reconcile });
        if (affected.length) {
          if (onSync) onSync({ uid, action, documentId, action_type: 'cascade', affected });
          else strapi.log.info(`[search-sync] cascade ${action} ${uid} → reindexed ${affected.length} child doc(s)`);
        }
      }
    } catch (e) {
      // never let indexing failures break a content write
      strapi.log.error(`[search-sync] sync failed: ${e.message}`);
    }
    return result;
  };
}

module.exports = { reconcile, createSyncMiddleware, isLocalized };
