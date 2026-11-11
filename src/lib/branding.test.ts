import { readFileSync } from 'node:fs';
import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import BrandMark from '../components/BrandMark.svelte';
import { APPEARANCE_KEY, LEGACY_DRAFT_KEY, REGISTRY_KEY } from './scenario-workspaces';
import { OUTPUT_WIDTH_KEY } from './output-layout';
import packageInfo from '../../package.json';
import packageLock from '../../package-lock.json';

const castGateway = 'M4 6h6v12a6 6 0 0 0 12 0V6h6v12a12 12 0 0 1-24 0Z';

describe('UAG Foundry rebrand', () => {
  it('uses the same original Cast gateway geometry for the header and public icon', () => {
    const { body } = render(BrandMark);
    const icon = readFileSync(new URL('../../public/logo.svg', import.meta.url), 'utf8');
    for (const svg of [body, icon]) {
      expect(svg).toContain('viewBox="0 0 32 32"');
      expect(svg).toContain(`d="${castGateway}"`);
      expect(svg).toContain('d="M7 14h16m-4-4 4 4-4 4"');
    }
    expect(body).toContain('aria-hidden="true"');
  });

  it('spells out Unified Access Gateway in the header subtitle', () => {
    const source = readFileSync(new URL('../ScenarioApp.svelte', import.meta.url), 'utf8');
    expect(source).toContain('Community Unified Access Gateway configuration builder');
  });

  it('aligns package naming and approved release metadata', () => {
    expect(packageInfo.name).toBe('uag-foundry');
    expect(packageLock.name).toBe(packageInfo.name);
    expect(packageLock.packages[''].name).toBe(packageInfo.name);
    expect(packageInfo.version).toBe('0.9.0');
    expect(packageLock.version).toBe(packageInfo.version);
    expect(packageLock.packages[''].version).toBe(packageInfo.version);
  });

  it('keeps existing browser-storage namespaces compatible', () => {
    expect(REGISTRY_KEY).toBe('gateway-forge.workspaces.v1');
    expect(APPEARANCE_KEY).toBe('gateway-forge.appearance.v1');
    expect(LEGACY_DRAFT_KEY).toBe('gateway-forge.draft');
    expect(OUTPUT_WIDTH_KEY).toBe('gateway-forge.output-width');
  });
});
