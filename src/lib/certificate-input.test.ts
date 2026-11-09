import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import FieldInput from '../components/FieldInput.svelte';
import TrustedCertEditor from '../components/TrustedCertEditor.svelte';
import { certificateMode, selectCertificateMode } from './certificate-input';
import { generateIni, generateJsonObject } from './generate';
import { importIni } from './importer';
import { applyPatch, defaultConfig, fieldAvailable } from './model';
import { GROUPS } from './schema';
import { removeTrustedCertPath } from './trusted-certs';
import { validateConfig } from './validate';

const saml = GROUPS.find((g) => g.id === 'saml')!;
const thumbprints = `sha1:${Array(20).fill('3e').join(' ')},sha1:${Array(20).fill('ef').join(' ')}`;
const samlConfig = () => applyPatch(defaultConfig(), { values: {
  saml_enabled: true, saml_entityID: 'example-idp', saml_metadataXmlFile: 'C:\\certs\\idp.xml'
} });

describe('source-backed certificate input modes', () => {
  it('shows separate internet-facing and management PEM/PFX path examples', () => {
    const fields = GROUPS.flatMap((group) => group.fields);
    expect(fields.find((field) => field.id === 'cert_pemCerts')?.placeholder).toBe('C:\\certs\\internet-facing-chain.pem');
    expect(fields.find((field) => field.id === 'cert_pemPrivKey')?.placeholder).toBe('C:\\certs\\internet-facing-key.pem');
    expect(fields.find((field) => field.id === 'cert_pfxCerts')?.placeholder).toBe('C:\\certs\\internet-facing.pfx');
    expect(fields.find((field) => field.id === 'adminCert_pemCerts')?.placeholder).toBe('C:\\certs\\management-chain.pem');
    expect(fields.find((field) => field.id === 'adminCert_pemPrivKey')?.placeholder).toBe('C:\\certs\\management-key.pem');
    expect(fields.find((field) => field.id === 'adminCert_pfxCerts')?.placeholder).toBe('C:\\certs\\management.pfx');
  });

  it.each(['cert', 'adminCert'])('infers %s mode from imported paths and clears incompatible values on explicit selection', (prefix) => {
    const selector = GROUPS.flatMap((g) => g.fields).find((f) => f.id === `${prefix}_mode`)!;
    const input = selector.certificateInput!;
    const values = { [input.pemCert]: 'chain.pem', [input.pemKey]: 'key.pem', [input.alias!]: 'old-alias' };
    expect(certificateMode(values, selector.id, input)).toBe('PEM');
    selectCertificateMode(values, selector.id, input, 'PFX');
    expect(values[input.pemCert]).toBe('');
    expect(values[input.pemKey]).toBe('');
    values[input.pfx!] = 'cert.pfx';
    selectCertificateMode(values, selector.id, input, 'PEM');
    expect(values[input.pfx!]).toBe('');
    expect(values[input.alias!]).toBe('');
    selectCertificateMode(values, selector.id, input, 'NONE');
    expect(certificateMode(values, selector.id, input)).toBe('NONE');
  });

  it('validates PEM and PFX extension guardrails on TLS certificate inputs', () => {
    const pem = applyPatch(defaultConfig(), {
      values: {
        cert_mode: 'PEM',
        cert_pemCerts: 'C:\\certs\\internet.txt',
        cert_pemPrivKey: 'C:\\certs\\internet.pem'
      }
    });
    expect(validateConfig(pem)).toContainEqual(expect.objectContaining({
      fieldId: 'cert_pemCerts',
      message: expect.stringContaining('.pem, .crt, or .cer')
    }));

    const pfx = applyPatch(defaultConfig(), {
      values: {
        adminCert_mode: 'PFX',
        adminCert_pfxCerts: 'C:\\certs\\management.pem'
      }
    });
    expect(validateConfig(pfx)).toContainEqual(expect.objectContaining({
      fieldId: 'adminCert_pfxCerts',
      message: expect.stringContaining('.pfx or .p12')
    }));
  });

  it.each(['cert', 'adminCert'])('rejects mixed, incomplete and alias-only %s inputs', (prefix) => {
    for (const [values, fieldId] of [
      [{ [`${prefix}_pfxCerts`]: 'cert.pfx', [`${prefix}_pemCerts`]: 'cert.pem' }, `${prefix}_mode`],
      [{ [`${prefix}_pemCerts`]: 'cert.pem' }, `${prefix}_pemPrivKey`],
      [{ [`${prefix}_pemPrivKey`]: 'cert.key' }, `${prefix}_pemCerts`],
      [{ [`${prefix}_pfxCertAlias`]: 'alias' }, `${prefix}_mode`],
      [{ [`${prefix}_mode`]: 'PFX' }, `${prefix}_pfxCerts`]
    ] as const) {
      expect(validateConfig(applyPatch(defaultConfig(), { values }))).toContainEqual(
        expect.objectContaining({ level: 'error', fieldId })
      );
    }
  });

  it('preserves mixed imported values for visible validation instead of discarding them', () => {
    const result = importIni('[SSLCert]\npemCerts=cert.pem\npemPrivKey=cert.key\npfxCerts=cert.pfx');
    expect(result.config.values).toMatchObject({ cert_pemCerts: 'cert.pem', cert_pemPrivKey: 'cert.key', cert_pfxCerts: 'cert.pfx' });
    expect(validateConfig(result.config)).toContainEqual(expect.objectContaining({ fieldId: 'cert_mode', level: 'error' }));
  });

  it.each(['cert', 'adminCert', 'samlSigning', 'samlEncryption', 'samlIdp'])('requires separate %s PEM certificate and private-key files', (prefix) => {
    const selector = GROUPS.flatMap((group) => group.fields).find((field) => field.id === `${prefix}_mode`)!;
    const input = selector.certificateInput!;
    const c = samlConfig();
    c.values[selector.id] = 'PEM';
    c.values[input.pemCert] = 'C:\\Certs\\gateway.pem';
    c.values[input.pemKey] = 'c:/certs/gateway.pem';
    expect(validateConfig(c)).toContainEqual(expect.objectContaining({
      level: 'error',
      fieldId: input.pemKey,
      message: expect.stringContaining('separate files')
    }));
  });

  it('does not accept or serialize an invented PFX password key, even with secrets included', () => {
    const result = importIni('[SSLCert]\npfxCerts=cert.pfx\npfxPassword=example-not-a-real-password');
    expect(result.unmapped).toContainEqual(expect.objectContaining({ key: 'pfxPassword' }));
    expect(generateIni(result.config, { secrets: 'include' })).not.toContain('example-not-a-real-password');
    expect(JSON.stringify(generateJsonObject(result.config, { secrets: 'include' }))).not.toContain('example-not-a-real-password');
  });

  it('makes opposing paths unavailable and never serializes a mode control or PFX password', () => {
    const c = applyPatch(defaultConfig(), { values: { cert_mode: 'PFX', cert_pfxCerts: 'C:\\cert.pfx' } });
    const fields = GROUPS.find((g) => g.id === 'certs')!.fields;
    expect(fields.filter((f) => fieldAvailable(f, c.version, c.platform, c.values)).map((f) => f.id)).toEqual([
      'cert_mode', 'cert_pfxCerts', 'cert_pfxCertAlias'
    ]);
    const selector = fields.find((f) => f.certificateInput)!;
    expect(render(FieldInput, { props: { field: selector, values: c.values, platform: c.platform } }).body)
      .toContain('password-protected');
    expect(generateIni(c)).toContain('[SSLCert]\npfxCerts=C:\\cert.pfx');
    expect(generateIni(c)).not.toMatch(/cert_mode|password/i);
    expect(JSON.stringify(generateJsonObject(c))).not.toMatch(/cert\.pfx|pfxPassword|pfxCertPassword/i);
  });

  it.each(['samlSigning', 'samlEncryption', 'samlIdp'])('offers PEM only for %s and requires its full pair', (prefix) => {
    const selector = GROUPS.flatMap((g) => g.fields).find((f) => f.id === `${prefix}_mode`)!;
    const input = selector.certificateInput!;
    expect(selector.options?.map((o) => o.value)).toEqual(['NONE', 'PEM']);
    expect(input.pfx).toBeUndefined();
    const c = samlConfig();
    c.values[selector.id] = 'PEM';
    expect(validateConfig(c)).toContainEqual(expect.objectContaining({ fieldId: input.pemCert, level: 'error' }));
    expect(validateConfig(c)).toContainEqual(expect.objectContaining({ fieldId: input.pemKey, level: 'error' }));
    c.values[input.pemCert] = 'C:\\certs\\chain.pem';
    c.values[input.pemKey] = 'C:\\certs\\key.key';
    expect(validateConfig(c).filter((i) => i.fieldId?.startsWith(prefix))).toEqual([]);
    c.values[input.pemCert] = 'wrong.pfx';
    expect(validateConfig(c)).toContainEqual(expect.objectContaining({ fieldId: input.pemCert, level: 'error' }));
    c.values[selector.id] = 'PFX';
    expect(validateConfig(c)).toContainEqual(expect.objectContaining({ fieldId: selector.id, level: 'error' }));
  });

  it('round-trips the vendor signing/encryption keys and dedicated IdP PEM section', () => {
    const source = '[IDPExternalMetadata1]\nentityID=example-idp\nmetadataXmlFile=C:\\certs\\idp.xml\nsigningCertificateType=pem\nsigningPrivateKeyPem=C:\\certs\\sign.key\nsigningCertChainPem=C:\\certs\\sign.pem\nencryptionCertificateType=PEM\nprivateKeyPem=C:\\certs\\enc.key\ncertChainPem=C:\\certs\\enc.pem\n[SAMLIdentityProviderMetadata]\npemCerts=C:\\certs\\idp.pem\npemPrivKey=C:\\certs\\idp.key';
    const result = importIni(source);
    expect(result.unmapped).toEqual([]);
    const ini = generateIni(result.config);
    expect(ini).toContain('signingCertificateType=PEM\nsigningCertChainPem=C:\\certs\\sign.pem\nsigningPrivateKeyPem=C:\\certs\\sign.key');
    expect(ini).toContain('encryptionCertificateType=PEM\ncertChainPem=C:\\certs\\enc.pem\nprivateKeyPem=C:\\certs\\enc.key');
    expect(ini).toContain('[SAMLIdentityProviderMetadata]\npemCerts=C:\\certs\\idp.pem\npemPrivKey=C:\\certs\\idp.key');
    expect(validateConfig(result.config).filter((i) => i.fieldId?.startsWith('saml'))).toEqual([]);
    expect(JSON.stringify(generateJsonObject(result.config))).not.toMatch(/sign\.key|sign\.pem|enc\.key|enc\.pem|idp\.key|idp\.pem|CertificateType/);
  });
});

describe('external IdP trust rows and thumbprints', () => {
  it('renders exactly nine trust rows at capacity and exports contiguous keys after removal', () => {
    const c = samlConfig();
    const fields = saml.fields.filter((f) => f.trustedCertIndex !== undefined);
    expect(fields).toHaveLength(9);
    fields.forEach((f, i) => { c.values[f.id] = `C:\\certs\\ca${i + 1}.pem`; });
    const html = render(TrustedCertEditor, { props: { fields, values: c.values, issues: [], uid: 'saml-trust' } }).body;
    expect(html).toContain('9 of 9');
    expect(html).toMatch(/disabled[^>]*aria-label="Add trusted CA certificate path"/);
    removeTrustedCertPath(c.values, fields, 3);
    const ini = generateIni(c);
    expect(ini).toContain('trustedCert4=C:\\certs\\ca5.pem');
    expect(ini).toContain('trustedCert8=C:\\certs\\ca9.pem');
    expect(ini).not.toContain('trustedCert9=');
    expect(validateConfig(c).filter((i) => i.fieldId?.startsWith('saml'))).toEqual([]);
  });

  it('imports sparse CA rows, preserves SHA list syntax, and reports overflow instead of silently consuming it', () => {
    const result = importIni(`[IDPExternalMetadata1]\nentityID=example-idp\nmetadataXmlFile=idp.xml\nidpUrlThumbprints=${thumbprints}\ntrustedCert1=one.pem\ntrustedCert9=nine.pem\ntrustedCert10=overflow.pem`);
    const ini = generateIni(result.config);
    expect(ini).toContain(`idpUrlThumbprints=${thumbprints}`);
    expect(ini).toContain('trustedCert1=one.pem\ntrustedCert2=nine.pem');
    expect(result.unmapped).toContainEqual(expect.objectContaining({ key: 'trustedCert10', value: 'overflow.pem' }));
    expect(JSON.stringify(generateJsonObject(result.config))).not.toMatch(/one\.pem|nine\.pem|idpUrlThumbprints|trustedCert/);
  });

  it('accepts absent optional thumbprints with or without CA rows and rejects malformed lists', () => {
    const c = samlConfig();
    c.values.saml_trustedCert1 = 'ca.pem';
    expect(validateConfig(c).filter((i) => i.fieldId === 'saml_idpUrlThumbprints')).toEqual([]);
    c.values.saml_idpUrlThumbprints = thumbprints;
    expect(validateConfig(c).filter((i) => i.fieldId === 'saml_idpUrlThumbprints')).toEqual([]);
    c.values.saml_idpUrlThumbprints = `${thumbprints},not-a-thumbprint`;
    expect(validateConfig(c)).toContainEqual(expect.objectContaining({ fieldId: 'saml_idpUrlThumbprints', level: 'error' }));
    c.values.saml_idpUrlThumbprints = `${thumbprints},`;
    expect(validateConfig(c)).toContainEqual(expect.objectContaining({ fieldId: 'saml_idpUrlThumbprints', level: 'error' }));
  });
});
