import { describe, expect, it } from 'vitest';
import { applyPatch, defaultConfig, newListItem, stripSecrets, listDef } from './model';
import { generateIni, generateJson } from './generate';
import { importIni, importJson } from './importer';
import { validateConfig } from './validate';

const provider = (id: string) => ({ ...newListItem('oidc'), oidcConfigurationId: id, oidcConfigUrl: `https://${id}.example.com/.well-known/openid-configuration`, oidcClientId: `${id}-client` });
const configured = () => applyPatch(defaultConfig(), {
  values: { oidc_enabled: true, oidc_oidcConfigurationId: 'first', oidc_oidcConfigUrl: 'https://first.example.com/discovery', oidc_oidcClientId: 'first-client' },
  oidc: [provider('second'), provider('third')]
});

describe('multiple OIDC providers', () => {
  it('retains the existing unnumbered provider and emits independent numbered providers', () => {
    const c = configured();
    const ini = generateIni(c);
    expect(ini).toContain('[OidcProviderSetting]\noidcConfigurationId=first');
    expect(ini).toContain('[OidcProviderSetting1]\noidcConfigurationId=second');
    expect(ini).toContain('[OidcProviderSetting2]\noidcConfigurationId=third');
    expect(ini).toContain('oidcClientId=second-client');
    expect(ini).toContain('oidcClientId=third-client');
    expect(generateJson(c)).not.toMatch(/oidcConfigurationId|oidcClientId|second\.example/);
  });

  it('round-trips all provider values without collapsing them into the first provider', () => {
    const c = configured();
    c.oidc[0].oidcTimeoutSeconds = 18;
    c.oidc[1].oidcForceAuthPrompt = true;
    const ini = generateIni(c);
    const back = importIni(ini, defaultConfig());
    expect(back.unmapped).toEqual([]);
    expect(back.config.values.oidc_oidcConfigurationId).toBe('first');
    expect(back.config.oidc).toEqual(c.oidc);
    expect(generateIni(back.config)).toBe(ini);
  });

  it('accepts case-insensitive, noncontiguous numbered sections and preserves IDs', () => {
    const ini = '[OidcProviderSetting]\noidcConfigurationId=first\noidcConfigUrl=https://first.example.com\noidcClientId=first-client\n\n[oidcprovidersetting9]\noidcConfigurationId=third\noidcConfigUrl=https://third.example.com\noidcClientId=third-client\n\n[OidcProviderSetting3]\noidcConfigurationId=second\noidcConfigUrl=https://second.example.com\noidcClientId=second-client';
    const back = importIni(ini, defaultConfig());
    expect(back.config.oidc.map((p) => p.oidcConfigurationId)).toEqual(['second', 'third']);
    expect(back.config.values.oidc_enabled).toBe(true);
    expect(back.unmapped).toEqual([]);
    expect(generateIni(back.config)).toContain('[OidcProviderSetting2]\noidcConfigurationId=third');
  });

  it('normalizes numbered-only imports to a compatible first unnumbered provider', () => {
    const back = importIni('[OidcProviderSetting2]\noidcConfigurationId=first\noidcConfigUrl=https://first.example.com\noidcClientId=a\n\n[OidcProviderSetting7]\noidcConfigurationId=second\noidcConfigUrl=https://second.example.com\noidcClientId=b', defaultConfig());
    expect(back.config.values.oidc_oidcConfigurationId).toBe('first');
    expect(back.config.values.oidc_oidcClientId).toBe('a');
    expect(back.config.oidc[0].oidcConfigurationId).toBe('second');
    expect(back.warnings.join(' ')).toContain('normalized');
    const ini = generateIni(back.config);
    expect(ini).toContain('[OidcProviderSetting]\noidcConfigurationId=first');
    expect(generateIni(importIni(ini, defaultConfig()).config)).toBe(ini);
  });

  it('retains first-provider-only imports with no additional entries', () => {
    const c = configured(); c.oidc = [];
    const back = importIni(generateIni(c), defaultConfig()).config;
    expect(back.oidc).toEqual([]);
    expect(back.values.oidc_oidcConfigurationId).toBe('first');
  });

  it('reports duplicate IDs across primary and additional providers on their fields', () => {
    const c = configured(); c.oidc[0].oidcConfigurationId = 'first';
    const issues = validateConfig(c);
    expect(issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ fieldId: 'oidc_oidcConfigurationId', level: 'error' }),
      expect.objectContaining({ fieldId: 'oidcConfigurationId', level: 'error', list: { id: 'oidc', index: 0 } })
    ]));
    expect(c.oidc[0].oidcConfigurationId).toBe('first');
  });

  it('reports duplicate IDs between additional providers', () => {
    const c = configured(); c.oidc[1].oidcConfigurationId = 'second';
    expect(validateConfig(c).filter((i) => i.fieldId === 'oidcConfigurationId')).toHaveLength(2);
  });

  it.each(['first', 'second'])('accepts Horizon referencing configured provider %s', (id) => {
    const c = configured(); Object.assign(c.values, { horizon_enabled: true, authMethods: 'oidc-auth', horizon_oidcConfigurationId: id });
    expect(validateConfig(c).filter((i) => i.fieldId === 'horizon_oidcConfigurationId')).toEqual([]);
  });

  it('reports a removed Horizon reference without replacing or clearing it', () => {
    const c = configured(); Object.assign(c.values, { horizon_enabled: true, authMethods: 'oidc-auth', horizon_oidcConfigurationId: 'second' });
    c.oidc.splice(0, 1);
    expect(validateConfig(c)).toContainEqual(expect.objectContaining({ fieldId: 'horizon_oidcConfigurationId', level: 'error' }));
    expect(c.values.horizon_oidcConfigurationId).toBe('second');
  });

  it('retains disabled and older-release providers without emitting or validating hidden rows', () => {
    const c = configured(); c.oidc[0].oidcConfigUrl = 'invalid'; c.values.oidc_enabled = false;
    expect(generateIni(c)).not.toContain('OidcProviderSetting');
    expect(validateConfig(c).some((i) => i.list?.id === 'oidc')).toBe(false);
    c.values.oidc_enabled = true; c.version = '2503';
    expect(generateIni(c)).not.toContain('OidcProviderSetting');
    expect(validateConfig(c).some((i) => i.list?.id === 'oidc')).toBe(false);
    expect(c.oidc[0].oidcConfigUrl).toBe('invalid');
    c.version = '2609'; c.oidc[0].oidcConfigUrl = 'https://second.example.com';
    expect(generateIni(c)).toContain('oidcConfigurationId=second');
  });

  it('checks required and HTTPS fields on additional provider rows', () => {
    const c = configured(); c.oidc = [newListItem('oidc')];
    expect(validateConfig(c).filter((i) => i.list?.id === 'oidc').map((i) => i.fieldId)).toEqual(expect.arrayContaining(['oidcConfigurationId', 'oidcConfigUrl', 'oidcClientId']));
    c.oidc = [provider('second')]; c.oidc[0].oidcConfigUrl = 'http://second.example.com';
    expect(validateConfig(c)).toContainEqual(expect.objectContaining({ fieldId: 'oidcConfigUrl', list: { id: 'oidc', index: 0 } }));
  });

  it('supports indices 1–99 and reports excess entries or unsupported imported indices', () => {
    expect(listDef('oidc').max).toBe(99);
    const c = configured(); c.oidc = Array.from({ length: 100 }, (_, i) => provider(`provider${i}`));
    expect(validateConfig(c).some((i) => i.message.includes('maximum of 99'))).toBe(true);
    const back = importIni('[OidcProviderSetting0]\noidcConfigurationId=zero\n[OidcProviderSetting100]\noidcConfigurationId=hundred', defaultConfig());
    expect(back.config.oidc).toEqual([]);
    expect(back.unmapped).toHaveLength(2);
  });

  it('patches old drafts and drops undeclared client secrets from additional provider persistence', () => {
    const legacy = defaultConfig(); delete (legacy as Partial<typeof legacy>).oidc;
    expect(applyPatch(legacy, {}).oidc).toEqual([]);
    expect(importIni('', legacy).config.oidc).toEqual([]);
    expect(importJson('{}', legacy).config.oidc).toEqual([]);
    expect(importJson('{}', configured()).config.oidc).toEqual(configured().oidc);
    const c = configured(); c.oidc[0].oidcClientSecret = 'synthetic-secret';
    expect(applyPatch(defaultConfig(), { oidc: c.oidc }).oidc[0]).not.toHaveProperty('oidcClientSecret');
    expect(stripSecrets(c).oidc[0]).not.toHaveProperty('oidcClientSecret');
    expect(generateIni(c)).not.toContain('synthetic-secret');
  });
});
