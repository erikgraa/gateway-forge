import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import { defaultConfig } from '../lib/model';
import { TEMPLATES } from '../lib/templates';
import { buildTopology } from '../lib/topology';
import TemplateVisual from './TemplateVisual.svelte';

describe('template architecture previews', () => {
  it.each(TEMPLATES)('renders the actual connections for $id without modifying the base configuration', (template) => {
    const base = defaultConfig();
    const snapshot = JSON.stringify(base);
    const config = template.build(base);
    const topology = buildTopology(config);
    const body = render(TemplateVisual, { props: { config, title: template.title } }).body;

    expect(body).toContain('role="img"');
    expect(body).toContain('Architecture preview:');
    expect(body).toContain('Example architecture');
    expect(body.match(/class="connection /g)).toHaveLength(topology.edges.length);
    expect(body.match(/class="node /g)).toHaveLength(topology.nodes.length);
    expect(body).not.toMatch(/NaN|undefined/);
    expect(JSON.stringify(base)).toBe(snapshot);
  });

  it('shows the distinct cascade, identity and deployment details', () => {
    const bodyFor = (id: string) => {
      const template = TEMPLATES.find((candidate) => candidate.id === id)!;
      return render(TemplateVisual, { props: { config: template.build(defaultConfig()), title: template.title } }).body;
    };
    expect(bodyFor('cascade-outer')).toContain('Inner UAG');
    expect(bodyFor('cascade-inner')).toContain('Outer UAG');
    expect(bodyFor('horizon-radius')).toContain('RADIUS / MFA');
    expect(bodyFor('horizon-saml')).toContain('SAML IdP');
    expect(bodyFor('hardened')).toContain('SNMPv3');
    expect(bodyFor('workspace-one-tunnel')).toContain('Tunnel clients');
    expect(bodyFor('workspace-one-content-gateway')).toContain('Content clients');
    expect(bodyFor('nutanix-ahv')).toContain('Nutanix AHV');
    expect(bodyFor('openshift-virtualization')).toContain('OpenShift');
    expect(bodyFor('horizon-basic')).toContain('1 NIC');
  });
});
