import { describe, expect, it } from 'vitest';
import { hiddenSettings } from './conditional-settings';
import { defaultConfig, fieldAvailable, groupAvailable } from './model';
import { GROUPS } from './schema';
import { generateIni } from './generate';
import { importIni } from './importer';

const fields = GROUPS.flatMap((group) => group.fields);
const hiddenIds = (config: ReturnType<typeof defaultConfig>) => GROUPS
  .filter((group) => groupAvailable(group, config.version, config.platform))
  .flatMap((group) => hiddenSettings(group.fields, config).flatMap((entry) => entry.fields.map((field) => field.id)));

describe('conditional settings explanations', () => {
  it('follows existing SSH and key-access prerequisites without changing stored values', () => {
    const config = defaultConfig();
    config.values.sshPublicKeys = 'C:\\keys\\admin.pub';
    expect(hiddenIds(config)).toContain('sshPublicKeys');
    config.values.sshEnabled = true;
    config.values.sshKeyAccessEnabled = false;
    expect(hiddenIds(config)).not.toContain('sshPort');
    expect(hiddenIds(config)).toContain('sshPublicKeys');
    config.values.sshKeyAccessEnabled = true;
    expect(hiddenIds(config)).not.toContain('sshPublicKeys');
    expect(config.values.sshPublicKeys).toBe('C:\\keys\\admin.pub');
    expect(fieldAvailable(fields.find((field) => field.id === 'sshLoginBannerText')!, config.version, config.platform, config.values)).toBe(true);
  });

  it.each([
    ['blastEnabled', 'blastExternalUrl', 'https://vdi.example.test:8443'],
    ['pcoipEnabled', 'pcoipExternalUrl', '192.0.2.21:4172'],
    ['tunnelEnabled', 'tunnelExternalUrl', 'https://vdi.example.test:443']
  ])('explains %s and preserves configured output across toggles', (toggle, id, value) => {
    const config = defaultConfig();
    config.values.horizon_enabled = true;
    config.values[id] = value;
    expect(hiddenIds(config)).toContain(id);
    config.values[toggle] = true;
    expect(hiddenIds(config)).not.toContain(id);
    const ini = generateIni(config);
    expect(ini).toContain(`${id}=${value}`);
    expect(importIni(ini).config.values[id]).toBe(value);
    config.values[toggle] = false;
    expect(hiddenIds(config)).toContain(id);
    expect(generateIni(config)).not.toContain(`${id}=${value}`);
    expect(config.values[id]).toBe(value);
    config.values[toggle] = true;
    expect(generateIni(config)).toContain(`${id}=${value}`);
  });

  it('explains static IPv4 prerequisites on QCOW2 platforms without clearing addresses', () => {
    const config = defaultConfig();
    config.platform = 'nutanix';
    config.values.deploymentOption = 'twonic';
    config.values.ipMode0 = 'DHCPV4';
    config.values.ipMode1 = 'DHCPV4';
    config.values.ip0 = '192.0.2.21';
    config.values.ip1 = '10.20.10.21';
    expect(hiddenIds(config)).toContain('ip0');
    expect(hiddenIds(config)).toContain('ip1');
    config.values.ipMode0 = 'STATICV4';
    config.values.ipMode1 = 'STATICV4';
    expect(hiddenIds(config)).not.toContain('ip0');
    expect(hiddenIds(config)).not.toContain('ip1');
    expect(config.values.ip0).toBe('192.0.2.21');
    expect(config.values.ip1).toBe('10.20.10.21');
  });

  it('explains only platform/version-eligible hidden fields', () => {
    const config = defaultConfig();
    config.values.deploymentOption = 'onenic';
    expect(hiddenIds(config)).toContain('netManagementNetwork');
    expect(hiddenIds(config)).toContain('netBackendNetwork');
    config.values.deploymentOption = 'twonic';
    expect(hiddenIds(config)).not.toContain('netManagementNetwork');
    expect(hiddenIds(config)).toContain('netBackendNetwork');
    config.values.deploymentOption = 'threenic';
    expect(hiddenIds(config)).not.toContain('netBackendNetwork');
    config.platform = 'azure';
    expect(hiddenIds(config)).not.toContain('netBackendNetwork');
    config.version = '2312';
    expect(hiddenIds(config)).not.toContain('tunnelExternalUrl');
    expect(hiddenIds(config)).not.toContain('pcoipDisableLegacyCertificate');
  });
});
