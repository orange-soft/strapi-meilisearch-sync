'use strict';

/**
 * Search Sync — run a real query against Meilisearch (no Strapi bootstrap).
 *
 *   node src/plugins/search-sync/scripts/search.js "central banking"
 *   node src/plugins/search-sync/scripts/search.js "retirement" --type=article
 *
 * This is exactly what a frontend search box would call (via a search-only key).
 */

try { require('dotenv').config(); } catch { /* dotenv optional */ }
const { clientFromEnv } = require('../engine/meilisearch');

const DEFAULT_LOCALE = process.env.SEARCH_SYNC_DEFAULT_LOCALE || 'en';

function parseArgs(argv) {
  const opts = { type: null };
  const terms = [];
  for (const a of argv) {
    if (a.startsWith('--type=')) opts.type = a.slice(7);
    else if (a.startsWith('--locale=')) opts.locale = a.slice(9);
    else terms.push(a);
  }
  return { q: terms.join(' '), opts };
}

async function run() {
  const { q, opts } = parseArgs(process.argv.slice(2));
  const query = q || 'central banking';
  const locale = opts.locale || DEFAULT_LOCALE;
  const index = `search_${locale}`;

  const meili = clientFromEnv();
  const res = await meili.search(index, query, {
    limit: 8,
    ...(opts.type ? { filter: `type = ${opts.type}` } : {}),
    attributesToRetrieve: ['type', 'title', 'url', 'locale'],
  });

  console.log(`\n  query "${query}"  index=${index}${opts.type ? `  type=${opts.type}` : ''}`);
  console.log(`  ${res.estimatedTotalHits} hits · ${res.processingTimeMs}ms\n`);
  res.hits.forEach((h, i) => {
    console.log(`  ${String(i + 1).padStart(2)}. [${(h.type || '').padEnd(16)}] ${h.title}`);
    console.log(`      ${h.url}`);
  });
  console.log('');
}

run().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
