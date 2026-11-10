import { render } from 'svelte/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { applyPatch, defaultConfig, newListItem, type Config } from '../lib/model';
import { generateIni } from '../lib/generate';
import { validateConfig } from '../lib/validate';

const provider = (id: string) => ({ ...newListItem('oidc'), oidcConfigurationId: id, oidcConfigUrl: `https://${id}.example.com/discovery`, oidcClientId: `${id}-client` });
let app: typeof import('../lib/store.svelte')['app'];
let OidcSettings: typeof import('./OidcSettings.svelte')['default'];
let previous: Config;
const markup = () => render(OidcSettings, { props: { issues: validateConfig(app.config) } }).body;

beforeEach(async () => {
  vi.stubGlobal('document', { documentElement: { dataset: {} } });
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => undefined, removeItem: () => undefined });
  ({ app } = await import('../lib/store.svelte'));
  ({ default: OidcSettings } = await import('./OidcSettings.svelte'));
  previous = app.config;
  app.config = applyPatch(defaultConfig(), {
    values: { oidc_enabled: true, oidc_oidcConfigurationId: 'one', oidc_oidcConfigUrl: 'https://one.example.com/discovery', oidc_oidcClientId: 'one-client' },
    oidc: [provider('two'), provider('three')]
  });
});
afterEach(() => { app.config = previous; vi.unstubAllGlobals(); });

describe('unified OIDC provider section', () => {
  it('boxes every provider under one heading and one shared Enabled control', () => {
    const before = JSON.stringify(app.config);
    const ini = generateIni(app.config);
    const body = markup();
    expect(body.match(/data-list="oidc"/g)).toHaveLength(1);
    expect(body.match(/id="f-oidc_enabled"/g)).toHaveLength(1);
    expect(body).toContain('<h3>OpenID Connect providers</h3>');
    for (const number of [1, 2, 3]) expect(body).toContain(`<strong>OIDC provider ${number}</strong>`);
    expect(body).not.toMatch(/Additional OpenID|First OIDC provider|None configured/);
    for (const id of ['oidc_oidcConfigurationId', 'oidc0_oidcConfigurationId', 'oidc1_oidcConfigurationId']) expect(body).toContain(`id="f-${id}"`);
    expect(JSON.stringify(app.config)).toBe(before);
    expect(generateIni(app.config)).toBe(ini);
  });

  it('shows a legacy single provider in the same box without fabricating another entry', () => {
    app.config.oidc = [];
    const legacy = structuredClone(app.config);
    delete (legacy as Partial<Config>).oidc;
    app.config = applyPatch(legacy, {});
    const body = markup();
    expect(body).toContain('<strong>OIDC provider 1</strong>');
    expect(body).not.toContain('<strong>OIDC provider 2</strong>');
    expect(body).not.toContain('None configured');
    expect(body).toContain('value="one"');
    expect(app.config.oidc).toEqual([]);
    expect(generateIni(app.config)).toContain('[OidcProviderSetting]\noidcConfigurationId=one');
  });

  it('hides all provider controls together when disabled without changing stored values', () => {
    app.config.values.oidc_enabled = false;
    const before = JSON.stringify(app.config);
    const body = markup();
    expect(body).toContain('id="f-oidc_enabled"');
    expect(body).not.toContain('id="f-oidc_oidcConfigurationId"');
    expect(body).not.toContain('id="f-oidc0_oidcConfigurationId"');
    expect(body).not.toContain('+ Add oidc provider');
    expect(body).toContain('Provider values are retained');
    expect(JSON.stringify(app.config)).toBe(before);
    expect(generateIni(app.config)).not.toContain('OidcProviderSetting');
  });

  it('respects the existing release gate without dropping provider values', () => {
    app.config.version = '2503';
    const before = JSON.stringify(app.config);
    expect(markup()).not.toContain('data-list="oidc"');
    expect(JSON.stringify(app.config)).toBe(before);
    app.config.version = '2609';
    expect(markup()).toContain('value="three"');
  });

  it('keeps duplicate-ID errors attached to legacy and numbered field IDs', () => {
    app.config.oidc[0].oidcConfigurationId = 'one';
    const body = markup();
    for (const id of ['oidc_oidcConfigurationId', 'oidc0_oidcConfigurationId']) {
      expect(body).toContain(`id="f-${id}-error"`);
      expect(body).toContain(`aria-describedby="f-${id}-error"`);
    }
  });

  it('renumbers display cards after removal without changing remaining IDs or Horizon references', () => {
    app.config.values.horizon_oidcConfigurationId = 'two';
    app.config.oidc.splice(0, 1);
    const body = markup();
    expect(body).toContain('<strong>OIDC provider 2</strong>');
    expect(body).not.toContain('<strong>OIDC provider 3</strong>');
    expect(body).toContain('value="three"');
    expect(app.config.values.horizon_oidcConfigurationId).toBe('two');
    expect(generateIni(app.config)).toContain('[OidcProviderSetting1]\noidcConfigurationId=three');
  });

  it('keeps the vendor-supported section limit and display numbering independent', () => {
    app.config.oidc = Array.from({ length: 99 }, (_, index) => provider(`id${index}`));
    const body = markup();
    expect(body).toMatch(/<button[^>]*disabled[^>]*>\+ Add oidc provider<\/button>/);
    expect(body).toContain('<strong>OIDC provider 100</strong>');
    expect(generateIni(app.config)).toContain('[OidcProviderSetting99]');
    expect(generateIni(app.config)).not.toContain('[OidcProviderSetting100]');
  });
});
