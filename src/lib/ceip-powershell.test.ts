import { describe, expect, it } from 'vitest';
import { applyPatch, defaultConfig } from './model';
import { generateIni, generateJson } from './generate';
import { importIni } from './importer';
import { generatePowerShell, MISSING_PASSWORD_WARNING, VSPHERE_HEADLESS_GUIDANCE } from './powershell';
import { generateDocs } from './topology';
import { PLATFORMS } from './versions';

const states = [false, true] as const;
const modes = ['interactive', 'headless'] as const;
const secrets = ['include', 'placeholder', 'omit'] as const;

function invocation(ps: string, script: string): string {
  return ps.split('\n').find((line) => line.startsWith(`.\\${script} `))!;
}

describe('explicit deployment CEIP', () => {
  for (const platform of PLATFORMS) {
    for (const mode of modes) {
      it.each(states)(`${platform.id} ${mode} passes CEIP %s once without changing config or INI/JSON`, (enabled) => {
        const c = applyPatch(defaultConfig(), { platform: platform.id, values: { name: 'ceip-test', ceipEnabled: enabled } });
        const before = JSON.stringify(c);
        const ini = generateIni(c);
        const json = generateJson(c);
        for (const secret of secrets) {
          const ps = generatePowerShell(c, secret, mode);
          const command = invocation(ps, platform.script);
          expect(command).toContain(` -ceipEnabled '${enabled ? 'yes' : 'no'}'`);
          expect(command.match(/-ceipEnabled/g)).toHaveLength(1);
          expect(command).not.toMatch(/\$env:UAG_ADMIN_PASSWORD (?:yes|no)(?: |$)/);
          const prose = ps.replace(/\n# /g, ' ');
          expect(prose).toContain(MISSING_PASSWORD_WARNING);
          expect(prose.includes(VSPHERE_HEADLESS_GUIDANCE)).toBe(platform.id === 'vsphere');
          expect(ps).not.toMatch(/headless/i);
          if (platform.id === 'nutanix' || mode === 'interactive') {
            expect(command).not.toMatch(/UAG_ROOT_PASSWORD|UAG_ADMIN_PASSWORD/);
          } else {
            expect(command).toContain('$env:UAG_ROOT_PASSWORD');
            expect(command).toContain('$env:UAG_ADMIN_PASSWORD');
          }
        }
        expect(JSON.stringify(c)).toBe(before);
        expect(generateIni(c)).toBe(ini);
        expect(generateJson(c)).toBe(json);
        expect(ini).toContain(`ceipEnabled=${enabled}`);
      });
    }
  }

  for (const source of ['url', 'console']) {
    for (const token of ['', 'synthetic-token']) {
      it.each(states)(`OpenShift ${source}, token=${!!token} respects CEIP %s and credential selection`, (enabled) => {
        const c = applyPatch(defaultConfig(), { platform: 'openshift', values: {
          ceipEnabled: enabled, ocp_volumeSourceMode: source, ocp_bearerToken: token
        } });
        for (const secret of secrets) {
          const command = invocation(generatePowerShell(c, secret, 'headless'), 'uagdeployopenshift.ps1');
          expect(command).toContain(` -ceipEnabled '${enabled ? 'yes' : 'no'}'`);
          expect(command.match(/-ceipEnabled/g)).toHaveLength(1);
          expect(command.includes('-openshiftPassword')).toBe(secret === 'omit' || !token);
        }
      });
    }
  }

  it.each(states)('maps imported INI boolean %s to command-line strings', (enabled) => {
    const c = importIni(`[General]\nname=imported\nceipEnabled=${enabled}\n`).config;
    expect(c.values.ceipEnabled).toBe(enabled);
    expect(invocation(generatePowerShell(c), 'uagdeploy.ps1')).toContain(`-ceipEnabled '${enabled ? 'yes' : 'no'}'`);
  });

  it('defaults absent CEIP to explicitly disabled and explains remaining prompts in the runbook', () => {
    const c = defaultConfig();
    delete c.values.ceipEnabled;
    expect(invocation(generatePowerShell(c), 'uagdeploy.ps1')).toContain("-ceipEnabled 'no'");
    const docs = generateDocs(c, []);
    expect(docs).toContain('vCenter password');
    expect(docs).toContain(MISSING_PASSWORD_WARNING);
    expect(docs).toContain(VSPHERE_HEADLESS_GUIDANCE);
    expect(docs).toContain('operator-tested with OVF Tool 5.0');
    expect(docs).toContain('without password redaction, regardless of secret mode');
    expect(docs).toContain('removing that prompt only');
    expect(docs).not.toMatch(/headless/i);
  });
});
