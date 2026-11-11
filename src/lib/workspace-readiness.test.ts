import { describe, expect, it } from 'vitest';
import { addMember, copy, fleetExportIssues, unlockFleet } from './fleet';
import { fleetBundle } from './fleet-export';
import { createWorkspace, emptyRegistry, registryShape, savedRegistry, upgradedRegistry, type Scenario } from './scenario-workspaces';
import { normalizeConfig } from './ordinary-whitespace';
import { validateConfig } from './validate';
import { workspaceExportReadiness } from './workspace-readiness';

function validWorkspace(scenario: Scenario) {
  const workspace = createWorkspace(scenario, scenario);
  const config = workspace.fleet?.members[0].config ?? workspace.config;
  Object.assign(config.values, {
    name: 'fixture-uag', uagName: 'fixture-uag', source: 'C:\\images\\fixture.ova',
    target: 'vi://operator@vc.example.com/DC%20One/host/Compute', ds: 'Datastore',
    deploymentOption: 'threenic', netInternet: 'DMZ', netManagementNetwork: 'Management', netBackendNetwork: 'Backend',
    ipmode0: 'STATICV4', ipmode1: 'STATICV4', ipmode2: 'STATICV4',
    ip0: '198.51.100.21', netmask0: '255.255.255.0', ip1: '192.0.2.21', netmask1: '255.255.255.0',
    ip2: '198.18.0.21', netmask2: '255.255.255.0', defaultGateway: '198.51.100.1',
    dns: '192.0.2.53', ntpServers: 'ntp.example.com', proxyDestinationUrl: 'https://cs.example.com'
  });
  if (scenario === 'web') config.wrp = [{ instanceId: 'web', proxyDestinationUrl: 'https://web.example.com', proxyPattern: '/(.*)', authMethods: 'passthrough' }];
  if (workspace.fleet) { unlockFleet(workspace.fleet); workspace.config = copy(config); }
  return workspace;
}

describe('Saved-workspace checked export readiness', () => {
  it.each(['single', 'web', 'horizon'] as const)('matches checked export rules for a valid %s draft with advisory warnings', scenario => {
    const workspace = validWorkspace(scenario), before = JSON.stringify(workspace);
    const issues = workspace.fleet ? fleetExportIssues(workspace.fleet) : validateConfig(normalizeConfig(workspace.config));
    const status = workspaceExportReadiness(workspace);
    expect(status).toMatchObject({ ready: true, blocking: 0, warnings: issues.filter(issue => issue.level === 'warn').length, planningRequired: false });
    expect(status.warnings).toBeGreaterThanOrEqual(2);
    expect(status.format).toBe(scenario === 'horizon' ? 'Fleet ZIP' : 'INI / JSON');
    if (workspace.fleet) expect(() => fleetBundle(workspace.fleet!)).not.toThrow();
    expect(JSON.stringify(workspace)).toBe(before);
  });

  it.each(['single', 'web', 'horizon'] as const)('marks blank %s drafts blocked without inventing configuration values', scenario => {
    const workspace = createWorkspace(scenario, scenario), before = JSON.stringify(workspace);
    expect(workspaceExportReadiness(workspace)).toMatchObject({ ready: false });
    expect(workspaceExportReadiness(workspace).blocking).toBeGreaterThan(0);
    expect(JSON.stringify(workspace)).toBe(before);
  });

  it.each(['single', 'web', 'horizon'] as const)('reflects missing and corrected compute inventory paths in %s', scenario => {
    const workspace = validWorkspace(scenario), config = workspace.fleet?.members[0].config ?? workspace.config;
    for (const target of ['vi://operator@vc.example.com', 'vi://@vc.example.com/DC/host/Compute', 'vi://operator@/DC/host/Compute']) {
      config.values.target = target;
      expect(workspaceExportReadiness(workspace)).toMatchObject({ ready: false, blocking: 1 });
    }
    config.values.target = 'vi://operator@vc.example.com/DC%20One/host/Compute/Resources/UAG';
    expect(workspaceExportReadiness(workspace)).toMatchObject({ ready: true, blocking: 0 });
    expect(config.values.target).toBe('vi://operator@vc.example.com/DC%20One/host/Compute/Resources/UAG');
  });

  it('uses fleet ZIP prerequisites without blocking the otherwise valid baseline INI', () => {
    const workspace = validWorkspace('horizon'); workspace.fleet!.unlocked = false;
    expect(validateConfig(normalizeConfig(workspace.config)).filter(issue => issue.level === 'error')).toEqual([]);
    expect(workspaceExportReadiness(workspace)).toMatchObject({ ready: false, blocking: 1, planningRequired: true, format: 'Fleet ZIP' });
    expect(() => fleetBundle(workspace.fleet!)).toThrow();
    unlockFleet(workspace.fleet!);
    expect(workspaceExportReadiness(workspace)).toMatchObject({ ready: true, planningRequired: false });
  });

  it('rejects an empty active fleet instead of treating zero member errors as ready', () => {
    const workspace = validWorkspace('horizon'); workspace.fleet!.members[0].removed = true;
    expect(workspaceExportReadiness(workspace)).toMatchObject({ ready: false, blocking: 1 });
    expect(() => fleetBundle(workspace.fleet!)).toThrow();
  });

  it('includes collision and member errors from the actual fleet rather than a stale workspace snapshot', () => {
    const workspace = validWorkspace('horizon'), fleet = workspace.fleet!;
    const member = addMember(fleet, fleet.groups[0]);
    Object.assign(member.config.values, { ip0: fleet.members[0].config.values.ip0, ip1: '192.0.2.22', ip2: '198.18.0.22' });
    expect(workspaceExportReadiness(workspace).blocking).toBe(2);
    expect(() => fleetBundle(fleet)).toThrow();
    member.config.values.ip0 = '198.51.100.22';
    expect(workspaceExportReadiness(workspace)).toMatchObject({ ready: true });
    expect(() => fleetBundle(fleet)).not.toThrow();
  });

  it('preserves saved edits, omission of recognized secrets and opaque import metadata across reload', () => {
    const workspace = validWorkspace('single'); workspace.config.values.adminPassword = 'Fixture-Only-123!';
    workspace.retainedImports.push({ filename: 'future.json', raw: 'private fixture content' });
    const registry = { ...emptyRegistry(), drafts: [workspace] }, before = JSON.stringify(registry);
    const initial = workspaceExportReadiness(workspace);
    expect(JSON.stringify(registry)).toBe(before);
    const saved = savedRegistry(registry);
    expect(JSON.stringify(saved)).not.toContain('Fixture-Only-123!');
    expect(JSON.stringify(saved)).not.toContain('private fixture content');
    const resumed = upgradedRegistry(JSON.parse(JSON.stringify(saved)));
    expect(workspaceExportReadiness(resumed.drafts[0])).toEqual(initial);
    resumed.drafts[0].config.values.target = 'vi://operator@vc.example.com';
    const reloaded = upgradedRegistry(JSON.parse(JSON.stringify(savedRegistry(resumed))));
    expect(workspaceExportReadiness(reloaded.drafts[0])).toMatchObject({ ready: false, blocking: 1 });
    expect(workspaceExportReadiness(workspace)).toEqual(initial);
  });

  it('keeps unsupported storage outside the supported registry without rewriting it', () => {
    const registry = { ...emptyRegistry(), drafts: [validWorkspace('single')] };
    registry.drafts[0].config.version = '9999'; const raw = JSON.stringify(registry);
    expect(registryShape(registry)).toBe(false);
    expect(JSON.stringify(registry)).toBe(raw);
  });
});
