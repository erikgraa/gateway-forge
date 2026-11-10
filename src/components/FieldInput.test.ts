import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import FieldInput from './FieldInput.svelte';
import { GROUPS, fieldHelp } from '../lib/schema';
import { applyPatch, defaultConfig } from '../lib/model';
import { generateIni } from '../lib/generate';
import { importIni } from '../lib/importer';
import { validateConfig } from '../lib/validate';

const datastore = GROUPS.find((group) => group.id === 'deploy')!.fields.find((field) => field.id === 'ds')!;
const platforms = ['hyperv', 'vsphere'] as const;
const source = GROUPS.find((group) => group.id === 'deploy')!.fields.find((field) => field.id === 'source')!;

describe('source image examples', () => {
  it.each(platforms)('shows the %s image extension without filling or rewriting the value', (platform) => {
    const values = { source: '' };
    const { body } = render(FieldInput, { props: { field: source, values, platform } });
    const extension = platform === 'hyperv' ? 'vhdx' : 'ova';
    expect(body).toContain(`placeholder="C:\\images\\euc-unified-access-gateway-26.09.0.0-[..].${extension}"`);
    expect(body).toContain('Replace [..] with the actual image filename build text.');
    expect(values.source).toBe('');
    expect(source.key).toBe('source');
  });
});

const vlanFields = GROUPS.flatMap((group) => group.fields).filter((field) => field.id.startsWith('hv_vlan'));
describe('Hyper-V VLAN fields', () => {
  it.each(vlanFields)('renders $id bounds and accessible project-only help', (field) => {
    const { body } = render(FieldInput, { props: { field, values: {}, platform: 'hyperv' } });
    expect(body).toContain('min="1" max="4094"');
    expect(body).toContain(`aria-describedby="f-${field.id}-help"`);
    expect(body).toContain('<code>Not exported</code>');
  });

  it('associates a VLAN error with its numeric input', () => {
    const field = vlanFields[0];
    const { body } = render(FieldInput, { props: { field, values: { hv_vlan0: 4095 }, platform: 'hyperv', error: 'NIC0 Internet access VLAN must be ≤ 4094' } });
    expect(body).toContain('aria-invalid="true"');
    expect(body).toContain('aria-describedby="f-hv_vlan0-error"');
    expect(body).toContain('id="f-hv_vlan0-error"');
  });
});

describe('deployment storage field', () => {
  it.each(platforms)('shows platform-specific %s terminology without changing the INI key', (platform) => {
    const values = { ds: '' };
    const { body } = render(FieldInput, { props: { field: datastore, values, platform } });
    const label = platform === 'hyperv' ? 'VM storage path' : 'Datastore';
    const placeholder = platform === 'hyperv' ? 'C:\\ClusterStorage\\Volume1\\uag-name' : 'datastore1';
    expect(body).toContain(label);
    expect(body).toContain(`placeholder="${placeholder}"`);
    expect(body).toContain(`aria-label="More information about ${label}"`);
    expect(body).toContain('<code>ds</code>');
    expect(datastore.key).toBe('ds');
    expect(values).toEqual({ ds: '' });
    if (platform === 'hyperv') {
      expect(body).toContain('Filesystem path on the Hyper-V deployment host');
      expect(body).toContain('not a vSphere datastore name');
    } else {
      expect(body).not.toContain('VM storage path');
      expect(fieldHelp(datastore, platform)).toBeUndefined();
    }
  });

  it.each(platforms)('uses the %s storage label in required-field feedback', (platform) => {
    const config = applyPatch(defaultConfig(), { platform, values: { ds: '' } });
    const label = platform === 'hyperv' ? 'VM storage path' : 'Datastore';
    expect(validateConfig(config).find((issue) => issue.fieldId === 'ds')?.message).toBe(`${label} is required`);
  });

  it.each(platforms.flatMap((platform) => [
    'C:\\ClusterVol\\UAG-name',
    'C:\\ClusterStorage\\Volume1\\uag-name',
    '\\\\fileserver\\VMs\\Custom UAG',
    'legacy-custom-value'
  ].map((ds) => ({ platform, ds }))))('preserves $platform imported/custom storage $ds', ({ platform, ds }) => {
    const config = importIni(`[General]\nds=${ds}\n`, applyPatch(defaultConfig(), { platform })).config;
    const before = structuredClone(config);
    render(FieldInput, { props: { field: datastore, values: config.values, platform } });
    expect(config).toEqual(before);
    expect(config.values.ds).toBe(ds);
    const ini = generateIni(config);
    expect(ini).toContain(`\nds=${ds}\n`);
    expect(importIni(ini, config).config.values.ds).toBe(ds);
    expect(validateConfig(config).filter((issue) => issue.fieldId === 'ds')).toEqual([]);
  });
});

const horizonGroup = GROUPS.find((group) => group.fields.some((field) => field.id === 'authMethods'))!;
const horizonAuth = horizonGroup.fields.find((field) => field.id === 'authMethods')!;
const gatedMethods = [
  { method: 'radius-auth', providers: ['radius_enabled'] },
  { method: 'radius-auth-and-unauthenticated', providers: ['radius_enabled'] },
  { method: 'securid-auth', providers: ['securid_enabled'] },
  { method: 'securid-auth-and-unauthenticated', providers: ['securid_enabled'] },
  { method: 'oidc-auth', providers: ['oidc_enabled'] },
  { method: 'saml-auth', providers: ['saml_enabled'] },
  { method: 'saml-auth-and-passthrough', providers: ['saml_enabled'] },
  { method: 'saml-auth-and-unauthenticated', providers: ['saml_enabled'] },
  { method: 'certificate-auth', providers: ['certauth_enabled'] },
  { method: 'certificate-auth-and-passthrough', providers: ['certauth_enabled'] },
  { method: 'certificate-auth-and-radius-auth', providers: ['certauth_enabled', 'radius_enabled'] },
  { method: 'device-certificate-auth-and-passthrough', providers: ['certauth_enabled'] },
  { method: 'device-certificate-auth-and-saml-auth', providers: ['certauth_enabled', 'saml_enabled'] }
];
const providerLabels: Record<string, string> = {
  radius_enabled: 'RADIUS', securid_enabled: 'RSA SecurID', oidc_enabled: 'OpenID Connect',
  saml_enabled: 'SAML', certauth_enabled: 'X.509 certificate authentication'
};
const disabledProviders = Object.fromEntries(Object.keys(providerLabels).map((flag) => [flag, false]));
const optionTag = (body: string, method: string) => body.match(new RegExp(`<option\\b[^>]*value="${method}"[^>]*>`))?.[0] ?? '';

describe('Horizon authentication provider prerequisites', () => {
  it.each(gatedMethods)('disables $method with provider-specific accessible guidance', ({ method, providers }) => {
    const { body } = render(FieldInput, { props: { field: horizonAuth, horizonAuthentication: true, values: { ...disabledProviders, authMethods: 'passthrough' }, platform: 'vsphere' } });
    expect(optionTag(body, method)).toMatch(/\bdisabled(?:[ =]|>)/);
    expect(body).toContain(`enable ${providers.map((flag) => providerLabels[flag]).join(' and ')} first`);
    expect(body).toContain('aria-describedby="f-authMethods-help f-authMethods-prerequisites"');
  });

  it.each(gatedMethods)('requires every named provider for $method', ({ method, providers }) => {
    const enabled = Object.fromEntries(providers.map((flag) => [flag, true]));
    const { body } = render(FieldInput, { props: { field: horizonAuth, horizonAuthentication: true, values: { ...disabledProviders, ...enabled, authMethods: 'passthrough' }, platform: 'vsphere' } });
    expect(optionTag(body, method)).not.toMatch(/\bdisabled(?:[ =]|>)/);
    for (const missing of providers) {
      const { body: partial } = render(FieldInput, { props: { field: horizonAuth, horizonAuthentication: true, values: { ...disabledProviders, ...enabled, [missing]: false, authMethods: method }, platform: 'vsphere' } });
      expect(optionTag(partial, method)).toMatch(/\bdisabled(?:[ =]|>)/);
      expect(partial).toContain(`Enable ${providerLabels[missing]} in Identity and access`);
    }
  });

  it.each(Object.keys(providerLabels))('enabling only %s unlocks only methods using that provider alone', (flag) => {
    const { body } = render(FieldInput, { props: { field: horizonAuth, horizonAuthentication: true, values: { ...disabledProviders, [flag]: true, authMethods: 'passthrough' }, platform: 'vsphere' } });
    for (const { method, providers } of gatedMethods) {
      expect(/\bdisabled(?:[ =]|>)/.test(optionTag(body, method))).toBe(providers.some((required) => required !== flag));
    }
  });

  it('leaves only passthrough selectable without providers and covers every schema method', () => {
    expect(horizonAuth.options!.map((option) => option.value).sort()).toEqual(['passthrough', ...gatedMethods.map((entry) => entry.method)].sort());
    const { body } = render(FieldInput, { props: { field: horizonAuth, horizonAuthentication: true, values: { ...disabledProviders, authMethods: 'passthrough' }, platform: 'vsphere' } });
    expect(optionTag(body, 'passthrough')).not.toMatch(/\bdisabled(?:[ =]|>)/);
    expect(body).toContain('Only passthrough is available without providers.');
  });

  it.each(gatedMethods)('preserves imported $method, disabled flags and INI round trips', ({ method, providers }) => {
    const base = applyPatch(defaultConfig(), { values: { ...disabledProviders, [horizonGroup.enabledBy!]: true } });
    const config = importIni(`[Horizon]\nauthMethods=${method}\n`, base).config;
    const before = structuredClone(config);
    const { body } = render(FieldInput, { props: { field: horizonAuth, horizonAuthentication: true, values: config.values, platform: 'vsphere' } });
    expect(config).toEqual(before);
    expect(config.values.authMethods).toBe(method);
    for (const flag of providers) expect(config.values[flag]).toBe(false);
    expect(optionTag(body, method)).toMatch(/\bselected(?:[ =]|>)/);
    expect(body).toContain(`Enable ${providers.map((flag) => providerLabels[flag]).join(' and ')} in Identity and access or choose another method.`);
    const ini = generateIni(config);
    expect(ini).toContain(`authMethods=${method}`);
    expect(importIni(ini, config).config.values.authMethods).toBe(method);
  });

  it('does not let administrator SAML or truthy imported strings unlock Horizon providers', () => {
    const { body } = render(FieldInput, { props: { field: horizonAuth, horizonAuthentication: true, values: { adminSaml_enable: true, saml_enabled: 'true', certauth_enabled: 'true', authMethods: 'saml-auth' }, platform: 'vsphere' } });
    expect(optionTag(body, 'saml-auth')).toMatch(/\bdisabled(?:[ =]|>)/);
    expect(optionTag(body, 'certificate-auth')).toMatch(/\bdisabled(?:[ =]|>)/);
  });

  it('does not gate unrelated reverse-proxy authentication selectors', () => {
    const { body } = render(FieldInput, { props: { field: horizonAuth, values: { authMethods: 'saml-auth' }, platform: 'vsphere' } });
    for (const { method } of gatedMethods) expect(optionTag(body, method)).not.toMatch(/\bdisabled(?:[ =]|>)/);
    expect(body).not.toContain('f-authMethods-prerequisites');
  });

  it('associates errors and prerequisite guidance with the Horizon select', () => {
    const { body } = render(FieldInput, { props: { field: horizonAuth, horizonAuthentication: true, values: { authMethods: 'radius-auth' }, platform: 'vsphere', error: 'Enable the RADIUS provider' } });
    expect(body).toContain('aria-invalid="true"');
    expect(body).toContain('aria-describedby="f-authMethods-error f-authMethods-prerequisites"');
    expect(body).toContain('id="f-authMethods-error"');
    expect(body).toContain('id="f-authMethods-prerequisites"');
  });
});

it('includes IWA as the final Horizon proxy-pattern example without filling or rewriting stored patterns', () => {
  const field = horizonGroup.fields.find((entry) => entry.id === 'proxyPattern')!;
  const values = { proxyPattern: '' };
  const { body } = render(FieldInput, { props: { field, values, platform: 'vsphere' } });
  expect(body).toContain('placeholder="(/|/view-client(.*)|/portal(.*)|/appblast(.*)|/iwa(.*))"');
  expect(new RegExp(field.placeholder!).test('/iwa/login')).toBe(true);
  expect(values.proxyPattern).toBe('');
  const config = applyPatch(defaultConfig(), { values: { horizon_enabled: true, proxyPattern: '/custom(.*)' } });
  const ini = generateIni(config);
  expect(ini).toContain('proxyPattern=/custom(.*)');
  expect(importIni(ini, config).config.values.proxyPattern).toBe('/custom(.*)');
});
