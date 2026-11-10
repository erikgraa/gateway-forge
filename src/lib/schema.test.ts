import { describe, expect, it } from 'vitest';
import { GROUPS, LISTS, SECTIONS } from './schema';

describe('schema integrity', () => {
  it('places Quiesce mode last in Appliance without changing its default or vendor key', () => {
    const field = GROUPS.find((group) => group.id === 'appliance')!.fields.at(-1)!;
    expect(field.id).toBe('quiesceMode');
    expect(field.key).toBe('quiesceMode');
    expect(field.default).toBe(false);
  });
  it('orders shared setup before optional edge service editors', () => {
    expect(SECTIONS.map((section) => section.id)).toEqual([
      'general',
      'network',
      'tls',
      'auth',
      'monitoring',
      'adminUsers',
      'ha',
      'services',
      'horizon',
      'wrp',
      'tunnel',
      'contentGateway',
      'seg',
      'templates'
    ]);
  });

  it('defaults the Horizon UDP tunnel server to disabled', () => {
    const field = GROUPS.find((group) => group.id === 'horizon')!.fields
      .find((candidate) => candidate.id === 'udpTunnelServerEnabled')!;
    expect(field.default).toBe(false);
  });

  it('edits the session timeout in minutes while retaining the vendor scale', () => {
    const field = GROUPS.find((group) => group.id === 'timeouts')!.fields
      .find((candidate) => candidate.id === 'sessionTimeout')!;
    expect(field.label).toBe('Session timeout (min)');
    expect(field.default).toBe(600);
    expect(field.exportScale).toBe(60000);
  });

  it('explains that Workspace ONE UEM passwords are runtime-only', () => {
    const tunnel = GROUPS.find((group) => group.id === 'airwatch')!.fields
      .find((field) => field.id === 'airwatch_apiServerUsername')!;
    const contentGateway = GROUPS.find((group) => group.id === 'contentGateway')!.fields
      .find((field) => field.id === 'contentGateway_apiServerUsername')!;
    expect(tunnel.help).toContain('UAG_WORKSPACE_ONE_UEM_API_PASSWORD');
    expect(tunnel.help).toContain('only at PowerShell runtime');
    expect(contentGateway.help).toContain('UAG_CONTENT_GATEWAY_API_PASSWORD');
    expect(contentGateway.help).toContain('interactive mode');
  });

  it('describes Horizon cascade roles as UAG types with standalone as the default', () => {
    const group = GROUPS.find((candidate) => candidate.id === 'cascade')!;
    const role = group.fields.find((field) => field.id === 'cascade_role')!;
    expect(group.title).toBe('UAG type');
    expect(role.label).toBe('UAG type');
    expect(role.default).toBe('none');
    expect(role.options?.find((option) => option.value === 'none')?.label).toContain('default');
  });

  it('uses unique field and select-option keys within each group', () => {
    expect(new Set(GROUPS.map((group) => group.id)).size).toBe(GROUPS.length);
    for (const group of GROUPS) {
      const ids = group.fields.map((field) => field.id);
      expect(new Set(ids).size, group.id).toBe(ids.length);
      for (const field of group.fields) {
        if (!field.options) continue;
        const values = field.options.map((option) => option.value);
        expect(new Set(values).size, `${group.id}.${field.id}`).toBe(values.length);
      }
    }
  });

  it('keeps network addressing separate from deployment target settings', () => {
    const deploy = GROUPS.find((group) => group.id === 'deploy')!;
    const networking = GROUPS.find((group) => group.id === 'networking')!;
    expect(deploy.fields.map((field) => field.id)).not.toContain('netInternet');
    expect(networking.fields.map((field) => field.id)).toEqual(expect.arrayContaining([
      'netInternet',
      'ip0',
      'defaultGateway',
      'routes0',
      'ipmode0',
      'v6ip0',
      'eth0CustomConfig'
    ]));
    expect(networking.fields.find((field) => field.id === 'netManagementNetwork')?.placeholder).toBe('Management');
    expect(networking.fields.find((field) => field.id === 'netBackendNetwork')?.placeholder).toBe('Backend');
    expect(networking.fields.find((field) => field.id === 'routes0')?.placeholder).toBe('10.108.172.32/32 10.108.172.253');
  });
  it('provides required addressing modes and multi-NIC IP examples', () => {
    for (const groupId of ['networking', 'native-ipv4']) {
      const group = GROUPS.find((candidate) => candidate.id === groupId)!;
      const modePrefix = groupId === 'networking' ? 'ipmode' : 'ipMode';
      expect(group.fields.find((field) => field.id === `${modePrefix}0`)?.default).toBeUndefined();
      expect(group.fields.find((field) => field.id === `${modePrefix}1`)?.default).toBeUndefined();
      expect(group.fields.find((field) => field.id === `${modePrefix}2`)?.default).toBeUndefined();
      expect(group.fields.find((field) => field.id === `${modePrefix}0`)?.options?.some((option) => option.value === '')).toBe(true);
      expect(group.fields.find((field) => field.id === 'ip1')?.placeholder).toBe('10.20.10.21');
      expect(group.fields.find((field) => field.id === 'netmask1')?.placeholder).toBe('255.255.255.0');
      expect(group.fields.find((field) => field.id === 'ip2')?.placeholder).toBe('172.16.10.21');
      expect(group.fields.find((field) => field.id === 'netmask2')?.placeholder).toBe('255.255.255.0');
    }
  });
  it('shows a thumbprint example for web reverse proxy destinations', () => {
    const wrp = LISTS.find((list) => list.id === 'wrp')!;
    expect(wrp.fields.find((field) => field.id === 'proxyDestinationUrlThumbprints')?.placeholder)
      .toContain('sha256=');
  });
  it('shows an optional URL thumbprint example for SAML identity providers', () => {
    const saml = GROUPS.find((group) => group.id === 'saml')!;
    expect(saml.fields.find((field) => field.id === 'saml_idpUrlThumbprints')?.placeholder)
      .toContain('sha256=');
  });
  it('shows and validates Syslog TLS certificate examples as PEM paths', () => {
    const fields = LISTS.find((list) => list.id === 'syslog')!.fields;
    for (const id of ['syslogServerCACertPemV2', 'syslogClientCertPemV2', 'syslogClientCertKeyPemV2']) {
      const field = fields.find((candidate) => candidate.id === id)!;
      expect(field.rule).toBe('pemPath');
      expect(field.placeholder).toMatch(/\.(pem|crt|cer)$/i);
    }
  });
  it('provides required addressing modes and multi-NIC IP examples', () => {
    for (const groupId of ['networking', 'native-ipv4']) {
      const group = GROUPS.find((candidate) => candidate.id === groupId)!;
      const modePrefix = groupId === 'networking' ? 'ipmode' : 'ipMode';
      expect(group.fields.find((field) => field.id === `${modePrefix}0`)?.default).toBeUndefined();
      expect(group.fields.find((field) => field.id === `${modePrefix}1`)?.default).toBeUndefined();
      expect(group.fields.find((field) => field.id === `${modePrefix}2`)?.default).toBeUndefined();
      expect(group.fields.find((field) => field.id === `${modePrefix}0`)?.options?.some((option) => option.value === '')).toBe(true);
      expect(group.fields.find((field) => field.id === 'ip1')?.placeholder).toBe('10.20.10.21');
      expect(group.fields.find((field) => field.id === 'netmask1')?.placeholder).toBe('255.255.255.0');
      expect(group.fields.find((field) => field.id === 'ip2')?.placeholder).toBe('172.16.10.21');
      expect(group.fields.find((field) => field.id === 'netmask2')?.placeholder).toBe('255.255.255.0');
    }
  });
});
