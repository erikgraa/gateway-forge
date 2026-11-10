import { readFileSync } from 'node:fs';
import { render } from 'svelte/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import packageInfo from '../package.json';
import packageLock from '../package-lock.json';
import { applyPatch, defaultConfig } from './lib/model';

const footerText = (body: string) => body.match(/<footer\b[^>]*>([\s\S]*?)<\/footer>/)?.[1].replace(/<!--[\s\S]*?-->/g, '');

describe('builder version footer', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('keeps package metadata and release documentation aligned', () => {
    expect(packageLock.version).toBe(packageInfo.version);
    expect(packageLock.packages[''].version).toBe(packageInfo.version);
    const changelog = readFileSync(new URL('../CHANGELOG.md', import.meta.url), 'utf8');
    const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8');
    expect(changelog).toContain(`## ${packageInfo.version} - `);
    expect(readme).toContain(`The current builder version is **${packageInfo.version}**.`);
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
      expect(footer).toContain(`Gateway Forge v${packageInfo.version}`);
      expect(footer).not.toContain(`Gateway Forge v${version}`);
      expect(footer).toContain('community-driven, unofficial tool');
      expect(footer).toContain('not affiliated with, endorsed by, or supported by Omnissa');
      expect(footer).toContain('Source on GitHub');
    } finally {
      app.config = before;
    }
  });
});
