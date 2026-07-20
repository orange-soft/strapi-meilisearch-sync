'use strict';

/**
 * Validate a serializable config before it's saved. Returns an array of error
 * strings (empty = valid). Keeps bad data out of the store so the compiler and
 * runtime never see a malformed mapping.
 */

const TRANSFORMS = new Set(['text', 'html', 'walk-component', 'walk-dz', 'media']);

function validateRoute(route, path, errors) {
  if (!route || typeof route !== 'object') { errors.push(`${path}: route is required`); return; }
  if (route.kind === 'conditional') {
    if (!route.if || !route.if.field) errors.push(`${path}.route.if: a condition field is required`);
    validateRoute(route.then, `${path}.route.then`, errors);
    if (route.else && route.else.kind !== 'field') validateRoute(route.else, `${path}.route.else`, errors);
    else if (route.else && !route.else.field) errors.push(`${path}.route.else: field is required`);
    return;
  }
  // pattern
  if (!Array.isArray(route.segments)) { errors.push(`${path}.route.segments: must be an array`); return; }
  route.segments.forEach((s, i) => {
    if (s.source === 'relation') {
      if (!s.relation) errors.push(`${path}.route.segments[${i}]: relation name required`);
      if (!s.field) errors.push(`${path}.route.segments[${i}]: field required`);
    } else if (s.source === 'self') {
      if (!s.field) errors.push(`${path}.route.segments[${i}]: field required`);
    } else {
      errors.push(`${path}.route.segments[${i}]: source must be "self" or "relation"`);
    }
  });
}

function validateConfig(raw) {
  const errors = [];
  if (!raw || typeof raw !== 'object') return ['config must be an object'];
  if (!raw.contentTypes || typeof raw.contentTypes !== 'object') return ['config.contentTypes must be an object'];

  for (const [uid, cfg] of Object.entries(raw.contentTypes)) {
    const path = `contentTypes["${uid}"]`;
    if (cfg.enabled === false) continue; // disabled entries aren't compiled; skip deep checks
    if (!cfg.type) errors.push(`${path}.type: a search "type" discriminator is required`);
    validateRoute(cfg.route, path, errors);

    if (!cfg.fields || typeof cfg.fields !== 'object') {
      errors.push(`${path}.fields: must be an object`);
    } else {
      for (const [target, specs] of Object.entries(cfg.fields)) {
        if (!Array.isArray(specs)) { errors.push(`${path}.fields.${target}: must be an array of sources`); continue; }
        specs.forEach((s, i) => {
          const at = `${path}.fields.${target}[${i}]`;
          if (!s.source) errors.push(`${at}: source required`);
          if (!TRANSFORMS.has(s.transform)) errors.push(`${at}: unknown transform "${s.transform}"`);
          // Optional deeper-selection keys.
          if ('only' in s && !Array.isArray(s.only)) errors.push(`${at}: "only" must be an array of component uids`);
          if ('field' in s && typeof s.field !== 'string') errors.push(`${at}: "field" must be a string`);
          if ('component' in s && typeof s.component !== 'string') errors.push(`${at}: "component" must be a string`);
        });
      }
    }
  }
  return errors;
}

module.exports = { validateConfig };
