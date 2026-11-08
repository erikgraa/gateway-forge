import type { Config } from './model';
import { generateIni, generateJson, iniFileName, jsonFileName, platformScript, type SecretMode } from './generate';
import { platformDef } from './versions';
import { sshPublicKeys } from './ssh';

const psq = (s: string) => `'${s.replace(/'/g, "''")}'`;

/** Run-time switches for the deploy script (not INI settings). */
export function runtimeSwitches(c: Config): string {
  let s = '';
  if (c.values.run_noSSLVerify === true) s += ' -noSSLVerify';
  if (c.platform === 'vsphere' && c.values.run_disableVerification === true) s += ' -disableVerification';
  return s;
}

/** PowerShell that writes the INI and runs the deployment script. */
export function generatePowerShell(c: Config, mode: SecretMode = 'placeholder'): string {
  const ini = generateIni(c, { secrets: mode });
  const file = iniFileName(c);
  const script = platformScript(c);
  const def = platformDef(c.platform);
  const sw = runtimeSwitches(c);
  const out: string[] = [
    `# Gateway Forge - UAG ${c.version} on ${def.label}`,
    `# Prerequisites: extract the uagdeploy scripts from the Omnissa Customer Connect download`,
    `# (${script} + uagdeploy.psm1)${c.platform === 'vsphere' ? ' and install OVF Tool 4.4.3 or later' : ''}.`,
    '',
    `# 1. Write the INI file`,
    `$ini = @'`,
    ini.trimEnd(),
    `'@`,
    `Set-Content -Path .\\${file} -Value $ini -Encoding ASCII`,
    ''
  ];
  const keys = sshPublicKeys(c.values.sshPublicKeys, c.values.sshPublicKeyNames).filter((key) => key.data);
  if (c.values.sshEnabled === true && c.values.sshKeyAccessEnabled === true && keys.length) {
    out.push('# Write SSH public key files referenced by sshPublicKeyN in the INI');
    for (const key of keys) {
      out.push(`$sshKey = @'`, key.data!, `'@`, `Set-Content -Path .\\${key.fileName} -Value $sshKey -Encoding ASCII`, '');
    }
  }
  if (mode === 'placeholder' && ini.includes('<REDACTED>')) out.push('# Replace every <REDACTED> value in the INI before deploying.', '');
  out.push(`# 2. Password handling and deployment`);
  out.push(`# Gateway Forge never requests or stores the UAG root or Admin UI passwords.`);
  out.push(`# Omnissa's headless parameter reference marks -rootPwd and -adminPwd as mandatory.`);
  out.push(`# Its deployment workflow also documents an intentional immutable option: if no post-deployment changes are needed,`);
  out.push(`# the Admin UI password can be left unset. The Admin UI and API are then unavailable, no user can be added later,`);
  out.push(`# and the appliance must be redeployed to regain administrative access. This does not remove the root account.`);
  out.push(`# References: https://docs.omnissa.com/UnifiedAccessGatewayDeployandConfigure-V2609/NonInteractiveModeParameters`);
  out.push(`#             https://docs.omnissa.com/UnifiedAccessGatewayDeployandConfigure-V2609/RunPowerShellscripttodeploy`);
  out.push(`# For replace-on-failure workflows, test this tradeoff and the complete INI as a recovery baseline, and retain the`);
  out.push(`# deployment artifacts in an approved secrets-managed location outside Gateway Forge and the exported script.`);
  out.push('');
  out.push(`# 2a. Interactive deployment (the deployment script prompts for credentials)`);
  out.push((c.platform === 'azure' ? `.\\${script} .\\${file}` : `.\\${script} -iniFile .\\${file}`) + sw, '');
  out.push(`# 2b. Non-interactive deployment: -rootPwd / -adminPwd are read at deploy time and are never stored in the INI (min 8 characters; 14 for FIPS)`);
  out.push(`$rootPwd  = Read-Host 'UAG root password'  -AsSecureString`);
  out.push(`$adminPwd = Read-Host 'UAG admin password' -AsSecureString`);
  out.push(`$plain = { param($s) [Runtime.InteropServices.Marshal]::PtrToStringBSTR([Runtime.InteropServices.Marshal]::SecureStringToBSTR($s)) }`);
  if (def.nonInteractive === 'positional') {
    out.push(`.\\${script} .\\${file} (& $plain $rootPwd) (& $plain $adminPwd) no${sw}   # <ceip-yes-no> follows the passwords`);
  } else {
    out.push(`.\\${script} -iniFile .\\${file} -rootPwd (& $plain $rootPwd) -adminPwd (& $plain $adminPwd)${sw}`);
  }
  out.push('');
  return out.join('\n');
}

/** PowerShell that pushes the settings JSON to the admin REST API of a running appliance. */
export function generateRestPowerShell(c: Config): string {
  const json = generateJson(c, { secrets: 'placeholder' });
  const file = jsonFileName(c);
  const mgmt = String(c.values.ip1 || c.values.ip0 || '<uag-management-ip>');
  return [
    `# Apply the settings JSON to a running UAG (admin API listens on 9443)`,
    `$json = @'`,
    json.trimEnd(),
    `'@`,
    `Set-Content -Path .\\${file} -Value $json -Encoding UTF8`,
    `$cred = Get-Credential admin`,
    `Invoke-RestMethod -Method Put -Uri ${psq(`https://${mgmt}:9443/rest/v1/config/settings`)} \``,
    `  -Credential $cred -ContentType 'application/json' -Body $json -SkipCertificateCheck`,
    ''
  ].join('\n');
}
