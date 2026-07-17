import { useState, useEffect, useCallback } from 'react';
import {
  Box, Flex, Typography, Button, Loader, Alert, Badge,
  Table, Thead, Tbody, Tr, Td, Th, TextInput, Field, SingleSelect, SingleSelectOption,
} from '@strapi/design-system';
import { useFetchClient } from '@strapi/strapi/admin';
import { PLUGIN_ID } from '../pluginId';
import { RouteBuilder, templateFor } from './RouteBuilder';
import { ConditionalRoute } from './ConditionalRoute';
import { FieldMapping } from './FieldMapping';

const shortUid = (uid) => (uid || '').split('.').pop();
const clone = (o) => JSON.parse(JSON.stringify(o));

const ConfigTab = () => {
  const { get, put, post } = useFetchClient();

  const [schema, setSchema] = useState([]);
  const [config, setConfig] = useState(null);
  const [selectedUid, setSelectedUid] = useState('');
  const [dirty, setDirty] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [s, c] = await Promise.all([get(`/${PLUGIN_ID}/schema`), get(`/${PLUGIN_ID}/config`)]);
      setSchema(s.data.contentTypes);
      setConfig(c.data);
      setDirty(false);
    } catch (err) {
      setError(err.message || 'Failed to load configuration');
    } finally {
      setLoading(false);
    }
  }, [get]);

  useEffect(() => { load(); }, [load]);

  const schemaFor = (uid) => schema.find((c) => c.uid === uid);
  const entryFor = (uid) => config?.contentTypes?.[uid];
  const isEnabled = (uid) => {
    const e = entryFor(uid);
    return !!e && e.enabled !== false;
  };

  const mutate = (fn) => { const c = clone(config); fn(c); setConfig(c); setDirty(true); };

  const defaultEntry = (uid) => {
    const s = schemaFor(uid);
    const t = (s && s.singularName) || shortUid(uid);
    return {
      enabled: true,
      type: t,
      route: { kind: 'pattern', prefix: `/${t}`, segments: [{ source: 'self', field: (s && s.slugField) || 'slug' }] },
      fields: { title: [{ source: 'title', transform: 'text' }] },
    };
  };

  const toggle = (uid) => mutate((c) => {
    const cur = c.contentTypes[uid];
    if (!cur) c.contentTypes[uid] = defaultEntry(uid);
    else cur.enabled = cur.enabled === false; // flip: was-disabled → enable, else disable
  });

  const setType = (uid, v) => mutate((c) => { c.contentTypes[uid].type = v; });
  const setRoute = (uid, r) => mutate((c) => { c.contentTypes[uid].route = r; });
  const setFields = (uid, f) => mutate((c) => { c.contentTypes[uid].fields = f; });

  const changeRouteKind = (uid, kind) => {
    const s = schemaFor(uid);
    const slug = (s && s.slugField) || 'slug';
    const cur = entryFor(uid).route || {};
    if (kind === 'conditional') {
      const pattern = cur.kind === 'pattern' ? cur : { kind: 'pattern', prefix: '/', segments: [{ source: 'self', field: slug }] };
      const boolField = (s?.fields || []).find((f) => f.type === 'boolean');
      setRoute(uid, {
        kind: 'conditional',
        if: { field: boolField?.name || (s?.fields?.[0]?.name) || slug, truthy: true },
        then: { ...pattern, kind: 'pattern' },
        else: { kind: 'field', field: (s?.fields || []).find((f) => f.kind === 'text')?.name || 'url' },
      });
    } else {
      const then = cur.kind === 'conditional' && cur.then ? cur.then : null;
      setRoute(uid, then || { kind: 'pattern', prefix: `/${entryFor(uid).type}`, segments: [{ source: 'self', field: slug }] });
    }
  };

  const save = async () => {
    setSaving(true); setError(''); setNotice('');
    try {
      await put(`/${PLUGIN_ID}/config`, config);
      setNotice('Configuration saved. Re-run a reindex from the Overview tab to apply it to existing content.');
      setDirty(false);
    } catch (err) {
      setError(err.response?.data?.error?.message || err.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const reset = async () => {
    setSaving(true); setError(''); setNotice('');
    try {
      await post(`/${PLUGIN_ID}/config/reset`, {});
      await load();
      setNotice('Configuration reset to defaults.');
    } catch (err) {
      setError(err.message || 'Reset failed');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Flex justifyContent="center" padding={8}><Loader>Loading configuration…</Loader></Flex>;

  const selEntry = selectedUid ? entryFor(selectedUid) : null;
  const selSchema = selectedUid ? schemaFor(selectedUid) : null;
  const isConditional = selEntry && selEntry.route && selEntry.route.kind === 'conditional';

  return (
    <Flex direction="column" alignItems="stretch" gap={6}>
      <Flex justifyContent="space-between" alignItems="center">
        <Typography variant="beta" tag="h2">Content types</Typography>
        <Flex gap={2}>
          <Button variant="tertiary" onClick={reset} disabled={saving}>Reset to defaults</Button>
          <Button onClick={save} loading={saving} disabled={!dirty || saving}>Save changes</Button>
        </Flex>
      </Flex>

      {error && <Alert closeLabel="Close" onClose={() => setError('')} title="Error" variant="danger">{error}</Alert>}
      {notice && <Alert closeLabel="Close" onClose={() => setNotice('')} title="Saved" variant="success">{notice}</Alert>}
      {dirty && <Alert title="Unsaved changes" variant="default">You have unsaved changes.</Alert>}

      <Box background="neutral0" hasRadius shadow="filterShadow" style={{ overflowX: 'auto' }}>
        <Table>
          <Thead>
            <Tr>
              <Th><Typography variant="sigma">Indexed</Typography></Th>
              <Th><Typography variant="sigma">Content type</Typography></Th>
              <Th><Typography variant="sigma">Search type</Typography></Th>
              <Th><Typography variant="sigma">Route</Typography></Th>
              <Th><Typography variant="sigma">Edit</Typography></Th>
            </Tr>
          </Thead>
          <Tbody>
            {schema.map((c) => {
              const enabled = isEnabled(c.uid);
              const entry = entryFor(c.uid);
              return (
                <Tr key={c.uid}>
                  <Td>
                    <Button variant={enabled ? 'success-light' : 'tertiary'} size="S" onClick={() => toggle(c.uid)}>
                      {enabled ? 'On' : 'Off'}
                    </Button>
                  </Td>
                  <Td>
                    <Flex direction="column" alignItems="flex-start">
                      <Typography fontWeight="bold" textColor="neutral800">{c.displayName}</Typography>
                      <Typography variant="pi" textColor="neutral500">{shortUid(c.uid)} · {c.localized ? 'localized' : 'not localized'}</Typography>
                    </Flex>
                  </Td>
                  <Td>{enabled ? <Badge>{entry.type}</Badge> : <Typography textColor="neutral500">—</Typography>}</Td>
                  <Td>
                    {enabled ? (
                      <Typography variant="pi" textColor="neutral600" style={{ fontFamily: 'ui-monospace, monospace' }}>
                        {entry.route?.kind === 'conditional' ? 'conditional' : templateFor(entry.route || {})}
                      </Typography>
                    ) : <Typography textColor="neutral500">—</Typography>}
                  </Td>
                  <Td>
                    <Button variant="tertiary" size="S" disabled={!enabled} onClick={() => setSelectedUid(c.uid)}>
                      Configure
                    </Button>
                  </Td>
                </Tr>
              );
            })}
          </Tbody>
        </Table>
      </Box>

      {selEntry && (
        <Box background="neutral0" padding={6} hasRadius shadow="filterShadow">
          <Flex direction="column" alignItems="stretch" gap={5}>
            <Flex justifyContent="space-between" alignItems="center">
              <Typography variant="delta" tag="h2">{selSchema?.displayName}</Typography>
              <Button variant="tertiary" size="S" onClick={() => setSelectedUid('')}>Close</Button>
            </Flex>

            <Box maxWidth="280px">
              <Field.Root hint="The `type` field on every indexed document (used for filtering & grouping)">
                <Field.Label>Search type</Field.Label>
                <TextInput value={selEntry.type || ''} onChange={(e) => setType(selectedUid, e.target.value)} />
                <Field.Hint />
              </Field.Root>
            </Box>

            <Box>
              <Flex justifyContent="space-between" alignItems="center" marginBottom={2}>
                <Typography variant="sigma" textColor="neutral600">Route</Typography>
                <Box minWidth="200px">
                  <SingleSelect
                    aria-label="Route type"
                    value={isConditional ? 'conditional' : 'pattern'}
                    onChange={(v) => changeRouteKind(selectedUid, v)}
                  >
                    <SingleSelectOption value="pattern">Pattern (fixed URL)</SingleSelectOption>
                    <SingleSelectOption value="conditional">Conditional (if/then/else)</SingleSelectOption>
                  </SingleSelect>
                </Box>
              </Flex>
              {isConditional ? (
                <ConditionalRoute route={selEntry.route} schema={selSchema} onChange={(r) => setRoute(selectedUid, r)} />
              ) : (
                <RouteBuilder route={selEntry.route} schema={selSchema} onChange={(r) => setRoute(selectedUid, r)} />
              )}
            </Box>

            <Box>
              <Typography variant="sigma" textColor="neutral600" style={{ display: 'block', marginBottom: 8 }}>
                Field mapping <Typography variant="pi" textColor="neutral500">(what each search field is built from)</Typography>
              </Typography>
              <FieldMapping fields={selEntry.fields || {}} schema={selSchema} onChange={(f) => setFields(selectedUid, f)} />
            </Box>
          </Flex>
        </Box>
      )}
    </Flex>
  );
};

export { ConfigTab };
