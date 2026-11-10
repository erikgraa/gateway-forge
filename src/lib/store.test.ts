import { describe, expect, it, vi } from 'vitest';
import { defaultConfig, newListItem } from './model';

describe('identity-provider draft restoration', () => {
  it('restores OIDC and JWT arrays after a browser reload', async () => {
    const c = defaultConfig();
    c.values.oidc_enabled = true;
    c.oidc = [{ ...newListItem('oidc'), oidcConfigurationId: 'secondary', oidcClientId: 'secondary-client', oidcConfigUrl: 'https://idp.example.com/discovery' }];
    c.jwt = [{ ...newListItem('jwt'), name: 'consumer', url: 'https://keys.example.com/jwks' }];
    c.jwtIssuers = [{ ...newListItem('jwtIssuers'), name: 'producer', pemPrivKey: 'C:\\uag\\signing.key', pemCerts: 'C:\\uag\\signing.pem' }];
    vi.resetModules();
    vi.stubGlobal('document', { documentElement: { dataset: {} } });
    vi.stubGlobal('localStorage', { getItem: (key: string) => key === 'gateway-forge.draft' ? JSON.stringify(c) : null, setItem: () => undefined, removeItem: () => undefined });
    try {
      const { app } = await import('./store.svelte');
      expect(app.config.oidc).toEqual(c.oidc);
      expect(app.config.jwt).toEqual(c.jwt);
      expect(app.config.jwtIssuers).toEqual(c.jwtIssuers);
      expect(app.config.values.oidc_enabled).toBe(true);
    } finally { vi.unstubAllGlobals(); vi.resetModules(); }
  });
});
