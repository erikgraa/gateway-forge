import { readFileSync } from 'node:fs';
import { render } from 'svelte/server';
import { describe, expect, it, vi } from 'vitest';
import DeploymentRisk from './components/DeploymentRisk.svelte';
import NoticeStack from './components/NoticeStack.svelte';
import { vmReplacementWarning } from './lib/deployment-safety';
import { PLATFORMS } from './lib/versions';

describe('Quieter workspace', () => {
  it.each(PLATFORMS.map((platform) => platform.id))('retains full source-backed deployment risks for %s', (platform) => {
    const body = render(DeploymentRisk, { props: { platform, version: '2609', latestVersionId: '2609' } }).body;
    expect(body).toContain('aria-label="Destructive deployment risks"');
    expect(body).toContain(vmReplacementWarning(platform));
    expect(body).toContain('<summary');
    expect(body).toContain('generates files only');
    expect(body).not.toContain('Older release');
    if (platform === 'azure') expect(body).toContain('Deletion risk: VM, OS disk, NICs');
    else expect(body).toContain('Deletes/recreates same-name VM');
  });
  it('keeps older-package/schema advice and its visible caution marker beside output', () => {
    const body = render(DeploymentRisk, { props: { platform: 'vsphere', version: '2606', latestVersionId: '2609' } }).body;
    expect(body).toContain('Older release');
    expect(body).toContain('INI/settings JSON schemas can differ');
    expect(body).toContain('documentation for UAG 2606');
  });
  it('retains all risks in the compact export disclosure', () => {
    const body = render(DeploymentRisk, { props: { platform: 'azure', version: '2609', latestVersionId: '2609', compact: true } }).body;
    expect(body).toContain('compact');
    expect(body).toContain('even if no matching VM exists');
    expect(body).toContain('name-eth0');
  });
  it.each(['nutanix', 'openshift'] as const)('keeps platform prerequisites without duplicating VM warnings for %s', (platform) => {
    const body = render(NoticeStack, { props: { platform, version: '2609', latestVersionId: '2609', onUseLatest: vi.fn() } }).body;
    expect(body).not.toContain('vm-replacement-advisory-title');
    expect(body).toContain(platform === 'nutanix' ? 'Upload the UAG QCOW2 image to Prism Central first' : 'requires Omnissa-granted access');
  });
  it('keeps phone navigation below the actual wrapped header height', () => {
    const css = readFileSync(new URL('./workspace.css', import.meta.url), 'utf8');
    const app = readFileSync(new URL('./App.svelte', import.meta.url), 'utf8');
    expect(css).toMatch(/header\.top\s*\{[^}]*flex:\s*0\s+0\s+auto/);
    expect(css).toMatch(/nav\.side\s*\{\s*top:\s*var\(--workspace-header-height,\s*64px\)/);
    expect(app).toContain('bind:offsetHeight={headerHeight}');
    expect(app).toContain('style:--workspace-header-height');
  });
  it('anchors screen-reader descriptions without extending the document past the footer', () => {
    const css = readFileSync(new URL('./app.css', import.meta.url), 'utf8');
    expect(css).toMatch(/\.sr-only\s*\{[^}]*position:\s*absolute;\s*top:\s*0;\s*left:\s*0;/);
  });
  it('pins the desktop output to its own grid column when the hidden splitter leaves auto-placement', () => {
    const css = readFileSync(new URL('./workspace.css', import.meta.url), 'utf8');
    expect(css).toMatch(/@media\s*\(min-width:\s*981px\)\s*\{\s*(?:\/\*[\s\S]*?\*\/\s*)?aside\.out\s*\{\s*grid-column:\s*4;\s*grid-row:\s*1;/);
  });
});
