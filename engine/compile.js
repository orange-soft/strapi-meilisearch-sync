'use strict';

/**
 * Compiler — turns the serializable config (config/default-config.js shape, or
 * whatever the admin UI saves) into the runtime mappings the engine executes.
 *
 * This is the bridge between "data the UI edits" and "functions the engine runs".
 */

const { f, html, components, dz, join } = require('./flatten');
const { seg, resolveRoute } = require('./route');

function readPath(entry, path) {
  return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), entry);
}

/** Evaluate a declarative condition against an entry. */
function condTrue(cond, entry) {
  const v = readPath(entry, cond.field);
  if (cond.truthy) return !!v;
  if (cond.falsy) return !v;
  if (cond.empty) return v == null || v === '';
  if ('equals' in cond) return v === cond.equals;
  return !!v;
}

/** Compile one field's list of {source, transform} specs into an extractor. */
function compileField(specs) {
  if (specs.length === 1 && specs[0].transform === 'media') {
    return { media: specs[0].source };
  }
  const extractors = specs
    .map((s) => {
      switch (s.transform) {
        case 'html': return html(s.source);
        case 'walk-component': return components(s.source);
        case 'walk-dz': return dz(s.source);
        case 'media': return null; // media only meaningful as a lone spec
        case 'text':
        default: return f(s.source);
      }
    })
    .filter(Boolean);
  if (extractors.length === 1) return extractors[0];
  return join(...extractors);
}

/** Compile a { prefix, segments } spec into a pattern route object. */
function compilePattern(p) {
  return {
    prefix: p.prefix,
    pattern: p.segments.map((s) => (s.source === 'self' ? seg.self(s.field) : seg(s.relation, s.field))),
  };
}

/** Compile a route spec (pattern or conditional) into a runtime route. */
function compileRoute(r) {
  if (r.kind === 'conditional') {
    const thenRoute = compilePattern(r.then);
    const elseSpec = r.else;
    return {
      assumption: r.assumption,
      resolve: (entry) => {
        if (condTrue(r.if, entry)) return resolveRoute(thenRoute, entry).url;
        if (elseSpec.kind === 'field') return entry[elseSpec.field] || null;
        return resolveRoute(compilePattern(elseSpec), entry).url;
      },
    };
  }
  return compilePattern(r);
}

/** Compile skip rules into a predicate (skip when ALL conditions hold). */
function compileSkip(skip) {
  if (!skip || !skip.length) return undefined;
  return (entry) => skip.every((c) => condTrue(c, entry));
}

/** Compile one content-type config into a runtime mapping. */
function compileMapping(cfg) {
  const map = {};
  for (const [target, specs] of Object.entries(cfg.fields || {})) {
    map[target] = compileField(specs);
  }
  const mapping = { type: cfg.type, route: compileRoute(cfg.route), map };
  const skip = compileSkip(cfg.skip);
  if (skip) mapping.skip = skip;
  return mapping;
}

/** Compile the whole config into { [uid]: runtimeMapping }, skipping disabled types. */
function compileConfig(raw) {
  const out = {};
  for (const [uid, cfg] of Object.entries((raw && raw.contentTypes) || {})) {
    if (cfg.enabled === false) continue;
    out[uid] = compileMapping(cfg);
  }
  return out;
}

module.exports = { compileConfig, compileMapping, compileRoute, compileField, condTrue };
