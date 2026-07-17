'use strict';

/**
 * Runtime knobs read at call-time from the UI-managed settings (plugin store).
 * No env fallback — prefix/locale are configured entirely from the Settings tab.
 * Before settings are loaded (standalone scripts) the static defaults apply.
 */
const { getSettingsCached, defaultSettings } = require('../engine/settings-loader');

const current = () => getSettingsCached() || defaultSettings();

const defaultLocale = () => current().defaultLocale;
const indexPrefix = () => current().indexPrefix;
const indexName = (locale) => `${indexPrefix()}_${locale || defaultLocale()}`;

module.exports = { defaultLocale, indexPrefix, indexName };
