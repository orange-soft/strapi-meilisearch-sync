import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Box, Flex, Typography, Button, Loader, Alert, Badge, TextInput, Field,
  Table, Thead, Tbody, Tr, Td, Th,
} from '@strapi/design-system';
import { useFetchClient } from '@strapi/strapi/admin';
import { PLUGIN_ID } from '../pluginId';

const mono = { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' };
const shortUid = (uid) => (uid || '').split('.').pop();

const CodeBlock = ({ children }) => (
  <Box background="neutral100" padding={3} hasRadius style={{ overflowX: 'auto' }}>
    <pre style={{ margin: 0 }}>
      <Typography variant="pi" style={{ ...mono, whiteSpace: 'pre' }}>{children}</Typography>
    </pre>
  </Box>
);

const SearchTab = () => {
  const { get, post } = useFetchClient();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [conn, setConn] = useState(null);
  const [prefix, setPrefix] = useState('');
  const [types, setTypes] = useState([]);         // [{ uid, type, displayName }]
  const [selected, setSelected] = useState([]);   // array of type strings

  const [q, setQ] = useState('');
  const [limit, setLimit] = useState(10);

  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);

  const [searchKey, setSearchKey] = useState('');
  const [copied, setCopied] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [settingsRes, schemaRes, configRes] = await Promise.all([
        get(`/${PLUGIN_ID}/settings`),
        get(`/${PLUGIN_ID}/schema`),
        get(`/${PLUGIN_ID}/config`),
      ]);
      setConn(settingsRes.data.connection);
      setPrefix(settingsRes.data.settings.indexPrefix);
      setSearchKey(settingsRes.data.connection.searchKey || '');
      const schema = schemaRes.data.contentTypes || [];
      const cfg = configRes.data.contentTypes || {};
      const enabled = Object.entries(cfg)
        .filter(([, e]) => e && e.enabled !== false)
        .map(([uid, e]) => ({
          uid,
          type: e.type,
          displayName: (schema.find((s) => s.uid === uid) || {}).displayName || shortUid(uid),
        }));
      setTypes(enabled);
    } catch (err) {
      setError(err.response?.data?.error?.message || err.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [get]);

  useEffect(() => { load(); }, [load]);

  const toggleType = (t) =>
    setSelected((cur) => (cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t]));

  const run = async () => {
    setRunning(true); setResult(null);
    try {
      const res = await post(`/${PLUGIN_ID}/search`, { q, types: selected, limit: Number(limit) });
      setResult(res.data);
    } catch (err) {
      setResult({ ok: false, error: err.response?.data?.error?.message || err.message });
    } finally {
      setRunning(false);
    }
  };

  const copy = (text, label) => {
    try {
      navigator.clipboard.writeText(text);
      setCopied(label);
      setTimeout(() => setCopied(''), 1500);
    } catch { /* clipboard unavailable */ }
  };

  const index = conn ? conn.indexName : '';
  const host = conn ? conn.host : '';
  const url = `${host}/indexes/${index}/search`;

  const body = useMemo(() => {
    const b = { q: q || 'your query', limit: Number(limit) || 10 };
    if (selected.length) b.filter = `type IN [${selected.map((t) => `"${t}"`).join(', ')}]`;
    return b;
  }, [q, limit, selected]);

  const snippet =
    `const res = await fetch(${JSON.stringify(url)}, {\n` +
    `  method: "POST",\n` +
    `  headers: {\n` +
    `    "Content-Type": "application/json",\n` +
    `    "Authorization": "Bearer ${searchKey || '<SEARCH_ONLY_KEY>'}"\n` +
    `  },\n` +
    `  body: JSON.stringify(${JSON.stringify(body, null, 2).split('\n').join('\n  ')})\n` +
    `});\n` +
    `const { hits } = await res.json();`;

  if (loading) return <Flex justifyContent="center" padding={8}><Loader>Loading…</Loader></Flex>;

  return (
    <Flex direction="column" alignItems="stretch" gap={6}>
      {error && <Alert title="Error" variant="danger" onClose={() => setError('')} closeLabel="Close">{error}</Alert>}

      {/* Playground controls */}
      <Box background="neutral0" padding={6} hasRadius shadow="filterShadow">
        <Flex direction="column" alignItems="stretch" gap={5}>
          <Typography variant="delta" tag="h2">Search playground</Typography>
          <Typography variant="pi" textColor="neutral600">
            Runs against{' '}
            <Typography variant="pi" fontWeight="bold" style={mono}>{index || '—'}</Typography>{' '}
            on the server using your configured connection.
          </Typography>

          <Flex gap={4} alignItems="flex-end" style={{ flexWrap: 'wrap' }}>
            <Box minWidth="320px" style={{ flex: 1 }}>
              <Field.Root>
                <Field.Label>Query</Field.Label>
                <TextInput
                  placeholder="Type a keyword…"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') run(); }}
                />
              </Field.Root>
            </Box>
            <Box minWidth="120px">
              <Field.Root>
                <Field.Label>Limit</Field.Label>
                <TextInput type="number" value={limit} onChange={(e) => setLimit(e.target.value)} />
              </Field.Root>
            </Box>
            <Button onClick={run} loading={running}>Search</Button>
          </Flex>

          {types.length > 0 && (
            <Box>
              <Typography variant="sigma" textColor="neutral600" style={{ display: 'block', marginBottom: 8 }}>
                Filter by type{' '}
                <Typography variant="pi" textColor="neutral500">(none selected = all types)</Typography>
              </Typography>
              <Flex gap={2} style={{ flexWrap: 'wrap' }}>
                {types.map((t) => (
                  <Button
                    key={t.uid}
                    size="S"
                    variant={selected.includes(t.type) ? 'success-light' : 'tertiary'}
                    onClick={() => toggleType(t.type)}
                  >
                    {t.displayName} · {t.type}
                  </Button>
                ))}
              </Flex>
            </Box>
          )}
        </Flex>
      </Box>

      {/* Results */}
      {result && (
        <Box background="neutral0" padding={6} hasRadius shadow="filterShadow" style={{ overflowX: 'auto' }}>
          {result.ok === false ? (
            <Alert title="Search failed" variant="danger">{result.error}</Alert>
          ) : (
            <Flex direction="column" alignItems="stretch" gap={4}>
              <Flex gap={3} alignItems="center">
                <Typography variant="delta" tag="h2">Results</Typography>
                <Badge>{result.estimatedTotalHits ?? result.hits.length} hits</Badge>
                <Typography variant="pi" textColor="neutral500">
                  {result.processingTimeMs}ms · {result.hits.length} shown
                </Typography>
              </Flex>
              {result.hits.length === 0 ? (
                <Typography textColor="neutral600">No results.</Typography>
              ) : (
                <Table>
                  <Thead>
                    <Tr>
                      <Th><Typography variant="sigma">Type</Typography></Th>
                      <Th><Typography variant="sigma">Title</Typography></Th>
                      <Th><Typography variant="sigma">URL</Typography></Th>
                    </Tr>
                  </Thead>
                  <Tbody>
                    {result.hits.map((h, i) => (
                      <Tr key={h.id || i}>
                        <Td><Badge>{h.type}</Badge></Td>
                        <Td><Typography>{h.title}</Typography></Td>
                        <Td><Typography variant="pi" textColor="neutral600" style={mono}>{h.url}</Typography></Td>
                      </Tr>
                    ))}
                  </Tbody>
                </Table>
              )}
            </Flex>
          )}
        </Box>
      )}

      {/* Frontend integration */}
      <Box background="neutral0" padding={6} hasRadius shadow="filterShadow" style={{ overflowX: 'auto' }}>
        <Flex direction="column" alignItems="stretch" gap={4}>
          <Typography variant="delta" tag="h2">Frontend integration</Typography>
          <Typography variant="pi" textColor="neutral600">
            Your frontend queries Meilisearch directly. Tick the types above to scope the query; the snippet updates live.
          </Typography>

          <Box background="neutral100" padding={3} hasRadius>
            <Typography variant="pi" textColor="neutral700">
              This <b>search-only key</b> can <b>only run searches</b> on your{' '}
              <Typography variant="pi" style={mono}>{prefix}_*</Typography> indexes — it cannot read settings,
              add, or change anything. That makes it <b>safe to embed in browser code</b>: if it leaked, the worst
              anyone could do is run searches they could already run.{' '}
              <Typography variant="pi" textColor="neutral500">
                (Not the same as the plugin's <b>indexing key</b> in Settings, which can write to your data and must stay on the server. Never put that one — or an admin key — in the frontend.)
              </Typography>
            </Typography>
          </Box>

          {searchKey ? (
            <Box background="neutral100" padding={3} hasRadius>
              <Flex direction="column" alignItems="stretch" gap={2}>
                <Flex justifyContent="space-between" alignItems="center">
                  <Typography variant="sigma" textColor="neutral600">Search-only key</Typography>
                  <Button variant="tertiary" size="S" onClick={() => copy(searchKey, 'key')}>Copy key</Button>
                </Flex>
                <Typography variant="pi" style={{ ...mono, wordBreak: 'break-all' }}>{searchKey}</Typography>
                <Typography variant="pi" textColor="neutral500">
                  Generated in the Settings tab, shown here for easy access. Used in the snippet below.
                </Typography>
              </Flex>
            </Box>
          ) : (
            <Alert variant="default" title="No search-only key yet">
              Generate it in the <b>Settings</b> tab (“Generate keys”). It will then appear here and in the snippet.
            </Alert>
          )}

          <Flex justifyContent="space-between" alignItems="center">
            <Typography variant="sigma" textColor="neutral600">Endpoint</Typography>
            <Button variant="tertiary" size="S" onClick={() => copy(`POST ${url}`, 'URL')}>Copy URL</Button>
          </Flex>
          <CodeBlock>{`POST ${url}`}</CodeBlock>

          <Flex justifyContent="space-between" alignItems="center">
            <Typography variant="sigma" textColor="neutral600">fetch() example</Typography>
            <Flex gap={2} alignItems="center">
              {copied && <Typography variant="pi" textColor="success600">Copied {copied}</Typography>}
              <Button variant="tertiary" size="S" onClick={() => copy(snippet, 'snippet')}>Copy snippet</Button>
            </Flex>
          </Flex>
          <CodeBlock>{snippet}</CodeBlock>
        </Flex>
      </Box>
    </Flex>
  );
};

export { SearchTab };
