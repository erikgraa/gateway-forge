import { readFileSync } from 'node:fs';
import { render } from 'svelte/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import packageInfo from '../package.json';
import packageLock from '../package-lock.json';
import { applyPatch, defaultConfig } from './lib/model';

const footerText = (body: string) => body.match(/<footer\b[^>]*>([\s\S]*?)<\/footer>/)?.[1].replace(/<!--[\s\S]*?-->/g, '');

describe('builder version footer', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('uses the Studio identity in the embedded footer without dropping community and version information', async () => {
    vi.stubGlobal('document', { documentElement: { dataset: {} } });
    vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => undefined, removeItem: () => undefined });
    const { default: App } = await import('./App.svelte');
    const { body } = render(App, { props: { embedded: true, brandName: 'UAG Studio' } });
    const footer = footerText(body);
    expect(footer).toContain(`UAG Studio v${packageInfo.version}`);
    expect(footer).toContain('UAG Studio is a community-driven, unofficial tool');
    expect(footer).toContain('not affiliated with, endorsed by, or supported by Omnissa');
    expect(footer).not.toContain('Gateway Forge');
    expect(body).not.toContain('class="brand"');
  });

  it.each(['general', 'horizon'] as const)('places one validation panel below the %s full-editor fields', async (section) => {
    vi.stubGlobal('document', { documentElement: { dataset: {} } });
    vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => undefined, removeItem: () => undefined });
    const { app } = await import('./lib/store.svelte');
    const before = app.config, beforeSection = app.section;
    try {
      app.config = applyPatch(defaultConfig(), { values: { horizon_enabled: true } }); app.section = section;
      const { default: App } = await import('./App.svelte');
      const { body } = render(App, { props: { embedded: true } });
      const panel = body.indexOf('id="validation-lint"'), field = body.indexOf(section === 'general' ? 'id="f-uagName"' : 'id="f-proxyDestinationUrl"');
      expect(panel).toBeGreaterThan(-1); expect(field).toBeGreaterThan(-1); expect(panel).toBeGreaterThan(field);
      expect(panel).toBeGreaterThan(body.lastIndexOf('id="f-'));
      expect(body.indexOf('class="validation-summary')).toBeLessThan(field);
      expect([...body.matchAll(/id="validation-lint"/g)]).toHaveLength(1);
      expect(body).toContain('aria-controls="validation-lint"');
    } finally { app.config = before; app.section = beforeSection; }
  });

  it('renders INI-name collision messages as escaped text in the full editor', async () => {
    vi.stubGlobal('document', { documentElement: { dataset: {} } });
    vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => undefined, removeItem: () => undefined });
    const { default: App } = await import('./App.svelte');
    const { body } = render(App, { props: { embedded: true, extraIssues: [{ id: 'fleet-1-ip0-collision', level: 'error', section: 'network', fieldId: 'ip0', message: 'Address 198.51.100.21 collides with UAG “<ini-name>” (#2) NIC2.' }] } });
    expect(body).toContain('collides with UAG “&lt;ini-name>” (#2) NIC2.');
    expect(body).not.toContain('<ini-name>');
  });

  it('keeps package metadata and release documentation aligned', () => {
    expect(packageLock.version).toBe(packageInfo.version);
    expect(packageLock.packages[''].version).toBe(packageInfo.version);
    const changelog = readFileSync(new URL('../CHANGELOG.md', import.meta.url), 'utf8');
    const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8');
    const technicalGuide = readFileSync(new URL('../docs/technical-guide.md', import.meta.url), 'utf8');
    expect(changelog).toContain(`## ${packageInfo.version} - `);
    expect(readme).toContain('[Technical guide](docs/technical-guide.md)');
    expect(technicalGuide).toContain(`The current builder version is **${packageInfo.version}**.`);
  });

  it.each(['2212', '2609'])('shows package version independently of UAG %s and preserves the disclaimer', async (version) => {
    vi.stubGlobal('document', { documentElement: { dataset: {} } });
    vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => undefined, removeItem: () => undefined });
    const { app } = await import('./lib/store.svelte');
    const before = app.config;
    try {
      app.config = applyPatch(defaultConfig(), { version });
      const { default: App } = await import('./App.svelte');
      const { body } = render(App);
      const footer = footerText(body);
      expect(footer).toContain(`UAG Studio v${packageInfo.version}`);
      expect(footer).not.toContain(`UAG Studio v${version}`);
      expect(footer).toContain('community-driven, unofficial tool');
      expect(footer).toContain('not affiliated with, endorsed by, or supported by Omnissa');
      expect(footer).toContain('Source on GitHub');
      expect(body).toContain(`class="profile-version">UAG ${version}</strong>`);
      expect(body).toContain('class="profile-platform"');
      expect(body).toMatch(/<details class="target-profile"[^>]*aria-label="Target environment"/);
    } finally {
      app.config = before;
    }
  });
});
