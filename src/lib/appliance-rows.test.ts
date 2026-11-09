import { describe, expect, it } from 'vitest';
import { parseListValue, serializeListValue } from './listValue';
import { applyPatch, defaultConfig, fieldAvailable } from './model';
import { GROUPS } from './schema';
import { generateIni, generateJsonObject } from './generate';
import { importIni, importJson } from './importer';
import { validateConfig as validate } from './validate';

const key = 'ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQC7 admin@host';
const fields = GROUPS.find((group) => group.id === 'appliance')!.fields;

describe('row-backed appliance fields', () => {
  it('preserves key comments and paths with spaces when parsing and serializing rows', () => {
    const rows = [key, 'C:\\SSH keys\\backup.pub'];
    expect(parseListValue(` ${rows.join('\r\n')}\r\n`, 'newline')).toEqual(rows);
    expect(serializeListValue([...rows, ''], 'newline')).toBe(rows.join('\n'));
  });

  it('keeps SSH key rows conditional on SSH and key access', () => {
    const field = fields.find((candidate) => candidate.id === 'sshPublicKeys')!;
    expect(field.rows).toMatchObject({ separator: 'newline', namesField: 'sshPublicKeyNames' });
    for (const [sshEnabled, sshKeyAccessEnabled, visible] of [[false, true, false], [true, false, false], [true, true, true]]) {
      expect(fieldAvailable(field, '2609', 'vsphere', { sshEnabled, sshKeyAccessEnabled })).toBe(visible);
    }
  });

  it('round-trips numbered SSH paths through INI and imported key names through JSON', () => {
    const config = applyPatch(defaultConfig(), { values: { sshEnabled: true, sshKeyAccessEnabled: true, sshPublicKeys: `${key}\nC:\\SSH keys\\backup.pub`, sshPublicKeyNames: 'admin.pub\nbackup.pub' } });
    const ini = generateIni(config);
    expect(ini).toContain('sshPublicKey1=admin.pub');
    expect(ini).toContain('sshPublicKey2=C:\\SSH keys\\backup.pub');
    expect(importIni(ini).config.values.sshPublicKeys).toBe('admin.pub\nC:\\SSH keys\\backup.pub');
    const imported = importJson(JSON.stringify(generateJsonObject(config))).config;
    expect(imported.values.sshPublicKeys).toBe(key);
    expect(imported.values.sshPublicKeyNames).toBe('admin.pub');
    expect(generateJsonObject(imported)).toMatchObject({ systemSettings: { sshPublicKeys: [{ name: 'admin.pub', data: key }] } });
  });

  it('reports required and invalid key rows independently without validating disabled keys', () => {
    const base = applyPatch(defaultConfig(), { values: { sshEnabled: true, sshKeyAccessEnabled: true, sshPublicKeys: '' } });
    expect(validate(base)).toContainEqual(expect.objectContaining({ fieldId: 'sshPublicKeys', message: 'SSH public keys is required' }));
    const invalid = applyPatch(base, { values: { sshPublicKeys: `${key}\ninvalid-key` } });
    expect(validate(invalid)).toContainEqual(expect.objectContaining({ fieldId: 'sshPublicKeys', rowIndex: 1, level: 'error' }));
    expect(validate(applyPatch(invalid, { values: { sshEnabled: false } })).filter((issue) => issue.fieldId === 'sshPublicKeys')).toEqual([]);
  });

  it('round-trips comma-separated headers without adding new validation restrictions', () => {
    const config = applyPatch(defaultConfig(), { values: { headersToBeLogged: serializeListValue(['X-Forwarded-For', 'host', 'X-Custom-Header'], 'comma') } });
    const ini = generateIni(config);
    expect(ini).toContain('headersToBeLogged=X-Forwarded-For,host,X-Custom-Header');
    expect(importIni(ini).config.values.headersToBeLogged).toBe(config.values.headersToBeLogged);
    expect(importJson(JSON.stringify(generateJsonObject(config))).config.values.headersToBeLogged).toBe(config.values.headersToBeLogged);
    expect(validate(config).filter((issue) => issue.fieldId === 'headersToBeLogged')).toEqual([]);
  });
});
