import { useState, useEffect, useCallback } from 'react';
import {
  Box, Flex, Typography, Button, Loader, Alert, Badge,
  Table, Thead, Tbody, Tr, Td, Th, SingleSelect, SingleSelectOption,
} from '@strapi/design-system';
import { ArrowClockwise } from '@strapi/icons';
import { useFetchClient } from '@strapi/strapi/admin';
import { PLUGIN_ID } from '../pluginId';

const shortUid = (uid) => (uid || '').split('.').pop();

const OverviewTab = () => {
  const { get, post } = useFetchClient();

  const [status, setStatus] = useState({ rows: [], meiliHost: '' });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(null);

  const [previewUid, setPreviewUid] = useState('');
  const [preview, setPreview] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const fetchStatus = useCallback(async () => {
    setIsLoading(true);
    setError('');
    try {
      const res = await get(`/${PLUGIN_ID}/status`);
      setStatus(res.data);
      if (!previewUid && res.data.rows.length) setPreviewUid(res.data.rows[0].uid);
    } catch (err) {
      setError(err.message || 'Failed to load status');
    } finally {
      setIsLoading(false);
    }
  }, [get, previewUid]);

  useEffect(() => { fetchStatus(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const runReindex = async (uid) => {
    setBusy(uid || 'ALL');
    setError(''); setNotice('');
    try {
      const res = await post(`/${PLUGIN_ID}/reindex`, uid ? { uid } : {});
      const built = res.data.report.reduce((n, r) => n + r.built, 0);
      setNotice(`Reindexed ${built} document(s) into ${res.data.indexes.join(', ') || 'no index'}.`);
      await fetchStatus();
    } catch (err) {
      setError(err.message || 'Reindex failed');
    } finally {
      setBusy(null);
    }
  };

  const loadPreview = useCallback(async (uid) => {
    if (!uid) return;
    setPreviewLoading(true); setPreview(null);
    try {
      const res = await get(`/${PLUGIN_ID}/preview`, { params: { uid } });
      setPreview(res.data);
    } catch (err) {
      setPreview({ error: err.message || 'Preview failed' });
    } finally {
      setPreviewLoading(false);
    }
  }, [get]);

  useEffect(() => { loadPreview(previewUid); }, [previewUid, loadPreview]);

  return (
    <Flex direction="column" alignItems="stretch" gap={6}>
      <Flex justifyContent="space-between" alignItems="center">
        <Typography variant="beta" tag="h2">Indexed content types</Typography>
        <Button onClick={() => runReindex(null)} loading={busy === 'ALL'} disabled={!!busy} startIcon={<ArrowClockwise />}>
          Reindex all
        </Button>
      </Flex>

      {error && <Alert closeLabel="Close" onClose={() => setError('')} title="Error" variant="danger">{error}</Alert>}
      {notice && <Alert closeLabel="Close" onClose={() => setNotice('')} title="Done" variant="success">{notice}</Alert>}

      {isLoading ? (
        <Flex justifyContent="center" padding={8}><Loader>Loading status…</Loader></Flex>
      ) : (
        <Box background="neutral0" hasRadius shadow="filterShadow" style={{ overflowX: 'auto' }}>
          <Table>
            <Thead>
              <Tr>
                <Th><Typography variant="sigma">Content type</Typography></Th>
                <Th><Typography variant="sigma">Route depends on</Typography></Th>
                <Th><Typography variant="sigma">Cascade parents</Typography></Th>
                <Th><Typography variant="sigma">In Strapi</Typography></Th>
                <Th><Typography variant="sigma">Indexed</Typography></Th>
                <Th><Typography variant="sigma">Status</Typography></Th>
                <Th><Typography variant="sigma">Actions</Typography></Th>
              </Tr>
            </Thead>
            <Tbody>
              {status.rows.map((r) => (
                <Tr key={r.uid}>
                  <Td>
                    <Flex direction="column" alignItems="flex-start">
                      <Typography fontWeight="bold" textColor="neutral800">{r.type}</Typography>
                      <Typography variant="pi" textColor="neutral500">{r.localized ? 'localized' : 'not localized'}</Typography>
                    </Flex>
                  </Td>
                  <Td>
                    {r.routeDeps.length ? (
                      <Flex gap={1} wrap="wrap">{r.routeDeps.map((d) => <Badge key={d}>{d}</Badge>)}</Flex>
                    ) : <Typography textColor="neutral500">—</Typography>}
                  </Td>
                  <Td>
                    {r.cascadeParents.length ? (
                      <Flex gap={1} wrap="wrap">{r.cascadeParents.map((p) => <Badge key={p}>{shortUid(p)}</Badge>)}</Flex>
                    ) : <Typography textColor="neutral500">—</Typography>}
                  </Td>
                  <Td><Typography textColor="neutral800">{r.strapiCount}</Typography></Td>
                  <Td><Typography textColor="neutral800">{r.indexed == null ? '—' : r.indexed}</Typography></Td>
                  <Td>
                    {r.indexed == null ? <Badge>not indexed</Badge>
                      : r.drift ? <Badge active textColor="danger600" backgroundColor="danger100">drift</Badge>
                      : <Badge active textColor="success600" backgroundColor="success100">in sync</Badge>}
                  </Td>
                  <Td>
                    <Button variant="tertiary" size="S" loading={busy === r.uid} disabled={!!busy}
                      onClick={() => runReindex(r.uid)} startIcon={<ArrowClockwise />}>
                      Reindex
                    </Button>
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        </Box>
      )}

      <Box background="neutral0" padding={6} hasRadius shadow="filterShadow">
        <Flex direction="column" alignItems="stretch" gap={4}>
          <Typography variant="delta" tag="h2">Dry-run preview</Typography>
          <Typography variant="pi" textColor="neutral600">
            The exact document that would be sent to Meilisearch for the first published entry of a type.
          </Typography>
          <Box maxWidth="320px">
            <SingleSelect label="Content type" value={previewUid || undefined} onChange={(v) => setPreviewUid(v)}>
              {status.rows.map((r) => <SingleSelectOption key={r.uid} value={r.uid}>{r.type}</SingleSelectOption>)}
            </SingleSelect>
          </Box>
          {previewLoading ? (
            <Flex justifyContent="center" padding={6}><Loader small>Building…</Loader></Flex>
          ) : preview && preview.error ? (
            <Alert variant="danger" title="Preview error">{preview.error}</Alert>
          ) : preview && preview.found === false ? (
            <Typography textColor="neutral600">No published entry to preview.</Typography>
          ) : preview && preview.document ? (
            <Flex direction="column" alignItems="stretch" gap={3}>
              <Flex gap={2} alignItems="center" wrap="wrap">
                <Typography variant="sigma" textColor="neutral600">Resolved URL</Typography>
                <Badge>{preview.url || '‹unresolved›'}</Badge>
                {preview.missing && preview.missing.length > 0 && (
                  <Typography variant="pi" textColor="danger600">missing: {preview.missing.join(', ')}</Typography>
                )}
              </Flex>
              <Box background="neutral900" hasRadius padding={4} style={{ overflowX: 'auto' }}>
                <pre style={{ margin: 0, color: '#dcdce6', fontSize: 12, lineHeight: 1.6, fontFamily: 'ui-monospace, monospace' }}>
                  {JSON.stringify(preview.document, null, 2)}
                </pre>
              </Box>
            </Flex>
          ) : null}
        </Flex>
      </Box>
    </Flex>
  );
};

export { OverviewTab };
