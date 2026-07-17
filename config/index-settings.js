'use strict';

/**
 * Meilisearch index settings — the "Index settings" panel (F8).
 * Applied idempotently whenever an index is (re)built.
 *
 * searchableAttributes order == relevance priority: a hit in `title` outranks
 * one in `body`. `type` and `locale` are filterable so a single consolidated
 * index can still be scoped ("only articles", "only en") from the frontend.
 */
module.exports = {
  primaryKey: 'id',
  settings: {
    searchableAttributes: ['title', 'description', 'body'],
    filterableAttributes: ['type', 'locale'],
    sortableAttributes: [],
    displayedAttributes: ['id', 'type', 'locale', 'title', 'description', 'url', 'thumbnail'],
    // keep body out of the payload we return to the frontend (searchable, not displayed)
    rankingRules: ['words', 'typo', 'proximity', 'attribute', 'exactness'],
  },
};
