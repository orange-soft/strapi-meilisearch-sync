import { useState } from 'react';
import {
  Box, Flex, Typography, Button, SingleSelect, SingleSelectOption,
  MultiSelect, MultiSelectOption, TextInput, Field,
} from '@strapi/design-system';

const ALL_TRANSFORMS = ['text', 'html', 'walk-component', 'walk-dz', 'media'];
const TRANSFORM_LABEL = {
  text: 'plain text',
  html: 'CKEditor → text',
  'walk-component': 'walk component',
  'walk-dz': 'walk dynamic zone',
  media: 'media → URL',
};

// The three selection modes for a component / dynamic-zone source.
const MODE_LABEL = {
  walk: 'Walk everything',
  only: 'Walk only these components',
  pick: 'Pinpoint one field',
};

/**
 * Editor for a type's field mapping — the "flatten toolkit" as UI.
 *
 * A source that points at a component or dynamic zone can go one layer deeper:
 *   - walk  → grab all text from the whole thing (transform walk-component/walk-dz)
 *   - only  → walk only the selected components of a dynamic zone     ({ only: [...] })
 *   - pick  → extract one field of one component                     ({ component, field })
 *
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
  const isDz = (sf) => sf && sf.kind === 'dynamiczone';
  const isWalkable = (sf) => sf && (sf.kind === 'component' || sf.kind === 'dynamiczone');
  // The component schema a pick currently targets (dz → matched by uid; component → the sole one).
  const pickComp = (sf, componentUid) => {
    const list = sf?.componentSchemas || [];
    return isDz(sf) ? list.find((c) => c.uid === componentUid) || list[0] : list[0];
  };
  const modeOf = (s) => (s.field ? 'pick' : s.only ? 'only' : 'walk');

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

  // When the source field changes, reset to a clean spec for its kind.
  const changeSourceField = (target, i, name) =>
    updateSource(target, i, { source: name, transform: transformsFor(name)[0] || 'text' });

  // Switch the selection mode for a walkable source.
  const changeMode = (target, i, s, sf, mode) => {
    if (mode === 'walk') {
      updateSource(target, i, { source: s.source, transform: isDz(sf) ? 'walk-dz' : 'walk-component' });
    } else if (mode === 'only') {
      updateSource(target, i, { source: s.source, transform: 'walk-dz', only: s.only || [] });
    } else {
      const comp = pickComp(sf, s.component);
      const ff = comp?.fields?.[0];
      const next = { source: s.source, field: ff?.name || '', transform: ff?.transforms?.[0] || 'text' };
      if (isDz(sf)) next.component = comp?.uid;
      updateSource(target, i, next);
    }
  };
  const changePickComponent = (target, i, s, sf, uid) => {
    const comp = pickComp(sf, uid);
    const ff = comp?.fields?.[0];
    updateSource(target, i, { source: s.source, component: uid, field: ff?.name || '', transform: ff?.transforms?.[0] || 'text' });
  };
  const changePickField = (target, i, s, sf, name) => {
    const comp = pickComp(sf, s.component);
    const fld = comp?.fields?.find((f) => f.name === name);
    updateSource(target, i, { ...s, field: name, transform: fld?.transforms?.[0] || 'text' });
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

  // The deeper-selection controls shown when a source is a component / dynamic zone.
  const renderDeeper = (target, i, s, sf) => {
    const mode = modeOf(s);
    const comp = pickComp(sf, s.component);
    const pickFields = comp?.fields || [];
    const activeField = pickFields.find((f) => f.name === s.field);
    const fieldTransforms = activeField?.transforms?.length ? activeField.transforms : ['text'];
    const modes = isDz(sf) ? ['walk', 'only', 'pick'] : ['walk', 'pick'];
    return (
      <>
        <Box minWidth="200px">
          <Field.Root>
            <Field.Label>Mode</Field.Label>
            <SingleSelect value={mode} onChange={(v) => changeMode(target, i, s, sf, v)}>
              {modes.map((m) => <SingleSelectOption key={m} value={m}>{MODE_LABEL[m]}</SingleSelectOption>)}
            </SingleSelect>
          </Field.Root>
        </Box>

        {mode === 'only' && (
          <Box minWidth="260px">
            <Field.Root hint="Empty = all components">
              <Field.Label>Components</Field.Label>
              <MultiSelect
                value={s.only || []}
                onChange={(vals) => updateSource(target, i, { source: s.source, transform: 'walk-dz', only: vals })}
                withTags
              >
                {(sf.componentSchemas || []).map((c) => (
                  <MultiSelectOption key={c.uid} value={c.uid}>{c.displayName}</MultiSelectOption>
                ))}
              </MultiSelect>
              <Field.Hint />
            </Field.Root>
          </Box>
        )}

        {mode === 'pick' && (
          <>
            {isDz(sf) && (
              <Box minWidth="200px">
                <Field.Root>
                  <Field.Label>Component</Field.Label>
                  <SingleSelect value={s.component || ''} onChange={(v) => changePickComponent(target, i, s, sf, v)}>
                    {(sf.componentSchemas || []).map((c) => (
                      <SingleSelectOption key={c.uid} value={c.uid}>{c.displayName}</SingleSelectOption>
                    ))}
                  </SingleSelect>
                </Field.Root>
              </Box>
            )}
            <Box minWidth="180px">
              <Field.Root>
                <Field.Label>Field</Field.Label>
                <SingleSelect value={s.field || ''} onChange={(v) => changePickField(target, i, s, sf, v)}>
                  {pickFields.map((f) => (
                    <SingleSelectOption key={f.name} value={f.name}>{f.name} ({f.kind})</SingleSelectOption>
                  ))}
                </SingleSelect>
              </Field.Root>
            </Box>
            <Box minWidth="160px">
              <Field.Root>
                <Field.Label>Transform</Field.Label>
                <SingleSelect value={s.transform} onChange={(v) => updateSource(target, i, { ...s, transform: v })}>
                  {fieldTransforms.map((t) => (
                    <SingleSelectOption key={t} value={t}>{TRANSFORM_LABEL[t] || t}</SingleSelectOption>
                  ))}
                </SingleSelect>
              </Field.Root>
            </Box>
          </>
        )}
      </>
    );
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
            {sources.map((s, i) => {
              const sf = fieldByName(s.source);
              return (
                <Flex key={i} gap={2} alignItems="flex-end" wrap="wrap">
                  <Box minWidth="200px">
                    <Field.Root>
                      <Field.Label>Source</Field.Label>
                      <SingleSelect value={s.source} onChange={(v) => changeSourceField(target, i, v)}>
                        {sourceOptions(s.source).map((f) => (
                          <SingleSelectOption key={f.name} value={f.name}>{f.name} ({f.kind})</SingleSelectOption>
                        ))}
                      </SingleSelect>
                    </Field.Root>
                  </Box>

                  {isWalkable(sf) ? (
                    renderDeeper(target, i, s, sf)
                  ) : (
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
                  )}

                  <Flex gap={1}>
                    <Button variant="tertiary" size="S" onClick={() => moveSource(target, i, -1)} disabled={i === 0}>↑</Button>
                    <Button variant="tertiary" size="S" onClick={() => moveSource(target, i, 1)} disabled={i === sources.length - 1}>↓</Button>
                    <Button variant="danger-light" size="S" onClick={() => removeSource(target, i)}>✕</Button>
                  </Flex>
                </Flex>
              );
            })}
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
