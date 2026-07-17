import {
  Box, Flex, Typography, Button, SingleSelect, SingleSelectOption, TextInput, Field,
} from '@strapi/design-system';

/** Build the template string a route pattern produces, e.g. /our-programs/{program_type.slug}/{slug} */
const templateFor = (route) => {
  const parts = (route.segments || []).map((s) =>
    s.source === 'self' ? `{${s.field}}` : `{${s.relation}.${s.field}}`
  );
  const base = (route.prefix || '/').replace(/\/+$/, '');
  return `${base}/${parts.join('/')}`.replace(/\/{2,}/g, '/') || '/';
};

/**
 * Editor for a `pattern` route. Conditional routes are handled by the parent.
 * props: { route, schema (introspection for this type), onChange }
 */
const RouteBuilder = ({ route, schema, onChange }) => {
  const relations = schema?.relations || [];
  const selfFields = schema?.selfSegmentFields?.length ? schema.selfSegmentFields : ['slug'];
  const segments = route.segments || [];

  const setSegments = (segs) => onChange({ ...route, segments: segs });
  const updateSeg = (i, seg) => setSegments(segments.map((s, idx) => (idx === i ? seg : s)));
  const removeSeg = (i) => setSegments(segments.filter((_, idx) => idx !== i));
  const move = (i, dir) => {
    const j = i + dir;
    if (j < 0 || j >= segments.length) return;
    const s = [...segments];
    [s[i], s[j]] = [s[j], s[i]];
    setSegments(s);
  };
  const addSelf = () => setSegments([...segments, { source: 'self', field: selfFields[0] }]);
  const addRelation = () => {
    const r = relations[0];
    if (!r) return;
    setSegments([...segments, { source: 'relation', relation: r.name, field: r.targetFields[0] || 'slug' }]);
  };

  const relFieldsFor = (name) => {
    const r = relations.find((x) => x.name === name);
    return r?.targetFields?.length ? r.targetFields : ['slug'];
  };

  return (
    <Flex direction="column" alignItems="stretch" gap={4}>
      <Field.Root>
        <Field.Label>URL prefix</Field.Label>
        <TextInput value={route.prefix || ''} onChange={(e) => onChange({ ...route, prefix: e.target.value })} placeholder="/our-programs" />
      </Field.Root>

      <Flex direction="column" alignItems="stretch" gap={2}>
        <Typography variant="sigma" textColor="neutral600">Segments</Typography>
        {segments.length === 0 && <Typography textColor="neutral500">No segments yet — add one below.</Typography>}

        {segments.map((seg, i) => (
          <Box key={i} background="neutral100" hasRadius padding={3}>
            <Flex gap={2} alignItems="flex-end" wrap="wrap">
              <Box minWidth="130px">
                <Field.Root>
                  <Field.Label>Source</Field.Label>
                  <SingleSelect
                    value={seg.source}
                    onChange={(v) =>
                      updateSeg(i, v === 'self'
                        ? { source: 'self', field: selfFields[0] }
                        : { source: 'relation', relation: relations[0]?.name, field: relations[0]?.targetFields?.[0] || 'slug' })
                    }
                  >
                    <SingleSelectOption value="self">This entry</SingleSelectOption>
                    <SingleSelectOption value="relation">Relation</SingleSelectOption>
                  </SingleSelect>
                </Field.Root>
              </Box>

              {seg.source === 'relation' && (
                <Box minWidth="170px">
                  <Field.Root>
                    <Field.Label>Relation</Field.Label>
                    <SingleSelect
                      value={seg.relation}
                      onChange={(v) => updateSeg(i, { ...seg, relation: v, field: relFieldsFor(v)[0] })}
                    >
                      {relations.map((r) => (
                        <SingleSelectOption key={r.name} value={r.name}>{r.name} → {r.target.split('.').pop()}</SingleSelectOption>
                      ))}
                    </SingleSelect>
                  </Field.Root>
                </Box>
              )}

              <Box minWidth="140px">
                <Field.Root>
                  <Field.Label>Field</Field.Label>
                  <SingleSelect value={seg.field} onChange={(v) => updateSeg(i, { ...seg, field: v })}>
                    {(seg.source === 'self' ? selfFields : relFieldsFor(seg.relation)).map((f) => (
                      <SingleSelectOption key={f} value={f}>{f}</SingleSelectOption>
                    ))}
                  </SingleSelect>
                </Field.Root>
              </Box>

              <Flex gap={1}>
                <Button variant="tertiary" size="S" onClick={() => move(i, -1)} disabled={i === 0}>↑</Button>
                <Button variant="tertiary" size="S" onClick={() => move(i, 1)} disabled={i === segments.length - 1}>↓</Button>
                <Button variant="danger-light" size="S" onClick={() => removeSeg(i)}>Remove</Button>
              </Flex>
            </Flex>
          </Box>
        ))}

        <Flex gap={2}>
          <Button variant="secondary" size="S" onClick={addSelf}>+ Entry field</Button>
          <Button variant="secondary" size="S" onClick={addRelation} disabled={!relations.length}>+ Relation</Button>
        </Flex>
      </Flex>

      <Box background="neutral900" hasRadius padding={3}>
        <Typography variant="pi" textColor="neutral0" style={{ fontFamily: 'ui-monospace, monospace' }}>
          {templateFor(route)}
        </Typography>
      </Box>
    </Flex>
  );
};

export { RouteBuilder, templateFor };
