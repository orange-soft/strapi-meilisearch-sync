'use strict';

/**
 * Default (seed) configuration.
 *
 * Ships EMPTY so the plugin is project-agnostic: on first boot it seeds an empty
 * config into the plugin store, and you configure which content-types to index
 * — and how — from the admin UI (Search Sync → Configuration), or by PUT-ing a
 * config to /search-sync/config.
 *
 * The serializable config shape (what the UI edits / what you can POST):
 *
 *   {
 *     version: 1,
 *     contentTypes: {
 *       "api::article.article": {
 *         enabled: true,
 *         type: "article",                          // the `type` discriminator on each doc
 *         route: {                                  // pattern OR conditional
 *           kind: "pattern",
 *           prefix: "/blog",
 *           segments: [
 *             { source: "relation", relation: "category", field: "slug" },
 *             { source: "self", field: "slug" }
 *           ]
 *         },
 *         skip: [{ field: "hidden", truthy: true }],   // optional
 *         fields: {                                    // search document fields
 *           title: [{ source: "title", transform: "text" }],
 *           body:  [{ source: "content", transform: "html" },
 *                   { source: "sections", transform: "walk-dz" }],
 *           thumbnail: [{ source: "cover", transform: "media" }]
 *         }
 *       }
 *     }
 *   }
 *
 * Transforms: text | html | walk-component | walk-dz | media
 * Conditions: { field, truthy } | { field, falsy } | { field, empty } | { field, equals }
 * Conditional route: { kind: "conditional", if: <condition>, then: <pattern>, else: <pattern | { kind: "field", field }> }
 *
 * See examples/asb-config.js for a full real-world example.
 */

const defaultConfig = {
  version: 1,
  contentTypes: {},
};

module.exports = { defaultConfig };
