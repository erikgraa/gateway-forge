import { describe, expect, it } from 'vitest';
import { applyPatch, defaultConfig } from './model';
import { generateIni, generateJsonObject } from './generate';
import { importIni } from './importer';
import { ADMIN_PASSWORD_GUIDANCE, adminSamlEnabled, generatePowerShell } from './powershell';
import { generateDocs } from './topology';
import { PLATFORMS } from './versions';

const modes = ['interactive', 'headless'] as const;

function deploymentConfig() {
  return applyPatch(defaultConfig(), { values: {
    horizon_enabled: true,
    proxyDestinationUrl: 'https://cs.example.com',
    blastEnabled: true,
    blastExternalUrl: 'https://vdi.example.com:443',
    cert_mode: 'PFX',
    cert_pfxCerts: 'C:\\certs\\internet-facing.pfx',
    cert_pfxCertAlias: 'public-tls'
  } });
}

describe('admin password deployment guidance', () => {
  for (const platform of PLATFORMS) {
    it.each(modes)(`${platform.id} %s explains policy without collecting passwords or losing Horizon/PFX INI`, (mode) => {
      const c = applyPatch(deploymentConfig(), { platform: platform.id });
      const before = JSON.stringify(c);
      const ini = generateIni(c);
      const ps = generatePowerShell(c, 'placeholder', mode);
      expect(ps).toContain(`# ${ADMIN_PASSWORD_GUIDANCE}`);
      expect(ps).toContain('Do not skip the Admin UI password prompt');
      expect(ps).toContain(ini.trimEnd());
      expect(ini).toContain('[Horizon]\nproxyDestinationUrl=https://cs.example.com');
      expect(ini).toContain('[SSLCert]\npfxCerts=C:\\certs\\internet-facing.pfx\npfxCertAlias=public-tls');
      expect(ini).not.toContain('UAG_ADMIN_PASSWORD');
      expect(ini).not.toContain(ADMIN_PASSWORD_GUIDANCE);
      expect(generateJsonObject(c)).not.toHaveProperty('pfxCertStoreWrapper');
      expect(JSON.stringify(c)).toBe(before);
      expect(generateDocs(c, [])).toContain(ADMIN_PASSWORD_GUIDANCE);
    });
  }

  it.each([8, 14, 20, 64])('always emits configured minimum %s under General and in settings JSON', (minimum) => {
    const c = applyPatch(defaultConfig(), { values: { adminPasswordPolicyMinLen: minimum } });
    const ini = generateIni(c);
    const general = ini.split('[General]\n')[1].split('\n[')[0];
    expect(general).toContain(`adminpasswordPolicyMinLen=${minimum}\n`);
    expect(ini.match(/^adminpasswordPolicyMinLen=/gm)).toHaveLength(1);
    expect(ini).not.toContain('adminPasswordPOlicyMinLen');
    expect(generateJsonObject(c).systemSettings).toHaveProperty('adminpasswordPolicyMinLen', minimum);
  });

  it('keeps older imports explicit without changing the existing default minimum', () => {
    const c = importIni('[General]\nname=imported\n').config;
    expect(c.values.adminPasswordPolicyMinLen).toBe(8);
    expect(generateIni(c)).toContain('adminpasswordPolicyMinLen=8\n');
    expect(importIni(generateIni(deploymentConfig())).config.values).toMatchObject({
      horizon_enabled: true,
      proxyDestinationUrl: 'https://cs.example.com',
      cert_pfxCerts: 'C:\\certs\\internet-facing.pfx',
      cert_pfxCertAlias: 'public-tls',
      adminPasswordPolicyMinLen: 8
    });
  });

  it.each([
    ['2609', true, true],
    ['2609', false, false],
    ['2606', true, false]
  ] as const)('warns about administrator SAML only when exported: version %s, enabled %s', (version, enabled, expected) => {
    const c = applyPatch(defaultConfig(), { version, values: { adminSaml_enable: enabled } });
    expect(adminSamlEnabled(c)).toBe(expected);
    expect(generateIni(c).includes('[adminSAMLSettings]')).toBe(expected);
    expect(generatePowerShell(c).includes('default admin password authentication is disabled')).toBe(expected);
    expect(generateDocs(c, []).includes('default admin password authentication is disabled')).toBe(expected);
    expect(c.values.adminSaml_enable).toBe(enabled);
  });
});
