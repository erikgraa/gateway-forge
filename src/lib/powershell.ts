import { groupEnabled, nicUsesStaticIpv4, type Config } from './model';
import { GROUPS } from './schema';
import { deploymentCommand, generateBootableVolumeManifest, generateIni, generateJson, iniFileName, jsonFileName, manifestFileName, platformScript, type SecretMode } from './generate';
import { platformDef } from './versions';
import { sshPublicKeys } from './ssh';
import { hypervVlanDeployment } from './hyperv-vlan';
import { VCENTER_CREDENTIAL_TARGET_EXAMPLE, VCENTER_INLINE_PASSWORD_WARNING, OVF_TOOL_VERSION_GUIDANCE } from './vcenterTarget';

const psq = (s: string) => `'${s.replace(/'/g, "''")}'`;

export type DeploymentMode = 'interactive' | 'headless';

export const MISSING_PASSWORD_WARNING = 'When root and Admin UI password parameters are omitted, uagdeploy and its platform variants prompt for them interactively. Environment-password mode supplies both from the deployment process. Fully unattended vSphere deployment is possible when its prerequisites are met; missing vCenter credentials, password-protected PFX files and other required input may still prompt.';

export const VSPHERE_HEADLESS_GUIDANCE = 'Supply root/Admin UI passwords and CEIP, include vCenter credentials in the full target, and use appliance-default certificates or an unencrypted PEM/key pair instead of password-protected PFX. All other required feature credentials must be supplied, with no validation retries or OVF Tool confirmations requiring input. Environment-password mode alone is not sufficient.';

export const ADMIN_PASSWORD_GUIDANCE = 'Admin UI passwords: 8-64 characters (14-64 on FIPS), subject to any higher configured minimum. Include at least one uppercase letter, one lowercase letter, one number and one special character; only ! @ # $ % ^ & * ( ) are allowed special characters. Root has different password rules; a working root login does not confirm Admin UI access.';

// Format static prose only, never commands or embedded configuration.
function commentLines(text: string): string[] {
  const lines: string[] = [];
  for (const clause of text.split(/(?<=[.;])\s+/)) {
    let line = '#';
    for (const word of clause.split(/\s+/)) {
      if (line !== '#' && line.length + 1 + word.length > 60) {
        lines.push(line);
        line = '#';
      }
      line += ` ${word}`;
    }
    lines.push(line);
  }
  return lines;
}

export function adminSamlEnabled(c: Config): boolean {
  const group = GROUPS.find((g) => g.id === 'admin-saml');
  return !!group && groupEnabled(group, c);
}

/** Run-time switches for the deploy script (not INI settings). */
export function runtimeSwitches(c: Config): string {
  let s = '';
  if (c.platform !== 'openshift' && c.values.run_noSSLVerify === true) s += ' -noSSLVerify';
  if (c.platform === 'vsphere' && c.values.run_disableVerification === true) s += ' -disableVerification';
  return s;
}

function ceipSwitch(c: Config): string {
  // The deployment CLI uses yes/no strings; the INI uses true/false.
  return ` -ceipEnabled '${c.values.ceipEnabled === true ? 'yes' : 'no'}'`;
}

function standaloneContentGatewayPasswordSwitch(c: Config, deploymentMode: DeploymentMode): string {
  return deploymentMode === 'headless' && c.values.contentGateway_enabled === true && c.values.contentGateway_mode !== 'shared'
    ? ' -awCGAPIServerPwd $env:UAG_CONTENT_GATEWAY_API_PASSWORD'
    : '';
}

function addStandaloneContentGatewayPasswordCheck(c: Config, out: string[]): void {
  if (c.values.contentGateway_enabled !== true || c.values.contentGateway_mode === 'shared') return;
  out.push(`if ([string]::IsNullOrWhiteSpace($env:UAG_CONTENT_GATEWAY_API_PASSWORD)) { throw 'Set UAG_CONTENT_GATEWAY_API_PASSWORD before running deployment.' }`);
}

function sharedAirwatchPasswordSwitch(c: Config): string {
  return c.values.airwatch_enabled === true
    ? ' -awAPIServerPwd $env:UAG_WORKSPACE_ONE_UEM_API_PASSWORD'
    : '';
}

function addSharedAirwatchPasswordCheck(c: Config, out: string[]): void {
  if (c.values.airwatch_enabled !== true) return;
  out.push(`if ([string]::IsNullOrWhiteSpace($env:UAG_WORKSPACE_ONE_UEM_API_PASSWORD)) { throw 'Set UAG_WORKSPACE_ONE_UEM_API_PASSWORD before running deployment.' }`);
}

function adminUserPasswordSwitch(c: Config): string {
  return c.adminUsers.length > 0 ? ' -NewAdminuserPwd $env:UAG_NEW_ADMIN_USER_PASSWORDS' : '';
}

function addAdminUserPasswordCheck(c: Config, out: string[]): void {
  if (c.adminUsers.length === 0) return;
  out.push(`if ([string]::IsNullOrWhiteSpace($env:UAG_NEW_ADMIN_USER_PASSWORDS)) { throw 'Set UAG_NEW_ADMIN_USER_PASSWORDS before running deployment.' }`);
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
  const sw = runtimeSwitches(c) + ceipSwitch(c);
  const invocation = deploymentCommand(c);
  const effectiveDeploymentMode = c.platform === 'nutanix' ? 'interactive' : deploymentMode;
  const out: string[] = [
    `# Gateway Forge - UAG ${c.version} on ${def.label}`,
    `# Prerequisites: extract the uagdeploy scripts from the Omnissa Customer Connect download`,
    `# (${script}${c.platform === 'openshift' ? ' + uagdeploy.psm1' : ''})${c.platform === 'vsphere' ? ' and install OVF Tool 4.4.3 or later' : ''}.`,
    ...(c.platform === 'openshift' ? ['# Run on Windows with PowerShell 5 or 7; install oc and authenticate to a cluster with the required RBAC.'] : []),
    ...(c.platform === 'nutanix' ? ['# Use Windows 10/11 or Ubuntu 20.04/22.04/24.04 with Prism Central 2024.3+, AOS 7.0+ and AHV 10.0+.'] : []),
    '# Password-protected PFX files trigger an interactive deployment-script prompt; no PFX password is embedded.',
    c.platform === 'vsphere'
      ? '# Fully unattended vSphere deployment is possible when the prerequisites below are met.'
      : '# This is a deployment script, not a guarantee of fully unattended execution.',
    '# CEIP is passed explicitly from the configuration, removing that prompt only.',
    '# UAG 2609 CLI documentation uses yes/no; verify parameters in your deployment package.',
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
  out.push('# 2. Deploy the appliance', '');
  out.push(...commentLines(MISSING_PASSWORD_WARNING), '');
  if (c.platform === 'vsphere') {
    out.push(...commentLines(`Fully unattended vSphere: ${VSPHERE_HEADLESS_GUIDANCE}`), '');
    out.push(...commentLines(`Credentialed target example (synthetic): ${VCENTER_CREDENTIAL_TARGET_EXAMPLE}`));
    out.push(...commentLines('Syntax is vi://username:password@host/path; the UPN domain belongs before the colon. Check special-character handling against the installed OVF Tool release.'), '');
    out.push(...commentLines(OVF_TOOL_VERSION_GUIDANCE));
    out.push(...commentLines(VCENTER_INLINE_PASSWORD_WARNING), '');
  }
  out.push(...commentLines(ADMIN_PASSWORD_GUIDANCE), '');
  out.push(...commentLines('Do not skip the Admin UI password prompt if password-based admin access is required. Verify the password policy for your UAG release and deployment package.'), '');
  if (adminSamlEnabled(c)) out.push(...commentLines('Administrator SAML is enabled: default admin password authentication is disabled. Use the configured identity provider for Admin UI access.'), '');
  if (c.values.contentGateway_enabled === true && c.values.contentGateway_mode !== 'shared') {
    out.push(...commentLines(effectiveDeploymentMode === 'interactive'
      ? 'Interactive mode: the official script prompts for the Content Gateway Workspace ONE UEM API password.'
      : 'Environment-password Content Gateway mode reads the UEM API password from UAG_CONTENT_GATEWAY_API_PASSWORD.'), '');
  }
  if (c.values.airwatch_enabled === true) {
    out.push(...commentLines('Shared [Airwatch] UEM passwords cover Tunnel and shared Content Gateway and are supplied at runtime only.'));
    out.push("# Set: $env:UAG_WORKSPACE_ONE_UEM_API_PASSWORD = '<Workspace ONE UEM API password>'");
    addSharedAirwatchPasswordCheck(c, out);
  }
  if (effectiveDeploymentMode === 'headless' && c.values.contentGateway_enabled === true && c.values.contentGateway_mode !== 'shared') {
    addStandaloneContentGatewayPasswordCheck(c, out);
  }
  if (c.adminUsers.length > 0) {
    out.push(...commentLines('Additional admin-user passwords are read from UAG_NEW_ADMIN_USER_PASSWORDS in username:password format, separated by semicolons.'));
    out.push("# Example: $env:UAG_NEW_ADMIN_USER_PASSWORDS = 'monitoringUser1:<password>;monitoringUser2:<password>'");
    addAdminUserPasswordCheck(c, out);
  }
  const adminSwitch = adminUserPasswordSwitch(c);
  const sharedAirwatchSwitch = sharedAirwatchPasswordSwitch(c);
  const standaloneContentGatewaySwitch = standaloneContentGatewayPasswordSwitch(c, effectiveDeploymentMode);
  if (c.platform === 'openshift') return generateOpenShiftPowerShell(c, secretMode, deploymentMode, out);
  if (c.platform === 'nutanix') {
    out.push(...commentLines('Interactive mode: the official script prompts for root and Admin UI passwords.'));
    out.push(`${invocation}${sharedAirwatchSwitch}${standaloneContentGatewaySwitch}${adminSwitch}${sw}`);
    out.push('# The official script prompts for the Prism Central password.');
    out.push('# WARNING: the official script deletes and recreates a VM with the same name.');
    out.push('Clear-History', '');
    return out.join('\n');
  }
  if (effectiveDeploymentMode === 'interactive') {
    out.push(...commentLines('Interactive mode: the official script prompts for root and Admin UI passwords.'));
    out.push(...hypervVlanDeployment(c, `${invocation}${sharedAirwatchSwitch}${standaloneContentGatewaySwitch}${adminSwitch}${sw}`));
    out.push('Clear-History');
  } else {
    out.push(...commentLines('Environment-password mode: root/admin passwords are read from the process environment, not embedded in this script or the INI.'), '');
    out.push(`if ([string]::IsNullOrWhiteSpace($env:UAG_ROOT_PASSWORD)) { throw 'Set UAG_ROOT_PASSWORD before running deployment.' }`);
    out.push(`if ([string]::IsNullOrWhiteSpace($env:UAG_ADMIN_PASSWORD)) { throw 'Set UAG_ADMIN_PASSWORD before running deployment.' }`);
    if (def.nonInteractive === 'positional') {
      out.push(`${invocation} $env:UAG_ROOT_PASSWORD $env:UAG_ADMIN_PASSWORD${sharedAirwatchSwitch}${standaloneContentGatewaySwitch}${adminSwitch}${sw}`);
    } else {
      out.push(...hypervVlanDeployment(c, `${invocation} -rootPwd $env:UAG_ROOT_PASSWORD -adminPwd $env:UAG_ADMIN_PASSWORD${sharedAirwatchSwitch}${standaloneContentGatewaySwitch}${adminSwitch}${sw}`));
    }
  }
  out.push('');
  return out.join('\n');
}

function generateOpenShiftPowerShell(c: Config, mode: SecretMode, deploymentMode: DeploymentMode, out: string[]): string {
  const yamlFile = manifestFileName(c);
  const manifest = generateBootableVolumeManifest(c);
  const volume = String(c.values.ocp_volume || '<volume-name>');
  const namespace = String(c.values.ocp_namespace || '<destination-project>');
  const sw = runtimeSwitches(c) + ceipSwitch(c);
  const sharedAirwatchSwitch = sharedAirwatchPasswordSwitch(c);
  const standaloneContentGatewaySwitch = standaloneContentGatewayPasswordSwitch(c, deploymentMode);
  const adminSwitch = adminUserPasswordSwitch(c);
  if (c.values.ocp_volumeSourceMode === 'console') {
    out.push('# 2. Prepare the local QCOW2 volume through the OpenShift web console (runbook mode).');
    out.push(`# Download the OpenShift/Nutanix QCOW2, then use Virtualization > Bootable volumes in namespace ${namespace}.`);
    out.push(`# Name the volume ${volume} and use the configured StorageClass and disk size.`);
    out.push('# No local-file YAML is emitted because the cluster cannot import a browser-local path.', '');
  } else {
    out.push('# 2. Write the OpenShift bootable-volume manifest (Limited Availability feature)');
    out.push("$yaml = @'");
    out.push(manifest.trimEnd());
    out.push("'@");
    out.push(`Set-Content -Path .\\${yamlFile} -Value $yaml -Encoding UTF8`, '');
    out.push('# 3. Prepare the namespace with oc. The endpoint, namespace, StorageClass, NADs, RBAC and NetworkPolicies must already exist.');
    out.push(`oc login --server=${psq(String(c.values.ocp_openShiftEndpoint || '<openshift-api-server>'))} --username=${psq(String(c.values.ocp_openShiftUserName || '<openshift-username>'))}`);
    out.push(`oc apply -f .\\${yamlFile}`);
  }
  if (c.values.ocp_volumeSourceMode !== 'console') {
    out.push(`oc get dv ${psq(volume)} -n ${psq(namespace)}  # wait for Succeeded and 100.0%`);
    out.push(`oc get pvc ${psq(volume)} -n ${psq(namespace)}`);
    out.push(`oc get datasource ${psq(volume)} -n ${psq(namespace)}`);
    out.push('oc logout', '');
  }
  out.push('# 4. Deploy the VM. The script requires both uagdeployopenshift.ps1 and uagdeploy.psm1.');
  if (deploymentMode === 'interactive') {
    out.push(...commentLines('The official script prompts for root, Admin UI and any required OpenShift password.'));
    out.push(`${deploymentCommand(c)}${sharedAirwatchSwitch}${standaloneContentGatewaySwitch}${adminSwitch}${sw}`);
    out.push('');
  } else {
    out.push(...commentLines('Environment-password mode: root/admin passwords are read from the process environment, not embedded in this script or the INI.'), '');
    out.push(`if ([string]::IsNullOrWhiteSpace($env:UAG_ROOT_PASSWORD)) { throw 'Set UAG_ROOT_PASSWORD before running deployment.' }`);
    out.push(`if ([string]::IsNullOrWhiteSpace($env:UAG_ADMIN_PASSWORD)) { throw 'Set UAG_ADMIN_PASSWORD before running deployment.' }`);
    if (mode === 'omit' || !String(c.values.ocp_bearerToken || '')) {
      out.push(`if ([string]::IsNullOrWhiteSpace($env:OPENSHIFT_PASSWORD)) { throw 'Set OPENSHIFT_PASSWORD before running OpenShift deployment.' }`);
      out.push(`${deploymentCommand(c)} -rootPwd $env:UAG_ROOT_PASSWORD -adminPwd $env:UAG_ADMIN_PASSWORD -openshiftPassword $env:OPENSHIFT_PASSWORD${sharedAirwatchSwitch}${standaloneContentGatewaySwitch}${adminSwitch}${sw}`);
    } else {
      out.push(`${deploymentCommand(c)} -rootPwd $env:UAG_ROOT_PASSWORD -adminPwd $env:UAG_ADMIN_PASSWORD${sharedAirwatchSwitch}${standaloneContentGatewaySwitch}${adminSwitch}${sw}`);
    }
  }
  out.push('Clear-History', '');
  return out.join('\n');
}

/** PowerShell that pushes the settings JSON to the admin REST API of a running appliance. */
export function generateRestPowerShell(c: Config): string {
  const json = generateJson(c, { secrets: 'placeholder' });
  const file = jsonFileName(c);
  const mgmt = String((nicUsesStaticIpv4(c, 1) && c.values.ip1) || (nicUsesStaticIpv4(c, 0) && c.values.ip0) || '<uag-management-ip>');
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
