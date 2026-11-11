import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import BrandMark from '../components/BrandMark.svelte';
import { APPEARANCE_KEY, LEGACY_DRAFT_KEY, REGISTRY_KEY } from './scenario-workspaces';
import { OUTPUT_WIDTH_KEY } from './output-layout';
import packageInfo from '../../package.json';
import packageLock from '../../package-lock.json';

const workspacePaths = [
  'M9 3H29V23H26V6H9Z',
  'M3 8H24V11H3Z',
  'M3 11H6V26H3Z',
  'M21 11H24V26H21Z',
  'M3 26H24V29H3Z',
  'M9 14H18V24H15V17H12V24H9Z',
];

describe('UAG Studio rebrand', () => {
  it('uses the same layered workspace and gateway geometry for the header and public icon', () => {
    const { body } = render(BrandMark);
    const icon = readFileSync(new URL('../../public/logo.svg', import.meta.url), 'utf8');
    for (const svg of [body, icon]) {
      expect(svg).toContain('viewBox="0 0 32 32"');
      expect([...svg.matchAll(/<path d="([^"]+)"/g)].map(match => match[1])).toEqual(workspacePaths);
      expect(svg).toContain('fill="#6b4fb3"');
      expect(svg).toContain('rx="6" fill="white"');
    }
    expect(body).toContain('aria-hidden="true"');
  });

  it('spells out Unified Access Gateway in the header subtitle', () => {
    const source = readFileSync(new URL('../ScenarioApp.svelte', import.meta.url), 'utf8');
    expect(source).toContain("const brandName = 'UAG Studio';");
    expect(source).toContain('Community Unified Access Gateway configuration builder');
  });

  it('aligns package naming and approved release metadata', () => {
    expect(packageInfo.name).toBe('uag-studio');
    expect(packageLock.name).toBe(packageInfo.name);
    expect(packageLock.packages[''].name).toBe(packageInfo.name);
    expect(packageInfo.version).toBe('0.9.2');
    expect(packageLock.version).toBe(packageInfo.version);
    expect(packageLock.packages[''].version).toBe(packageInfo.version);
  });

  it.each([
    'src/App.svelte', 'src/components/CommunityFooter.svelte', 'README.md', 'ROADMAP.md', 'CHANGELOG.md',
    'docs/technical-guide.md', 'docs/secret-pki-provider-design.md', 'Dockerfile',
  ])('uses canonical Studio GitHub links in %s', path => {
    const source = readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
    const links = source.match(/https:\/\/github\.com\/erikgraa\/[\w-]+/g) || [];
    expect(links.length).toBeGreaterThan(0);
    expect([...new Set(links)]).toEqual(['https://github.com/erikgraa/uag-studio']);
  });

  it('omits previous branding while retaining the legacy migration anchor and import identifier', () => {
    const root = new URL('../../', import.meta.url);
    const paths = [
      ...readdirSync(root).filter(name => name.endsWith('.md')),
      ...readdirSync(new URL('docs/', root), { recursive: true })
        .filter(name => name.endsWith('.md')).map(name => `docs/${name.replaceAll('\\', '/')}`),
    ];
    for (const path of paths) {
      const source = readFileSync(new URL(path, root), 'utf8');
      const visible = source.replace('<a id="moving-from-gateway-forge"></a>', '').replaceAll('`gateway-forge-fleet-1`', '');
      expect(visible, path).not.toMatch(/uag[- ]?foundry|gateway[- ]?forge/i);
    }
    const guide = readFileSync(new URL('docs/technical-guide.md', root), 'utf8');
    expect(guide).toContain('<a id="moving-from-gateway-forge"></a>');
    expect(guide).toContain('## Moving from a previous domain');
    expect(guide).toContain('Previously published container packages remain separate historical packages');
  });

  it('aligns OCI branding and derives the publication namespace from the renamed repository', () => {
    const dockerfile = readFileSync(new URL('../../Dockerfile', import.meta.url), 'utf8');
    expect(dockerfile).toContain('org.opencontainers.image.title="UAG Studio"');
    const workflow = readFileSync(new URL('../../.github/workflows/container.yml', import.meta.url), 'utf8');
    expect(workflow).toContain('IMAGE: ghcr.io/${{ github.repository }}');
    expect(workflow).not.toContain('uag-foundry');
  });

  it('uses Studio artwork filenames without changing the approved social card or metadata', () => {
    const readme = readFileSync(new URL('../../README.md', import.meta.url), 'utf8');
    for (const name of ['icon', 'readme-icon', 'readme-icon-dark']) {
      expect(existsSync(new URL(`../../assets/uag-studio-${name}.png`, import.meta.url))).toBe(true);
      expect(existsSync(new URL(`../../assets/uag-foundry-${name}.png`, import.meta.url))).toBe(false);
    }
    expect(readme).toContain('assets/uag-studio-readme-icon.png');
    expect(readme).toContain('assets/uag-studio-readme-icon-dark.png');
    const card = readFileSync(new URL('../../public/social-preview.png', import.meta.url));
    expect(createHash('sha256').update(card).digest('hex')).toBe('33b644278875d06104e03181478beb988dbc6545e23a5ad3c4fc66cbb337e70e');
    const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
    expect(html.match(/https:\/\/uagstudio\.graa\.dev\/social-preview\.png\?v=0\.9\.1-social-2/g)).toHaveLength(2);
    expect(readFileSync(new URL('../../public/CNAME', import.meta.url), 'utf8').trim()).toBe('uagstudio.graa.dev');
  });

  it('keeps existing browser-storage namespaces compatible', () => {
    expect(REGISTRY_KEY).toBe('gateway-forge.workspaces.v1');
    expect(APPEARANCE_KEY).toBe('gateway-forge.appearance.v1');
    expect(LEGACY_DRAFT_KEY).toBe('gateway-forge.draft');
    expect(OUTPUT_WIDTH_KEY).toBe('gateway-forge.output-width');
    const store = readFileSync(new URL('./store.svelte.ts', import.meta.url), 'utf8');
    expect(store).toContain("const DRAFT_KEY = 'gateway-forge.draft';");
    expect(store).toContain("const THEME_KEY = 'gateway-forge.theme';");
    const app = readFileSync(new URL('../App.svelte', import.meta.url), 'utf8');
    expect(app).toContain("localStorage.getItem('gateway-forge.theme')");
    const bootstrap = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
    expect(bootstrap).toContain("localStorage.getItem('gateway-forge.appearance.v1')");
  });
});
