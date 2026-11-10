import { render } from 'svelte/server';
import { describe, expect, it, vi } from 'vitest';

describe('JWT settings grouping', () => {
  it('groups consumer and producer editors without mutating profiles', async () => {
    vi.stubGlobal('document', { documentElement: { dataset: {} } });
    vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => undefined, removeItem: () => undefined });
    try {
      const { app } = await import('../lib/store.svelte');
      const before = JSON.stringify(app.config);
      const { default: JwtSettings } = await import('./JwtSettings.svelte');
      const { body } = render(JwtSettings, { props: { issues: [] } });
      expect(body).toContain('<h3>JWT settings</h3>');
      expect(body).toContain('JWT consumer settings');
      expect(body).toContain('JWT producer settings');
      expect(body).toContain('+ Add jwt consumer');
      expect(body).toContain('+ Add jwt producer');
      expect(JSON.stringify(app.config)).toBe(before);
    } finally { vi.unstubAllGlobals(); }
  });
});
