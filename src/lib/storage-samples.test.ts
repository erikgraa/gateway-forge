import { afterEach, describe, expect, it, vi } from 'vitest';
import { TEMPLATES } from './templates';
import { applyPatch, defaultConfig } from './model';
import { generateIni } from './generate';
import { importIni } from './importer';

async function load(draft?: ReturnType<typeof defaultConfig>) {
  vi.resetModules();
  const writes: string[] = [];
  vi.stubGlobal('localStorage', { getItem: (key: string) => key === 'gateway-forge.draft' && draft ? JSON.stringify(draft) : null, setItem: (_key: string, value: string) => writes.push(value), removeItem: () => {} });
  vi.stubGlobal('document', { documentElement: { dataset: {} } });
  return { app: (await import('./store.svelte')).app, writes };
}

describe('storage examples never replace operator values', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('starts fresh without a VMware datastore sample, including after platform switches/reset', async () => {
    const { app } = await load();
    expect(app.config.values.ds).toBe('');
    expect(app.config.values.source).toBe('');
    app.config.platform = 'hyperv';
    expect(app.config.values.ds).toBe('');
    expect(generateIni(app.config)).not.toContain('ds=vsanDatastore');
    expect(generateIni(app.config)).not.toContain('\nsource=');
    app.config.platform = 'vsphere';
    expect(app.config.values.ds).toBe('');
    app.clearDraft();
    expect(app.config.values.ds).toBe('');
  });

  it('keeps templates storage-neutral on both deployment platforms', () => {
    for (const platform of ['hyperv', 'vsphere'] as const) {
      for (const template of TEMPLATES) {
        const c = template.build(applyPatch(defaultConfig(), { platform, values: { ds: 'custom-before-template' } }));
        expect(c.values.ds).toBe('');
        expect(c.values.source).toBe('');
      }
    }
  });

  it.each(['C:\\images\\uag.ova', 'C:\\images\\custom.vhdx', '\\\\server\\images\\uag.vhdx', 'https://images.example.com/uag.ova'])('preserves saved/imported source %s across platform switches', async (source) => {
    const { app, writes } = await load(applyPatch(defaultConfig(), { values: { source } }));
    expect(app.config.values.source).toBe(source);
    app.config.platform = 'hyperv';
    expect(app.config.values.source).toBe(source);
    app.config.platform = 'vsphere';
    expect(app.config.values.source).toBe(source);
    expect(importIni(generateIni(app.config), app.config).config.values.source).toBe(source);
    app.saveDraft();
    expect(JSON.parse(writes.at(-1)!).values.source).toBe(source);
  });

  it.each(['vsanDatastore', 'legacy-custom-value', 'C:\\ClusterVol\\UAG-name', '\\\\server\\VMs\\UAG'])('preserves saved/imported/custom %s across platform switches', async (ds) => {
    const draft = applyPatch(defaultConfig(), { values: { ds, hv_vlan0: 100, hv_vlan1: 200 } });
    const { app, writes } = await load(draft);
    expect(app.config.values.ds).toBe(ds);
    app.config.platform = 'hyperv';
    expect(app.config.values.ds).toBe(ds);
    app.config.platform = 'vsphere';
    expect(app.config.values.ds).toBe(ds);
    expect(importIni(generateIni(app.config), app.config).config.values.ds).toBe(ds);
    app.saveDraft();
    const saved = JSON.parse(writes.at(-1)!);
    expect(saved.values.ds).toBe(ds);
    expect(saved.values.hv_vlan0).toBe(100);
    expect(saved.values.hv_vlan1).toBe(200);
  });
});
