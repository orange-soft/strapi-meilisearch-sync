'use strict';

/**
 * Flatten toolkit — the "transforms" surfaced in the admin UI mockup.
 *
 * Every extractor is a pure function `(entry, ctx) => string | { text, deps }`.
 * `ctx` gives schema access so the dynamic-zone / component walkers know which
 * nested fields are human-readable text:
 *
 *   ctx = {
 *     getComponent(uid)   -> { attributes }   // strapi.components[uid]
 *     getContentType(uid) -> { attributes }   // strapi.contentTypes[uid]
 *   }
 *
 * The engine never hard-codes field names — it reads the schema, so a new
 * component variant dropped into a dynamic zone stays searchable automatically.
 */

const TEXT_TYPES = new Set(['string', 'text', 'richtext']);
const RICH_TYPES = new Set(['richtext', 'blocks']); // may carry markup/markdown

/** Is this attribute definition a human-readable text field? */
function isTextAttr(attr) {
  if (!attr) return false;
  if (attr.type === 'customField' && /ckeditor/i.test(attr.customField || '')) return true;
  return TEXT_TYPES.has(attr.type);
}
function isRichAttr(attr) {
  if (!attr) return false;
  if (attr.type === 'customField' && /ckeditor/i.test(attr.customField || '')) return true;
  return RICH_TYPES.has(attr.type);
}

/** Strip HTML/markdown to clean, single-spaced plain text. Safe for CKEditor + markdown. */
function htmlToText(input) {
  if (input == null) return '';
  let s = typeof input === 'string' ? input : JSON.stringify(input);
  s = s
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, ' ') // drop script/style bodies
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/(p|div|li|h[1-6]|tr|section)>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')          // remaining tags
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ') // md images
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1') // md links -> label
    .replace(/[#*_`>~]+/g, ' ')        // md punctuation
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, ' ')
    .trim();
  return s;
}

/** Read a possibly-dotted path off an object (e.g. "metadata.description"). */
function readPath(obj, path) {
  return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

/**
 * Recursively collect text from a component value using its schema.
 * Handles nested components and nested dynamic zones. Returns an array of strings.
 */
function walkComponentValue(value, componentUid, ctx, seen = new Set()) {
  if (value == null) return [];
  if (Array.isArray(value)) {
    return value.flatMap((v) => walkComponentValue(v, componentUid, ctx, seen));
  }
  const schema = ctx.getComponent(componentUid);
  if (!schema) return [];
  const out = [];
  for (const [name, attr] of Object.entries(schema.attributes || {})) {
    const v = value[name];
    if (v == null) continue;
    if (isRichAttr(attr)) out.push(htmlToText(v));
    else if (isTextAttr(attr)) out.push(String(v).trim());
    else if (attr.type === 'component') {
      out.push(...walkComponentValue(v, attr.component, ctx, seen));
    } else if (attr.type === 'dynamiczone') {
      out.push(...walkDynamicZone(v, ctx));
    }
  }
  return out.filter(Boolean);
}

/** Walk a dynamic-zone array; each item carries __component to resolve its schema. */
function walkDynamicZone(value, ctx) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const uid = item && item.__component;
    if (!uid) return [];
    return walkComponentValue(item, uid, ctx);
  });
}

// ---- Extractor factories (the UI "transform" menu) --------------------------

/** plain text / dotted field */
const f = (path) => ({
  kind: 'field',
  deps: [path.split('.')[0]],
  run: (entry) => {
    const v = readPath(entry, path);
    return v == null ? '' : String(v).trim();
  },
});

/** CKEditor / rich HTML → clean text */
const html = (path) => ({
  kind: 'html',
  deps: [path.split('.')[0]],
  run: (entry) => htmlToText(readPath(entry, path)),
});

/** walk a component field (repeatable or single) */
const components = (...fields) => ({
  kind: 'walk-component',
  deps: fields,
  run: (entry, ctx) =>
    fields
      .flatMap((field) => {
        const attr = ctx.attrOf(field);
        if (!attr || attr.type !== 'component') return [];
        return walkComponentValue(entry[field], attr.component, ctx);
      })
      .join(' '),
});

/** walk a dynamic-zone field */
const dz = (field) => ({
  kind: 'walk-dz',
  deps: [field],
  run: (entry, ctx) => walkDynamicZone(entry[field], ctx).join(' '),
});

/** resolve a media field to a URL */
const media = (field) => ({
  kind: 'media',
  deps: [field],
  run: (entry) => {
    const m = entry[field];
    if (!m) return '';
    const one = Array.isArray(m) ? m[0] : m;
    return (one && (one.url || one.formats?.thumbnail?.url)) || '';
  },
});

/** join several extractors into one blob */
const join = (...extractors) => ({
  kind: 'join',
  deps: extractors.flatMap((e) => e.deps || []),
  run: (entry, ctx) =>
    extractors
      .map((e) => e.run(entry, ctx))
      .filter(Boolean)
      .join(' — '),
});

module.exports = {
  f, html, components, dz, media, join,
  htmlToText, isTextAttr, isRichAttr, walkComponentValue, walkDynamicZone, readPath,
};
