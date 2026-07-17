import { useState } from 'react';
import { Box, Flex, Button } from '@strapi/design-system';
import { Layouts } from '@strapi/strapi/admin';

import { OverviewTab } from '../components/OverviewTab';
import { ConfigTab } from '../components/ConfigTab';
import { SettingsTab } from '../components/SettingsTab';
import { SearchTab } from '../components/SearchTab';

const TABS = [
  ['overview', 'Overview'],
  ['config', 'Configuration'],
  ['settings', 'Settings'],
  ['search', 'Search playground'],
];

const HomePage = () => {
  const [view, setView] = useState('overview');

  return (
    <>
      <Layouts.Header title="Search Sync" subtitle="Index content into Meilisearch" />

      <Box paddingLeft={10} paddingRight={10} paddingBottom={10}>
        <Flex direction="column" alignItems="stretch" gap={6}>
          <Flex gap={2}>
            {TABS.map(([key, label]) => (
              <Button
                key={key}
                variant={view === key ? 'default' : 'tertiary'}
                onClick={() => setView(key)}
              >
                {label}
              </Button>
            ))}
          </Flex>

          {view === 'overview' && <OverviewTab />}
          {view === 'config' && <ConfigTab />}
          {view === 'settings' && <SettingsTab />}
          {view === 'search' && <SearchTab />}
        </Flex>
      </Box>
    </>
  );
};

export { HomePage };
