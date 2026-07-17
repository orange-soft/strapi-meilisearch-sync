'use strict';

/**
 * Search Sync — dry run against the real database (READ ONLY).
 *
 *   node src/plugins/search-sync/scripts/dryrun.js
 *
 * Bootstraps Strapi, fetches real entries with the schema-derived populate,
 * runs the flatten + route engine, and prints the exact search document that
 * would be sent to Meilisearch. Writes nothing.
 */

const { ensureLoaded } = require('../engine/config-loader');
const { buildPopulate, buildDocument } = require('../engine/document');
const { routeDeps } = require('../engine/route');

const SAMPLES = 2;

function trunc(v, n = 160) {
  if (typeof v !== 'string') return v;
  return v.length > n ? v.slice(0, n) + ` …(+${v.length - n} chars)` : v;
}
function line(c = '─', n = 74) { return c.repeat(n); }

async function run() {
  const { createStrapi, compileStrapi } = require('@strapi/strapi');
  const app = await createStrapi(await compileStrapi()).load();
  app.log.level = 'error'; // quiet the boot logs for readable output
  const { mappings } = await ensureLoaded(app);

  const results = [];
  try {
    for (const [uid, mapping] of Object.entries(mappings)) {
      const ct = app.contentTypes[uid];
      const localized = !!(ct.pluginOptions && ct.pluginOptions.i18n && ct.pluginOptions.i18n.localized);
      const populate = buildPopulate(uid, app);

      console.log('\n' + line('═'));
      console.log(`  ${mapping.type.toUpperCase()}   (${uid})`);
      console.log(`  localized: ${localized}   route deps: [${routeDeps(mapping.route).join(', ') || '—'}]`);
      if (mapping.route.assumption) console.log(`  ⚠ assumption: ${mapping.route.assumption}`);
      console.log(line('═'));
      console.log('  derived populate: ' + trunc(JSON.stringify(populate), 320));

      const entries = await app.documents(uid).findMany({
        populate,
        limit: SAMPLES,
        ...(localized ? { locale: 'en' } : {}),
        status: 'published',
      });

      if (!entries.length) { console.log('  (no published entries found)'); continue; }

      for (const entry of entries) {
        const locale = localized ? (entry.locale || 'en') : undefined;
        const out = buildDocument({ entry, mapping, strapi: app, contentTypeUid: uid, locale });
        results.push({ type: mapping.type, ...out });

        console.log('\n  ' + line('·', 70));
        console.log(`  entry #${entry.id} — ${trunc(entry.title, 60)}`);
        if (out.skipped) { console.log(`  ⤷ SKIPPED (${out.reason})`); continue; }
        console.log(`  ⤷ URL: ${out.url || '‹unresolved›'}`);
        if (out.missing && out.missing.length) console.log(`  ⤷ missing segments: ${out.missing.join(', ')}`);
        const d = out.document;
        console.log('  ⤷ document:');
        for (const [k, v] of Object.entries(d)) {
          console.log(`       ${k.padEnd(12)} : ${trunc(v)}`);
        }
      }
    }

    // summary
    console.log('\n' + line('═'));
    const built = results.filter((r) => !r.skipped);
    const skipped = results.filter((r) => r.skipped);
    const unresolved = built.filter((r) => !r.url);
    console.log(`  SUMMARY  built: ${built.length}   skipped: ${skipped.length}   unresolved-url: ${unresolved.length}`);
    console.log(line('═') + '\n');
  } finally {
    await app.destroy();
  }
}

run().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
