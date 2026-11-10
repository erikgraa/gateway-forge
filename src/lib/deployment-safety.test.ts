import { describe, expect, it } from 'vitest';
import { vmReplacementWarning } from './deployment-safety';
import { generateIni, generateJson } from './generate';
import { applyPatch, defaultConfig } from './model';
import { generatePowerShell } from './powershell';
import { generateDocs } from './topology';
import { PLATFORMS } from './versions';

describe('VM replacement deployment warnings', () => {
  it('includes Azure resource-group, disk and unconditional NIC deletion scope only for Azure', () => {
    const warning = vmReplacementWarning('azure');
    expect(warning).toContain('configured Azure resource group');
    expect(warning).toContain('deletes the VM OS disk');
    expect(warning).toContain('name-eth0, name-eth1, and name-eth2');
    expect(warning).toContain('even if no matching VM exists');
    for (const platform of PLATFORMS.filter((p) => p.id !== 'azure')) {
      expect(vmReplacementWarning(platform.id)).not.toContain('VM OS disk');
      expect(vmReplacementWarning(platform.id)).not.toContain('name-eth0');
    }
  });

  it('explains the Nutanix cluster scope and duplicate-name abort', () => {
    const warning = vmReplacementWarning('nutanix');
    expect(warning).toContain('selected cluster');
    expect(warning).toContain('Exactly one matching VM is deleted; multiple matches abort deployment');
  });

  it('explains OpenShift namespace scoping and deletion before creation without claiming PVC deletion', () => {
    const warning = vmReplacementWarning('openshift');
    expect(warning).toContain('configured namespace');
    expect(warning).toContain('waits for VM deletion before creating the replacement');
    expect(warning).not.toMatch(/PVC|disk/);
  });
  it.each(PLATFORMS.map((platform) => platform.id))('warns before executable deployment for %s without adding configuration keys', (platform) => {
    const c = applyPatch(defaultConfig(), { platform, values: { name: 'deployment-vm', uagName: 'appliance-host' } });
    const original = structuredClone(c);
    const warning = vmReplacementWarning(platform);
    expect(warning).toContain('deletes and recreates');
    for (const mode of ['interactive', 'headless'] as const) {
      const ps = generatePowerShell(c, 'placeholder', mode);
      expect(ps.replace(/\n# /g, ' ')).toContain(`WARNING: ${warning}`);
      const warningIndex = ps.indexOf('# WARNING:');
      expect(warningIndex).toBeLessThan(ps.indexOf("$ini = @'"));
      expect(warningIndex).toBeLessThan(ps.indexOf(`.\\${PLATFORMS.find((p) => p.id === platform)!.script} -iniFile`));
      for (const line of ps.slice(warningIndex, ps.indexOf('# Prerequisites:')).trim().split('\n')) {
        expect(line).toMatch(/^#/);
        expect(line.length).toBeLessThanOrEqual(60);
      }
    }
    const docs = generateDocs(c, []);
    expect(docs).toContain(`**WARNING:** ${warning}`);
    expect(docs.indexOf('**WARNING:**')).toBeLessThan(docs.indexOf('- Run:'));
    expect(warning).toContain('VM name ([General] name)');
    expect(generateIni(c)).toContain('name=deployment-vm');
    expect(generateIni(c)).toContain('uagName=appliance-host');
    expect(generateIni(c)).not.toContain('plan downtime');
    expect(generateJson(c)).not.toContain('plan downtime');
    expect(c).toEqual(original);
  });
});
