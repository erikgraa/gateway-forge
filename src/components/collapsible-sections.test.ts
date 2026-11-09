import { render } from 'svelte/server';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { GROUPS, LISTS } from '../lib/schema';

let app: typeof import('../lib/store.svelte').app;
let GroupCard: typeof import('./GroupCard.svelte').default;
let LintPanel: typeof import('./LintPanel.svelte').default;
let ListEditor: typeof import('./ListEditor.svelte').default;
let Templates: typeof import('./Templates.svelte').default;
let Topology: typeof import('./Topology.svelte').default;

beforeAll(async () => {
  vi.stubGlobal('document', { documentElement: { dataset: {} } });
  vi.stubGlobal('localStorage', {
    getItem: () => null,
    setItem: () => undefined,
    removeItem: () => undefined
  });
  ({ app } = await import('../lib/store.svelte'));
  ({ default: GroupCard } = await import('./GroupCard.svelte'));
  ({ default: LintPanel } = await import('./LintPanel.svelte'));
  ({ default: ListEditor } = await import('./ListEditor.svelte'));
  ({ default: Templates } = await import('./Templates.svelte'));
  ({ default: Topology } = await import('./Topology.svelte'));
});

describe('collapsible section cards', () => {
  it('renders major section cards open by default', () => {
    const group = GROUPS.find((candidate) => candidate.id === 'deploy')!;
    expect(render(GroupCard, { props: { group, issues: [] } }).body).toMatch(/<details class="card collapsible-card" open(?:=""|)>/);
    expect(render(Topology).body).toMatch(/<details class="card topo collapsible-card" open(?:=""|)/);
    expect(render(LintPanel, { props: { issues: [] } }).body).toMatch(/<details class="card collapsible-card" open(?:=""|)/);
    expect(render(Templates).body).toMatch(/<details class="card collapsible-card" open(?:=""|)>/);
  });

  it('explains hidden SSH controls and removes explanations when prerequisites are enabled', () => {
    const group = GROUPS.find((candidate) => candidate.id === 'appliance')!;
    const previous = { ...app.config.values };
    try {
      app.config.values.sshEnabled = false;
      let body = render(GroupCard, { props: { group, issues: [] } }).body;
      expect(body).toContain('Hidden settings — how to enable them');
      expect(body).toContain('Enable SSH and SSH key access');
      expect(body).not.toContain('id="f-sshPort"');
      app.config.values.sshEnabled = true;
      app.config.values.sshKeyAccessEnabled = true;
      body = render(GroupCard, { props: { group, issues: [] } }).body;
      expect(body).toContain('id="f-sshPort"');
      expect(body).not.toContain('Hidden settings — how to enable them');
    } finally {
      app.config.values = previous;
    }
  });

  it('renders list instances open by default inside a collapsible list', () => {
    const list = LISTS.find((candidate) => candidate.id === 'wrp')!;
    const previous = [...app.config.wrp];
    app.config.wrp = [{ instanceId: 'test', proxyDestinationUrl: 'https://example.test' }];
    try {
      const body = render(ListEditor, { props: { list, issues: [] } }).body;
      expect(body).toMatch(/<details class="card collapsible-card" open(?:=""|)>/);
      expect(body).toMatch(/<details class="list-item collapsible-item" open(?:=""|)>/);
    } finally {
      app.config.wrp = previous;
    }
  });
});
