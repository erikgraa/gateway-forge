import { readFileSync } from 'node:fs';
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
    expect(packageInfo.name).toBe('uag-foundry');
    expect(packageLock.name).toBe(packageInfo.name);
    expect(packageLock.packages[''].name).toBe(packageInfo.name);
    expect(packageInfo.version).toBe('0.9.1');
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
