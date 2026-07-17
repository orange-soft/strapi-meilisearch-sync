import { useState } from 'react';
import { Box, Flex, Typography, Button, TextInput, Field } from '@strapi/design-system';
import { useFetchClient } from '@strapi/strapi/admin';
import { PLUGIN_ID } from '../pluginId';

const mono = { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' };

/**
 * Inline "generate scoped Meilisearch key(s)" flow. The server mints and
 * persists the key(s), so the caller just refreshes afterwards.
 *
 * Requires an admin key that can create keys. If MEILISEARCH_ADMIN_KEY is set
 * in .env (adminKeyFromEnv), the prompt is skipped. Otherwise the user is
 * prompted once; the key is sent once and never stored.
 *
 * Props: scope ('indexing' | 'search' | 'both'), buttonLabel, prefix,
 * adminKeyFromEnv, adminKeyEnvVar, disabled, disabledReason,
 * onGenerated(result) — result = { indexingKey?, searchKey?, pattern }.
 */
const GenerateKeyPanel = ({
  scope,
  buttonLabel,
  prefix,
  adminKeyFromEnv,
  adminKeyEnvVar,
  disabled,
  disabledReason,
  onGenerated,
}) => {
  const { post } = useFetchClient();
  const [open, setOpen] = useState(false);
  const [adminKey, setAdminKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const generate = async () => {
    setBusy(true); setError('');
    try {
      const res = await post(`/${PLUGIN_ID}/settings/generate-key`, { scope, adminKey });
      setOpen(false);
      setAdminKey('');
      if (onGenerated) onGenerated(res.data);
    } catch (err) {
      setError(err.response?.data?.error?.message || err.message || 'Could not generate key');
    } finally {
      setBusy(false);
    }
  };

  const start = () => {
    setError('');
    if (adminKeyFromEnv) generate();   // env admin key → no prompt
    else setOpen((v) => !v);
  };

  const pattern = `${prefix}_*`;

  return (
    <Flex direction="column" alignItems="stretch" gap={3}>
      <Flex gap={3} alignItems="center" style={{ flexWrap: 'wrap' }}>
        <Button variant="secondary" onClick={start} loading={busy && adminKeyFromEnv} disabled={disabled}>
          {buttonLabel}
        </Button>
        <Typography variant="pi" textColor="neutral500">scoped to <Typography variant="pi" style={mono}>{pattern}</Typography></Typography>
        {disabled && disabledReason && <Typography variant="pi" textColor="warning600">{disabledReason}</Typography>}
      </Flex>

      {open && !adminKeyFromEnv && (
        <Box background="neutral100" padding={4} hasRadius>
          <Flex direction="column" alignItems="stretch" gap={3}>
            <Field.Root
              hint={`Needs the keys.create action (plus keys.get to reuse an existing key). Your Default Admin API Key or master key both work. Sent once to mint the scoped key — never stored. Tip: set ${adminKeyEnvVar} in .env to skip this prompt.`}
            >
              <Field.Label>Meilisearch admin key</Field.Label>
              <TextInput
                type="password"
                placeholder="Paste a key that can create keys…"
                value={adminKey}
                onChange={(e) => setAdminKey(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && adminKey) generate(); }}
              />
              <Field.Hint />
            </Field.Root>
            <Flex gap={2}>
              <Button onClick={generate} loading={busy} disabled={!adminKey}>Generate</Button>
              <Button variant="tertiary" onClick={() => { setOpen(false); setAdminKey(''); }}>Cancel</Button>
            </Flex>
          </Flex>
        </Box>
      )}

      {adminKeyFromEnv && (
        <Typography variant="pi" textColor="neutral500">
          Using <Typography variant="pi" style={mono}>{adminKeyEnvVar}</Typography> from .env — no prompt needed.
        </Typography>
      )}

      {error && <Typography variant="pi" textColor="danger600">{error}</Typography>}
    </Flex>
  );
};

export { GenerateKeyPanel };
