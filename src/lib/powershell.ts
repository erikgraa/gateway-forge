import { isEmpty, type Config } from './model';
import { generateIni, generateJson, iniFileName, jsonFileName, platformScript, type SecretMode } from './generate';
import { platformDef } from './versions';
import { sshPublicKeys } from './ssh';

const psq = (s: string) => `'${s.replace(/'/g, "''")}'`;

export type DeploymentMode = 'interactive' | 'headless';

/** Run-time switches for the deploy script (not INI settings). */
export function runtimeSwitches(c: Config): string {
  let s = '';
  if (c.values.run_noSSLVerify === true) s += ' -noSSLVerify';
  if (c.platform === 'vsphere' && c.values.run_disableVerification === true) s += ' -disableVerification';
  return s;
}

/** PowerShell that writes the INI and runs the deployment script. */
export function generatePowerShell(
  c: Config,
  secretMode: SecretMode = 'placeholder',
  deploymentMode: DeploymentMode = 'interactive'
): string {
  const ini = generateIni(c, { secrets: secretMode });
  const file = iniFileName(c);
  const script = platformScript(c);
  const def = platformDef(c.platform);
  const sw = runtimeSwitches(c);
  const invocation = def.iniArgument === 'positional' ? `.\\${script} .\\${file}` : `.\\${script} -iniFile .\\${file}`;
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
  if (secretMode === 'placeholder' && ini.includes('<REDACTED>')) out.push('# Replace every <REDACTED> value in the INI before deploying.', '');
  out.push('# 2. Deploy the appliance');
  if (deploymentMode === 'interactive') {
    out.push('# Interactive mode: the deployment script prompts for the root and Admin UI passwords.');
    out.push(invocation + sw);
  } else {
    out.push('# Headless mode: passwords are read from the runtime environment and never written to this script or the INI.');
    out.push(`if ([string]::IsNullOrWhiteSpace($env:UAG_ROOT_PASSWORD)) { throw 'Set UAG_ROOT_PASSWORD before running headless deployment.' }`);
    out.push(`if ([string]::IsNullOrWhiteSpace($env:UAG_ADMIN_PASSWORD)) { throw 'Set UAG_ADMIN_PASSWORD before running headless deployment.' }`);
    const needsOpenShiftPassword = c.platform === 'openshift' && isEmpty(c.values.ocp_bearerToken);
    if (needsOpenShiftPassword) {
      out.push(`if ([string]::IsNullOrWhiteSpace($env:OPENSHIFT_PASSWORD)) { throw 'Set OPENSHIFT_PASSWORD before running headless OpenShift deployment.' }`);
    }
    const openshiftPassword = needsOpenShiftPassword ? ' -openshiftPassword $env:OPENSHIFT_PASSWORD' : '';
    if (def.nonInteractive === 'positional') {
      out.push(`${invocation} $env:UAG_ROOT_PASSWORD $env:UAG_ADMIN_PASSWORD no${sw}`);
    } else {
      out.push(`${invocation} -rootPwd $env:UAG_ROOT_PASSWORD -adminPwd $env:UAG_ADMIN_PASSWORD${sw}${openshiftPassword}`);
    }
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
