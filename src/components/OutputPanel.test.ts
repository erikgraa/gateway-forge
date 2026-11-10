import { render } from 'svelte/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyPatch, defaultConfig } from '../lib/model';
import { highlight, render as renderArtifact } from '../lib/render';

describe('OutputPanel', () => {
  afterEach(() => vi.unstubAllGlobals());

  it.each(['ini', 'json', 'ps', 'docs', 'manifest'] as const)('numbers only code previews without altering %s output', async (tab) => {
    vi.stubGlobal('document', { documentElement: { dataset: {} } });
    vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => undefined, removeItem: () => undefined });
    const { app } = await import('../lib/store.svelte');
    const previous = { config: app.config, tab: app.tab };
    try {
      app.config = applyPatch(defaultConfig(), { platform: tab === 'manifest' ? 'openshift' : 'vsphere' });
      app.tab = tab;
      const artifact = renderArtifact(app.config, tab, app.secretMode, app.deploymentMode);
      const { default: OutputPanel } = await import('./OutputPanel.svelte');
      const { body } = render(OutputPanel);
      const numbered = tab === 'ini' || tab === 'json' || tab === 'ps';
      const numbers = [...body.matchAll(/data-line="(\d+)"/g)].map((match) => Number(match[1]));
      expect(numbers).toEqual(numbered ? artifact.text.split('\n').map((_, index) => index + 1) : []);
      if (numbered) {
        expect(body).toContain('aria-hidden="true"');
        expect(body).toMatch(/<span data-line="1"><\/span>/);
      }
      const code = body.match(/<pre\b[^>]*>[\s\S]*?<code>([\s\S]*?)<\/code><\/pre>/)?.[1];
      expect(code?.replace(/<!--[\s\S]*?-->/g, '')).toBe(highlight(artifact.text, tab));
      expect(renderArtifact(app.config, tab, app.secretMode, app.deploymentMode)).toEqual(artifact);
    } finally {
      app.config = previous.config;
      app.tab = previous.tab;
    }
  });

  it('explains native deployment password prompts when parameters are omitted', async () => {
    vi.stubGlobal('document', { documentElement: { dataset: {} } });
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: () => undefined,
      removeItem: () => undefined
    });
    const { app } = await import('../lib/store.svelte');
    app.tab = 'ps';
    const { default: OutputPanel } = await import('./OutputPanel.svelte');
    const { body } = render(OutputPanel);

    expect(body).toContain('When root and Admin UI password parameters are omitted, uagdeploy and its platform variants prompt for them interactively.');
    expect(body).not.toContain('not accessible through the console');
    expect(body).toContain('Admin UI password policy:');
    expect(body).toContain('8-64 characters (14-64 on FIPS)');
    expect(body).toContain('one uppercase letter, one lowercase letter, one number');
    expect(body).toContain('only ! @ # $ % ^ &amp; * ( )');
    expect(body).toContain('Do not skip the admin password prompt');
    expect(body).toContain('PasswordRequirementsforUAG');
    expect(body).not.toContain('type="password"');
  });

  it.each(['vsphere', 'hyperv', 'azure', 'nutanix', 'openshift'] as const)('scopes unattended vSphere prerequisites and tool-version evidence to %s', async (platform) => {
    vi.stubGlobal('document', { documentElement: { dataset: {} } });
    vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => undefined, removeItem: () => undefined });
    const { app } = await import('../lib/store.svelte');
    const previous = { config: app.config, tab: app.tab, mode: app.deploymentMode };
    try {
      app.config = applyPatch(defaultConfig(), { platform });
      app.tab = 'ps';
      app.deploymentMode = 'headless';
      const { default: OutputPanel } = await import('./OutputPanel.svelte');
      const { body } = render(OutputPanel);
      expect(body.includes('<strong>Fully unattended vSphere:</strong>')).toBe(platform === 'vsphere');
      expect(body.includes('Horizon on vSphere is operator-tested with OVF Tool 5.0.')).toBe(platform === 'vsphere');
      expect(body).not.toContain('type="password"');
      if (platform === 'vsphere') {
        expect(body).toContain('Environment-password mode alone is not sufficient');
        expect(body).toContain('vi://uagdeploy@vsphere.local:PASSWORD@vcenter.example.com/DC1/host/Cluster1');
        expect(body).toContain('saved in the browser draft');
        expect(body).toContain('without password redaction, regardless of secret mode');
        expect(body).toContain('Regressions were reported with 5.1 and 9.1');
        expect(body).toContain('have not been independently verified');
      }
    } finally {
      app.config = previous.config;
      app.tab = previous.tab;
      app.deploymentMode = previous.mode;
    }
  });

  it.each([
    ['2609', true, true],
    ['2609', false, false],
    ['2606', true, false]
  ] as const)('explains administrator SAML only when active: version %s, selected %s', async (version, enabled, expected) => {
    vi.stubGlobal('document', { documentElement: { dataset: {} } });
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: () => undefined,
      removeItem: () => undefined
    });
    const { app } = await import('../lib/store.svelte');
    const previous = { config: app.config, tab: app.tab, mode: app.deploymentMode };
    try {
      app.config = applyPatch(defaultConfig(), { version, values: { adminSaml_enable: enabled } });
      app.tab = 'ps';
      app.deploymentMode = 'headless';
      const { default: OutputPanel } = await import('./OutputPanel.svelte');
      const { body } = render(OutputPanel);
      expect(body.includes('password authentication is disabled')).toBe(expected);
      expect(body).toContain('Admin UI password policy:');
      expect(body).not.toContain('type="password"');
    } finally {
      app.config = previous.config;
      app.tab = previous.tab;
      app.deploymentMode = previous.mode;
    }
  });
});
