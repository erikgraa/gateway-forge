import { describe, expect, it } from 'vitest';
import { applyPatch, defaultConfig } from './model';
import { buildTopology } from './topology';

describe('topology model', () => {
  it('reflects the enabled Horizon protocols and three-NIC roles', () => {
    const topology = buildTopology(applyPatch(defaultConfig(), {
      platform: 'vsphere',
      values: {
        uagName: 'uag-edge-01',
        deploymentOption: 'threenic',
        ip0: '192.0.2.21',
        ip1: '10.20.0.21',
        ip2: '10.30.0.21',
        horizon_enabled: true,
        blastEnabled: true,
        tunnelEnabled: true,
        pcoipEnabled: true,
        proxyDestinationUrl: 'https://cs01.corp.local'
      }
    }));

    expect(topology.nodes.find((node) => node.id === 'uag')).toMatchObject({
      sub: 'vSphere · UAG 2609 · 3-NIC',
      detail: expect.stringContaining('NIC0 internet · NIC1 management · NIC2 backend')
    });
    expect(topology.edges.find((edge) => edge.from === 'client' && edge.to === 'uag')?.label)
      .toContain('Blast TCP+UDP 8443');
    expect(topology.edges.find((edge) => edge.from === 'client' && edge.to === 'uag')?.label)
      .toContain('PCoIP TCP+UDP 4172');
    expect(topology.edges).toContainEqual(expect.objectContaining({ from: 'uag', to: 'cs', label: 'HTTPS · XML-API' }));
  });

  it('does not render disabled Horizon and identity connections', () => {
    const topology = buildTopology(applyPatch(defaultConfig(), {
      values: {
        horizon_enabled: false,
        radius_enabled: false,
        saml_enabled: false,
        blastEnabled: true,
        pcoipEnabled: true
      }
    }));

    expect(topology.nodes.map((node) => node.id)).not.toEqual(expect.arrayContaining(['client', 'cs', 'radius', 'idp']));
    expect(topology.edges).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ to: 'cs' }),
      expect.objectContaining({ to: 'radius' }),
      expect.objectContaining({ to: 'idp' })
    ]));
    expect(topology.edges.find((edge) => edge.kind === 'access')).toBeUndefined();
  });

  it('shows Content Gateway clients and the selected UEM connection', () => {
    const topology = buildTopology(applyPatch(defaultConfig(), {
      values: {
        contentGateway_enabled: true,
        contentGateway_mode: 'standalone',
        contentGateway_apiServerUrl: 'https://uem.example.com',
        contentGateway_airwatchServerHostname: 'content.example.com'
      }
    }));
    expect(topology.nodes).toContainEqual(expect.objectContaining({ id: 'content-gateway-client', sub: 'content.example.com' }));
    expect(topology.nodes).toContainEqual(expect.objectContaining({ id: 'content-uem', sub: 'uem.example.com' }));
    expect(topology.edges).toContainEqual(expect.objectContaining({ from: 'content-gateway-client', to: 'uag' }));
  });

  it('routes an inner cascade through an external outer-UAG peer', () => {
    const topology = buildTopology(applyPatch(defaultConfig(), {
      values: {
        cascade_role: 'inner',
        horizon_enabled: true,
        proxyDestinationUrl: 'https://cs01.corp.local'
      }
    }));

    expect(topology.nodes.map((node) => node.id)).toEqual(expect.arrayContaining(['client', 'outer', 'uag', 'cs']));
    expect(topology.edges).toContainEqual(expect.objectContaining({ from: 'client', to: 'outer', kind: 'access' }));
    expect(topology.edges).toContainEqual(expect.objectContaining({ from: 'outer', to: 'uag', kind: 'cascade' }));
    expect(topology.edges).not.toEqual(expect.arrayContaining([expect.objectContaining({ from: 'client', to: 'uag' })]));
    expect(topology.description).toContain('Outer UAG connects to UAG using Cascade to DMZ 2');
  });

  it('shows an outer cascade target without a stale Horizon edge', () => {
    const topology = buildTopology(applyPatch(defaultConfig(), {
      values: {
        horizon_enabled: false,
        cascade_role: 'outer',
        cascade_innerUrl: 'https://uag-dmz2.corp.local',
        cascade_fwdBlastTcp: true,
        cascade_fwdBlastUdp: true
      }
    }));

    expect(topology.nodes.find((node) => node.id === 'inner')).toMatchObject({
      sub: 'uag-dmz2.corp.local',
      detail: 'Cascade · TCP 8443 · UDP 8443'
    });
    expect(topology.nodes.map((node) => node.id)).not.toContain('cs');
    expect(topology.edges).toContainEqual(expect.objectContaining({ from: 'uag', to: 'inner', kind: 'cascade' }));
  });
});
