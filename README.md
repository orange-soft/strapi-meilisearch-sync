# Search Sync

A Strapi 5 plugin that indexes your content into [Meilisearch](https://www.meilisearch.com/) — with **UI-configurable content flattening**, **relation-aware URLs**, **real-time sync**, and **cascade reindexing**. Built for real content models where the searchable text lives deep inside dynamic zones, components, and rich-text (CKEditor) fields, and where page URLs are derived from parent relations.

It is intentionally search-engine-facing only: the plugin keeps Meilisearch in sync; your frontend queries Meilisearch directly with a search-only key.

```
 Strapi content ──(flatten + resolve URL, from your config)──▶  Meilisearch
       ▲                                                             │
   real-time sync                                            search-only key
   (lifecycle hooks)                                                 ▼
                                                          your SSG / frontend
```

## Why

The stock approach copies flat fields to a search index. Real Strapi models don't work that way:

- Body text is buried in **dynamic zones**, repeatable **components**, and **CKEditor HTML** — a naive index captures only the title.
- Page URLs traverse **relations** (`/programs/{type.slug}/{category.slug}/{slug}`), so the index must resolve them — and re-resolve children when a parent's slug changes.
- What to index, and how, should be editable by the team in the **admin UI**, not hard-coded per project.

Search Sync handles all of this and is configured entirely from the admin panel.

## Features

- **Flatten toolkit** — per field, choose a transform: `plain text`, `CKEditor → text`, `walk component`, `walk dynamic zone`, `media → URL`. Dynamic-zone/component walking is schema-aware and recursive, so new component variants stay searchable automatically.
- **Relation-aware route builder** — build a page URL from `prefix` + segments, each an entry field or a hop across a relation. Or a **conditional** route (`if/then/else`, e.g. internal page vs external link).
- **Real-time sync** — a document-service middleware upserts/removes on create / update / publish / unpublish / delete.
- **Cascade reindex** — when a parent's slug changes, children whose URL depends on it are reindexed automatically (derived from the routes, not hand-listed).
- **Consolidated per-locale index** with a `type` discriminator — one search box, one ranked result set, optional filtering by type.
- **Admin UI** — enable/disable types, edit routes & field mappings, dry-run preview, drift detection, one-click reindex.
- **DB-persisted config** — everything is stored in the plugin store and editable via UI or API; nothing is hard-coded.
- **UI-managed connection & keys** *(new in 1.0)* — set the Meilisearch host, index prefix, locale and real-time-sync toggle in the **Settings** tab (persisted in the DB, no `.env` needed). A **live connection health check** tells you exactly what's missing (host / key / reachability).
- **One-click key generation** *(new in 1.0)* — mint correctly-scoped **indexing** and **search-only** keys from a single admin-key entry; both are persisted. You never hand-craft key scopes or paste the admin key twice.
- **Search playground** *(new in 1.0)* — run test queries server-side with per-type filters, see live results, and copy a ready-to-use `fetch()` snippet for your frontend (pre-filled with the saved search-only key).
- **Admin RBAC** *(new in 1.0)* — the plugin is gated behind the `plugin::search-sync.read` permission: Super Admin only by default, grantable to other roles on the standard Roles page.

## Install

Requires **Strapi 5** and a running **Meilisearch** instance.

```bash
# from npm
npm install @orange-soft/strapi-meilisearch-sync

# or from GitHub
npm install github:orange-soft/strapi-meilisearch-sync

# or a local checkout during development (symlinks it)
npm install ../strapi-meilisearch-sync
```

Enable it in `config/plugins.ts` (the plugin id is `search-sync`):

```ts
export default ({ env }) => ({
  'search-sync': { enabled: true },
});
```

**No connection env vars are required** — the Meilisearch host, keys, index prefix, locale and sync toggle are all configured in the admin **Settings** tab (persisted in the DB). See [Connection & keys](#connection--keys).

The only optional env var is a convenience for key generation:

```bash
# Optional: an admin/master key used ONLY to mint scoped keys from the UI.
# When set, the "Generate keys" button skips its prompt. Never used at runtime.
MEILISEARCH_ADMIN_KEY=<a key with keys.create>
```

> The Strapi admin build is memory-hungry on large projects. If `strapi build`/`develop` OOMs, run with `NODE_OPTIONS=--max-old-space-size=8192`.

## Quick start

1. Start Strapi (`npm run develop`) and open **Search Sync** in the admin menu → **Settings**.
2. Set the **Host** and an **index prefix** (a unique per-app prefix, e.g. `myapp` → indexes named `myapp_<locale>`) and click **Save changes**. Then click **Generate keys** (Generate is enabled only once the host/prefix are saved) and enter a Meilisearch admin/master key once — or set `MEILISEARCH_ADMIN_KEY` to skip the prompt. The plugin mints and saves a scoped **indexing key** *and* a **search-only key**, and the connection status turns green.
3. Go to **Configuration** and toggle a content-type **On**. For a simple blog `category` (fields `name`, `slug`, `description`):
   - **Search type**: `category`
   - **Route**: *Pattern*, prefix `/category`, one segment → *This entry* · `slug`
   - **Field mapping**: `title` ← `name` (plain text), `description` ← `description` (plain text)
4. **Save**, switch to **Overview**, click **Reindex all**.
5. Open **Search playground** to test a query and copy the frontend `fetch()` snippet. Or query Meilisearch directly:

```bash
curl -s -X POST 'http://127.0.0.1:7700/indexes/myapp_en/search' \
  -H 'Authorization: Bearer <search-only key>' -H 'Content-Type: application/json' \
  --data '{"q":"tech"}'
# → { hits: [ { type: "category", title: "tech", url: "/category/tech", ... } ] }
```

That's the whole loop: **configure the connection → map content → reindex → query from your frontend.**

## Connection & keys

Everything about the Meilisearch connection lives in the **Settings** tab (persisted in the plugin store — no `.env`):

- **Host** and **index prefix** / **default locale** / **real-time sync** on-off. Indexes are named `<prefix>_<locale>`; use a unique prefix per app to isolate it on a shared Meilisearch.
- A **live connection check** runs on open and after every save, verifying both reachability *and* that the API key is accepted (not just Meilisearch's public `/health`). It states exactly what's missing.

The plugin uses **two scoped keys**, both generated and stored for you:

| Key | Who uses it | Scope | Stored |
|---|---|---|---|
| **Indexing key** | the plugin (server-side) | `search`, `documents.add/get/delete`, `indexes.create/get`, `settings.get/update`, `stats.get`, `tasks.get` on `<prefix>_*` | as the connection API key; never sent to the browser |
| **Search-only key** | your **frontend** (browser) | `search` on `<prefix>_*` only | persisted and shown in Settings + Search playground; safe to embed publicly |

**Generating keys** requires an admin key that can create keys (`keys.create`, plus `keys.get` to reuse). Click **Generate keys** and paste one once — it's sent to the server for the single `/keys` call and **never stored**. Set `MEILISEARCH_ADMIN_KEY` to skip the prompt entirely. Prefer not to use the master key? A **Default Admin API Key** works too. You can also paste your own pre-made keys; the UI documents the exact scope a pasted key needs.

## Configure

Open **Search Sync → Configuration** in the admin. The plugin ships with an **empty** config, so nothing is indexed until you enable content-types:

1. Toggle a content-type **On** and set its **search type** (the `type` field on every document).
2. **Route** — choose *Pattern* (fixed URL) or *Conditional* (if/then/else), then build segments from the type's real relations and fields.
3. **Field mapping** — for each search field (`title`, `body`, …) pick sources and a transform.
4. **Save**, then **Reindex** from the Overview tab to backfill existing content. New changes sync automatically.

Use **Overview** to watch indexed vs. Strapi counts (drift is flagged), dry-run the exact document for any entry, and reindex.

### Config shape

The config is plain JSON (stored in the DB, editable via `PUT /search-sync/config`):

```jsonc
{
  "version": 1,
  "contentTypes": {
    "api::article.article": {
      "enabled": true,
      "type": "article",
      "route": {
        "kind": "pattern",
        "prefix": "/blog",
        "segments": [
          { "source": "relation", "relation": "category", "field": "slug" },
          { "source": "self", "field": "slug" }
        ]
      },
      "skip": [{ "field": "hidden", "truthy": true }],
      "fields": {
        "title": [{ "source": "title", "transform": "text" }],
        "body":  [{ "source": "content", "transform": "html" },
                  { "source": "sections", "transform": "walk-dz" }],
        "thumbnail": [{ "source": "cover", "transform": "media" }]
      }
    }
  }
}
```

- **Transforms**: `text` · `html` · `walk-component` · `walk-dz` · `media`
- **Conditions** (skip rules / conditional routes): `{ field, truthy }` · `{ field, falsy }` · `{ field, empty }` · `{ field, equals }`
- **Conditional route**: `{ kind: "conditional", if: <condition>, then: <pattern>, else: <pattern | { kind: "field", field }> }`

This shape supports multi-level relation routes, conditional internal/external URLs, and CKEditor + dynamic-zone + component flattening — build it visually in the **Configuration** tab, or `PUT` the JSON to `/search-sync/config`.

## Query it from your frontend

Search Sync does **not** add a search endpoint to Strapi — you query Meilisearch directly, which is the point of a headless search engine. Use the **search-only key** generated in Settings (shown, ready to copy, on both the Settings and Search playground tabs) and ship it to the browser. The **Search playground** tab also generates a matching `fetch()` snippet for you.

```js
import { MeiliSearch } from 'meilisearch';

const client = new MeiliSearch({ host: 'https://search.example.com', apiKey: SEARCH_ONLY_KEY });

// one search box → one ranked result set across all types
const res = await client.index('myapp_en').search(query);

// or scope by type
await client.index('myapp_en').search(query, { filter: 'type = article' });
```

The search-only key can `search` and nothing else — safe for a static site. Never expose the indexing key.

## HTTP API (admin-authenticated, RBAC-gated)

Every route below is admin-only and gated on the `plugin::search-sync.read` permission.

| Method & path | Purpose |
|---|---|
| `GET /search-sync/status` | per-type Strapi vs indexed counts, drift, cascade parents |
| `GET /search-sync/schema` | content-type introspection (relations, fields, transforms) for the editors |
| `GET /search-sync/preview?uid=…` | dry-run the document for the first published entry |
| `GET /search-sync/config` · `PUT /search-sync/config` | read / write the mapping config |
| `POST /search-sync/config/reset` | reset config to the (empty) default |
| `POST /search-sync/reindex` | reindex all (or `{ uid }` for one type) |
| `GET /search-sync/settings` · `PUT /search-sync/settings` | read / write the connection & settings (API key masked on read) |
| `GET /search-sync/settings/health` | live connection check (reachability + key validity) |
| `POST /search-sync/settings/generate-key` | mint scoped key(s): `{ adminKey?, scope: "indexing" \| "search" \| "both" }` |
| `POST /search-sync/search` | run a search server-side (for the playground): `{ q, types?, limit?, locale? }` |

Day-to-day operations are all in the admin UI — **Overview** does reindex and per-entry dry-run, **Search playground** runs queries — so no CLI is needed.

## Development

```bash
git clone https://github.com/orange-soft/strapi-meilisearch-sync.git && cd strapi-meilisearch-sync
npm install            # runs the build automatically via the "prepare" script
npm run build          # or rebuild manually → dist/{admin,server}
npm run watch          # rebuild on change while developing against a linked app
```

- Source layout: `engine/` (framework-agnostic core: flatten, route, compile, sync, cascade, meilisearch, config-loader, settings-loader, validate), `server/` (register/bootstrap + admin API + RBAC), `admin/` (React tabs: Overview, Configuration, Settings, Search playground), `config/` (defaults + index settings + runtime).
- Built with [`@strapi/sdk-plugin`](https://github.com/strapi/sdk-plugin); `dist/` is generated and git-ignored (published via the `files` field). To develop against a real app, `npm install ../strapi-meilisearch-sync` in that app to symlink it, then `npm run watch` here.
- Optional dev scripts live in `scripts/` (`reindex.js`, `dryrun.js`, `search.js`) — run from a checkout with the plugin source present. They bootstrap Strapi and read the Meilisearch connection from `MEILISEARCH_HOST` / `MEILISEARCH_API_KEY` env vars (not the UI settings), and are **not** shipped in the published package.
- Publish: `npm publish` (the `prepare` script builds `dist/` first).

## Notes

- **i18n**: each locale gets its own index (`<prefix>_en`, `<prefix>_zh`, …). Non-localized types are written to the default-locale index.
- **Connection changes are live**: host, key, prefix, locale and the sync toggle are read per-operation from the stored settings, so edits in the Settings tab apply without a restart.
- **Access control**: only Super Admins see the plugin by default. Grant the `plugin::search-sync.read` action to another role via **Settings → Administration Panel → Roles** to give it access (hides the menu *and* enforces the API).
- **Admin key handling**: the admin/master key used to generate scoped keys is only sent for the single `/keys` call and is never stored or logged. `MEILISEARCH_ADMIN_KEY` (env) is the sole exception you may set to skip the prompt.
- **Cascade** parent set is computed at boot; changing which relations a route uses takes effect for the parent set on the next restart (individual reconciles are always live).
- **Publishing**: `npm publish` ships a prebuilt `dist/` (rebuilt by the `prepare` script via [`@strapi/sdk-plugin`](https://github.com/strapi/sdk-plugin); `exports` resolve to `dist/`). The `files` field publishes only `dist/`, `README.md` and `LICENSE` — source isn't shipped. The package is public (`publishConfig.access: public`).
