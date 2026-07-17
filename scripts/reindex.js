'use strict';

/**
 * Search Sync — reindex real content into Meilisearch.
 *
 *   node src/plugins/search-sync/scripts/reindex.js [--clear]
 *
 * Reads content from Strapi, flattens + resolves routes via the engine, and
 * pushes documents into per-locale consolidated indexes (search_<locale>).
 * --clear empties each touched index first.
 */

const { ensureLoaded } = require('../engine/config-loader');
const { buildPopulate, buildDocument } = require('../engine/document');
const { clientFromEnv } = require('../engine/meilisearch');
const indexConfig = require('../config/index-settings');

const DEFAULT_LOCALE = process.env.SEARCH_SYNC_DEFAULT_LOCALE || 'en';
const BATCH = 200;
const CLEAR = process.argv.includes('--clear');

async function collect(app, mappings) {
  const byIndex = {};
  const report = [];

  for (const [uid, mapping] of Object.entries(mappings)) {
    const ct = app.contentTypes[uid];
    const localized = !!(ct.pluginOptions && ct.pluginOptions.i18n && ct.pluginOptions.i18n.localized);
    const populate = buildPopulate(uid, app);

    let start = 0;
    const stat = { type: mapping.type, total: 0, built: 0, skipped: 0, unresolved: 0 };

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const rows = await app.documents(uid).findMany({
        populate,
        start,
        limit: BATCH,
        status: 'published',
        ...(localized ? { locale: DEFAULT_LOCALE } : {}),
      });
      if (!rows.length) break;

      for (const entry of rows) {
        stat.total++;
        const locale = localized ? entry.locale || DEFAULT_LOCALE : undefined;
        const out = buildDocument({ entry, mapping, strapi: app, contentTypeUid: uid, locale });
        if (out.skipped) { stat.skipped++; continue; }
        if (!out.url) { stat.unresolved++; continue; }
        const index = `search_${locale || DEFAULT_LOCALE}`;
        (byIndex[index] = byIndex[index] || []).push(out.document);
        stat.built++;
      }
      start += rows.length;
      if (rows.length < BATCH) break;
    }
    report.push(stat);
  }
  return { byIndex, report };
}

async function push(byIndex) {
  const meili = clientFromEnv();
  await meili.health();
  const { primaryKey, settings } = indexConfig;

  for (const [index, docs] of Object.entries(byIndex)) {
    await meili.ensureIndex(index, primaryKey);
    await meili.updateSettings(index, settings);
    if (CLEAR) await meili.clearIndex(index);

    for (let i = 0; i < docs.length; i += BATCH) {
      await meili.addDocuments(index, docs.slice(i, i + BATCH), primaryKey);
    }
    const stats = await meili.stats(index);
    console.log(`  → ${index}: pushed ${docs.length}, index now holds ${stats.numberOfDocuments} docs`);
  }
}

async function run() {
  const { createStrapi, compileStrapi } = require('@strapi/strapi');
  const app = await createStrapi(await compileStrapi()).load();
  app.log.level = 'error';
  const { mappings } = await ensureLoaded(app);
  try {
    console.log(`\nReindex → Meilisearch (${process.env.MEILISEARCH_HOST}) ${CLEAR ? '[--clear]' : ''}\n`);
    const { byIndex, report } = await collect(app, mappings);

    console.log('  collected per content-type:');
    for (const s of report) {
      console.log(`    ${s.type.padEnd(18)} total ${String(s.total).padStart(4)}  built ${String(s.built).padStart(4)}  skipped ${s.skipped}  unresolved ${s.unresolved}`);
    }
    console.log('');
    await push(byIndex);
    console.log('\n  done.\n');
  } finally {
    await app.destroy();
  }
}

run().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
