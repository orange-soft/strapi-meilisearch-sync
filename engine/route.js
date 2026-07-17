'use strict';

/**
 * Relation-aware route builder — the "Route builder" screen in the UI mockup.
 *
 * A route is either:
 *   { prefix, pattern: [ seg(relation, field) | seg.self(field) ] }
 *   { resolve: (entry) => string }        // escape hatch / conditional
 * plus optional { skip: (entry) => bool }.
 *
 * seg() traverses a *populated* relation and reads a field off the related
 * entry. The list of relations a route depends on is derivable statically
 * (routeDeps) so the populate query can guarantee they're fetched — and so the
 * cascade map (reindex-children-on-parent-change) can be inverted from it.
 */

/** A segment sourced from a related entry: program.program_type.slug */
function seg(relation, field = 'slug') {
  return { source: 'relation', relation, field };
}
/** A segment sourced from the entry itself: program.slug */
seg.self = (field = 'slug') => ({ source: 'self', field });

function joinPath(prefix, parts) {
  const clean = parts.filter((p) => p != null && p !== '');
  const base = (prefix || '/').replace(/\/+$/, '');
  const tail = clean.join('/');
  if (!tail) return base === '' ? '/' : base;
  return `${base}/${tail}`.replace(/\/{2,}/g, '/');
}

/** Which top-level relations must be populated for this route to resolve. */
function routeDeps(route) {
  if (!route || !route.pattern) return [];
  return route.pattern
    .filter((s) => s.source === 'relation')
    .map((s) => s.relation);
}

/**
 * Resolve a route for an entry.
 * @returns { url: string|null, missing: string[] }  missing = unresolved segments
 */
function resolveRoute(route, entry) {
  if (typeof route.resolve === 'function') {
    const url = route.resolve(entry);
    return { url: url || null, missing: url ? [] : ['<resolver returned empty>'] };
  }

  const missing = [];
  const parts = route.pattern.map((s) => {
    if (s.source === 'self') {
      const v = entry[s.field];
      if (v == null || v === '') missing.push(`self.${s.field}`);
      return v;
    }
    // relation hop
    const rel = entry[s.relation];
    const related = Array.isArray(rel) ? rel[0] : rel; // manyToOne/oneToOne → object
    const v = related ? related[s.field] : undefined;
    if (v == null || v === '') missing.push(`${s.relation}.${s.field}`);
    return v;
  });

  if (missing.length) {
    const fb = typeof route.fallback === 'function' ? route.fallback(entry) : null;
    return { url: fb || null, missing };
  }
  return { url: joinPath(route.prefix, parts), missing: [] };
}

module.exports = { seg, resolveRoute, routeDeps, joinPath };
