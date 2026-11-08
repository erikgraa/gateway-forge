import { nicUsesStaticIpv4, type Config } from './model';
import { deploymentCommand, generateBootableVolumeManifest, generateIni, generateJson, iniFileName, jsonFileName, manifestFileName, platformScript, type SecretMode } from './generate';
import { platformDef } from './versions';
import { sshPublicKeys } from './ssh';

const psq = (s: string) => `'${s.replace(/'/g, "''")}'`;

export type DeploymentMode = 'interactive' | 'headless';

export const MISSING_PASSWORD_WARNING = 'If root and Admin UI password parameters are not provided during deployment, the UAG is not accessible through the console or Admin UI/API.';

/** Run-time switches for the deploy script (not INI settings). */
export function runtimeSwitches(c: Config): string {
  let s = '';
  if (c.platform !== 'openshift' && c.values.run_noSSLVerify === true) s += ' -noSSLVerify';
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
    `# (${script}${c.platform === 'openshift' ? ' + uagdeploy.psm1' : ''})${c.platform === 'vsphere' ? ' and install OVF Tool 4.4.3 or later' : ''}.`,
    ...(c.platform === 'openshift' ? ['# Run on Windows with PowerShell 5 or 7; install oc and authenticate to a cluster with the required RBAC.'] : []),
    ...(c.platform === 'nutanix' ? ['# Use Windows 10/11 or Ubuntu 20.04/22.04/24.04 with Prism Central 2024.3+, AOS 7.0+ and AHV 10.0+.'] : []),
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
  out.push(`# WARNING: ${MISSING_PASSWORD_WARNING}`);
  if (c.platform === 'openshift') return generateOpenShiftPowerShell(c, secretMode, deploymentMode, out);
  if (c.platform === 'nutanix') {
    out.push('# Interactive mode: Gateway Forge prompts for UAG passwords as SecureString values.');
    appendInteractivePasswordPrompts(out);
    out.push(`${invocation} -rootPwd (ConvertTo-PlainTextAtInvocation $rootPwdSecure) -adminPwd (ConvertTo-PlainTextAtInvocation $adminPwdSecure)${sw}`);
    out.push('# The official script prompts for the Prism Central password.');
    out.push('# WARNING: the official script deletes and recreates a VM with the same name.');
    out.push('Clear-History', '');
    return out.join('\n');
  }
  if (deploymentMode === 'interactive') {
    out.push('# Interactive mode: Gateway Forge prompts for UAG passwords as SecureString values.');
    appendInteractivePasswordPrompts(out);
    if (def.nonInteractive === 'positional') {
      out.push(`${invocation} (ConvertTo-PlainTextAtInvocation $rootPwdSecure) (ConvertTo-PlainTextAtInvocation $adminPwdSecure) no${sw}`);
    } else {
      out.push(`${invocation} -rootPwd (ConvertTo-PlainTextAtInvocation $rootPwdSecure) -adminPwd (ConvertTo-PlainTextAtInvocation $adminPwdSecure)${sw}`);
    }
    out.push('Clear-History');
  } else {
    out.push('# Headless mode: passwords are read from the runtime environment and never written to this script or the INI.');
    out.push(`if ([string]::IsNullOrWhiteSpace($env:UAG_ROOT_PASSWORD)) { throw 'Set UAG_ROOT_PASSWORD before running headless deployment.' }`);
    out.push(`if ([string]::IsNullOrWhiteSpace($env:UAG_ADMIN_PASSWORD)) { throw 'Set UAG_ADMIN_PASSWORD before running headless deployment.' }`);
    if (def.nonInteractive === 'positional') {
      out.push(`${invocation} $env:UAG_ROOT_PASSWORD $env:UAG_ADMIN_PASSWORD no${sw}`);
    } else {
      out.push(`${invocation} -rootPwd $env:UAG_ROOT_PASSWORD -adminPwd $env:UAG_ADMIN_PASSWORD${sw}`);
    }
  }
  out.push('');
  return out.join('\n');
}

function appendInteractivePasswordPrompts(out: string[]): void {
  out.push(`$rootPwdSecure = Read-Host 'UAG root password' -AsSecureString`);
  out.push(`$adminPwdSecure = Read-Host 'UAG Admin UI password' -AsSecureString`);
  out.push('function ConvertTo-PlainTextAtInvocation {');
  out.push('  param([Security.SecureString] $Value)');
  out.push('  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Value)');
  out.push('  try { [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr) }');
  out.push('  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }');
  out.push('}');
}

function generateOpenShiftPowerShell(c: Config, mode: SecretMode, deploymentMode: DeploymentMode, out: string[]): string {
  const yamlFile = manifestFileName(c);
  const manifest = generateBootableVolumeManifest(c);
  const volume = String(c.values.ocp_volume || '<volume-name>');
  const namespace = String(c.values.ocp_namespace || '<destination-project>');
  const sw = runtimeSwitches(c);
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
    appendInteractivePasswordPrompts(out);
    const auth = mode === 'omit' || !String(c.values.ocp_bearerToken || '');
    if (mode === 'omit' || !String(c.values.ocp_bearerToken || '')) {
      out.push('# The bearer token is omitted, so provide the OpenShift password securely at runtime.');
      out.push(`$openshiftPwd = Read-Host 'OpenShift password' -AsSecureString`);
    }
    out.push(`${deploymentCommand(c)} -rootPwd (ConvertTo-PlainTextAtInvocation $rootPwdSecure) -adminPwd (ConvertTo-PlainTextAtInvocation $adminPwdSecure) no${auth ? ' -openshiftPassword (ConvertTo-PlainTextAtInvocation $openshiftPwd)' : ''}${sw}`);
    out.push('');
  } else {
    out.push('# Headless mode: passwords are read from the runtime environment and never written to this script or the INI.');
    out.push(`if ([string]::IsNullOrWhiteSpace($env:UAG_ROOT_PASSWORD)) { throw 'Set UAG_ROOT_PASSWORD before running headless deployment.' }`);
    out.push(`if ([string]::IsNullOrWhiteSpace($env:UAG_ADMIN_PASSWORD)) { throw 'Set UAG_ADMIN_PASSWORD before running headless deployment.' }`);
    if (mode === 'omit' || !String(c.values.ocp_bearerToken || '')) {
      out.push(`if ([string]::IsNullOrWhiteSpace($env:OPENSHIFT_PASSWORD)) { throw 'Set OPENSHIFT_PASSWORD before running headless OpenShift deployment.' }`);
      out.push(`${deploymentCommand(c)} -rootPwd $env:UAG_ROOT_PASSWORD -adminPwd $env:UAG_ADMIN_PASSWORD no -openshiftPassword $env:OPENSHIFT_PASSWORD${sw}`);
    } else {
      out.push(`${deploymentCommand(c)} -rootPwd $env:UAG_ROOT_PASSWORD -adminPwd $env:UAG_ADMIN_PASSWORD no${sw}`);
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
