import { describe, expect, it } from 'vitest';
import { applyPatch, defaultConfig, newListItem, stripSecrets } from './model';
import { collectBlocks, generateIni, generateJsonObject } from './generate';
import { importIni, importJson } from './importer';
import { GROUPS, LISTS } from './schema';
import { validateConfig as validate } from './validate';

const segValues = {
  seg_enabled: true,
  seg_memConfigurationId: 'a1b2c3d4-1111-2222-3333-444455556666',
  seg_apiServerUrl: 'https://uem.example.com',
  seg_apiServerUsername: 'seg-api-user',
  seg_organizationGroupCode: 'CORP',
  seg_airwatchServerHostname: 'mail.example.com',
  seg_disableAutoConfigUpdate: true,
  seg_reinitializeGatewayProcess: true,
  seg_airwatchOutboundProxy: true,
  seg_outboundProxyHost: 'proxy.example.com',
  seg_outboundProxyPort: 8080,
  seg_outboundProxyUsername: 'proxy-user',
  seg_ntlmAuthentication: true,
  seg_hostEntry1: '192.0.2.10 mail.example.com',
  seg_trustedCert2: 'C:\\certs\\seg-ca.pem',
  seg_pfxCerts: 'C:\\certs\\seg.p12',
  seg_pfxCertAlias: 'seg-key'
};
const consumer = { ...newListItem('jwt'), name: 'Consumer 1', issuer: 'CaseSensitiveIssuer', url: 'https://keys.example.com/jwks', publicKeyRefreshInterval: 0, urlThumbprints: 'sha256=' + 'ab'.repeat(32), trustedCert2: 'C:\\certs\\jwt-ca.pem', publicKey1: 'C:\\keys\\consumer.pem' };
const producer = { ...newListItem('jwtIssuers'), name: 'Producer 1', issuer: 'ProducerIssuer', signingMode: 'PEM', pemPrivKey: 'C:\\keys\\producer.key', pemCerts: 'C:\\certs\\producer.pem', pfxCerts: 'C:\\certs\\producer.pfx', encryptionPublicKey: 'C:\\keys\\encryption.pem' };
const populated = () => applyPatch(defaultConfig(), { values: segValues, jwt: [consumer], jwtIssuers: [producer] });
const material = '-----BEGIN RSA PRIVATE KEY-----\\nsynthetic-private-material\\n-----END RSA PRIVATE KEY-----';
const jwtBlocks = (config: ReturnType<typeof defaultConfig>) => collectBlocks(config).filter((b) => b.target === 'jwt' || b.target === 'jwtIssuers');

describe('synthetic standalone SEG and independent JWT regression coverage', () => {
  it('maps all SEG INI keys and compacts only trusted CA slots', () => {
    const config = populated();
    const text = generateIni(config);
    expect(text).toContain('[AirwatchSecureEmailGateway]');
    const fields = GROUPS.find((g) => g.id === 'seg')!.fields;
    const back = importIni(text);
    expect(back.unmapped).toEqual([]);
    expect(back.config.values.seg_enabled).toBe(true);
    for (const field of fields.filter((f) => f.trustedCertIndex === undefined)) expect(back.config.values[field.id]).toEqual(config.values[field.id]);
    expect(back.config.values.seg_trustedCert1).toBe(segValues.seg_trustedCert2);
    expect(generateIni(back.config)).toBe(text);
  });

  it.each([undefined, populated()])('imports JWT profiles independently over fresh/populated bases (%#)', (base) => {
    const config = populated();
    config.jwt.push({ ...newListItem('jwt'), name: 'Static consumer', publicKey1: 'keys\\static.pem' });
    config.jwtIssuers.push({ ...newListItem('jwtIssuers'), name: 'PFX producer', signingMode: 'PFX', pfxCerts: 'certs\\signer.pfx', url: 'https://keys.example.com/encryption', publicKeyRefreshInterval: 3600 });
    const result = importIni(generateIni(config), base);
    expect(result.unmapped).toEqual([]);
    expect(result.config.jwt).toHaveLength(2);
    expect(result.config.jwtIssuers).toHaveLength(2);
    expect(jwtBlocks(result.config)).toEqual(jwtBlocks(config));
    expect(result.config.jwtIssuers[1].signingMode).toBe('PFX');
    expect(result.config.jwtIssuers[1].pfxCerts).toBe('certs\\signer.pfx');
  });

  it('sorts numbered profiles and accepts 99 without crossing consumer/producer namespaces', () => {
    const result = importIni('[JWTSettings99]\nname=last\nurl=https://last.example.com\n[JWTSettings2]\nname=first\nurl=https://first.example.com\n[JWTIssuerSettings99]\nname=issuer\npfxCerts=C:\\certs\\issuer.pfx');
    expect(result.config.jwt.map((item) => item.name)).toEqual(['first', 'last']);
    expect(result.config.jwtIssuers[0].name).toBe('issuer');
    expect(LISTS.find((l) => l.id === 'jwt')!.max).toBe(99);
    expect(LISTS.find((l) => l.id === 'jwtIssuers')!.max).toBe(99);
  });

  it('round-trips 99 profiles per type without dropping or mixing the final profile', () => {
    const config = applyPatch(defaultConfig(), {
      jwt: Array.from({ length: 99 }, (_, i) => ({ ...consumer, name: `consumer ${i + 1}` })),
      jwtIssuers: Array.from({ length: 99 }, (_, i) => ({ ...producer, name: `producer ${i + 1}` }))
    });
    const ini = generateIni(config);
    expect(ini).toContain('[JWTSettings99]');
    expect(ini).toContain('[JWTIssuerSettings99]');
    const back = importIni(ini).config;
    expect(back.jwt).toHaveLength(99);
    expect(back.jwtIssuers).toHaveLength(99);
    expect(generateIni(back)).toBe(ini);
    const json = generateJsonObject(config);
    expect(generateJsonObject(importJson(JSON.stringify(json)).config)).toEqual(json);
  });

  it('retains hidden signing/URL references in patches and stripped drafts without emitting incompatible choices', () => {
    const config = populated();
    const pfx = applyPatch(config, { jwtIssuers: [{ ...config.jwtIssuers[0], signingMode: 'PFX' }] });
    const draft = stripSecrets(pfx);
    expect(draft.jwtIssuers[0]).toEqual(pfx.jwtIssuers[0]);
    expect(generateIni(pfx)).toContain('pfxCerts=C:\\certs\\producer.pfx');
    expect(generateIni(pfx)).not.toContain('pemPrivKey=C:\\keys\\producer.key');
    const pem = applyPatch(draft, { jwtIssuers: [{ ...draft.jwtIssuers[0], signingMode: 'PEM' }] });
    expect(generateIni(pem)).toContain('pemPrivKey=C:\\keys\\producer.key');
    expect(pem.jwtIssuers[0].pfxCerts).toBe(producer.pfxCerts);
    const noUrl = applyPatch(config, { jwt: [{ ...config.jwt[0], url: '' }] });
    expect(stripSecrets(noUrl).jwt[0].trustedCert1).toBe(consumer.trustedCert2);
    expect(noUrl.jwt[0].urlThumbprints).toBe(consumer.urlThumbprints);
  });

  it.each([['pemCerts=C:\\certs\\issuer.pem\npfxCerts=C:\\certs\\issuer.pfx'], ['pfxCerts=C:\\certs\\issuer.pfx\npemCerts=C:\\certs\\issuer.pem']])('uses source-backed PEM precedence for ambiguous imported signing references (%#)', (keys) => {
    const result = importIni('[JWTIssuerSettings1]\nname=issuer\npemPrivKey=C:\\keys\\issuer.key\n' + keys);
    expect(result.config.jwtIssuers[0].signingMode).toBe('PEM');
    expect(result.config.jwtIssuers[0].pfxCerts).toBe('C:\\certs\\issuer.pfx');
    expect(result.warnings.join(' ')).toMatch(/prefers PEM/);
  });

  it.each([true, false])('round-trips supported SEG boolean and JSON shapes (%s)', (flag) => {
    const config = applyPatch(defaultConfig(), { values: { ...segValues, seg_disableAutoConfigUpdate: flag, seg_reinitializeGatewayProcess: flag, seg_airwatchOutboundProxy: flag, seg_ntlmAuthentication: flag } });
    const doc = generateJsonObject(config);
    const edge = (doc.edgeServiceSettingsList as any).edgeServiceSettingsList[0];
    expect(edge.identifier).toBe('SEG');
    expect(edge.outboundProxyPort).toBe('8080');
    expect(edge.disableAutoConfigUpdate).toBe(flag);
    expect(edge.hostEntries).toEqual([segValues.seg_hostEntry1]);
    expect(edge).not.toHaveProperty('pfxCerts');
    expect(edge).not.toHaveProperty('trustedCertificates');
    const result = importJson(JSON.stringify(doc), populated());
    expect(result.unmapped).toEqual([]);
    expect(generateJsonObject(result.config)).toEqual(doc);
    expect(result.config.values.seg_pfxCerts).toBe('');
    expect(result.warnings.join(' ')).toMatch(/provenance/);
    for (const id of ['seg_disableAutoConfigUpdate', 'seg_reinitializeGatewayProcess', 'seg_airwatchOutboundProxy', 'seg_ntlmAuthentication']) expect(result.config.values[id]).toBe(flag);
  });

  it('round-trips supported JSON URL mappings without inventing signing or public-key contents', () => {
    const config = populated();
    config.jwtIssuers[0].url = 'https://keys.example.com/encryption';
    config.jwtIssuers[0].publicKeyRefreshInterval = 86400;
    const doc = generateJsonObject(config);
    expect(doc.jwtSettingsList).toEqual({ jwtSettingsList: [{ name: consumer.name, issuer: consumer.issuer, publicKeyURLSettings: { url: consumer.url, urlThumbprints: consumer.urlThumbprints, urlResponseRefreshInterval: 0 } }] });
    expect(doc.jwtIssuerSettingsList).toEqual({ jwtIssuerSettingsList: [{ name: producer.name, issuer: producer.issuer, encryptionPublicKeyURLSettings: { url: config.jwtIssuers[0].url, urlResponseRefreshInterval: 86400 } }] });
    expect(JSON.stringify(doc)).not.toMatch(/C:\\\\|jwtSigning|publicKeys|pfxKeystore|privateKeyPem/);
    for (const base of [undefined, populated()]) {
      const result = importJson(JSON.stringify(doc), base);
      expect(generateJsonObject(result.config)).toEqual(doc);
      expect(result.config.jwtIssuers[0].pemPrivKey).toBe('');
      expect(result.config.jwtIssuers[0].pfxCerts).toBe('');
      expect(result.config.jwt[0].publicKey1).toBe('');
    }
  });

  it('replaces prior SEG/JWT selections when importing unrelated settings', () => {
    for (const result of [importIni('[General]\nname=other', populated()), importJson('{"systemSettings":{"uagName":"other"}}', populated())]) {
      expect(result.config.values.seg_enabled).toBe(false);
      expect(result.config.jwt).toEqual([]);
      expect(result.config.jwtIssuers).toEqual([]);
    }
  });

  it('keeps shared SEG visibly unsupported rather than enabling standalone', () => {
    const result = importIni('[Airwatch]\nsecureEmailGatewayEnabled=true\nmemConfigurationId=shared-mem', populated());
    expect(result.config.values.seg_enabled).toBe(false);
    expect(result.unmapped.map((e) => e.key)).toEqual(['secureEmailGatewayEnabled', 'memConfigurationId']);
    expect(result.warnings.join(' ')).toMatch(/not converted to standalone/);
    expect(generateIni(result.config)).not.toContain('[AirwatchSecureEmailGateway]');
  });

  it('keeps invalid boolean inputs visible instead of coercing them into a valid SEG configuration', () => {
    const ini = importIni('[AirwatchSecureEmailGateway]\ndisableAutoConfigUpdate=maybe\nntlmAuthentication=1');
    expect(ini.config.values.seg_disableAutoConfigUpdate).toBe('maybe');
    expect(validate(ini.config).filter((n) => n.section === 'seg').map((n) => n.fieldId)).toEqual(expect.arrayContaining(['seg_disableAutoConfigUpdate', 'seg_ntlmAuthentication']));
    const json = importJson(JSON.stringify({ edgeServiceSettingsList: { edgeServiceSettingsList: [{ identifier: 'SEG', enabled: 'false' }] } }));
    expect(json.config.values.seg_enabled).toBe(false);
    expect(json.unmapped).toContainEqual({ where: 'edgeService SEG', key: 'enabled' });
  });

  it('shows unsupported profile indices and malformed sections without promoting them to supported profiles', () => {
    const result = importIni('[JWTSettings0]\nname=zero\n[JWTSettings100]\nname=overflow\n[JWTIssuerSettingsbad]\nunknown=synthetic-secret');
    expect(result.config.jwt).toEqual([]);
    expect(result.config.jwtIssuers).toEqual([]);
    expect(result.unmapped).toHaveLength(3);
    expect(JSON.stringify(result)).not.toContain('synthetic-secret');
  });

  it('reports malformed SEG scalar JSON values without treating arrays as booleans or identifiers', () => {
    const result = importJson(JSON.stringify({ edgeServiceSettingsList: { edgeServiceSettingsList: [{ identifier: 'SEG', enabled: true, memConfigurationId: ['synthetic-private-value'], ntlmAuthentication: [true], outboundProxyPort: { credential: 'synthetic-secret' } }] } }));
    expect(result.unmapped.map((e) => e.key)).toEqual(expect.arrayContaining(['memConfigurationId', 'ntlmAuthentication', 'outboundProxyPort']));
    expect(result.config.values.seg_ntlmAuthentication).toBe(false);
    expect(result.config.values.seg_memConfigurationId).toBe('');
    expect(JSON.stringify(result)).not.toMatch(/synthetic-/);
  });

  it('shows malformed JWT wrappers, URL values and unknown keys without retaining material', () => {
    const result = importJson(JSON.stringify({ jwtSettingsList: { jwtSettingsList: [null, { name: 'consumer', publicKeyURLSettings: { url: { token: 'synthetic-token' }, urlThumbprints: [], urlResponseRefreshInterval: true, unknown: 'synthetic-unknown' }, publicKeys: [{ pem: material }] }] }, jwtIssuerSettingsList: [] }));
    expect(result.unmapped.map((e) => e.key)).toEqual(expect.arrayContaining(['url', 'urlThumbprints', 'urlResponseRefreshInterval', 'unknown', 'publicKeys', 'jwtIssuerSettingsList']));
    expect(result.config.jwt[0].url).toBe('');
    expect(JSON.stringify(result)).not.toMatch(/synthetic-token|synthetic-unknown|synthetic-private-material/);
  });

  it('does not import or expose INI runtime credentials, raw material or unrecognized values', () => {
    const result = importIni(`[AirwatchSecureEmailGateway]\napiServerPassword=synthetic-api-password\npfxCerts=synthetic-base64-private-pfx\ntrustedCert1=${material}\naccessToken=synthetic-token\nunknown=synthetic-unknown\n[JWTIssuerSettings1]\nname=issuer\npemPrivKey=synthetic-base64-private-key\nprivateKeyPem=${material}\npassword=synthetic-password\nunknown=synthetic-unknown\n[JWTSettings1]\nname=consumer\nurl=https://keys.example.com?token=synthetic-url-token`);
    expect(result.unmapped.map((e) => e.key)).toEqual(expect.arrayContaining(['apiServerPassword', 'pfxCerts', 'trustedCert1', 'accessToken', 'unknown', 'pemPrivKey', 'privateKeyPem', 'password', 'url']));
    expect(JSON.stringify(result)).not.toMatch(/synthetic-(?:api-password|base64|private-material|token|unknown|password|url-token)/);
  });

  it('does not materialize imported JSON private signing keys, PFX stores, certificates or credentials', () => {
    const result = importJson(JSON.stringify({ edgeServiceSettingsList: { edgeServiceSettingsList: [{ identifier: 'SEG', apiServerPassword: 'synthetic-api-password', outboundProxyPassword: 'synthetic-proxy-password', pfxCertsPassword: 'synthetic-pfx-password', pfxCerts: 'synthetic-base64-pfx', trustedCertificates: [{ pem: material }], unknownSecret: 'synthetic-other', hostEntries: [material, null, '', '', '', '', material] }] }, jwtIssuerSettingsList: { jwtIssuerSettingsList: [{ name: 'issuer', jwtSigningPemCertSettings: { privateKeyPem: material }, jwtSigningPfxCertSettings: { pfxKeystore: 'synthetic-base64-pfx', password: 'synthetic-password' }, jsonWebKeySet: '{"d":"synthetic-private-jwk"}' }] } }));
    expect(JSON.stringify(result)).not.toMatch(/synthetic-/);
    expect(result.config.jwtIssuers[0].pemPrivKey).toBe('');
    expect(result.config.jwtIssuers[0].pfxCerts).toBe('');
    expect(result.config.values.seg_pfxCerts).toBe('');
    expect(result.unmapped.map((e) => e.key)).toEqual(expect.arrayContaining(['pfxCerts', 'trustedCertificates', 'jwtSigningPemCertSettings', 'jwtSigningPfxCertSettings', 'jsonWebKeySet']));
  });

  it('strips injected credentials and raw material while preserving valid deployment file references', () => {
    const config = populated();
    Object.assign(config.values, { seg_apiServerPassword: 'synthetic-secret', UAG_SEG_API_PASSWORD: 'synthetic-secret', awSEGAPIServerPwd: 'synthetic-secret', seg_unknown: 'synthetic-secret', seg_pfxCerts: 'synthetic-private-pfx', seg_hostEntry2: material });
    Object.assign(config.jwt[0], { accessToken: 'synthetic-secret', publicKey2: material, url: 'https://user:synthetic-secret@keys.example.com/jwks' });
    Object.assign(config.jwtIssuers[0], { pemPrivKey: 'synthetic-private-signing-key', password: 'synthetic-secret', jwtSigningPemCertSettings: { privateKeyPem: material }, pemCerts: material });
    const draft = JSON.parse(JSON.stringify(stripSecrets(config)));
    expect(JSON.stringify(draft)).not.toMatch(/synthetic-|BEGIN/);
    expect(draft.jwtIssuers[0].pfxCerts).toBe(producer.pfxCerts);
    expect(draft.jwt[0].publicKey1).toBe(consumer.publicKey1);
    expect(draft.values.seg_apiServerUsername).toBe(segValues.seg_apiServerUsername);
    expect(config.jwtIssuers[0].pemPrivKey).toBe('synthetic-private-signing-key');
    expect(stripSecrets(stripSecrets(config))).toEqual(stripSecrets(config));
  });

  it('reports malformed SEG/JWT INI lines and strips SEG runtime values even outside its service section', () => {
    const result = importIni('[AirwatchSecureEmailGateway]\nsynthetic-broken-secret\n=synthetic-broken-secret\n[JWTSettings1]\nname=consumer\nsynthetic-broken-secret\n[Runtime]\nawSEGAPIServerPwd=synthetic-runtime-secret\nUAG_SEG_API_PASSWORD=synthetic-runtime-secret\n[Airwatch]\nsecureEmailGatewayEnabled=true\noutboundProxyPassword=synthetic-shared-secret');
    expect(result.unmapped.filter((e) => e.key.startsWith('malformed line'))).toHaveLength(3);
    expect(JSON.stringify(result)).not.toMatch(/synthetic-/);
  });

  it('never copies JSON parser input excerpts into diagnostics', () => {
    expect(importJson('{"password":"synthetic-secret", invalid').warnings.join(' ')).not.toContain('synthetic-secret');
  });

  it('validates independent names, refresh interval, producer encryption conflict and max99', () => {
    const config = populated();
    config.jwt[0].publicKeyRefreshInterval = 1;
    config.jwtIssuers[0].url = 'https://keys.example.com/encryption';
    config.jwt.push({ ...consumer });
    config.jwtIssuers[0].name = consumer.name;
    const notices = validate(config);
    expect(notices.some((n) => n.fieldId === 'publicKeyRefreshInterval' && n.level === 'error')).toBe(true);
    expect(notices.some((n) => n.fieldId === 'encryptionPublicKey' && n.level === 'error')).toBe(true);
    expect(notices.filter((n) => /profile names must be unique/.test(n.message)).every((n) => n.list?.id === 'jwt')).toBe(true);
    config.jwt = Array.from({ length: 100 }, (_, i) => ({ ...consumer, name: `consumer ${i}` }));
    expect(validate(config).some((n) => /maximum of 99 profiles/.test(n.message))).toBe(true);
  });
});
