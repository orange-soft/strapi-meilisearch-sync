'use strict';

/**
 * Minimal Meilisearch client (Node global fetch — no npm dependency).
 * Covers exactly what the reindex/search commands need.
 */

function createClient({ host, apiKey }) {
  const base = host.replace(/\/+$/, '');
  const headers = {
    'Content-Type': 'application/json',
    ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
  };

  async function req(method, path, body) {
    const res = await fetch(`${base}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    const json = text ? JSON.parse(text) : null;
    if (!res.ok) {
      const msg = json && json.message ? json.message : `${res.status} ${res.statusText}`;
      throw new Error(`Meilisearch ${method} ${path} → ${msg}`);
    }
    return json;
  }

  /** Wait for an async task to finish so callers can report real results. */
  async function waitForTask(taskUid, { timeoutMs = 30000, intervalMs = 150 } = {}) {
    const deadline = Date.now() + timeoutMs;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const task = await req('GET', `/tasks/${taskUid}`);
      if (task.status === 'succeeded') return task;
      if (task.status === 'failed') throw new Error(`task ${taskUid} failed: ${JSON.stringify(task.error)}`);
      if (Date.now() > deadline) throw new Error(`task ${taskUid} timed out (${task.status})`);
      await new Promise((r) => setTimeout(r, intervalMs));
    }
  }

  return {
    health: () => req('GET', '/health'),

    /** Create the index if missing and set its primary key. */
    async ensureIndex(uid, primaryKey) {
      try {
        await req('GET', `/indexes/${uid}`);
      } catch {
        const task = await req('POST', '/indexes', { uid, primaryKey });
        await waitForTask(task.taskUid);
      }
      return uid;
    },

    async updateSettings(uid, settings) {
      const task = await req('PATCH', `/indexes/${uid}/settings`, settings);
      return waitForTask(task.taskUid);
    },

    async addDocuments(uid, docs, primaryKey = 'id') {
      const task = await req('POST', `/indexes/${uid}/documents?primaryKey=${primaryKey}`, docs);
      return waitForTask(task.taskUid);
    },

    async clearIndex(uid) {
      const task = await req('DELETE', `/indexes/${uid}/documents`);
      return waitForTask(task.taskUid);
    },

    async deleteDocument(uid, id) {
      try {
        const task = await req('DELETE', `/indexes/${uid}/documents/${encodeURIComponent(id)}`);
        return await waitForTask(task.taskUid);
      } catch (e) {
        // index/doc may not exist yet — a no-op removal is fine
        if (/not found|Index .* not found/i.test(e.message)) return null;
        throw e;
      }
    },

    async deleteIndex(uid) {
      try {
        const task = await req('DELETE', `/indexes/${uid}`);
        return await waitForTask(task.taskUid);
      } catch (e) {
        if (/not found/i.test(e.message)) return null;
        throw e;
      }
    },

    search(uid, q, opts = {}) {
      return req('POST', `/indexes/${uid}/search`, { q, ...opts });
    },

    stats(uid) {
      return req('GET', `/indexes/${uid}/stats`);
    },

    /** Authenticated probe — verifies the API key (needs indexes.get / master). */
    listIndexes() {
      return req('GET', '/indexes?limit=0');
    },

    /** List API keys (needs a key with keys.get / a master key). */
    listKeys() {
      return req('GET', '/keys?limit=1000');
    },

    /** Create an API key, e.g. a search-only key scoped to some indexes. */
    createKey(payload) {
      return req('POST', '/keys', payload);
    },

    async getDocument(uid, id) {
      try {
        return await req('GET', `/indexes/${uid}/documents/${encodeURIComponent(id)}`);
      } catch (e) {
        if (/not found|Document .* not found/i.test(e.message)) return null;
        throw e;
      }
    },
  };
}

/** Build a client from env (MEILISEARCH_HOST / MEILISEARCH_API_KEY). */
function clientFromEnv(env = process.env) {
  return createClient({
    host: env.MEILISEARCH_HOST || 'http://127.0.0.1:7700',
    apiKey: env.MEILISEARCH_API_KEY || '',
  });
}

/**
 * Build a client from the UI-managed settings (plugin store). Read at call-time
 * so host/key changes made in the UI apply without a restart. No env fallback —
 * the connection is configured entirely from the Settings tab.
 */
function clientFromSettings() {
  // Lazy require avoids a load-order dependency on the settings cache.
  const { getSettingsCached, defaultSettings } = require('./settings-loader');
  const s = getSettingsCached() || defaultSettings();
  return createClient({ host: s.host, apiKey: s.apiKey });
}

module.exports = { createClient, clientFromEnv, clientFromSettings };
