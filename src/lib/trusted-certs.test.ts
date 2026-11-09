import { describe, expect, it } from 'vitest';
import { GROUPS, LISTS } from './schema';
import { defaultConfig } from './model';
import { addTrustedCertPath, trustedCertPaths } from './trusted-certs';
import { generateIni } from './generate';
import { importIni } from './importer';
import { validateConfig } from './validate';

const horizonFields = GROUPS.find((group) => group.id === 'horizon')!.fields;
const wrpFields = LISTS.find((list) => list.id === 'wrp')!.fields;

describe('trusted CA path families', () => {
  it('defines trustedCert1 through trustedCert9 for every verified target', () => {
    const targets = ['horizon', 'airwatch', 'wrp', 'outboundproxy', 'cascade'];
    for (const target of targets) {
      const fields = target === 'wrp'
        ? wrpFields
        : GROUPS.find((group) => group.id === target)!.fields;
      expect(fields.filter((field) => field.trustedCertIndex).map((field) => field.key))
        .toEqual(Array.from({ length: 9 }, (_, index) => `trustedCert${index + 1}`));
    }
  });

  it('generates ordered, non-empty Horizon and WRP keys', () => {
    const c = defaultConfig();
    c.values.horizon_enabled = true;
    c.values.trustedCert1 = 'C:\\certs\\root.pem';
    c.values.trustedCert9 = 'C:\\certs\\nine.pem';
    c.wrp.push({
      instanceId: 'app',
      proxyDestinationUrl: 'https://app.example.com',
      proxyPattern: '/(.*)',
      trustedCert1: '/certs/one.pem',
      trustedCert4: '/certs/four.pem'
    });

    const ini = generateIni(c);
    expect(ini).toContain('trustedCert1=C:\\certs\\root.pem\ntrustedCert2=C:\\certs\\nine.pem');
    expect(ini).not.toContain('trustedCert3=');
    expect(ini).toContain('trustedCert1=/certs/one.pem\ntrustedCert2=/certs/four.pem');
  });

  it('keeps Tunnel host entries before PAC paths and renders nine trust rows', () => {
    const fields = GROUPS.find((group) => group.id === 'airwatch')!.fields;
    const firstHost = fields.findIndex((field) => field.hostEntryIndex === 1);
    const lastHost = fields.findIndex((field) => field.hostEntryIndex === 6);
    const pacPath = fields.findIndex((field) => field.id === 'airwatch_pacFilePath');
    expect(firstHost).toBeGreaterThan(-1);
    expect(lastHost).toBeGreaterThan(firstHost);
    expect(pacPath).toBeGreaterThan(lastHost);
    expect(fields.filter((field) => field.trustedCertIndex).map((field) => field.key))
      .toEqual(Array.from({ length: 9 }, (_, index) => `trustedCert${index + 1}`));
  });

  it('imports sparse INI paths in documented order without empty slots', () => {
    const result = importIni([
      '[Horizon]',
      'proxyDestinationUrl=https://cs.example.com',
      'trustedCert2=C:\\certs\\two.pem',
      'trustedCert9=C:\\certs\\nine.pem',
      '',
      '[WebReverseProxy1]',
      'instanceId=app',
      'proxyDestinationUrl=https://app.example.com',
      'proxyPattern=/(.*)',
      'trustedCert3=/certs/three.pem',
      'trustedCert8=/certs/eight.pem'
    ].join('\n'));

    expect(trustedCertPaths(result.config.values, horizonFields)).toEqual(['C:\\certs\\two.pem', 'C:\\certs\\nine.pem']);
    expect(trustedCertPaths(result.config.wrp[0], wrpFields)).toEqual(['/certs/three.pem', '/certs/eight.pem']);
    expect(generateIni(result.config)).toContain('trustedCert1=C:\\certs\\two.pem\ntrustedCert2=C:\\certs\\nine.pem');
    expect(generateIni(result.config)).toContain('trustedCert1=/certs/three.pem\ntrustedCert2=/certs/eight.pem');
  });

  it('imports and generates cascade trustedCert paths through WebReverseProxy1', () => {
    const result = importIni([
      '[WebReverseProxy1]',
      'instanceId=HORIZON-WRP',
      'proxyDestinationUrl=https://inner.example.com',
      'trustedCert1=C:\\certs\\root.pem',
      'trustedCert9=C:\\certs\\issuer.pem',
      'proxyPattern=/(.*)'
    ].join('\n'));
    const ini = generateIni(result.config);

    expect(result.config.values.cascade_role).toBe('outer');
    expect(result.config.values.cascade_innerTrustedCert).toBe('C:\\certs\\root.pem');
    expect(result.config.values.cascade_innerTrustedCert2).toBe('C:\\certs\\issuer.pem');
    expect(ini).toContain('trustedCert1=C:\\certs\\root.pem');
    expect(ini).toContain('trustedCert2=C:\\certs\\issuer.pem');
  });

  it('supports outbound proxy paths without mapping deploy-time values to JSON', () => {
    const c = defaultConfig();
    c.values.obp_enabled = true;
    c.values.obp_trustedCert1 = '/certs/one.pem';
    c.values.obp_trustedCert2 = '/certs/two.pem';
    const ini = generateIni(c);

    expect(ini).toContain('[OutboundProxySettings1]');
    expect(ini).toContain('trustedCert1=/certs/one.pem\ntrustedCert2=/certs/two.pem');
  });

  it('validates every PEM path and caps the reusable editor model at nine', () => {
    const c = defaultConfig();
    c.values.horizon_enabled = true;
    c.values.trustedCert1 = 'relative-root.pem';
    c.values.trustedCert2 = 'C:\\certs\\root.txt';
    const messages = validateConfig(c).map((issue) => `${issue.fieldId}:${issue.message}`).join('\n');
    expect(messages).toContain('trustedCert1:Trusted CA certificate (PEM path): Must be an absolute local path');
    expect(messages).toContain('trustedCert2:Additional trusted CA certificate (PEM path): Must point to a .pem, .crt, or .cer file');

    const values = defaultConfig().values;
    for (let index = 1; index <= 9; index++) values[`trustedCert${index}`] = `/certs/${index}.pem`;
    expect(addTrustedCertPath(values, horizonFields)).toBe(9);
    expect(trustedCertPaths(values, horizonFields)).toHaveLength(9);
  });

  it('rejects duplicate trusted CA paths within Horizon, Content Gateway and each WRP instance', () => {
    const c = defaultConfig();
    c.values.horizon_enabled = true;
    c.values.trustedCert1 = 'C:\\Certs\\Corp-Root.pem';
    c.values.trustedCert2 = 'c:/certs/corp-root.pem';
    c.values.contentGateway_enabled = true;
    c.values.contentGateway_trustedCert1 = '/certs/workspace-one-root.pem';
    c.values.contentGateway_trustedCert2 = '/certs//workspace-one-root.pem';
    c.values.airwatch_enabled = true;
    c.values.airwatch_trustedCert1 = 'C:\\certs\\tunnel-root.pem';
    c.values.airwatch_trustedCert2 = 'c:/certs/tunnel-root.pem';
    c.wrp = [
      { instanceId: 'one', proxyDestinationUrl: 'https://one.local', trustedCert1: '/certs/web.pem', trustedCert2: '/certs/web.pem' },
      { instanceId: 'two', proxyDestinationUrl: 'https://two.local', trustedCert1: '/certs/web.pem' }
    ];

    const duplicates = validateConfig(c).filter((issue) => issue.message.includes('duplicate trusted CA path'));
    expect(duplicates).toEqual(expect.arrayContaining([
      expect.objectContaining({ section: 'horizon', fieldId: 'trustedCert2' }),
      expect.objectContaining({ section: 'contentGateway', fieldId: 'contentGateway_trustedCert2' }),
      expect.objectContaining({ section: 'tunnel', fieldId: 'airwatch_trustedCert2' }),
      expect.objectContaining({ section: 'wrp', fieldId: 'trustedCert2', list: { id: 'wrp', index: 0 } })
    ]));
    expect(duplicates).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ list: { id: 'wrp', index: 1 } })
    ]));
  });
});
