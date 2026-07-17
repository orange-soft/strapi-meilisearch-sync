'use strict';

/**
 * Schema introspection — feeds the admin UI's dropdowns.
 *
 * Walks strapi.contentTypes and, for every user content-type (api::*), reports
 * the shape the editors need: which fields are text/rich/media/component/dz,
 * which transforms apply to each, which relations exist (and what to segment on),
 * and which own fields can form a self URL segment. Read-only, no config.
 */

const SCALAR_SEGMENT_TYPES = ['uid', 'string'];
const REL_SEGMENT_TYPES = ['uid', 'string', 'integer'];

// System attributes that shouldn't appear in the editor dropdowns.
const SYSTEM_FIELDS = new Set(['createdBy', 'updatedBy', 'localizations', 'locale', 'createdAt', 'updatedAt', 'publishedAt']);
const isSystemRelationTarget = (target) =>
  target && (target.startsWith('admin::') || target.startsWith('plugin::') || target.startsWith('strapi::'));

/** Classify a single attribute into { kind, transforms }. */
function classify(attr) {
  const t = attr.type;
  if (t === 'customField' && /ckeditor/i.test(attr.customField || '')) {
    return { kind: 'richtext', transforms: ['html', 'text'] };
  }
  if (t === 'richtext' || t === 'blocks') return { kind: 'richtext', transforms: ['html', 'text'] };
  if (t === 'string' || t === 'text') return { kind: 'text', transforms: ['text'] };
  if (t === 'uid') return { kind: 'uid', transforms: ['text'] };
  if (t === 'media') return { kind: 'media', transforms: ['media'] };
  if (t === 'component') return { kind: 'component', transforms: ['walk-component'] };
  if (t === 'dynamiczone') return { kind: 'dynamiczone', transforms: ['walk-dz'] };
  if (t === 'relation') return { kind: 'relation', transforms: [] };
  return { kind: 'other', transforms: [] };
}

/** Scalar field names on a content-type that can serve as a relation segment field. */
function segmentFields(ct, types) {
  return Object.entries(ct.attributes || {})
    .filter(([, a]) => types.includes(a.type))
    .map(([name]) => name);
}

function introspectOne(uid, ct, strapi) {
  const localized = !!(ct.pluginOptions && ct.pluginOptions.i18n && ct.pluginOptions.i18n.localized);
  const fields = [];
  const relations = [];
  let slugField = null;

  for (const [name, attr] of Object.entries(ct.attributes || {})) {
    if (SYSTEM_FIELDS.has(name)) continue;
    if (attr.type === 'relation' && isSystemRelationTarget(attr.target)) continue;

    const { kind, transforms } = classify(attr);
    if (attr.type === 'uid' && !slugField) slugField = name;

    const field = { name, type: attr.type, kind, transforms };
    if (attr.type === 'component') field.component = attr.component;
    if (attr.type === 'dynamiczone') field.components = attr.components || [];
    if (attr.customField) field.customField = attr.customField;
    fields.push(field);

    if (attr.type === 'relation' && attr.target) {
      const target = strapi.contentTypes[attr.target];
      const targetFields = target ? segmentFields(target, REL_SEGMENT_TYPES) : [];
      relations.push({
        name,
        target: attr.target,
        targetDisplayName: (target && target.info && target.info.displayName) || attr.target,
        relationType: attr.relation,
        targetFields,
        targetHasSlug: targetFields.includes('slug'),
      });
    }
  }

  return {
    uid,
    kind: ct.kind, // collectionType | singleType
    displayName: (ct.info && ct.info.displayName) || uid,
    singularName: ct.info && ct.info.singularName,
    localized,
    slugField,
    selfSegmentFields: segmentFields(ct, SCALAR_SEGMENT_TYPES),
    relations,
    fields,
  };
}

/** Introspect all user content-types. */
function introspectContentTypes(strapi) {
  const contentTypes = [];
  for (const [uid, ct] of Object.entries(strapi.contentTypes)) {
    if (!uid.startsWith('api::')) continue; // skip admin::/plugin::/strapi:: internals
    contentTypes.push(introspectOne(uid, ct, strapi));
  }
  // stable order by display name
  contentTypes.sort((a, b) => a.displayName.localeCompare(b.displayName));
  return { contentTypes };
}

module.exports = { introspectContentTypes, classify };
