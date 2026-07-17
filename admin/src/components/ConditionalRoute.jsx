import {
  Box, Flex, Typography, SingleSelect, SingleSelectOption, TextInput, Field,
} from '@strapi/design-system';
import { RouteBuilder, templateFor } from './RouteBuilder';

const OPERATORS = [
  { value: 'truthy', label: 'is true / present' },
  { value: 'falsy', label: 'is false / empty' },
  { value: 'empty', label: 'is empty' },
  { value: 'equals', label: 'equals value' },
];

const opOf = (cond) => {
  if (!cond) return 'truthy';
  if (cond.truthy) return 'truthy';
  if (cond.falsy) return 'falsy';
  if (cond.empty) return 'empty';
  if ('equals' in cond) return 'equals';
  return 'truthy';
};
const buildCond = (field, op, value) => {
  const base = { field };
  if (op === 'truthy') return { ...base, truthy: true };
  if (op === 'falsy') return { ...base, falsy: true };
  if (op === 'empty') return { ...base, empty: true };
  return { ...base, equals: value ?? '' };
};

/**
 * Editor for a `conditional` route: IF <field op value> THEN <pattern> ELSE <field | pattern>.
 * props: { route, schema, onChange }
 */
const ConditionalRoute = ({ route, schema, onChange }) => {
  const fields = schema?.fields || [];
  const selfFields = schema?.selfSegmentFields?.length ? schema.selfSegmentFields : ['slug'];
  const cond = route.if || { field: fields[0]?.name, truthy: true };
  const op = opOf(cond);
  const elseSpec = route.else || { kind: 'field', field: 'url' };

  const set = (patch) => onChange({ ...route, ...patch });
  const fieldOptions = (current) => {
    const names = fields.map((f) => f.name);
    return names.includes(current) || !current ? fields : [{ name: current, kind: 'custom' }, ...fields];
  };

  const defaultPattern = () => ({ kind: 'pattern', prefix: '/', segments: [{ source: 'self', field: selfFields[0] }] });

  return (
    <Flex direction="column" alignItems="stretch" gap={4}>
      {/* IF */}
      <Box background="neutral100" hasRadius padding={3}>
        <Typography variant="sigma" textColor="neutral600" style={{ display: 'block', marginBottom: 8 }}>If</Typography>
        <Flex gap={2} alignItems="flex-end" wrap="wrap">
          <Box minWidth="200px">
            <Field.Root>
              <Field.Label>Field</Field.Label>
              <SingleSelect value={cond.field} onChange={(v) => set({ if: buildCond(v, op, cond.equals) })}>
                {fieldOptions(cond.field).map((f) => (
                  <SingleSelectOption key={f.name} value={f.name}>{f.name} ({f.kind})</SingleSelectOption>
                ))}
              </SingleSelect>
            </Field.Root>
          </Box>
          <Box minWidth="170px">
            <Field.Root>
              <Field.Label>Condition</Field.Label>
              <SingleSelect value={op} onChange={(v) => set({ if: buildCond(cond.field, v, cond.equals) })}>
                {OPERATORS.map((o) => <SingleSelectOption key={o.value} value={o.value}>{o.label}</SingleSelectOption>)}
              </SingleSelect>
            </Field.Root>
          </Box>
          {op === 'equals' && (
            <Box minWidth="140px">
              <Field.Root>
                <Field.Label>Value</Field.Label>
                <TextInput value={String(cond.equals ?? '')} onChange={(e) => set({ if: buildCond(cond.field, 'equals', e.target.value) })} />
              </Field.Root>
            </Box>
          )}
        </Flex>
      </Box>

      {/* THEN */}
      <Box background="neutral0" hasRadius padding={3} shadow="tableShadow">
        <Typography variant="sigma" textColor="success600" style={{ display: 'block', marginBottom: 8 }}>Then — build the URL from a pattern</Typography>
        <RouteBuilder route={route.then || defaultPattern()} schema={schema} onChange={(r) => set({ then: { ...r, kind: 'pattern' } })} />
      </Box>

      {/* ELSE */}
      <Box background="neutral0" hasRadius padding={3} shadow="tableShadow">
        <Typography variant="sigma" textColor="warning600" style={{ display: 'block', marginBottom: 8 }}>Else</Typography>
        <Box maxWidth="220px" marginBottom={3}>
          <Field.Root>
            <Field.Label>Else uses</Field.Label>
            <SingleSelect
              value={elseSpec.kind === 'field' ? 'field' : 'pattern'}
              onChange={(v) => set({ else: v === 'field' ? { kind: 'field', field: fields[0]?.name || 'url' } : defaultPattern() })}
            >
              <SingleSelectOption value="field">A field value (e.g. external url)</SingleSelectOption>
              <SingleSelectOption value="pattern">A URL pattern</SingleSelectOption>
            </SingleSelect>
          </Field.Root>
        </Box>
        {elseSpec.kind === 'field' ? (
          <Box maxWidth="220px">
            <Field.Root>
              <Field.Label>Field</Field.Label>
              <SingleSelect value={elseSpec.field} onChange={(v) => set({ else: { kind: 'field', field: v } })}>
                {fieldOptions(elseSpec.field).map((f) => <SingleSelectOption key={f.name} value={f.name}>{f.name} ({f.kind})</SingleSelectOption>)}
              </SingleSelect>
            </Field.Root>
          </Box>
        ) : (
          <RouteBuilder route={elseSpec} schema={schema} onChange={(r) => set({ else: { ...r, kind: 'pattern' } })} />
        )}
      </Box>

      {/* summary */}
      <Box background="neutral900" hasRadius padding={3}>
        <Typography variant="pi" textColor="neutral0" style={{ fontFamily: 'ui-monospace, monospace' }}>
          if {cond.field} {op}{op === 'equals' ? ` "${cond.equals ?? ''}"` : ''} → {templateFor(route.then || defaultPattern())}
          {' '}else → {elseSpec.kind === 'field' ? `{${elseSpec.field}}` : templateFor(elseSpec)}
        </Typography>
      </Box>
    </Flex>
  );
};

export { ConditionalRoute };
