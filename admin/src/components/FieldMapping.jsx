import { useState } from 'react';
import {
  Box, Flex, Typography, Button, SingleSelect, SingleSelectOption, TextInput, Field,
} from '@strapi/design-system';

const ALL_TRANSFORMS = ['text', 'html', 'walk-component', 'walk-dz', 'media'];
const TRANSFORM_LABEL = {
  text: 'plain text',
  html: 'CKEditor → text',
  'walk-component': 'walk component',
  'walk-dz': 'walk dynamic zone',
  media: 'media → URL',
};

/**
 * Editor for a type's field mapping — the "flatten toolkit" as UI.
 * props: { fields (config.fields object), schema (introspection for this type), onChange }
 */
const FieldMapping = ({ fields, schema, onChange }) => {
  const [newTarget, setNewTarget] = useState('');
  const schemaFields = schema?.fields || [];
  const fieldByName = (n) => schemaFields.find((f) => f.name === n);
  const transformsFor = (source) => {
    const f = fieldByName(source);
    return f && f.transforms && f.transforms.length ? f.transforms : ALL_TRANSFORMS;
  };

  const setTargetSources = (target, sources) => onChange({ ...fields, [target]: sources });
  const updateSource = (target, i, src) => onChange({ ...fields, [target]: fields[target].map((s, idx) => (idx === i ? src : s)) });
  const removeSource = (target, i) => setTargetSources(target, fields[target].filter((_, idx) => idx !== i));
  const moveSource = (target, i, dir) => {
    const arr = fields[target]; const j = i + dir;
    if (j < 0 || j >= arr.length) return;
    const a = [...arr]; [a[i], a[j]] = [a[j], a[i]]; setTargetSources(target, a);
  };
  const addSource = (target) => {
    const f = schemaFields[0];
    setTargetSources(target, [...(fields[target] || []), { source: f?.name || 'title', transform: f?.transforms?.[0] || 'text' }]);
  };
  const removeTarget = (target) => {
    const next = { ...fields }; delete next[target]; onChange(next);
  };
  const addTarget = () => {
    const name = newTarget.trim();
    if (!name || fields[name]) return;
    const f = schemaFields[0];
    onChange({ ...fields, [name]: [{ source: f?.name || 'title', transform: f?.transforms?.[0] || 'text' }] });
    setNewTarget('');
  };

  // options for a source dropdown, preserving any current value not in the schema (e.g. dotted paths)
  const sourceOptions = (current) => {
    const names = schemaFields.map((f) => f.name);
    return names.includes(current) || !current ? schemaFields : [{ name: current, kind: 'custom' }, ...schemaFields];
  };
  const transformOptions = (current, source) => {
    const opts = transformsFor(source);
    return opts.includes(current) || !current ? opts : [current, ...opts];
  };

  return (
    <Flex direction="column" alignItems="stretch" gap={3}>
      {Object.entries(fields).map(([target, sources]) => (
        <Box key={target} background="neutral100" hasRadius padding={3}>
          <Flex justifyContent="space-between" alignItems="center" marginBottom={2}>
            <Typography fontWeight="bold" style={{ fontFamily: 'ui-monospace, monospace' }}>{target}</Typography>
            <Button variant="danger-light" size="S" onClick={() => removeTarget(target)}>Remove field</Button>
          </Flex>

          <Flex direction="column" alignItems="stretch" gap={2}>
            {sources.map((s, i) => (
              <Flex key={i} gap={2} alignItems="flex-end" wrap="wrap">
                <Box minWidth="200px">
                  <Field.Root>
                    <Field.Label>Source</Field.Label>
                    <SingleSelect
                      value={s.source}
                      onChange={(v) => updateSource(target, i, { source: v, transform: transformsFor(v)[0] || 'text' })}
                    >
                      {sourceOptions(s.source).map((f) => (
                        <SingleSelectOption key={f.name} value={f.name}>{f.name} ({f.kind})</SingleSelectOption>
                      ))}
                    </SingleSelect>
                  </Field.Root>
                </Box>
                <Box minWidth="180px">
                  <Field.Root>
                    <Field.Label>Transform</Field.Label>
                    <SingleSelect value={s.transform} onChange={(v) => updateSource(target, i, { ...s, transform: v })}>
                      {transformOptions(s.transform, s.source).map((t) => (
                        <SingleSelectOption key={t} value={t}>{TRANSFORM_LABEL[t] || t}</SingleSelectOption>
                      ))}
                    </SingleSelect>
                  </Field.Root>
                </Box>
                <Flex gap={1}>
                  <Button variant="tertiary" size="S" onClick={() => moveSource(target, i, -1)} disabled={i === 0}>↑</Button>
                  <Button variant="tertiary" size="S" onClick={() => moveSource(target, i, 1)} disabled={i === sources.length - 1}>↓</Button>
                  <Button variant="danger-light" size="S" onClick={() => removeSource(target, i)}>✕</Button>
                </Flex>
              </Flex>
            ))}
            <Box>
              <Button variant="secondary" size="S" onClick={() => addSource(target)}>+ Source</Button>
            </Box>
          </Flex>
        </Box>
      ))}

      <Flex gap={2} alignItems="flex-end">
        <Box minWidth="220px">
          <Field.Root hint="e.g. title, description, body, thumbnail">
            <Field.Label>Add a document field</Field.Label>
            <TextInput value={newTarget} onChange={(e) => setNewTarget(e.target.value)} placeholder="field name" />
            <Field.Hint />
          </Field.Root>
        </Box>
        <Button variant="secondary" onClick={addTarget} disabled={!newTarget.trim()}>Add field</Button>
      </Flex>
    </Flex>
  );
};

export { FieldMapping };
