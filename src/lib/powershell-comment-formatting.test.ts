import { describe, expect, it } from 'vitest';
import { applyPatch, defaultConfig } from './model';
import { generateIni, generateBootableVolumeManifest } from './generate';
import { ADMIN_PASSWORD_GUIDANCE, MISSING_PASSWORD_WARNING, VSPHERE_HEADLESS_GUIDANCE, generatePowerShell } from './powershell';
import { VCENTER_CREDENTIAL_TARGET_EXAMPLE } from './vcenterTarget';
import { PLATFORMS } from './versions';

const modes = ['interactive', 'headless'] as const;
const key = `ssh-rsa AAAAB3NzaC1yc2E${'A'.repeat(100)} synthetic-comment-with-a-long-unbroken-token`;

function paragraph(ps: string, startsWith: string): string {
  const start = ps.indexOf(startsWith);
  expect(start).toBeGreaterThanOrEqual(0);
  return ps.slice(start).split('\n\n')[0];
}

function prose(block: string): string {
  const lines = block.split('\n');
  for (const line of lines) {
    expect(line.startsWith('# ')).toBe(true);
    expect(line.length).toBeLessThanOrEqual(60);
  }
  return lines.map((line) => line.slice(2)).join(' ');
}

describe('PowerShell guidance readability', () => {
  for (const platform of PLATFORMS) {
    it.each(modes)(`${platform.id} %s wraps prose and separates topics without rewriting embedded files`, (mode) => {
      const c = applyPatch(defaultConfig(), { platform: platform.id, values: {
        name: 'comment-format-test', sshEnabled: true, sshKeyAccessEnabled: true,
        sshPublicKeys: key, sshPublicKeyNames: 'synthetic-key.pub'
      } });
      const before = JSON.stringify(c);
      const ps = generatePowerShell(c, 'placeholder', mode);
      expect(ps).toContain('# 2. Deploy the appliance\n\n# When root');
      expect(prose(paragraph(ps, '# When root'))).toBe(MISSING_PASSWORD_WARNING);
      expect(prose(paragraph(ps, '# Admin UI passwords:'))).toBe(ADMIN_PASSWORD_GUIDANCE);
      expect(ps).toContain('# only ! @ # $ % ^ & * ( ) are allowed special characters.\n');
      expect(prose(paragraph(ps, '# Do not skip'))).toBe('Do not skip the Admin UI password prompt if password-based admin access is required. Verify the password policy for your UAG release and deployment package.');
      if (platform.id === 'vsphere') {
        expect(prose(paragraph(ps, '# Fully unattended vSphere:'))).toBe(`Fully unattended vSphere: ${VSPHERE_HEADLESS_GUIDANCE}`);
        expect(ps).toContain(`# ${VCENTER_CREDENTIAL_TARGET_EXAMPLE}\n`);
      }
      expect(ps).toContain(`$ini = @'\n${generateIni(c).trimEnd()}\n'@`);
      expect(ps).toContain(`$sshKey = @'\n${key}\n'@\nSet-Content -Path .\\synthetic-key.pub -Value $sshKey -Encoding ASCII`);
      if (platform.id === 'openshift') {
        expect(ps).toContain(`$yaml = @'\n${generateBootableVolumeManifest(c).trimEnd()}\n'@`);
      }
      expect(JSON.stringify(c)).toBe(before);
    });
  }
});
