'use strict';

/**
 * Cascade reindexing — the reverse-dependency piece.
 *
 * A child's URL is built from its parents' slugs (program URL embeds
 * program_type.slug and category.slug). So when a parent's slug changes,
 * every child's indexed URL goes stale — but Strapi only fires a lifecycle
 * event on the parent. This module inverts the route's relation dependencies
 * into a parent→children map and reindexes the affected children.
 *
 * The map is DERIVED from the same route config the URLs are built from, so it
 * can't drift: add a relation segment to a route and its parent is covered.
 */

const { isLocalized } = require('./sync');

/**
 * Build { parentUid: [{ childUid, relationField, mapping }] } from mappings,
 * by reading each route's relation segments and resolving their target uid.
 */
function buildReverseDeps(strapi, mappings) {
  const rev = {};
  for (const [childUid, mapping] of Object.entries(mappings)) {
    const route = mapping.route;
    if (!route || !route.pattern) continue;
    const ct = strapi.contentTypes[childUid];
    if (!ct) continue;
    for (const s of route.pattern) {
      if (s.source !== 'relation') continue;
      const attr = ct.attributes[s.relation];
      const target = attr && attr.target;
      if (!target) continue;
      (rev[target] = rev[target] || []).push({ childUid, relationField: s.relation, mapping });
    }
  }
  return rev;
}

/**
 * Reindex every child that references the changed parent.
 * `reconcile` is injected (from sync.js) to avoid a circular require.
 */
async function cascadeReindex({ strapi, meili, parentUid, parentDocumentId, reverseDeps, reconcile }) {
  const deps = reverseDeps[parentUid];
  if (!deps || !parentDocumentId) return [];

  const results = [];
  for (const { childUid, relationField } of deps) {
    const localized = isLocalized(strapi, childUid);
    const children = await strapi.documents(childUid).findMany({
      filters: { [relationField]: { documentId: parentDocumentId } },
      status: 'published',
      fields: ['documentId'],
      limit: 2000,
      ...(localized ? { locale: '*' } : {}),
    });
    for (const child of children) {
      const r = await reconcile({
        strapi, meili, uid: childUid,
        documentId: child.documentId,
        locale: child.locale,
      });
      results.push({ childUid, documentId: child.documentId, action: r.action });
    }
  }
  return results;
}

module.exports = { buildReverseDeps, cascadeReindex };
