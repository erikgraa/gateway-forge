import { describe, expect, it } from 'vitest';
import { GROUPS, LISTS, type Field } from './schema';
import { defaultConfig, newListItem, stripSecrets } from './model';
import { markGuidedTarget, normalizeConfig, normalizeField, ordinaryField, trailingWhitespace } from './ordinary-whitespace';
import { render } from './render';
import { importIni } from './importer';

const fields = GROUPS.flatMap(group => group.fields);
const field = (id: string) => fields.find(value => value.id === id)!;
describe('ordinary trailing whitespace review policy', () => {
  it.each(['name', 'uagName', 'source', 'ds', 'netInternet', 'proxyDestinationUrl'])('normalizes known %s snapshots without editing live inputs', id => {
    const config = defaultConfig();
    config.values[id] = ' leading and internal spaces \t\u00a0';
    const before = structuredClone(config);
    expect(normalizeConfig(config).values[id]).toBe(' leading and internal spaces');
    expect(config).toEqual(before);
  });
  it('normalizes WRP and administrative ordinary list fields only', () => {
    const config = defaultConfig();
    config.wrp = [newListItem('wrp')];
    config.wrp[0].instanceId = 'Public portal  ';
    config.wrp[0].proxyDestinationUrl = 'https://portal.example.test:8443/path  ';
    const result = normalizeConfig(config);
    expect(result.wrp[0].instanceId).toBe('Public portal');
    expect(result.wrp[0].proxyDestinationUrl).toBe('https://portal.example.test:8443/path');
    expect(config.wrp[0].instanceId).toBe('Public portal  ');
  });
  it('does not rewrite passwords, textarea, certificates, custom overrides or unknown fields', () => {
    const config = defaultConfig();
    const protectedFields = [...fields, ...LISTS.flatMap(list => list.fields)].filter(f => f.type === 'secret' || f.secret || f.certificateInput || f.type === 'textarea' && !f.rows);
    for (const f of protectedFields) expect(normalizeField(f, 'opaque \ncontent  ')).toBe('opaque \ncontent  ');
    config.values.unknownOpaque = 'unknown  ';
    config.values.radius_sharedSecret = 'password  ';
    expect(normalizeConfig(config).values.unknownOpaque).toBe('unknown  ');
    expect(normalizeConfig(config).values.radius_sharedSecret).toBe('password  ');
    expect(stripSecrets(normalizeConfig(config)).values.radius_sharedSecret).toBe('');
  });
  it('preserves untouched ordinary-looking and password-bearing locators', () => {
    const config = defaultConfig();
    for (const target of ['vi://operator@vc.example/Datacenter/host/Pool  ', 'vi://user:password @vc.example/Datacenter/host/Pool  ']) {
      config.values.target = target;
      expect(normalizeConfig(config).values.target).toBe(target);
      expect(render(config, 'ini', 'omit').text).toContain('target=' + target);
    }
  });
  it('normalizes guided parts only after an explicit guided edit, and protects subsequent raw edits', () => {
    const config = defaultConfig();
    config.values.target = 'vi://operator  @vc.example  /Datacenter/host/Pool  ';
    markGuidedTarget(config.values, true);
    expect(normalizeConfig(config).values.target).toBe('vi://operator@vc.example/Datacenter/host/Pool');
    expect(config.values.target).toContain('operator  ');
    markGuidedTarget(config.values, false);
    expect(normalizeConfig(config).values.target).toBe(config.values.target);
  });
  it('preserves raw multiline values even if a schema text input received them through import', () => {
    expect(normalizeField(field('name'), 'first \nsecond  ')).toBe('first \nsecond  ');
  });
  it('normalizes semantic row tails without changing leading spelling or separators', () => {
    const row: Field = { id: 'rows', key: 'rows', label: 'Rows', type: 'textarea', rows: { itemLabel: 'Host', rule: 'hostOrIp', separator: 'newline' } };
    expect(normalizeField(row, ' host.example  \r\nnext.example\t')).toBe(' host.example\r\nnext.example');
    expect(normalizeField({ ...row, rows: { ...row.rows!, rule: 'sshPublicKeys' } }, 'ssh-rsa opaque  ')).toBe('ssh-rsa opaque  ');
  });
  it('keeps all passwords excluded even when revealed as single-line text controls', () => {
    for (const f of [...fields, ...LISTS.flatMap(list => list.fields)].filter(f => f.secret || f.type === 'secret')) expect(ordinaryField(f)).toBe(false);
  });
  it('preserves imported locator/password tails and includes secrets verbatim only when requested', () => {
    const rawTarget = 'vi://operator:pass word@vc.example/Datacenter/host/Pool  ';
    const imported = importIni('[General]\ntarget=' + rawTarget + '\n[RADIUSAuth]\nsharedSecret= password  \n', defaultConfig()).config;
    expect(imported.values.target).toBe(rawTarget);
    expect(imported.values.radius_sharedSecret).toBe(' password  ');
    imported.values.radius_enabled = true;
    expect(render(imported, 'ini', 'include').text).toContain('sharedSecret= password  ');
  });
  it('trims only trailing unicode whitespace, never leading or internal spaces', () => {
    expect(trailingWhitespace('  VM folder / Nested name  \t')).toBe('  VM folder / Nested name');
  });
});
