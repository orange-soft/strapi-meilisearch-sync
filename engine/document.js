'use strict';

/**
 * Document builder + schema-driven populate derivation.
 *
 * buildPopulate() walks the content-type schema and produces a populate query
 * that covers exactly what the mapping + route need: relations (slug/title/url),
 * components (recursively), and dynamic zones (per-component, recursively).
 * This is F5 in the proposal — populate can't silently drift from the mapping
 * because it's derived from the same schema the flatteners walk.
 */

const { resolveRoute, routeDeps } = require('./route');

/** Meilisearch primary-key value for an entry. Keep in sync with removals. */
function docId(type, documentIdOrId, locale) {
  return `${type}-${documentIdOrId}${locale ? '-' + locale : ''}`;
}

const REL_FIELDS = ['slug', 'title', 'name', 'url'];
const MEDIA_FIELDS = ['url', 'name', 'formats'];

/** Build a ctx the extractors use to consult the schema. */
function makeCtx(strapi, contentTypeUid) {
  const ct = strapi.contentTypes[contentTypeUid];
  return {
    getComponent: (uid) => strapi.components[uid],
    getContentType: (uid) => strapi.contentTypes[uid],
    attrOf: (field) => ct && ct.attributes[field],
  };
}

/** Recursively build populate for a component/content-type's attributes. */
function populateForAttributes(attributes, strapi, seen) {
  const populate = {};
  for (const [name, attr] of Object.entries(attributes || {})) {
    if (attr.type === 'component') {
      if (seen.has(attr.component)) { populate[name] = true; continue; }
      seen.add(attr.component);
      const comp = strapi.components[attr.component];
      populate[name] = comp
        ? { populate: populateForAttributes(comp.attributes, strapi, seen) }
        : true;
    } else if (attr.type === 'dynamiczone') {
      const on = {};
      for (const uid of attr.components || []) {
        const comp = strapi.components[uid];
        if (seen.has(uid)) { on[uid] = { populate: '*' }; continue; }
        seen.add(uid);
        on[uid] = comp
          ? { populate: populateForAttributes(comp.attributes, strapi, seen) }
          : { populate: '*' };
      }
      populate[name] = { on };
    } else if (attr.type === 'media') {
      populate[name] = { fields: MEDIA_FIELDS };
    } else if (attr.type === 'relation') {
      const target = strapi.contentTypes[attr.target];
      const fields = target
        ? REL_FIELDS.filter((fld) => target.attributes[fld])
        : REL_FIELDS;
      populate[name] = { fields };
    }
  }
  return populate;
}

/** Derive a full populate query for one content-type from its schema. */
function buildPopulate(contentTypeUid, strapi) {
  const ct = strapi.contentTypes[contentTypeUid];
  if (!ct) return {};
  return populateForAttributes(ct.attributes, strapi, new Set());
}

/** Run a single field's extractor spec against an entry. */
function runField(spec, entry, ctx) {
  if (spec && typeof spec.run === 'function') return spec.run(entry, ctx);
  if (spec && spec.media) {
    const m = entry[spec.media];
    const one = Array.isArray(m) ? m[0] : m;
    return (one && (one.url || (one.formats && one.formats.thumbnail && one.formats.thumbnail.url))) || '';
  }
  return '';
}

/**
 * Build the search document for a real entry.
 * @returns { document, url, missing, skipped, assumption }
 */
function buildDocument({ entry, mapping, strapi, contentTypeUid, locale }) {
  const ctx = makeCtx(strapi, contentTypeUid);

  if (typeof mapping.skip === 'function' && mapping.skip(entry)) {
    return { skipped: true, reason: 'skip() matched', document: null, url: null, missing: [] };
  }

  const { url, missing } = resolveRoute(mapping.route, entry);

  const doc = {
    // documentId is stable across draft/publish and is available on delete
    // events, so the same id can be computed to remove a doc later.
    id: docId(mapping.type, entry.documentId || entry.id, locale),
    type: mapping.type,
    ...(locale ? { locale } : {}),
  };
  for (const [target, spec] of Object.entries(mapping.map)) {
    doc[target] = runField(spec, entry, ctx);
  }
  doc.url = url;

  return {
    skipped: false,
    document: doc,
    url,
    missing,
    assumption: mapping.route.assumption,
  };
}

module.exports = { buildPopulate, buildDocument, makeCtx, routeDeps, docId };
