import { describe, expect, it } from 'vitest';
import { deploymentCommand, generateIni, iniFileName } from './generate';
import { applyPatch, defaultConfig } from './model';
import { generatePowerShell } from './powershell';
import { PLATFORMS } from './versions';

describe('named deployment INI arguments', () => {
  for (const platform of PLATFORMS) {
    it.each(['interactive', 'headless'] as const)(`${platform.id} %s uses its actual script and one named INI argument`, (mode) => {
      const c = applyPatch(defaultConfig(), { platform: platform.id, values: { name: "UAG prod's 01", ocp_volumeSourceMode: 'console' } });
      const expected = `.\\${platform.script} -iniFile .\\UAG_prod_s_01.ini`;
      expect(iniFileName(c)).toBe('UAG_prod_s_01.ini');
      expect(deploymentCommand(c)).toBe(expected);
      expect(generateIni(c)).toContain(`# Deploy: ${expected}`);
      const ps = generatePowerShell(c, 'placeholder', mode);
      const invocation = ps.split('\n').find((line) => line.startsWith(`.\\${platform.script} `))!;
      expect(invocation).toContain(expected);
      expect(invocation.match(/-iniFile/g)).toHaveLength(1);
      expect(ps).toContain('Set-Content -Path .\\UAG_prod_s_01.ini -Value $ini -Encoding ASCII');
      if (mode === 'interactive' || platform.id === 'nutanix') {
        expect(invocation).not.toMatch(/-rootPwd|-adminPwd|UAG_ROOT_PASSWORD|UAG_ADMIN_PASSWORD/);
      } else if (platform.id === 'azure') {
        expect(invocation).toBe(`${expected} $env:UAG_ROOT_PASSWORD $env:UAG_ADMIN_PASSWORD no`);
      } else {
        expect(invocation).toContain('-rootPwd $env:UAG_ROOT_PASSWORD -adminPwd $env:UAG_ADMIN_PASSWORD');
      }
    });
  }

  it.each(['url', 'console'] as const)('keeps -iniFile in both OpenShift preparation flows (%s)', (source) => {
    for (const token of ['', 'example-token']) {
      const c = applyPatch(defaultConfig(), { platform: 'openshift', values: {
        name: 'uag-openshift', ocp_volumeSourceMode: source, ocp_bearerToken: token
      } });
      const ps = generatePowerShell(c, 'include', 'headless');
      const invocation = ps.split('\n').find((line) => line.startsWith('.\\uagdeployopenshift.ps1 '))!;
      expect(invocation).toContain('-iniFile .\\uag-openshift.ini');
      expect(invocation.includes('-openshiftPassword $env:OPENSHIFT_PASSWORD')).toBe(!token);
    }
  });
});
