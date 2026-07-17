import { useState } from 'react';
import { Box, Flex, Typography, Button } from '@strapi/design-system';

const mono = { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' };

/**
 * Explains the exact Meilisearch scope a manually-pasted key must have, so a
 * user who brings their own key (instead of using "Generate") knows what to
 * create. Shows the required actions + index pattern and a ready-to-run
 * `POST /keys` body. Props: actions (string[]), pattern (string), what (label).
 */
const KeyScopeHelp = ({ actions = [], pattern, what = 'this key' }) => {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const body = JSON.stringify(
    { description: `search-sync ${what} (${pattern})`, actions, indexes: [pattern], expiresAt: null },
    null,
    2
  );
  const snippet =
    `curl -X POST '<MEILI_HOST>/keys' \\\n` +
    `  -H 'Authorization: Bearer <MASTER_OR_ADMIN_KEY>' \\\n` +
    `  -H 'Content-Type: application/json' \\\n` +
    `  --data '${body}'`;

  const copy = () => {
    try { navigator.clipboard.writeText(snippet); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* noop */ }
  };

  return (
    <Box>
      <Button variant="tertiary" size="S" onClick={() => setOpen((v) => !v)}>
        {open ? 'Hide required scope' : 'What scope does a pasted key need?'}
      </Button>

      {open && (
        <Box background="neutral100" padding={3} hasRadius marginTop={2}>
          <Flex direction="column" alignItems="stretch" gap={2}>
            <Typography variant="pi" textColor="neutral700">
              A key you paste must be allowed to run these actions on{' '}
              <Typography variant="pi" style={mono}>{pattern}</Typography>:
            </Typography>
            <Flex gap={1} style={{ flexWrap: 'wrap' }}>
              {actions.map((a) => (
                <Typography key={a} variant="pi" style={{ ...mono }} textColor="primary600">
                  {a}
                </Typography>
              ))}
            </Flex>
            <Flex justifyContent="space-between" alignItems="center" paddingTop={1}>
              <Typography variant="pi" textColor="neutral500">
                Create one with your master/admin key:
              </Typography>
              <Button variant="tertiary" size="S" onClick={copy}>{copied ? 'Copied' : 'Copy curl'}</Button>
            </Flex>
            <Box background="neutral0" padding={2} hasRadius style={{ overflowX: 'auto' }}>
              <pre style={{ margin: 0 }}>
                <Typography variant="pi" style={{ ...mono, whiteSpace: 'pre' }}>{snippet}</Typography>
              </pre>
            </Box>
            <Typography variant="pi" textColor="neutral500">
              …or just click “Generate” to have a correctly-scoped key created for you.
            </Typography>
          </Flex>
        </Box>
      )}
    </Box>
  );
};

export { KeyScopeHelp };
