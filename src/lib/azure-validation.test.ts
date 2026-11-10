import { describe, expect, it } from 'vitest';
import { applyPatch, defaultConfig } from './model';
import { checkRule, validateConfig } from './validate';
import { importIni } from './importer';
import { generateIni } from './generate';
import { knownAzureRegion } from './azure-regions';

describe('Azure region and subscription guardrails', () => {
  it.each(['uksouth', 'northeurope', 'WESTUS2', ' North Europe ', 'austriaeast', 'belgiumcentral', 'chilecentral'])('recognizes documented region %s', (region) => {
    expect(knownAzureRegion(region)).toBe(true);
  });
  it.each(['uksoouth', 'future-region', 'usgovvirginia'])('warns rather than rejects unrecognized/cloud-specific region %s', (location) => {
    const config = applyPatch(defaultConfig(), { platform: 'azure', values: { az_location: location } });
    const issues = validateConfig(config).filter((issue) => issue.fieldId === 'az_location');
    expect(issues).toEqual([expect.objectContaining({ level: 'warn', section: 'network' })]);
    expect(config.values.az_location).toBe(location);
  });
  it('does not warn for a missing location or retained Azure values on another platform', () => {
    for (const config of [applyPatch(defaultConfig(), { platform: 'azure' }), applyPatch(defaultConfig(), { values: { az_location: 'uksoouth' } })]) {
      expect(validateConfig(config).some((issue) => issue.fieldId === 'az_location' && issue.level === 'warn')).toBe(false);
    }
  });
  it.each(['291bba3f-e0a5-47bc-a099-3bdcb2a50a05', ' ABCDEF12-ABCD-ABCD-ABCD-ABCDEF123456 ', '12345678-1234-1234-1234-123456788901'])('accepts GUID syntax without requiring a UUID version: %s', (id) => {
    expect(checkRule('guid', id)).toBeNull();
  });
  it.each(['291bba3fe0a547bca0993bdcb2a50a05', '{291bba3f-e0a5-47bc-a099-3bdcb2a50a05}', '291bba3f-e0a5-47bc-a099-3bdcb2a50a0Z', '/subscriptions/291bba3f-e0a5-47bc-a099-3bdcb2a50a05'])('rejects malformed subscription syntax: %s', (id) => {
    expect(checkRule('guid', id)).not.toBeNull();
    expect(validateConfig(applyPatch(defaultConfig(), { platform: 'azure', values: { az_subscriptionID: id } }))).toContainEqual(expect.objectContaining({ fieldId: 'az_subscriptionID', level: 'error' }));
  });
  it('preserves malformed imports and original spelling through INI round trips', () => {
    const imported = importIni('[Azure]\nlocation=uksoouth\nsubscriptionID=not-a-guid\n', applyPatch(defaultConfig(), { platform: 'azure' }));
    const config = imported.config;
    expect(config.values.az_location).toBe('uksoouth');
    expect(config.values.az_subscriptionID).toBe('not-a-guid');
    expect(validateConfig(config)).toContainEqual(expect.objectContaining({ fieldId: 'az_subscriptionID', level: 'error' }));
    const ini = generateIni(config);
    expect(ini).toContain('location=uksoouth');
    expect(ini).toContain('subscriptionID=not-a-guid');
  });
});
