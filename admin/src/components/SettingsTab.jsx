import { useState, useEffect, useCallback } from 'react';
import {
  Box, Flex, Typography, Button, Loader, Alert, TextInput, Field,
} from '@strapi/design-system';
import { useFetchClient } from '@strapi/strapi/admin';
import { PLUGIN_ID } from '../pluginId';
import { GenerateKeyPanel } from './GenerateKeyPanel';
import { KeyScopeHelp } from './KeyScopeHelp';

const mono = { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' };

// Small coloured status dot + label for the live connection check.
const StatusLine = ({ color, children }) => (
  <Flex gap={2} alignItems="center">
    <Box style={{ width: 8, height: 8, borderRadius: 8, background: `var(--cc-dot)` }} />
    <Typography variant="pi" textColor={color}>{children}</Typography>
  </Flex>
);

const SettingsTab = () => {
  const { get, put } = useFetchClient();

  const [data, setData] = useState(null);
  const [form, setForm] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [health, setHealth] = useState(null);
  const [testing, setTesting] = useState(false);
  const [copied, setCopied] = useState(false);

  const copyText = (t) => {
    try { navigator.clipboard.writeText(t); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* noop */ }
  };

  const runHealth = useCallback(async () => {
    setTesting(true);
    try {
      const res = await get(`/${PLUGIN_ID}/settings/health`);
      setHealth(res.data);
    } catch (err) {
      setHealth({ ok: false, error: err.response?.data?.error?.message || err.message });
    } finally {
      setTesting(false);
    }
  }, [get]);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const res = await get(`/${PLUGIN_ID}/settings`);
      setData(res.data);
      setForm({ ...res.data.settings, apiKey: '' });
      setDirty(false);
    } catch (err) {
      setError(err.response?.data?.error?.message || err.message || 'Failed to load settings');
    } finally {
      setLoading(false);
    }
  }, [get]);

  useEffect(() => { load(); }, [load]);
  // Auto-check the connection whenever the saved settings (re)load.
  useEffect(() => { if (data) runHealth(); }, [data, runHealth]);

  const change = (k, v) => { setForm((f) => ({ ...f, [k]: v })); setDirty(true); };

  const persist = async (extra, successMsg) => {
    setSaving(true); setError(''); setNotice('');
    try {
      const payload = { ...form, ...extra };
      if (!payload.apiKey) delete payload.apiKey;
      await put(`/${PLUGIN_ID}/settings`, payload);
      setNotice(successMsg || 'Settings saved. If you changed the index prefix or locale, run a reindex from the Overview tab.');
      await load(); // re-load triggers a fresh connection check
    } catch (err) {
      setError(err.response?.data?.error?.message || err.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };
  const save = () => persist();

  if (loading || !form) {
    return <Flex justifyContent="center" padding={8}><Loader>Loading settings…</Loader></Flex>;
  }

  const conn = data.connection;
  const prefixDirty = form.indexPrefix !== data.settings.indexPrefix;
  const hostDirty = form.host !== data.settings.host;
  const keyTyped = !!form.apiKey;
  const indexPreview = `${form.indexPrefix}_${form.defaultLocale}`;

  // Live connection status derived from the health probe.
  const stateKey = testing ? 'checking'
    : !health ? 'unknown'
      : health.ok ? 'ok'
        : health.reachable ? 'noauth'
          : 'down';
  const STATUS = {
    checking: { dot: '#8e8ea9', color: 'neutral600', text: 'Checking connection…' },
    unknown: { dot: '#8e8ea9', color: 'neutral600', text: 'Not checked yet' },
    ok: { dot: '#5cb176', color: 'success600', text: `Connected — host reachable and API key valid.` },
    noauth: { dot: '#ee5e52', color: 'danger600', text: health?.error || 'Reachable, but the API key is missing or invalid.' },
    down: { dot: '#ee5e52', color: 'danger600', text: health?.error || 'Cannot reach the host.' },
  }[stateKey];

  const missingHost = !form.host;
  const missingKey = !conn.apiKeyConfigured && !keyTyped;

  return (
    <Flex direction="column" alignItems="stretch" gap={6}>
      <Flex justifyContent="space-between" alignItems="center">
        <Typography variant="beta" tag="h2">Search Sync settings</Typography>
        <Button onClick={save} loading={saving} disabled={!dirty || saving}>Save changes</Button>
      </Flex>

      {error && <Alert closeLabel="Close" onClose={() => setError('')} title="Error" variant="danger">{error}</Alert>}
      {notice && <Alert closeLabel="Close" onClose={() => setNotice('')} title="Saved" variant="success">{notice}</Alert>}
      {dirty && <Alert title="Unsaved changes" variant="default">You have unsaved changes — click “Save changes”.</Alert>}

      {/* 1) Index settings first — the prefix scopes key generation below */}
      <Box background="neutral0" padding={6} hasRadius shadow="filterShadow">
        <Flex direction="column" alignItems="stretch" gap={5}>
          <Typography variant="delta" tag="h2">Indexing settings</Typography>

          <Flex gap={4} alignItems="flex-start" style={{ flexWrap: 'wrap' }}>
            <Box minWidth="220px">
              <Field.Root required hint="Every index is named <prefix>_<locale>. Use a unique per-app prefix to isolate this app.">
                <Field.Label>Index prefix</Field.Label>
                <TextInput value={form.indexPrefix} onChange={(e) => change('indexPrefix', e.target.value)} />
                <Field.Hint />
              </Field.Root>
            </Box>
            <Box minWidth="180px">
              <Field.Root required hint="Locale used for non-localized types.">
                <Field.Label>Default locale</Field.Label>
                <TextInput value={form.defaultLocale} onChange={(e) => change('defaultLocale', e.target.value)} />
                <Field.Hint />
              </Field.Root>
            </Box>
            <Box minWidth="220px">
              <Field.Root hint="Real-time indexing on content changes. Applies immediately.">
                <Field.Label>Real-time sync</Field.Label>
                <Box paddingTop={1}>
                  <Button
                    variant={form.syncEnabled ? 'success-light' : 'tertiary'}
                    onClick={() => change('syncEnabled', !form.syncEnabled)}
                  >
                    {form.syncEnabled ? 'On' : 'Off'}
                  </Button>
                </Box>
                <Field.Hint />
              </Field.Root>
            </Box>
          </Flex>

          <Typography variant="pi" textColor="neutral600">
            Indexes will be named{' '}
            <Typography variant="pi" fontWeight="bold" style={mono}>{indexPreview}</Typography>{' '}
            (one per locale). Changing the prefix does not move existing documents — reindex to repopulate.
          </Typography>
        </Flex>
      </Box>

      {/* 2) Connection — fully UI-managed (no .env) */}
      <Box background="neutral0" padding={6} hasRadius shadow="filterShadow">
        <Flex direction="column" alignItems="stretch" gap={4}>
          <Flex justifyContent="space-between" alignItems="center">
            <Typography variant="delta" tag="h2">Meilisearch connection</Typography>
            <Button variant="secondary" onClick={runHealth} loading={testing}>Test connection</Button>
          </Flex>

          {/* Live status — tells the user exactly whether it works */}
          <Box style={{ '--cc-dot': STATUS.dot }}>
            <StatusLine color={STATUS.color}>
              {STATUS.text}{(hostDirty || keyTyped) && stateKey !== 'checking' ? ' (unsaved edits — save, then re-test)' : ''}
            </StatusLine>
          </Box>

          {/* What's required / missing */}
          {(missingHost || missingKey) && (
            <Alert variant="default" title="Configuration needed">
              {missingHost && <div>• <b>Host</b> is required.</div>}
              {missingKey && (
                <div>
                  • An <b>API key</b> is required if your Meilisearch has a master key (most do). Paste a scoped
                  indexing key or click <b>Generate indexing key</b> below. Leave it blank only for an unsecured instance.
                </div>
              )}
            </Alert>
          )}

          <Box background="neutral100" padding={3} hasRadius>
            <Typography variant="pi" textColor="neutral700">
              The <b>API key</b> here is the plugin's own <b>server-side indexing key</b>. It needs
              read <b>and write</b> access to your <Typography variant="pi" style={mono}>{data.settings.indexPrefix}_*</Typography> indexes
              so it can create indexes and keep Meilisearch in sync as content changes. Because it can modify your data it is
              powerful — it stays on the server and is never sent to the browser.{' '}
              <Typography variant="pi" textColor="neutral500">
                (Not the same as the public <b>search-only key</b> on the Search playground tab, which can only run searches.)
              </Typography>
            </Typography>
          </Box>

          <Flex gap={4} alignItems="flex-start" style={{ flexWrap: 'wrap' }}>
            <Box minWidth="320px" style={{ flex: 1 }}>
              <Field.Root required error={missingHost ? 'Host is required' : undefined} hint="Meilisearch base URL, e.g. https://meilisearch.example.com">
                <Field.Label>Host</Field.Label>
                <TextInput value={form.host} onChange={(e) => change('host', e.target.value)} placeholder="http://127.0.0.1:7700" />
                <Field.Hint />
                <Field.Error />
              </Field.Root>
            </Box>
            <Box minWidth="300px" style={{ flex: 1 }}>
              <Field.Root
                error={stateKey === 'noauth' && !keyTyped ? 'The stored key was rejected — set a valid one' : undefined}
                hint={conn.apiKeyConfigured
                  ? `A key is set (${conn.apiKeyMasked}). Type or generate a new one to replace it.`
                  : 'Required if your Meilisearch is secured. Paste a scoped indexing key, or generate one below.'}
              >
                <Field.Label>API key (scoped indexing key)</Field.Label>
                <TextInput
                  type="password"
                  value={form.apiKey}
                  onChange={(e) => change('apiKey', e.target.value)}
                  placeholder={conn.apiKeyConfigured ? '•••••••• (leave blank to keep)' : 'Paste or generate a key'}
                />
                <Field.Hint />
                <Field.Error />
              </Field.Root>
            </Box>
          </Flex>

          <KeyScopeHelp actions={conn.indexingKeyActions} pattern={conn.indexPattern} what="indexer" />

          <Box paddingTop={2}>
            <GenerateKeyPanel
              scope="both"
              buttonLabel="Generate keys (indexing + search-only)"
              prefix={data.settings.indexPrefix}
              adminKeyFromEnv={conn.adminKeyFromEnv}
              adminKeyEnvVar={conn.adminKeyEnvVar}
              disabled={prefixDirty || hostDirty}
              disabledReason={prefixDirty ? 'Save the index prefix first' : hostDirty ? 'Save the host first' : ''}
              onGenerated={() => { load(); setNotice('Keys generated and saved — the indexing key is set here, and the search-only key is ready on the Search playground tab.'); }}
            />
            <Box paddingTop={2}>
              <Typography variant="pi" textColor="neutral500">
                One admin-key entry mints both keys: the <b>indexing key</b> (saved here) and the public
                <b> search-only key</b> (below). No need to paste the admin key twice.
              </Typography>
            </Box>
          </Box>

          {/* The public search-only key (minted alongside the indexing key) */}
          {conn.searchKeyConfigured && (
            <Box background="neutral100" padding={3} hasRadius>
              <Flex direction="column" alignItems="stretch" gap={2}>
                <Flex justifyContent="space-between" alignItems="center">
                  <Typography variant="sigma" textColor="neutral600">Search-only key (for your frontend)</Typography>
                  <Flex gap={2} alignItems="center">
                    {copied && <Typography variant="pi" textColor="success600">Copied</Typography>}
                    <Button variant="tertiary" size="S" onClick={() => copyText(conn.searchKey)}>Copy</Button>
                  </Flex>
                </Flex>
                <Typography variant="pi" style={{ ...mono, wordBreak: 'break-all' }}>{conn.searchKey}</Typography>
                <Typography variant="pi" textColor="neutral500">
                  Public, search-only — safe to embed in your frontend. Also shown on the Search playground tab for easy access.
                </Typography>
              </Flex>
            </Box>
          )}
        </Flex>
      </Box>
    </Flex>
  );
};

export { SettingsTab };
